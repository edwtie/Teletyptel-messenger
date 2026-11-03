const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "php/public/jingle-session.js"), "utf8");
const client = fs.readFileSync(path.join(root, "php/public/chat-client.js"), "utf8");
const dispatcher = client.slice(client.indexOf("  function handleXmppIqElement("), client.indexOf("  function applyXmppRosterItem("));

async function check(engine, name) {
  const browser = await engine.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("https://jingle.teletyptel.test/**", route => route.fulfill({
      contentType: "text/html", body: "<!doctype html><title>Isolated Jingle IQ fixture</title>"
    }));
    await page.goto("https://jingle.teletyptel.test/");
    await page.evaluate(source);
    const results = await page.evaluate(async dispatcher => {
      const parse = text => new DOMParser().parseFromString(text, "application/xml").documentElement;
      const xml = value => new XMLSerializer().serializeToString(value);
      const NS = TeleTypTelJingleSession.NS;
      const caller = "alice@example.test/phone", callee = "bob@example.test/tablet";
      const offer = () => [parse(`<content xmlns="${NS}" creator="initiator" name="text" senders="both">
        <description xmlns="urn:xmpp:jingle:apps:rtp:1" media="text">
          <payload-type id="98" name="t140" clockrate="1000"/>
          <payload-type id="100" name="red" clockrate="1000"><parameter name="fmtp" value="98/98/98"/></payload-type>
        </description><transport xmlns="urn:xmpp:jingle:transports:ice-udp:1" ufrag="fixture" pwd="synthetic-only"/>
      </content>`)];
      const supported = jingle => jingle.getElementsByTagNameNS("urn:xmpp:jingle:apps:rtp:1", "payload-type")[0]?.getAttribute("name") === "t140";
      const verify = (condition, message) => { if (!condition) throw new Error(message); };
      const tick = () => new Promise(resolve => setTimeout(resolve, 0));
      const endpoints = [];
      const completed = [];
      function endpoint(jid, extra = {}) {
        const queue = [], events = [];
        const agent = TeleTypTelJingleSession.create({ localJid: jid, send: stanza => queue.push(stanza),
          allowPeer: () => true, supports: supported, onEvent: event => events.push(event), ...extra });
        const result = { agent, queue, events, jid };
        endpoints.push(result);
        return result;
      }
      function request(from, to, sid, action, id = crypto.randomUUID(), payload = "") {
        const stanza = parse(`<iq xmlns="jabber:client" type="set"><jingle xmlns="${NS}"/></iq>`);
        for (const [key, value] of Object.entries({ from, to, id })) stanza.setAttribute(key, value);
        stanza.firstElementChild.setAttribute("sid", sid);
        stanza.firstElementChild.setAttribute("action", action);
        if (payload) stanza.firstElementChild.appendChild(stanza.ownerDocument.importNode(parse(payload), true));
        return stanza;
      }
      function transfer(sender, receiver) {
        const outgoing = sender.queue.shift();
        verify(Boolean(outgoing), "Expected outbound IQ");
        verify(receiver.agent.handleIq(parse(outgoing)), "IQ handled");
        return outgoing;
      }
      async function pair() {
        const left = endpoint(caller), right = endpoint(callee);
        const pending = left.agent.initiate(callee, offer(), "session-fixture");
        const initial = transfer(left, right);
        verify(!initial.includes("json-base64") && !initial.includes("browser-managed"), "Real XML, not diagnostic JSON");
        verify(right.agent.snapshot()?.state === "pending", "Incoming offer pending, not accepted by IQ result");
        transfer(right, left);
        await pending;
        return { left, right, initial };
      }
      async function run(label, body) {
        try { await body(); completed.push(label); }
        finally { for (const entry of endpoints.splice(0)) entry.agent.reset(); await tick(); }
      }
      await run("initiate/result/accept/result/transport/terminate", async () => {
        const { left, right } = await pair();
        verify(left.agent.snapshot().state === "pending", "IQ acknowledgement is not call acceptance");
        const accepted = right.agent.accept(offer());
        transfer(right, left);
        verify(left.agent.snapshot().state === "active", "Initiator accepted");
        transfer(left, right);
        await accepted;
        verify(right.agent.snapshot().state === "active", "Responder active after acknowledgement");
        const candidate = offer()[0]; candidate.removeChild(candidate.firstElementChild);
        const transported = left.agent.transportInfo([candidate]);
        transfer(left, right); transfer(right, left); await transported;
        verify(right.events.some(event => event.event === "transport-info"), "Transport delivered");
        const terminated = left.agent.terminate();
        verify(left.agent.snapshot() === null, "End immediately, not after acknowledgement");
        transfer(left, right); transfer(right, left); await terminated;
        verify(right.agent.snapshot() === null, "Both ended");
      });
      await run("forged result and wrong resource cannot acknowledge", async () => {
        const left = endpoint(caller);
        let acknowledged = false;
        const pending = left.agent.initiate(callee, offer()); pending.catch(() => {});
        pending.then(() => { acknowledged = true; }, () => {});
        const original = parse(left.queue.shift());
        const response = parse(`<iq xmlns="jabber:client" type="result"/>`);
        response.setAttribute("id", original.getAttribute("id"));
        response.setAttribute("from", "bob@example.test/other-device");
        response.setAttribute("to", caller);
        left.agent.handleIq(response); await tick();
        verify(!acknowledged, "Wrong resource must not acknowledge");
        response.setAttribute("from", callee); response.setAttribute("to", "other@example.test/device");
        left.agent.handleIq(response); await tick(); verify(!acknowledged, "Wrong recipient ignored");
        response.setAttribute("to", caller); left.agent.handleIq(response); await pending;
        verify(acknowledged, "Correct response accepted");
      });
      await run("simultaneous hangup is acknowledged without reopening an ended session", async () => {
        const { left, right } = await pair();
        const leftEnd = left.agent.terminate();
        const rightEnd = right.agent.terminate();
        transfer(left, right); transfer(right, left);
        transfer(left, right); transfer(right, left);
        await Promise.all([leftEnd, rightEnd]);
        verify(!left.agent.snapshot() && !right.agent.snapshot(), "Both ended");
        left.agent.handleIq(request("mallory@example.test/phone", caller, "session-fixture", "session-terminate"));
        verify(left.queue.pop().includes("unknown-session"), "Ended cache remains peer-bound");
        left.agent.reset();
        left.agent.handleIq(request(callee, caller, "session-fixture", "session-terminate"));
        verify(left.queue.pop().includes("unknown-session"), "Reset clears ended cache");
      });
      await run("wrong peer and unknown SID cannot terminate", async () => {
        const { left, right } = await pair();
        for (const [peer, sid] of [["mallory@example.test/phone", "session-fixture"], [callee, "old-session"]]) {
          left.agent.handleIq(request(peer, caller, sid, "session-terminate"));
          verify(left.queue.pop().includes("unknown-session"), "Unknown session error");
          verify(left.agent.snapshot() !== null, "Unrelated session preserved");
        }
        const ended = right.agent.terminate(); ended.catch(() => {});
        transfer(right, left); transfer(left, right); await ended;
        left.agent.handleIq(request(callee, caller, "session-fixture", "session-info"));
        verify(left.queue.pop().includes("unknown-session"), "Ended session stays ended");
      });
      await run("replayed IQ is idempotent, ID reuse with changed payload fails", async () => {
        const { left, right, initial } = await pair();
        const count = right.events.filter(event => event.event === "incoming").length;
        right.agent.handleIq(parse(initial));
        verify(parse(right.queue.pop()).getAttribute("type") === "result", "Duplicate acknowledged");
        verify(right.events.filter(event => event.event === "incoming").length === count, "No duplicate incoming event");
        const changed = parse(initial); changed.firstElementChild.setAttribute("action", "session-terminate");
        right.agent.handleIq(changed);
        verify(right.queue.pop().includes("bad-request"), "Changed replay rejected");
        verify(right.agent.snapshot() !== null && left.agent.snapshot() !== null, "Replay cannot end session");
      });
      await run("unsupported application acknowledges then terminates, no media opened", async () => {
        const left = endpoint(caller), right = endpoint(callee, { supports: () => false });
        const pending = left.agent.initiate(callee, offer());
        transfer(left, right); transfer(right, left); await pending;
        verify(right.agent.snapshot() === null && !right.events.some(event => event.event === "incoming"), "No incoming media event");
        verify(right.queue[0].includes("unsupported-applications"), "Explicit negotiation failure");
        transfer(right, left); transfer(left, right); await tick();
        verify(left.agent.snapshot() === null, "Caller terminated");
      });
      await run("unexpected action, content and session-info are rejected", async () => {
        const { left, right } = await pair();
        right.agent.handleIq(request(caller, callee, "session-fixture", "session-accept", undefined, xml(offer()[0])));
        verify(right.queue.pop().includes("out-of-order"), "Responder cannot receive accept");
        const alien = offer()[0]; alien.setAttribute("name", "unoffered");
        left.agent.handleIq(request(callee, caller, "session-fixture", "session-accept", undefined, xml(alien)));
        verify(left.queue.pop().includes("bad-request"), "Unnegotiated content rejected");
        left.agent.handleIq(request(callee, caller, "session-fixture", "content-add"));
        verify(left.queue.pop().includes("feature-not-implemented"), "Unsupported action explicit");
        left.agent.handleIq(request(callee, caller, "session-fixture", "session-info", undefined, '<unknown xmlns="urn:test"/>'));
        verify(left.queue.pop().includes("unsupported-info"), "Unsupported info explicit");
        verify(left.agent.snapshot().state === "pending", "No invalid acceptance");
      });
      await run("malformed and nested Jingle cannot enter state machine", async () => {
        const right = endpoint(callee);
        const nested = parse(`<iq xmlns="jabber:client" type="set"><wrapper><jingle xmlns="${NS}"/></wrapper></iq>`);
        verify(right.agent.handleIq(nested) === false, "Only direct Jingle child");
        const malformed = request(caller, callee, "fixture", "session-initiate");
        right.agent.handleIq(malformed); verify(right.queue.pop().includes("bad-request"), "Contents required");
        malformed.firstElementChild.appendChild(offer()[0]);
        malformed.setAttribute("id", crypto.randomUUID());
        malformed.firstElementChild.setAttribute("initiator", "mallory@example.test/device");
        right.agent.handleIq(malformed); verify(right.queue.pop().includes("bad-request"), "Forged initiator rejected");
        verify(right.agent.snapshot() === null, "No malformed session");
      });
      await run("IQ error, timeout, send failure and disconnect release state", async () => {
        const timed = endpoint(caller, { timeoutMs: 20 });
        let failed = false;
        try { await timed.agent.initiate(callee, offer()); } catch { failed = true; }
        verify(failed && timed.agent.snapshot() === null, "Timed-out session released");
        const broken = endpoint(caller, { send: () => false }); failed = false;
        try { await broken.agent.initiate(callee, offer()); } catch { failed = true; }
        verify(failed && broken.agent.snapshot() === null, "Failed send released");
        const denied = endpoint(caller);
        const pending = denied.agent.initiate(callee, offer()); pending.catch(() => {});
        const outgoing = parse(denied.queue.shift());
        const error = parse(`<iq xmlns="jabber:client" type="error"/>`);
        error.setAttribute("id", outgoing.getAttribute("id")); error.setAttribute("from", callee);
        denied.agent.handleIq(error); failed = false;
        try { await pending; } catch { failed = true; }
        verify(failed && denied.agent.snapshot() === null, "IQ error releases session");
        const reset = denied.agent.initiate(callee, offer()); reset.catch(() => {});
        denied.agent.reset(); failed = false;
        try { await reset; } catch { failed = true; }
        verify(failed && denied.agent.snapshot() === null, "Disconnect clears requests");
      });
      await run("discovery advertises only configured adapter features", async () => {
        const left = endpoint(caller), right = endpoint(callee, {
          features: ["urn:xmpp:jingle:apps:rtp:1", "urn:xmpp:jingle:transports:ice-udp:1"]
        });
        const discovery = left.agent.discover(callee);
        transfer(left, right); transfer(right, left);
        const features = await discovery;
        verify(features.has(NS) && features.has("urn:xmpp:jingle:apps:rtp:1"), "Configured features discovered");
        verify(!features.has("urn:xmpp:jingle:apps:rtt-sync:0"), "No unimplemented RTT claim");
        const disabled = endpoint(callee, { supports: () => false });
        const query = parse('<iq xmlns="jabber:client" type="get" id="disco"><query xmlns="http://jabber.org/protocol/disco#info"/></iq>');
        query.setAttribute("from", caller); query.setAttribute("to", callee);
        verify(disabled.agent.handleIq(query) === false && disabled.queue.length === 0, "Inactive adapter does not advertise Jingle");
      });
      await run("busy session survives second offer and transport namespace substitution", async () => {
        const { right } = await pair();
        const other = endpoint("other@example.test/device");
        const attempt = other.agent.initiate(callee, offer(), "second-session");
        transfer(other, right); transfer(right, other); await attempt;
        verify(right.queue[0].includes("busy"), "Second call declined explicitly");
        transfer(right, other); transfer(other, right); await tick();
        verify(right.agent.snapshot().sid === "session-fixture", "First call retained");
        const alien = offer()[0]; alien.removeChild(alien.firstElementChild);
        alien.replaceChild(parse('<transport xmlns="urn:untrusted:transport"/>'), alien.firstElementChild);
        right.agent.handleIq(request(caller, callee, "session-fixture", "transport-info", undefined, xml(alien)));
        verify(right.queue.pop().includes("bad-request"), "Transport replacement needs negotiation");
      });
      await run("real Messenger IQ dispatcher rejects unimplemented media safely", async () => {
        const right = endpoint(callee, { supports: () => false });
        const state = { xmppSession: { boundJid: callee } };
        const dispatch = new Function("jingleSessions", "state", "isXmppRttConnected", "handleXmppPing", "xmppTranslation",
          "xmppRosterNamespace", `${dispatcher}; return handleXmppIqElement;`)(
          right.agent, state, () => true, () => false, { handleIq: () => false }, "jabber:iq:roster");
        const incoming = request(caller, callee, "dispatch-session", "session-initiate", undefined, xml(offer()[0]));
        state.xmppSession.boundJid = "";
        verify(dispatch(incoming) === false && !right.queue.length, "Never use fabricated pre-bind JID");
        state.xmppSession.boundJid = callee;
        verify(dispatch(incoming) === true, "Actual client dispatches standard IQ");
        verify(parse(right.queue[0]).getAttribute("type") === "result" && right.queue[1].includes("unsupported-applications"), "Explicit rejection, no fake success");
        verify(!right.events.some(event => event.event === "incoming"), "No camera/microphone/UI invocation");
      });
      await run("media adapter can reject unsupported trickle or ICE restart", async () => {
        const { right } = await pair();
        right.agent.reset();
        const guarded = endpoint(callee, { supportsTransport: () => false });
        guarded.agent.handleIq(request(caller, callee, "fixed-ice", "session-initiate", undefined, xml(offer()[0])));
        guarded.queue.length = 0;
        const transport = offer()[0];
        transport.removeChild(transport.firstElementChild);
        guarded.agent.handleIq(request(caller, callee, "fixed-ice", "transport-info", undefined, xml(transport)));
        verify(guarded.queue[0].includes("not-acceptable"), "Adapter rejection returns IQ error");
        verify(!guarded.events.some(event => event.event === "transport-info"), "Rejected candidate is never applied");
        verify(guarded.agent.snapshot()?.sid === "fixed-ice", "Existing session survives rejected update");
      });
      await run("native WebView IDs work without randomUUID", async () => {
        const original = crypto.randomUUID;
        crypto.randomUUID = undefined;
        try {
          const { left, right } = await pair();
          const ending = left.agent.terminate();
          transfer(left, right); transfer(right, left); await ending;
        } finally { crypto.randomUUID = original; }
      });
      return completed;
    }, dispatcher);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}: ${results.length} Jingle IQ scenarios\n- ${results.join("\n- ")}`);
  } finally { await browser.close(); }
}

(async () => {
  assert.match(fs.readFileSync(path.join(root, "php/public/chat.html"), "utf8"), /jingle-session\.js/);
  assert.ok(require("../scripts/ios-testflight/bundle-frontend").assetFiles().includes("jingle-session.js"));
  await check(chromium, "Chromium");
  await check(webkit, "WebKit");
})().catch(error => { console.error(error); process.exitCode = 1; });
