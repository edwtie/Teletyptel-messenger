const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { safeExtras, safeGroups, safeState, safeConversation, createClient } = require("../mobile/ios-hybrid/Web/native-session");
const group = () => ({ room: "familie@conference.localhost", name: "Familie", joined: true, joining: false, canSpeak: true, subject: "Test",
  participants: ["Fixture", "Peer"], canModerate: false });

test("group metadata is bounded and never carries occupant accounts or native authority objects", () => {
  const value = safeGroups([group()]);
  assert.ok(Object.isFrozen(value[0].participants));
  assert.throws(() => safeGroups([group(), group()]), /invalidNativeReply/);
  assert.throws(() => safeGroups([{ ...group(), occupants: [{ jid: "private@localhost" }] }]), /invalidNativeReply/);
  assert.throws(() => safeGroups([{ ...group(), canModerate: "true" }]), /invalidNativeReply/);
  const conversation = { kind: "group", peer: group().room, draft: "Concept", messages: [], history: "ready", canSend: true, canChange: false };
  assert.equal(safeConversation(conversation, { contacts: [] }, value).kind, "group");
  assert.throws(() => safeConversation(conversation, { contacts: [] }, []), /invalidNativeReply/);
});

test("off or unconsented translation cannot carry captions; live directions have separate consent", () => {
  const id = crypto.randomUUID();
  for (const value of [{ translations: { [id]: "Stale text" } }, { ready: true, available: true, mode: "automatic", consent: false, ownRtt: "Stale" },
    { ready: true, available: true, mode: "automatic", consent: true, liveConsent: false, remoteRtt: "No consent" }]) {
    assert.throws(() => safeExtras(value), /invalidNativeReply/);
  }
  const allowed = safeExtras({ ready: true, available: true, mode: "automatic", consent: true, translations: { [id]: "Hello" } });
  assert.equal(allowed.translations[id], "Hello");
  assert.ok(Object.isFrozen(allowed.translations));
  assert.throws(() => safeExtras({ token: "private" }), /invalidNativeReply/);
  assert.throws(() => safeExtras({ fileMessages: ["file:///private"] }), /invalidNativeReply/);
});

test("feature commands are account-scoped and file operations never transmit local paths or bytes", async () => {
  const epoch = crypto.randomUUID(); const commands = [];
  const state = { version: 1, sequence: 1, phase: "connected", epoch, chatAvailable: true, callsAvailable: false, socialLoginAvailable: false,
    roster: { status: "ready", contacts: [] }, groups: [group()], groupsAvailable: true };
  const client = createClient({ makeID: crypto.randomUUID, postMessage: body => {
    const command = JSON.parse(body); commands.push(command);
    return { version: 1, id: command.id, snapshot: { ...state, sequence: commands.length + 1 } };
  } });
  client.receive(state);
  await client.joinGroup("familie", "Fixture", true);
  await client.pickAttachment();
  await client.openAttachment(crypto.randomUUID());
  await client.disableTranslation();
  assert.ok(commands.every(value => value.epoch === epoch));
  assert.deepEqual(commands[1].arguments, {});
  assert.deepEqual(Object.keys(commands[2].arguments), ["id"]);
  client.receive({ ...state, sequence: 20, epoch: crypto.randomUUID() });
  await assert.rejects(client.pickAttachment(epoch), /invalidState/);
  assert.equal(commands.length, 4);
  assert.throws(() => safeState({ ...state, phase: "signedOut", chatAvailable: false }), /invalidNativeReply/);
  client.dispose();
});

test("native attachment and translation adapters retain selection consent and forbid automatic chat sends", () => {
  const source = fs.readFileSync("mobile/ios-hybrid/App/NativeHybridExtrasAdapter.swift", "utf8");
  const app = fs.readFileSync("mobile/ios-hybrid/App/TeleTypTelHybridApp.swift", "utf8");
  assert.match(app, /NativeAttachmentPicker/);
  assert.match(app, /NativeFileMessageButton/);
  assert.match(source, /translation\.setSharingConsent\(false\)/);
  assert.match(source, /NativeTranslationModel\.sameLanguage/);
  assert.match(source, /scopeEpoch == epoch/);
  assert.match(source, /translation\.pendingCount < 4/);
  assert.doesNotMatch(source, /sendDraft|sendMessage|URLSession\(|Data\(base64Encoded/);
});
