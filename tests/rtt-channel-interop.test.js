const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium, webkit } = require("playwright");

const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
function section(start, end) {
  const first = client.indexOf(`  ${start}`);
  const last = client.indexOf(`  ${end}`, first);
  assert.ok(first >= 0 && last > first);
  return client.slice(first, last);
}

const harness = `(() => {
  const jingleRttSyncNamespace = "urn:xmpp:jingle:apps:rtt-sync:0";
  const jingleRttSyncDataChannelLabel = "rtt";
  const teletyptelRttDataChannelProtocol = "teletyptel-rtt-json-v1";
  const jingleRttSyncMaxSkewMs = 700;
  const t140Backspace = "\\b", t140Delete = "\\u007f";
  const conversation = { peer: "fixture@example.test", remoteText: "" };
  const call = { sid: "fixture", peer: conversation.peer, rttEnabled: true, localStream: null, tcRemoteText: "" };
  const state = { call }, finals = [];
  const activeConversation = () => conversation, ensureConversationForPeer = () => conversation;
  const addressMatches = (left, right) => left === right;
  const currentFromJid = () => "local@example.test", displayNameForJid = value => value;
  const isActiveConversationBlocked = () => false;
  const isXmppRttConnected = () => false, isRelayConnected = () => false;
  const t = (key, fallback) => fallback, escapeXml = value => value;
  const appendDebug = () => {}, setPeerPresence = () => {}, recordTotalConversationText = () => {};
  const updateRemoteDraftMessage = () => {}, updateTotalConversationTextPanel = () => {};
  const setCallStatus = text => { window.statusText = text; }, updateCallUi = () => {};
  const flushTotalConversationInput = () => {};
  const updateCallInputUi = () => {}, appendWebRtcStateDebug = () => {};
  const scheduleTotalConversationRecorder = () => {}, sendJingleEnvelope = () => {};
  const rtcPeerConnectionConfig = () => ({ iceServers: [] }), rtcConfigDebugSummary = () => "fixture";
  const candidateDebugSummary = () => "fixture", dataChannelDebugSummary = () => "fixture";
  const callModeName = () => "total", createJingleRttPacketDebugXml = () => "fixture";
  const applyJingleRttSyncDraft = (call, packet) => { call.tcRemoteText = packet.text; };
  const applyJingleRttSyncFinal = (call, packet) => { finals.push(packet.text); call.tcRemoteText = ""; };
  ${section("function createJingleRttSyncDescriptor(", "function rtcPeerConnectionConfig(")}
  ${section("function configureJingleRttSyncChannel(", "function applyXmppRttElement(")}
  ${section("function isIgnoredT140Control(", "function applyJingleRttSyncDraft(")}
  ${section("function jingleRttSyncStatusText(", "function redactJingleForLog(")}
  window.fixture = {
    start({ role, legacy = false }) {
      call.role = legacy ? "receiver" : role;
      call.rttSync = createJingleRttSyncDescriptor(call.sid);
      createPeerConnection(call);
      if (legacy) configureJingleRttSyncChannel(call,
        call.pc.createDataChannel("rtt", { ordered: true, protocol: "t140" }));
      call.role = role;
    },
    async offer() {
      await call.pc.setLocalDescription(await call.pc.createOffer());
    },
    async answer(offer) {
      await call.pc.setRemoteDescription(offer);
      await call.pc.setLocalDescription(await call.pc.createAnswer());
    },
    accept: answer => call.pc.setRemoteDescription(answer),
    gathered: () => call.pc.iceGatheringState === "complete",
    description: () => call.pc.localDescription.toJSON(),
    open: () => call.rttChannel?.readyState === "open",
    protocol: () => call.rttChannel.protocol,
    send(event, text) {
      const sent = sendJingleRttSyncPacket(event, text, { previousText: call.previousText || "" });
      if (sent) call.previousText = event === "message" ? "" : text;
      return sent;
    },
    raw: text => call.rttChannel.send(text),
    text: () => call.tcRemoteText,
    finals: () => finals,
    close: () => call.rttChannel.close()
  };
})();`;

async function check(engine, name, legacy = false) {
  const browser = await engine.launch({ headless: true });
  try {
    const caller = await browser.newPage();
    const receiver = await browser.newPage();
    const failures = [];
    for (const page of [caller, receiver]) {
      page.on("pageerror", error => failures.push(error.message));
      await page.route("https://rtt-channel.teletyptel.test/**", route => route.fulfill({
        contentType: "text/html", body: "<!doctype html><title>RTT fixture</title>"
      }));
      await page.goto("https://rtt-channel.teletyptel.test/");
      await page.evaluate(harness);
    }
    const hasWebRtc = await caller.evaluate(() => typeof RTCPeerConnection === "function");
    if (!hasWebRtc && engine === webkit) {
      console.log("SKIP WebKit transport: this installed engine has no RTCPeerConnection; a real iPhone/iPad retest is still required.");
      return;
    }
    assert.ok(hasWebRtc, "Chromium must expose real WebRTC for this transport test");
    await caller.evaluate(legacy => window.fixture.start({ role: "caller", legacy }), legacy);
    await receiver.evaluate(() => window.fixture.start({ role: "receiver" }));
    await caller.evaluate(() => window.fixture.offer());
    await caller.waitForFunction(() => window.fixture.gathered());
    await receiver.evaluate(offer => window.fixture.answer(offer), await caller.evaluate(() => window.fixture.description()));
    await receiver.waitForFunction(() => window.fixture.gathered());
    await caller.evaluate(answer => window.fixture.accept(answer), await receiver.evaluate(() => window.fixture.description()));
    for (const page of [caller, receiver]) {
      await page.waitForFunction(() => window.fixture.open());
      assert.equal(await page.evaluate(() => window.fixture.protocol()), legacy ? "t140" : "teletyptel-rtt-json-v1");
    }
    const literalEnvelope = JSON.stringify({ type: "jingle-rtt-sync",
      namespace: "urn:xmpp:jingle:apps:rtt-sync:0", sid: "fixture", event: "message", text: "literal" });
    for (const [sender, target] of [[caller, receiver], [receiver, caller]]) {
      for (const text of ["123", "Hallo 👋", "Hallo!", literalEnvelope, "Nieuwe\nregel"]) {
        assert.equal(await sender.evaluate(text => window.fixture.send("edit", text), text), true);
        await target.waitForFunction(text => window.fixture.text() === text, text);
      }
      assert.equal(await sender.evaluate(() => window.fixture.send("message", "Definitief")), true);
      await target.waitForFunction(() => window.fixture.finals().at(-1) === "Definitief" && window.fixture.text() === "");
    }
    await receiver.evaluate(() => {
      window.fixture.raw("Legacy 👋\r");
      window.fixture.raw("\nantwoord");
    });
    await caller.waitForFunction(() => window.fixture.text() === "Legacy 👋\nantwoord");
    await caller.evaluate(() => window.fixture.close());
    await receiver.waitForFunction(() => /unavailable/.test(window.statusText));
    assert.deepEqual(failures, []);
    console.log(`PASS ${name} ${legacy ? "legacy caller" : "versioned caller"}: actual ordered WebRTC channels, bidirectional snapshots/finals, literal JSON, raw legacy reply and close status.`);
  } finally {
    await browser.close();
  }
}

(async () => {
  await check(chromium, "Chromium");
  await check(chromium, "Chromium", true);
  await check(webkit, "WebKit");
})().catch(error => { console.error(error); process.exitCode = 1; });
