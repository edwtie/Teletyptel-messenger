const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit, devices } = require("playwright");

const root = path.resolve(__dirname, "../php/public");
const origin = "https://receipts.teletyptel.test";
const profile = { accountId: "receipt-fixture", jid: "sam@example.test", displayName: "Sam",
  providerId: "fixture", preferredLanguage: "ned", peer: "noor@example.test",
  xmppWebSocket: "wss://receipts.teletyptel.test/websocket", xmppDomain: "example.test" };
const source = fs.readFileSync(path.join(root, "chat-client.js"), "utf8");
assert.ok(source.trimEnd().endsWith("})();"));
const hook = `
  window.receiptFixture = {
    packets: [],
    setup(mode) {
      state.mode = mode;
      state.activeTabId = "chat";
      state.clientLifecycle.current = "active";
      state.xmppSession = { authenticated: true, streamManagement: null };
      const socket = { readyState: WebSocket.OPEN, send: (packet) => this.packets.push(packet) };
      state.xmppSocket = mode === "xmpp" ? socket : null;
      state.relaySocket = mode === "xmpp" ? null : socket;
      state.conversations = [];
      state.activeConversationId = null;
      this.chat = ensureConversationForPeer("noor@example.test", "contact", "Noor");
      this.other = ensureConversationForPeer("other@example.test", "contact", "Other");
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => this.hidden ? "hidden" : "visible" });
      document.hasFocus = () => !this.blurred;
      this.hidden = false; this.blurred = false;
      renderActiveConversation();
      this.clear();
    },
    clear() { this.packets.length = 0; },
    receive(id, markable = true) {
      if (state.mode === "xmpp") handleXmppIncomingFrame('<message xmlns="jabber:client" from="noor@example.test/device" type="chat" id="' + id + '"><body>Hello ' + id + '</body><origin-id xmlns="urn:xmpp:sid:0" id="origin-' + id + '"/><stanza-id xmlns="urn:xmpp:sid:0" by="example.test" id="archive-' + id + '"/><request xmlns="urn:xmpp:receipts"/>' + (markable ? '<markable xmlns="urn:xmpp:chat-markers:0"/>' : '') + '</message>');
      else applyRelayEnvelope({ type: "message", from: "noor@example.test", to: "sam@example.test", text: "Hello " + id, messageId: id });
    },
    open(other = false) { selectConversation(other ? this.other : this.chat); renderActiveConversation(); },
    scan() { acknowledgeVisibleMessages(); },
    sync() { syncAllConversationMessageState("fixture-history"); },
    disconnect() { (state.mode === "xmpp" ? state.xmppSocket : state.relaySocket).readyState = WebSocket.CLOSED; },
    reconnect() {
      const socket = { readyState: WebSocket.OPEN, send: (packet) => this.packets.push(packet) };
      if (state.mode === "xmpp") state.xmppSocket = socket; else state.relaySocket = socket;
      this.sync();
    },
    selfStatus(status) {
      const message = this.chat.messages.find((item) => item.direction === "self")
        || addMessage("self", "Outgoing", "sent", currentFromJid(), null, this.chat.id, null, "outgoing", false, false);
      this.chat.presence = "offline";
      if (status) applyMessageDeliveryMarker(this.chat, "outgoing", status);
      return messageReceiptLabel(message);
    },
    tab(value) { state.activeTabId = value; },
    viewport(visible) {
      const message = this.chat.messages.at(-1);
      const item = [...el.messageTimeline.querySelectorAll("[data-message-id]")].find((node) => node.dataset.messageId === message.id);
      if (!visible) item.getBoundingClientRect = () => ({ top: -2000, bottom: -1900, left: 0, right: 100, width: 100, height: 100 });
      else delete item.getBoundingClientRect;
    }
  };
`;
const instrumented = source.replace(/\}\)\(\);\s*$/, hook + "})();");

