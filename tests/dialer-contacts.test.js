const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const client = fs.readFileSync(path.join(__dirname, "../php/public/chat-client.js"), "utf8");
const source = client.slice(client.indexOf("  function phoneDialerContacts()"), client.indexOf("  function renderConversations()"));

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
