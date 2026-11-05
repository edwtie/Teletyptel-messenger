const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { chromium, webkit } = require("playwright");

const source = fs.readFileSync(path.join(__dirname, "../php/public/xmpp-availability.js"), "utf8");
const css = fs.readFileSync(path.join(__dirname, "../php/public/xmpp-availability.css"), "utf8");
const open = '<open from="example.test" id="ejabberd-fixture" xmlns="urn:ietf:params:xml:ns:xmpp-framing"'
  + ' xml:lang="en" version="1.0"/>';
const features = '<stream:features xmlns:stream="http://etherx.jabber.org/streams">'
  + '<mechanisms xmlns="urn:ietf:params:xml:ns:xmpp-sasl"><mechanism>SCRAM-SHA-256</mechanism>'
  + '</mechanisms></stream:features>';
const options = { url: "wss://chat.example.test/xmpp", domain: "example.test" };

function fixture(source) {
  let elapsed = 0;
  let sequence = 0;
  const timers = new Map();
  const sockets = [];
  const faults = {};
  class Socket {
    constructor(url, protocol) {
      if (faults.construct) throw new Error("constructor");
      this.url = url;
      this.requestedProtocol = protocol;
      this.protocol = "xmpp";
      this.readyState = 0;
      this.listeners = new Map();
      this.sent = [];
      this.closes = 0;
      sockets.push(this);
    }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    removeEventListener(name, callback) {
      if (this.listeners.get(name) === callback) this.listeners.delete(name);
    }
    emit(name, data) {
      if (name === "open") this.readyState = 1;
      if (name === "close") this.readyState = 3;
      this.listeners.get(name)?.({ data });
    }
    send(value) {
      if (faults.send) throw new Error("send");
      this.sent.push(value);
    }
    close() {
      this.closes++;
      this.readyState = 3;
      if (faults.close) throw new Error("close");
    }
  }
  const environment = {
    document, DOMParser, TextEncoder, URL, MutationObserver,
    performance: { now: () => elapsed },
    location: new URL("https://example.test/chat.html"),
    WebSocket: Socket,
    setTimeout(callback, delay) {
      const id = ++sequence;
      timers.set(id, { callback, delay, due: elapsed + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  for (const name of ["localStorage", "sessionStorage"]) {
    Object.defineProperty(environment, name, { get() { throw new Error("Account storage must not be accessed"); } });
  }
  new Function("window", source)(environment);
  window.fixture = {
    environment, api: environment.TeleTypTelXmppAvailability, sockets, timers, faults, Socket,
    advance(duration, dispatch = true) {
      elapsed += duration;
      if (!dispatch) return;
      for (const [id, timer] of timers) {
        if (timer.due <= elapsed) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
    clean() { return timers.size === 0 && sockets.every(socket => socket.closes === 1 && socket.listeners.size === 0); }
  };
}

test("Global export and controller creation do not require a document", async () => {
  const context = { URL, setTimeout, clearTimeout };
  vm.runInNewContext(source, context);
  const api = context.TeleTypTelXmppAvailability;
  assert.equal(typeof api.probe, "function");
  const controller = api.create();
  controller.connecting();
  controller.unavailable(() => {});
  controller.ready();
  controller.hide();
  assert.equal(await controller.check(options), false);
});

test("Before body creation, hide removes the deferred UI listener", () => {
  const listeners = new Map();
  const context = { document: {
    body: null,
    addEventListener: (name, listener) => listeners.set(name, listener),
    removeEventListener: (name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name);
    }
  } };
  vm.runInNewContext(source, context);
  const controller = context.TeleTypTelXmppAvailability.create();
  controller.connecting();
  controller.unavailable();
  assert.equal(listeners.size, 1);
  controller.hide();
  assert.equal(listeners.size, 0);
});

for (const [engineName, engine] of Object.entries({ chromium, webkit })) {
  test(`${engineName}: isolated XMPP availability`, { timeout: 60000 }, async suite => {
    const browser = await engine.launch({ headless: true });
    async function check(name, body) {
      await suite.test(name, async () => {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
        try {
          await page.route("**/*", route => route.abort());
          await page.setContent('<main class="app-shell"><button id="launch">Login</button>'
            + '<input id="draft" value="Unsent draft"></main><div id="accountDialog" role="dialog">Account</div>'
            + '<aside id="alreadyInert" inert="prior">Preserve</aside><dialog id="nativeDialog">Existing dialog</dialog>');
          await page.addStyleTag({ content: css });
          await page.evaluate(fixture, source);
          await body(page);
        } finally { await page.close(); }
      });
    }
    try {
      await check("Sign-in preflight stays inline, but offline failures still block access", async page => {
        const result = await page.evaluate(async ({ options, open, features }) => {
          const harness = window.fixture;
          const controller = harness.api.create();
          const pending = controller.check({ ...options, background: true });
          const flashed = !!document.querySelector(".xmpp-availability[open]");
          const socket = harness.sockets.at(-1);
          socket.emit("open");
          socket.emit("message", open + features);
          const available = await pending;
          const hidden = !document.querySelector(".xmpp-availability[open]");
          const failure = controller.check({ ...options, background: true });
          harness.sockets.at(-1).emit("error");
          const unavailable = await failure;
          const blocked = !!document.querySelector('.xmpp-availability[open][data-state="offline"]')
            && document.querySelector(".app-shell").inert;
          controller.hide();
          return { flashed, available, hidden, unavailable, blocked, clean: harness.clean() };
        }, { options, open, features });
        assert.deepEqual(result, { flashed: false, available: true, hidden: true, unavailable: false, blocked: true, clean: true });
      });
      await check("Confirmed certificate errors show actionable text; opaque socket failures remain offline", async page => {
        const result = await page.evaluate(async options => {
          const harness = window.fixture;
          const controller = harness.api.create();
          let retries = 0;
          controller.unavailable(() => { retries++; controller.connecting(); }, "certificate");
          const overlay = document.querySelector(".xmpp-availability[open]");
          const certificate = overlay.querySelector('[role="status"]').textContent;
          overlay.querySelector("button").click();
          const checking = overlay.dataset.state === "checking" && overlay.dataset.reason === "offline";
          const pending = controller.check(options);
          harness.sockets.at(-1).emit("error");
          await pending;
          const network = overlay.querySelector('[role="status"]').textContent;
          const reason = overlay.dataset.reason;
          controller.hide();
          return { certificate, retries, checking, network, reason };
        }, options);
        assert.match(result.certificate, /Certificaatfout/);
        assert.doesNotMatch(result.certificate, /chatserver is niet online/);
        assert.equal(result.retries, 1);
        assert.equal(result.checking, true);
        assert.match(result.network, /chatserver is niet online/);
        assert.equal(result.reason, "offline");
      });
      await check("Only native iOS, Android and Windows WebView2 show startup branding", async page => {
        const results = await page.evaluate(() => {
          const harness = window.fixture;
          return ["browser", "chrome", "capacitor-web", "ios", "android", "webview2", "broken-bridge"].map(platform => {
            delete harness.environment.Capacitor;
            delete harness.environment.chrome;
            if (["capacitor-web", "ios", "android"].includes(platform)) {
              harness.environment.Capacitor = { getPlatform: () => platform === "capacitor-web" ? "web" : platform };
            }
            if (platform === "chrome") harness.environment.chrome = {};
            if (platform === "webview2") harness.environment.chrome = { webview: { postMessage() {} } };
            if (platform === "broken-bridge") harness.environment.Capacitor = { getPlatform() { throw new Error("unavailable"); } };
            const controller = harness.api.create();
            controller.connecting();
            const overlay = document.querySelector(".xmpp-availability[open]");
            const brand = overlay.querySelector("img");
            const checking = overlay.dataset.state === "checking" && !!overlay.querySelector('[role="status"]').textContent;
            const progress = overlay.querySelector('[role="progressbar"]');
            const loading = !!progress && !progress.hidden && !progress.hasAttribute("aria-valuenow");
            controller.unavailable(() => {});
            const offline = overlay.dataset.state === "offline" && !overlay.querySelector("button").hidden;
            const stopped = !progress || progress.hidden;
            controller.connecting();
            const resumed = !progress || !progress.hidden;
            const result = { platform, branded: !!brand, checking, offline, loading, stopped, resumed };
            controller.hide();
            overlay.remove();
            return result;
          });
        });
        assert.deepEqual(results, ["browser", "chrome", "capacitor-web", "ios", "android", "webview2", "broken-bridge"].map(platform => ({
          platform, branded: ["ios", "android", "webview2"].includes(platform), checking: true, offline: true,
          loading: ["ios", "android", "webview2"].includes(platform), stopped: true, resumed: true
        })));
      });
      await check("Native progress stops on errors and respects reduced motion", async page => {
        await page.evaluate(() => {
          window.fixture.environment.Capacitor = { getPlatform: () => "ios" };
          window.progressController = window.fixture.api.create();
          window.progressController.connecting();
        });
        const progress = page.locator('[role="progressbar"]');
        assert.equal(await progress.isVisible(), true);
        assert.equal(await progress.evaluate(element => getComputedStyle(element, "::before").backgroundColor), "rgb(37, 99, 235)");
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await progress.evaluate(element => getComputedStyle(element, "::before").animationName), "none");
        await page.evaluate(() => window.progressController.unavailable(() => {}, "certificate"));
        assert.equal(await progress.isVisible(), false);
        await page.evaluate(() => window.progressController.connecting());
        assert.equal(await progress.isVisible(), true);
        await page.evaluate(() => window.progressController.ready());
        assert.equal(await progress.isVisible(), false);
      });
      await check("Requires framing open and SASL features; sends no authentication", async page => {
        for (const combined of [false, true]) {
          const result = await page.evaluate(async ({ options, open, features, combined }) => {
            const harness = window.fixture;
            let resolved = false;
            const promise = harness.api.probe(options).then(value => { resolved = true; return value; });
            const socket = harness.sockets.at(-1);
            socket.emit("open");
            await Promise.resolve();
            const afterSocketOpen = resolved;
            if (!combined) socket.emit("message", open);
            await Promise.resolve();
            const afterStreamOpen = resolved;
            socket.emit("message", combined ? open + features : features);
            return { available: await promise, afterSocketOpen, afterStreamOpen,
              protocol: socket.requestedProtocol, sent: socket.sent, clean: harness.clean() };
          }, { options, open, features, combined });
          assert.equal(result.available, true);
          assert.equal(result.afterSocketOpen, false);
          assert.equal(result.afterStreamOpen, false);
          assert.equal(result.protocol, "xmpp");
          assert.equal(result.clean, true);
          assert.deepEqual(result.sent, [
            '<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="example.test" version="1.0"/>',
            '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>'
          ]);
        }
      });

      await check("Rejects wrong protocols, namespaces, errors, malformed XML and non-SASL servers", async page => {
        const frames = [
          [features], ['<open/>', features], [open, '<stream:features/>'],
          [open, features.replaceAll("http://etherx.jabber.org/streams", "urn:wrong")],
          [open, features.replaceAll("urn:ietf:params:xml:ns:xmpp-sasl", "urn:wrong")],
          [open, features.replace("SCRAM-SHA-256", "")],
          [open, '<stream:features><wrapper>' + features + '</wrapper></stream:features>'],
          [open, '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>'],
          [open, '<stream:error><host-unknown/></stream:error>'],
          [open, '<stream:features><broken></stream:features>'],
          ['<!DOCTYPE open [<!ENTITY example "text">]>' + open],
          ['<!ENTITY example SYSTEM "https://example.test/secret">'],
          [open + features + '<stream:error/>'], [open, new Uint8Array([1, 2])]
        ];
        for (const messages of frames) {
          const result = await page.evaluate(async ({ options, messages }) => {
            const harness = window.fixture;
            const promise = harness.api.probe(options);
            const socket = harness.sockets.at(-1);
            socket.emit("open");
            for (const message of messages) socket.emit("message", message);
            return { available: await promise, clean: harness.clean() };
          }, { options, messages });
          assert.deepEqual(result, { available: false, clean: true });
        }
        assert.equal(await page.evaluate(async options => {
          const harness = window.fixture;
          const promise = harness.api.probe(options);
          const socket = harness.sockets.at(-1);
          socket.protocol = "";
          socket.emit("open");
          return !(await promise) && socket.sent.length === 0 && harness.clean();
        }, options), true);
      });

      await check("Accepts namespace variants and safely escapes the requested XMPP domain", async page => {
        for (const frame of [
          features.replace(' xmlns:stream="http://etherx.jabber.org/streams"', ""),
          features.replaceAll("stream:features", "features").replace("xmlns:stream=", "xmlns=")
        ]) {
          assert.equal(await page.evaluate(async ({ options, open, frame }) => {
            const harness = window.fixture;
            const domain = 'example&"<test\'>.test';
            const promise = harness.api.probe({ ...options, domain });
            const socket = harness.sockets.at(-1);
            socket.emit("open");
            const outgoing = new DOMParser().parseFromString(socket.sent[0], "application/xml");
            socket.emit("message", open);
            socket.emit("message", frame);
            return await promise && outgoing.documentElement.getAttribute("to") === domain && harness.clean();
          }, { options, open, frame }), true);
        }
      });

      await check("Absolute deadline, UTF-8 size cap and transport failures always clean up", async page => {
        for (const mode of ["neverOpen", "keepalive", "short", "delayedTimer", "bytes", "cumulative", "error", "close", "construct", "send", "closeThrows"]) {
          assert.equal(await page.evaluate(async ({ options, open, features, mode }) => {
            const harness = window.fixture;
            harness.faults.construct = mode === "construct";
            harness.faults.send = mode === "send";
            harness.faults.close = mode === "closeThrows";
            const promise = harness.api.probe({ ...options, timeoutMs: mode === "short" ? 25 : 90000 });
            const socket = harness.sockets.at(-1);
            if (mode === "construct") return !(await promise) && harness.clean();
            if (mode !== "neverOpen") socket.emit("open");
            if (mode === "neverOpen") harness.advance(8000);
            if (mode === "keepalive") {
              for (let count = 0; count < 7; count++) { harness.advance(1000); socket.emit("message", " "); }
              harness.advance(1000);
            }
            if (mode === "short") harness.advance(25);
            if (mode === "delayedTimer") { harness.advance(8000, false); socket.emit("message", open + features); }
            if (mode === "bytes") socket.emit("message", "é".repeat(32769));
            if (mode === "cumulative") {
              socket.emit("message", " ".repeat(40000));
              socket.emit("message", " ".repeat(30000));
            }
            if (["error", "close"].includes(mode)) socket.emit(mode);
            if (mode === "closeThrows") socket.emit("error");
            return !(await promise) && harness.clean();
          }, { options, open, features, mode }), true, mode);
        }
      });

      await check("Only secure URLs or HTTP-loopback development; bundled iPhone stays secure", async page => {
        for (const [location, url, allowed] of [
          ["https://site.test", options.url, true], ["capacitor://localhost", options.url, true],
          ["http://localhost:8080", "ws://localhost:5280/xmpp", true],
          ["http://127.0.0.1", "ws://[::1]:5280/xmpp", true],
          ["https://localhost", "ws://localhost/xmpp", false],
          ["capacitor://localhost", "ws://localhost/xmpp", false],
          ["http://localhost", "ws://remote.test/xmpp", false],
          ["http://remote.test", "ws://localhost/xmpp", false],
          ["http://localhost.evil.test", "ws://localhost/xmpp", false],
          ["https://site.test", "https://chat.test/xmpp", false],
          ["https://site.test", "wss://user:password@chat.test/xmpp", false],
          ["https://site.test", "wss://chat.test/xmpp#fragment", false],
          ["https://site.test", "not a URL", false]
        ]) {
          assert.equal(await page.evaluate(async ({ location, url, options }) => {
            const harness = window.fixture;
            harness.environment.location = new URL(location);
            const count = harness.sockets.length;
            const promise = harness.api.probe({ ...options, url });
            const created = harness.sockets.length > count;
            if (created) harness.sockets.at(-1).emit("close");
            await promise;
            return created && harness.clean();
          }, { location, url, options }), allowed, `${location} -> ${url}`);
        }
      });

      await check("Lazy UI deduplicates, retries, restores inert and preserves drafts", async page => {
        const result = await page.evaluate(async ({ options, open, features }) => {
          const harness = window.fixture;
          harness.environment.WebSocket = undefined;
          const controller = harness.api.create({ WebSocket: harness.Socket, translate: key => key });
          const lazy = !document.querySelector(".xmpp-availability");
          document.getElementById("draft").focus();
          const first = controller.check(options);
          const samePromise = first === controller.check(options);
          const overlay = document.querySelector(".xmpp-availability");
          const checking = overlay.open && overlay.dataset.state === "checking"
            && document.activeElement === overlay.querySelector('[role="status"]');
          harness.sockets[0].emit("error");
          const unavailable = await first;
          const offline = overlay.querySelector('[role="status"]').textContent;
          const inert = document.querySelector(".app-shell").inert && document.getElementById("accountDialog").inert;
          const extra = document.createElement("div");
          document.body.append(extra);
          await Promise.resolve();
          const extraBlocked = extra.inert;
          overlay.querySelector("button").click();
          overlay.querySelector("button").click();
          const retries = harness.sockets.length;
          const socket = harness.sockets.at(-1);
          socket.emit("open");
          socket.emit("message", open + features);
          await Promise.resolve();
          await Promise.resolve();
          return { lazy, samePromise, checking, unavailable, offline, inert, extraBlocked, retries,
            hidden: !overlay.open, restored: !document.querySelector(".app-shell").inert
              && !document.getElementById("accountDialog").inert && !extra.inert,
            prior: document.getElementById("alreadyInert").getAttribute("inert"),
            draft: document.getElementById("draft").value, inputFocused: document.activeElement.matches("input"),
            clean: harness.clean() };
        }, { options, open, features });
        assert.deepEqual(result, { lazy: true, samePromise: true, checking: true, unavailable: false,
          offline: "De chatserver is niet online of niet bereikbaar. Probeer het later opnieuw.",
          inert: true, extraBlocked: true, retries: 2, hidden: true, restored: true, prior: "prior",
          draft: "Unsent draft", inputFocused: false, clean: true });
      });

      await check("Native startup stays visible until account preparation ends, without hiding newer errors", async page => {
        await page.evaluate(() => {
          window.fixture.environment.Capacitor = { getPlatform: () => "ios" };
          const startup = document.createElement("dialog");
          startup.className = "native-startup";
          document.body.append(startup);
        });
        for (const transition of ["prepared", "connecting", "unavailable"]) {
          const result = await page.evaluate(async ({ options, open, features, transition }) => {
            const harness = window.fixture;
            document.body.classList.add("account-booting");
            const controller = harness.api.create();
            const promise = controller.check(options);
            const socket = harness.sockets.at(-1);
            socket.emit("open");
            socket.emit("message", open + features);
            const available = await promise;
            const overlay = document.querySelector(".native-startup");
            const keptVisible = overlay.open;
            document.body.classList.remove("account-booting");
            if (transition !== "prepared") controller[transition](() => {});
            await Promise.resolve();
            const visible = overlay.open;
            controller.hide();
            overlay.remove();
            const next = document.createElement("dialog");
            next.className = "native-startup";
            document.body.append(next);
            return { available, keptVisible, visible };
          }, { options, open, features, transition });
          assert.deepEqual(result, { available: true, keptVisible: true, visible: transition !== "prepared" });
        }
      });

      await check("State transitions cancel probes and ignore even queued late failures", async page => {
        for (const transition of ["ready", "hide", "connecting", "unavailable"]) {
          const result = await page.evaluate(async ({ options, transition }) => {
            const harness = window.fixture;
            const controller = harness.api.create();
            const promise = controller.check(options);
            const socket = harness.sockets.at(-1);
            const lateFailure = socket.listeners.get("error");
            controller[transition](() => {});
            lateFailure();
            harness.advance(8000);
            const available = await promise;
            const overlay = document.querySelector(".xmpp-availability:last-of-type");
            const result = { available, visible: overlay.open, state: overlay.dataset.state, clean: harness.clean() };
            controller.hide();
            overlay.remove();
            return result;
          }, { options, transition });
          assert.equal(result.available, false);
          assert.equal(result.visible, ["connecting", "unavailable"].includes(transition));
          if (result.visible) assert.equal(result.state, transition === "connecting" ? "checking" : "offline");
          assert.equal(result.clean, true);
        }
        assert.equal(await page.evaluate(async ({ options, open, features }) => {
          const harness = window.fixture;
          const controller = harness.api.create();
          const old = controller.check(options);
          const current = controller.check({ ...options, url: "wss://other.test/xmpp" });
          const socket = harness.sockets.at(-1);
          socket.emit("open");
          socket.emit("message", open + features);
          return !(await old) && await current && harness.clean();
        }, { options, open, features }), true);
        assert.equal(await page.evaluate(async ({ options, open, features }) => {
          const harness = window.fixture;
          const controller = harness.api.create();
          const promise = controller.check(options);
          const socket = harness.sockets.at(-1);
          socket.emit("open");
          socket.emit("message", open + features);
          controller.connecting();
          const available = await promise;
          const overlays = document.querySelectorAll(".xmpp-availability");
          const overlay = overlays[overlays.length - 1];
          const remainsChecking = overlay.open && overlay.dataset.state === "checking";
          controller.ready();
          return !available && remainsChecking && !overlay.open && harness.clean();
        }, { options, open, features }), true);
      });

      await check("Translated offline UI, rejected retry, top-layer coverage and mobile sizing", async page => {
        await page.evaluate(() => {
          const harness = window.fixture;
          window.translationKeys = [];
          window.retries = 0;
          document.body.className = "native-startup";
          document.getElementById("nativeDialog").showModal();
          window.controller = harness.api.create({ translate: key => {
            window.translationKeys.push(key);
            return { "status.xmpp_server_checking": "Checking", "status.xmpp_server_connecting": "Connecting", "status.xmpp_server_offline": "Offline",
              "status.xmpp_server_retry": "Retry" }[key];
          } });
          window.controller.connecting();
          window.controller.unavailable(async () => { window.retries++; throw new Error("Retry failed"); });
        });
        await page.keyboard.press("Escape");
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        assert.deepEqual(await page.evaluate(() => {
          const overlay = document.querySelector(".xmpp-availability");
          return { open: overlay.open, retries: window.retries, disabled: overlay.querySelector("button").disabled,
            text: overlay.querySelector('[role="status"]').textContent,
            keys: Array.from(new Set(window.translationKeys)).sort(),
            nativeStartup: document.body.className, zIndex: Number(getComputedStyle(overlay).zIndex),
            modal: overlay.matches(":modal"), otherModal: document.getElementById("nativeDialog").open };
        }), { open: true, retries: 1, disabled: false, text: "Offline", nativeStartup: "native-startup",
          zIndex: 20000, modal: true, otherModal: true,
          keys: ["status.xmpp_server_checking", "status.xmpp_server_connecting", "status.xmpp_server_offline", "status.xmpp_server_retry"] });
        for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }, { width: 1280, height: 720 }]) {
          await page.setViewportSize(viewport);
          const bounds = await page.locator(".xmpp-availability").boundingBox();
          assert.deepEqual(bounds, { x: 0, y: 0, ...viewport });
        }
        await page.evaluate(() => window.controller.hide());
        assert.equal(await page.evaluate(() => document.getElementById("nativeDialog").open
          && !document.getElementById("nativeDialog").inert), true);
      });
    } finally { await browser.close(); }
  });
}