async function check(engine, device, label) {
  const browser = await engine.launch({ headless: true });
  try {
    const context = await browser.newContext({ ...devices[device], locale: "nl-NL", serviceWorkers: "block" });
    const failures = [];
    await context.routeWebSocket("**/*", (socket) => socket.close());
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === "/config/account-profile.json") return route.fulfill({ json: profile });
      if (url.pathname === "/config/google-maps.json") return route.fulfill({ json: {} });
      if (url.pathname === "/api/account.php") return route.fulfill({ json: { ok: true, account: null } });
      if (url.pathname === "/api/history.php") return route.fulfill({ json: { ok: true, messages: [], calls: [] } });
      if (url.pathname === "/api/group-metadata.php") return route.fulfill({ json: { ok: true, groups: [] } });
      if (url.pathname === "/api/rtc-config.php") return route.fulfill({ json: { iceServers: [] } });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ status: 403, json: { ok: false } });
      if (url.pathname === "/chat-client.js") return route.fulfill({ contentType: "text/javascript", body: instrumented });
      const file = path.resolve(root, "." + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.fulfill({ status: 404, body: "" });
      return route.fulfill({ path: file });
    });
    await context.addInitScript((account) => sessionStorage.setItem("teletyptel.serverAccountSession", JSON.stringify(account)), profile);
    const page = await context.newPage();
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(origin + "/chat.html");
    await page.waitForFunction(() => !document.body.classList.contains("account-booting"));
    const packets = () => page.evaluate(() => window.receiptFixture.packets.map((packet) => {
      if (packet.startsWith("{")) { const value = JSON.parse(packet); return { kind: value.ack, id: value.targetMessageId }; }
      const xml = new DOMParser().parseFromString(packet, "application/xml");
      const marker = xml.getElementsByTagNameNS("urn:xmpp:chat-markers:0", "displayed")[0];
      const receipt = xml.getElementsByTagNameNS("urn:xmpp:receipts", "received")[0];
      return { kind: marker ? "displayed" : receipt ? "delivered" : "other", id: (marker || receipt)?.getAttribute("id") };
    }).filter((packet) => packet.kind !== "other"));
    const settle = () => page.waitForTimeout(250);
    for (const mode of ["xmpp", "relay"]) {
      await page.evaluate((mode) => { window.receiptFixture.setup(mode); window.receiptFixture.receive("unopened"); }, mode);
      await settle();
      assert.deepEqual(await packets(), [{ kind: "delivered", id: "unopened" }], mode + ": arrival is delivery, not read; use sender's message ID");
      await page.evaluate(() => { window.receiptFixture.clear(); window.receiptFixture.sync(); });
      await settle();
      assert.deepEqual(await packets(), [], mode + ": loading history does not send receipts for unopened conversations");
      await page.evaluate(() => { window.receiptFixture.hidden = true; window.receiptFixture.open(); });
      await settle();
      assert.deepEqual(await packets(), [], mode + ": background chat is not read");
      await page.evaluate(() => { window.receiptFixture.hidden = false; window.receiptFixture.blurred = true; window.receiptFixture.scan(); });
      assert.deepEqual(await packets(), [], mode + ": unfocused chat is not read");
      await page.evaluate(() => { window.receiptFixture.blurred = false; window.receiptFixture.open(true); window.receiptFixture.scan(); });
      assert.deepEqual(await packets(), [], mode + ": other conversation does not acknowledge the message");
      await page.evaluate(() => { window.receiptFixture.open(); window.receiptFixture.tab("news"); });
      await settle();
      assert.deepEqual(await packets(), [], mode + ": other application tab is not read");
      await page.evaluate(() => { window.receiptFixture.tab("chat"); window.receiptFixture.viewport(false); window.receiptFixture.scan(); });
      assert.deepEqual(await packets(), [], mode + ": offscreen message is not read");
      await page.evaluate(() => { window.receiptFixture.viewport(true); window.dispatchEvent(new Event("focus")); });
      await settle();
      assert.deepEqual(await packets(), [{ kind: "displayed", id: "unopened" }], mode + ": focused visible message sends displayed");
      await page.evaluate(() => { window.receiptFixture.scan(); window.receiptFixture.sync(); });
      await settle();
      assert.equal((await packets()).length, 1, mode + ": duplicate read markers suppressed");
      await page.evaluate(() => { window.receiptFixture.clear(); window.receiptFixture.hidden = true; window.receiptFixture.receive("background"); });
      await settle();
      assert.deepEqual(await packets(), [{ kind: "delivered", id: "background" }], mode + ": new background message is delivery only");
      await page.evaluate(() => { window.receiptFixture.clear(); window.receiptFixture.disconnect(); window.receiptFixture.hidden = false; window.receiptFixture.scan(); });
      assert.deepEqual(await packets(), [], mode + ": disconnected client cannot acknowledge");
      await page.evaluate(() => { window.receiptFixture.hidden = true; window.receiptFixture.reconnect(); });
      await settle();
      assert.deepEqual(await packets(), [], mode + ": background reconnect is not read");
      await page.evaluate(() => { window.receiptFixture.hidden = false; document.dispatchEvent(new Event("visibilitychange")); });
      await settle();
      assert.ok((await packets()).some((packet) => packet.kind === "displayed" && packet.id === "background"), mode + ": foreground return flushes visible unread message");
      if (mode === "xmpp") {
        await page.evaluate(() => { window.receiptFixture.clear(); window.receiptFixture.receive("not-markable", false); });
        await settle();
        assert.deepEqual(await packets(), [{ kind: "delivered", id: "not-markable" }], "No unsolicited read marker for non-markable XMPP messages");
      }
      const status = await page.evaluate(() => {
        const sent = window.receiptFixture.selfStatus();
        const delivered = window.receiptFixture.selfStatus("delivered");
        const displayed = window.receiptFixture.selfStatus("displayed");
        const lateDelivery = window.receiptFixture.selfStatus("delivered");
        return [sent.state, delivered.state, displayed.state, lateDelivery.state];
      });
      assert.deepEqual(status, ["sent", "delivered", "displayed", "displayed"], mode + ": genuine read confirmation is independent of offline presence and cannot regress");
    }
    assert.deepEqual(failures, []);
    console.log("Message receipts passed: " + label + ", XMPP and relay, visibility/focus, history, reconnection, IDs and status transitions.");
  } finally { await browser.close(); }
}

(async () => {
  await check(chromium, "Pixel 7", "Android");
  await check(webkit, "iPhone 13", "iPhone");
})().catch((error) => { console.error(error); process.exitCode = 1; });
