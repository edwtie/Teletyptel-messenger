const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const section = (start, end) => source.slice(source.indexOf(`  function ${start}(`), source.indexOf(`  function ${end}(`));

function fixture() {
  const sent = [];
  const translations = new Map();
  const conversation = { peer: "peer@test", remoteText: "Ordinary chat draft", messages: [
    { direction: "self", text: "Previous call ended" }, { direction: "peer", text: "Old chat" }
  ] };
  const state = { call: null, totalConversationTextVisible: true };
  const el = new Proxy({ messageInput: { value: "Unsent chat" } }, {
    get(target, key) { return target[key] ??= { value: "", textContent: "", classList: { toggle() {} } }; }
  });
  let open = true;
  const context = vm.createContext({ state, el, document: { body: { classList: { toggle() {} } } },
    activeConversation: () => conversation, addressMatches: (left, right) => left === right,
    displayNameForJid: value => value, currentFromJid: () => "self@test", isActiveConversationBlocked: () => false,
    callModeName: () => "total", createJingleRttSyncDescriptor: () => ({}),
    refreshLiveTranslation() {}, shouldUseFullTotalConversationText: () => false, updatePhoneLandscapeCallMode() {},
    activeJingleRttSyncCall: () => open ? state.call : null,
    sendJingleRttSyncPacket(event, text, options) { sent.push({ event, text, options }); return true; },
    jingleRttSyncStatusText: () => "unavailable", setCallStatus() {}, setPeerPresence() {},
    messageTranslation: { clearLive: key => translations.delete(key),
      setLiveDraft: (sid, text, sender, direction, key) => translations.set(key, { sid, text }) }
  });
  vm.runInContext(section("createCallState", "callStartedText")
    + section("recordTotalConversationText", "persistConversationHistoryCall")
    + section("applyJingleRttSyncDraft", "applyJingleRttSyncFinal")
    + section("handleTotalConversationInput", "lastPeerConversationText"), context);
  const start = sid => {
    state.call = context.createCallState(sid, conversation.peer, "caller", "video", true);
    context.updateTotalConversationTextPanel();
    return state.call;
  };
  const type = text => { el.totalConversationLocalText.value = text; context.handleTotalConversationInput(); };
  return { state, el, conversation, sent, translations, context, start, type, closeTransport: () => { open = false; } };
}

test("Each TC call starts empty without importing chat or previous-call text", () => {
  const app = fixture();
  const first = app.start("first");
  assert.equal(app.el.totalConversationLocalText.value, "");
  assert.equal(app.el.totalConversationRemoteText.textContent, "");
  app.type("Live letters 👋\nSecond line");
  app.context.applyJingleRttSyncDraft(first, { text: "Reply" });
  assert.equal(app.el.totalConversationRemoteText.textContent, "Reply");
  const next = app.start("second");
  assert.equal(app.el.totalConversationLocalText.value, "");
  assert.equal(app.el.totalConversationRemoteText.textContent, "");
  assert.equal(next.transcript.length, 0);
  assert.equal(next.transcriptDrafts.self, null);
  app.context.applyJingleRttSyncDraft(first, { text: "Late first-call packet" });
  assert.equal(next.tcRemoteText, "");
  assert.equal(app.el.messageInput.value, "Unsent chat");
  assert.equal(app.conversation.remoteText, "Ordinary chat draft");
  assert.equal(app.conversation.messages.length, 2);
});

test("TC typing sends live edits, not final chat, and preserves whitespace and erasure", () => {
  const app = fixture();
  const call = app.start("call");
  for (const text of ["H", "He", "Hello 👋", "Hello\nthere", " ", ""]) app.type(text);
  assert.deepEqual(app.sent.map(packet => packet.text), ["H", "He", "Hello 👋", "Hello\nthere", " ", ""]);
  assert.ok(app.sent.every(packet => ["reset", "edit"].includes(packet.event)));
  assert.equal(call.tcLocalText, "");
  assert.equal(app.el.messageInput.value, "Unsent chat");
  assert.equal(app.el.totalConversationLocalPreviousText.hidden, true);
});

test("IME composition waits until committed and never switches to chat on transport loss", () => {
  const app = fixture();
  const call = app.start("call");
  call.tcComposing = true;
  app.type("に");
  assert.equal(app.sent.length, 0);
  call.tcComposing = false;
  app.type("日本");
  assert.equal(app.sent.at(-1).text, "日本");
  app.closeTransport();
  app.type("日本語");
  assert.equal(call.tcLocalText, "日本語");
  assert.equal(call.tcSentText, "日本");
  assert.equal(app.el.messageInput.value, "Unsent chat");
});

test("Ending TC clears its displayed text and translations but preserves chat", () => {
  const app = fixture();
  app.start("call");
  app.type("TC draft");
  assert.equal(app.translations.get("tc-self").text, "TC draft");
  app.state.call = null;
  app.context.updateTotalConversationTextPanel();
  assert.equal(app.el.totalConversationLocalText.value, "");
  assert.equal(app.el.totalConversationLocalText.disabled, true);
  assert.equal(app.el.totalConversationLocalText.tcCall, null);
  assert.equal(app.translations.size, 0);
  app.type("Late input");
  assert.equal(app.sent.length, 1);
  assert.equal(app.el.messageInput.value, "Unsent chat");
});

test("Ordinary chat paths never send on or reset the TC datachannel", () => {
  const chat = source.slice(source.indexOf("  function sendComposerMessage("), source.indexOf("  function createRelayEnvelope("));
  assert.doesNotMatch(chat, /sendJingleRttSyncPacket|setRttText|recordTotalConversationText/);
  const transport = source.slice(source.indexOf("  function hasActiveMessageTransport("), source.indexOf("  function hasActiveMessageTransport(") + 250);
  assert.doesNotMatch(transport, /activeJingleRttSyncCall/);
});
