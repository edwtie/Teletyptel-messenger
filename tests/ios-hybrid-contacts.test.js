const { test } = require("node:test");
const assert = require("node:assert/strict");
const { safeState, safeRoster, createClient } = require("../mobile/ios-hybrid/Web/native-session");
const { initials, normalized } = require("../mobile/ios-hybrid/Web/contacts-presentation");
const crypto = require("node:crypto");

const contact = { jid: "peer@localhost", name: "Fictieve Gebruiker", presence: "online" };
const state = (sequence, phase, roster) => ({ version: 1, sequence, phase, errorCode: null,
  chatAvailable: false, callsAvailable: false, socialLoginAvailable: false, roster });

test("authenticated roster is a frozen minimal projection without endpoints or profile data", () => {
  const result = safeRoster({ status: "ready", contacts: [contact] }, "connected");
  assert.deepEqual(result.contacts[0], contact);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.contacts) && Object.isFrozen(result.contacts[0]));
  for (const extra of ["password", "token", "callEndpoint", "groups", "subscription", "avatarUrl"]) {
    assert.throws(() => safeRoster({ status: "ready", contacts: [{ ...contact, [extra]: "private" }] }, "connected"), /invalidNativeReply/);
  }
});

test("roster shape identifiers sizes and presence values fail closed", () => {
  for (const value of [
    { status: "ready", contacts: [contact, contact] },
    { status: "loading", contacts: [contact] },
    { status: "other", contacts: [] },
    { status: "ready", contacts: Array.from({ length: 101 }, (_, index) => ({ ...contact, jid: "peer" + index + "@localhost" })) },
    { status: "ready", contacts: [{ ...contact, presence: "available" }] },
    { status: "ready", contacts: [{ ...contact, jid: "peer@localhost/private-resource" }] },
    { status: "ready", contacts: [{ ...contact, jid: "peer\n@localhost" }] },
    { status: "ready", contacts: [{ ...contact, jid: "x".repeat(1024) }] },
    { status: "ready", contacts: [{ ...contact, name: "x".repeat(4097) }] },
    { status: "ready", contacts: [{ ...contact, name: "User\u0000" }] },
    { status: "hidden", contacts: [], secret: "private" }
  ]) assert.throws(() => safeRoster(value, "connected"), /invalidNativeReply/);
  for (const phase of ["idle", "checking", "authenticating", "signedOut", "suspended", "failed"]) {
    assert.throws(() => safeRoster({ status: "ready", contacts: [contact] }, phase), /invalidNativeReply/);
    assert.deepEqual(safeRoster({ status: "hidden", contacts: [] }, phase).contacts, []);
  }
});

test("presence updates with an unchanged connected phase are delivered; stale account snapshots are ignored", () => {
  const client = createClient({ makeID: crypto.randomUUID, postMessage() { throw new Error("No network in this test"); } });
  const received = [];
  client.subscribe(value => received.push(value));
  client.receive(state(1, "connected", { status: "ready", contacts: [contact] }));
  client.receive(state(2, "connected", { status: "ready", contacts: [{ ...contact, presence: "away" }] }));
  client.receive(state(3, "signedOut", { status: "hidden", contacts: [] }));
  client.receive(state(2, "connected", { status: "ready", contacts: [contact] }));
  assert.deepEqual(received.map(value => value.roster.contacts[0]?.presence), ["online", "away", undefined]);
  assert.equal(received.at(-1).phase, "signedOut");
  assert.deepEqual(safeState(state(4, "connected", { status: "unavailable", contacts: [] })).roster.contacts, []);
  client.dispose();
});

test("initials and search preserve Unicode without executing contact names", () => {
  assert.equal(initials("Edward Tie"), "ET");
  assert.equal(initials("peer@localhost"), "PE");
  assert.equal(initials("Åsa Svensson"), "ÅS");
  assert.equal(initials("😀 User"), "😀U");
  assert.equal(initials(""), "TX");
  assert.equal(normalized("ÉDWÁRD  "), "edward");
  assert.equal(normalized("ＰＥＥＲ"), "peer");
  assert.equal(initials("<script> alert(1)"), "<A");
});
