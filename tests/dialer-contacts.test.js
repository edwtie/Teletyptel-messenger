const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const source = client.slice(client.indexOf("  function phoneDialerContacts()"), client.indexOf("  function renderConversations()"));

test("Number calling uses TC labels without enabling an unconnected call action", () => {
  const html = fs.readFileSync(path.join(__dirname, "../php/public/chat.html"), "utf8");
  const button = html.match(/<button id="phoneDialerCall"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.ok(button);
  assert.match(button, /<button[^>]*\bdisabled\b/);
  assert.match(button, /data-i18n-aria-label="dialer.call"/);
  assert.match(button, /data-i18n-title="dialer.call"/);
  assert.doesNotMatch(button, /<button[^>]*\sdata-i18n=/);
  assert.match(button, /class="sr-only" data-i18n="dialer.call">Call with TC<\/span>/);
  const primary = html.match(/<button id="startTotalCallOption"[^>]*>[\s\S]*?<\/button>/)?.[0];
  assert.equal(button.match(/data-icon="([^"]+)"/)[1], primary.match(/data-icon="([^"]+)"/)[1]);
  for (const language of ["ned", "eng"]) {
    const labels = fs.readFileSync(path.join(__dirname, `../php/public/lang/${language}.lng`), "utf8");
    assert.match(labels, /^dialer\.mode=TC \(/m);
    assert.match(labels, /^dialer\.call=.*\bTC\r?$/m);
    assert.doesNotMatch(labels, /^dialer\.(mode|call|unavailable)=.*RTT/m);
  }
});

test("Dialer uses only eligible contact numbers, not groups, own account or service accounts", () => {
  const contact = { id: "test", kind: "contact", peer: "contact@example.test", name: "Example", phoneNumber: "+31 (20) 123-4567" };
  const state = { conversations: [
    contact,
    { ...contact, id: "group", kind: "group" },
    { ...contact, id: "own", own: true },
    { ...contact, id: "blocked", blocked: true },
    { ...contact, id: "archived", archived: true },
    { ...contact, id: "service", peer: "translation@example.test" },
    { ...contact, id: "missing", phoneNumber: "" },
    { ...contact, id: "sip", phoneNumber: "sip:123@example.test" },
    { ...contact, id: "long", phoneNumber: "1".repeat(41) },
    { ...contact, id: "legacy", name: "Another", phoneNumber: "", telephone: "+442012345678" },
    { ...contact, id: "local", name: "Local", phoneNumber: "0201234567" }
  ] };
  const context = vm.createContext({ state,
    isOwnContact: entry => entry.own,
    isBlockedConversation: entry => entry.blocked,
    isArchivedConversation: entry => entry.archived,
    isInfrastructurePeer: peer => peer.startsWith("translation@"),
    conversationDisplayName: entry => entry.name
  });
  vm.runInContext(source, context);
  const contacts = JSON.parse(vm.runInContext("JSON.stringify(phoneDialerContacts())", context));
  assert.deepEqual(contacts.map(entry => entry.id), ["legacy", "test", "local"]);
  assert.equal(contacts[1].number, contact.phoneNumber);
  assert.deepEqual(Object.keys(contacts[0]), ["id", "name", "number"]);
  state.conversations = [];
  assert.equal(vm.runInContext("phoneDialerContacts().length", context), 0);
});
