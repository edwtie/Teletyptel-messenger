const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { safeAccount, safeState, createClient } = require("../mobile/ios-hybrid/Web/native-session");
const roster = { status: "ready", contacts: [{ jid: "peer@localhost", name: "Peer", presence: "online" }] };
const state = epoch => ({ version: 1, sequence: 1, epoch, phase: "idle", chatAvailable: false, callsAvailable: false, socialLoginAvailable: false });

test("provider capabilities contain no credentials and must match the native snapshot", () => {
  const epoch = crypto.randomUUID();
  const value = safeState({ ...state(epoch), socialLoginAvailable: true, account: { providers: ["google", "facebook"] } });
  assert.deepEqual(value.account.providers, ["google", "facebook"]);
  assert.ok(Object.isFrozen(value.account.providers));
  assert.throws(() => safeState({ ...state(epoch), socialLoginAvailable: true }), /invalidNativeReply/);
  assert.throws(() => safeAccount({ providers: ["google"], token: "secret" }, roster, "idle"), /invalidNativeReply/);
  assert.throws(() => safeAccount({ providers: ["other"] }, roster, "idle"), /invalidNativeReply/);
});

test("avatars accept only bounded native JPEG thumbnails for the owner and current contacts", () => {
  const image = "data:image/jpeg;base64,/9j/2Q==";
  const good = safeAccount({ owner: "fixture@localhost", avatars: { "peer@localhost": image } }, roster, "connected");
  assert.equal(good.avatars["peer@localhost"], image);
  assert.ok(Object.isFrozen(good.avatars));
  for (const avatars of [{ "unknown@localhost": image }, { "peer@localhost": "https://tracking.invalid/photo" },
    { "peer@localhost": "data:image/svg+xml,<svg onload=alert(1)>" }, { "peer@localhost": image + "x".repeat(40000) }]) {
    assert.throws(() => safeAccount({ avatars }, roster, "connected"), /invalidNativeReply/);
  }
  assert.throws(() => safeAccount({ owner: "fixture@localhost", avatars: { "peer@localhost": image } }, roster, "signedOut"), /invalidNativeReply/);
});

test("profile data is a minimal editable projection, never a server account ID or CSRF token", () => {
  const profile = { jid: "fixture@localhost", name: "Fixture", phone: "", language: "nl", color: "#2563eb" };
  const valid = safeAccount({ owner: profile.jid, profile }, roster, "connected");
  assert.ok(Object.isFrozen(valid.profile));
  for (const bad of [{ ...profile, accountId: "private" }, { ...profile, csrfToken: "private" }, { ...profile, jid: "other@localhost" }]) {
    assert.throws(() => safeAccount({ owner: profile.jid, profile: bad }, roster, "connected"), /invalidNativeReply/);
  }
});

test("account operations and logout are epoch scoped and old account work is rejected", async () => {
  const epoch = crypto.randomUUID(); const commands = [];
  const client = createClient({ makeID: crypto.randomUUID, postMessage: body => {
    const request = JSON.parse(body); commands.push(request);
    return { version: 1, id: request.id, snapshot: { ...state(epoch), sequence: commands.length + 1 } };
  } });
  client.receive(state(epoch));
  await client.accountCommand("auth.social", { provider: "google" });
  await client.accountCommand("contacts.add", { jid: "peer@localhost", name: "Peer", presence: false });
  await client.logout();
  assert.ok(commands.every(command => command.epoch === epoch));
  assert.equal(commands[1].arguments.presence, "false");
  client.receive({ ...state(crypto.randomUUID()), sequence: 20 });
  await assert.rejects(client.accountCommand("account.save", {}, epoch), /invalidState/);
  assert.equal(commands.length, 3); client.dispose();
});

test("provider login keychain and avatars reuse native code without a browser authentication fallback", () => {
  const source = fs.readFileSync("mobile/ios-hybrid/App/NativeHybridAccountAdapter.swift", "utf8");
  for (const name of ["NativeProviderSDK", "NativeSavedLoginModel", "NativeAccountSettingsModel", "NativeAvatarCache", "NativeContactEditor", "NativeContactRequests"]) assert.ok(source.includes(name));
  assert.match(source, /provider\.configured/); assert.match(source, /CGImageSourceCreateThumbnailAtIndex/);
  assert.match(source, /encoded\.count <= 24000/); assert.match(source, /profile\.accountId == login\.activeAccountID/);
  assert.doesNotMatch(source, /URLSession\(|UserDefaults.*password|startSipCall/);
});
