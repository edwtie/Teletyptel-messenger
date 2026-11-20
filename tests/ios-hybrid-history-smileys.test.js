const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { catalog, resolveCatalog } = require("../scripts/ios-hybrid/smileys");
const { readReference } = require("../scripts/ios-hybrid/check-baseline");
const { renderer } = require("../mobile/ios-hybrid/Web/smileys-presentation");
const { safeHistory, safeAdministration, createClient } = require("../mobile/ios-hybrid/Web/native-session");
const source = rows => "const smiles = " + JSON.stringify(rows).slice(0, -1) + "\n  ].map(";

test("all 41 original smileys resolve to the pinned GIF or the same SVG fallback as the web", () => {
  const original = readReference("chat-client.js").toString("utf8");
  const values = resolveCatalog(original, readReference);
  assert.equal(values.length, 41); assert.equal(new Set(values.map(value => value.name)).size, 41);
  for (const value of values) assert.ok(readReference(value.file).length > 0);
  assert.equal(values.find(value => value.name === "smile").file, "smileys/smile.svg");
  assert.equal(values.find(value => value.name === "bye").file, "smileys/bye.gif");
  assert.deepEqual(values.map(value => value.codes), catalog(original).map(value => value.codes));
});

test("the smiley parser uses JSON only and rejects traversal duplicate aliases and executable source", () => {
  const wrap = source;
  assert.equal(catalog(wrap([["smile", "smile.gif", [":)"]]])).length, 1);
  for (const rows of [[["x", "../private.gif", [":)"]]], [["x", "x.gif", [":)", ":)"]]],
    [["x", "x.gif", [":)"]], ["y", "y.gif", [":)"]]], [["x", "x.gif", [""]]], []]) assert.throws(() => catalog(wrap(rows)));
  assert.throws(() => catalog("const smiles = [process.exit()]\n  ].map("));
  assert.throws(() => resolveCatalog(wrap([["x", "x.svg", [":)"]]]), () => { throw new Error("missing"); }));
});

function fakeDocument() {
  const element = () => ({ children: [], attributes: {}, append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = value; } });
  return { createElement: element, createTextNode: value => ({ text: value }), element };
}

test("smileys render as bounded local images and literal text, including malicious HTML and Unicode", () => {
  const document = fakeDocument(); const view = renderer(document, [{ name: "smile", file: "smileys/smile.svg", codes: [":)"] }]);
  const container = document.element(); view.body(container, "<script>alert(1)</script> 🤟 :)\n" + ":)".repeat(30));
  assert.equal(container.children.filter(child => child.className === "smiley-image").length, 24);
  assert.ok(container.children[0].text.includes("<script>alert(1)</script> 🤟"));
  assert.equal(container.children.filter(child => child.src).every(child => child.src === "smileys/smile.svg"), true);
  assert.ok(container.children.at(-1).text.includes(":)"));
  let inserted; const picker = document.element(); view.picker(picker, value => { inserted = value; });
  picker.children[0].onclick(); assert.equal(inserted, ":)");
  renderer(document, []).body(container, "Plain text"); assert.equal(container.children[0].text, "Plain text");
  assert.throws(() => renderer(document, [{ name: "x", file: "https://tracker.invalid/x.gif", codes: [":)"] }]));
});

function history() {
  return { available: true, query: "", archivedOnly: false,
    entries: [{ id: crypto.randomUUID(), peer: "peer@localhost", kind: "direct", name: "Peer", preview: "Hallo", timestamp: 1780000000, archived: false }], archived: [],
    window: { id: crypto.randomUUID(), title: "Peer", loading: false, hasEarlier: true, canChat: true,
      messages: [{ id: crypto.randomUUID(), body: "Hallo", outgoing: false, timestamp: 1780000000 }] } };
}

test("history is a bounded immutable read-only projection without server cursors or authority data", () => {
  const value = history(); const safe = safeHistory(value, "connected");
  assert.ok(Object.isFrozen(safe.window.messages[0])); assert.ok(Object.isFrozen(safe.entries));
  for (const bad of [{ ...value, cursor: "private" }, { ...value, entries: Array(201).fill(value.entries[0]) },
    { ...value, window: { ...value.window, cursor: "private" } }, { ...value, window: { ...value.window, messages: [{ ...value.window.messages[0], timestamp: NaN }] } },
    { ...value, entries: [{ ...value.entries[0], peer: "peer@localhost/resource" }] }]) assert.throws(() => safeHistory(bad, "connected"), /invalidNativeReply/);
  assert.throws(() => safeHistory(value, "signedOut"), /invalidNativeReply/);
});

test("history commands cannot run from the previous account or introduce a second transport", async () => {
  const epoch = crypto.randomUUID(); const commands = [];
  const client = createClient({ makeID: crypto.randomUUID, postMessage: async body => {
    const command = JSON.parse(body); commands.push(command); return { version: 1, id: command.id, snapshot: state };
  } });
  const state = { version: 1, sequence: 1, epoch, phase: "connected", errorCode: null, chatAvailable: true, callsAvailable: false, socialLoginAvailable: false, history: history() };
  client.receive(state);
  await client.historyCommand("search", { query: "Peer", archived: true }, epoch);
  assert.deepEqual(commands[0].arguments, { query: "Peer", archived: "true" }); assert.equal(commands[0].epoch, epoch);
  await assert.rejects(client.historyCommand("open", { id: crypto.randomUUID() }, crypto.randomUUID()), /invalidState/);
  assert.equal(commands.length, 1); client.dispose();
  const adapter = fs.readFileSync("mobile/ios-hybrid/App/NativeHybridHistoryAdapter.swift", "utf8");
  assert.match(adapter, /NativeConversationArchive/); assert.match(adapter, /login\.loadCloudHistory/);
  assert.doesNotMatch(adapter, /URLSession|sendDraft|markRead|displayed\(/);
});

test("group administration admits only current joined groups, safe configuration fields and authorized member lists", () => {
  const room = "familie@conference.localhost"; const conversation = { peer: room, kind: "group" }; const groups = [{ room, joined: true }];
  const value = { room, busy: false, canConfigure: true, canManageMembers: true, members: [], affiliation: null,
    configuration: { token: crypto.randomUUID(), name: "Familie", description: "Besloten", membersOnly: true, moderated: false, publicRoom: false, persistent: true, allowInvites: true, editableFields: ["name"] } };
  assert.ok(Object.isFrozen(safeAdministration(value, conversation, groups).configuration.editableFields));
  for (const bad of [{ ...value, canConfigure: false }, { ...value, members: ["unknown@localhost"] },
    { ...value, configuration: { ...value.configuration, fields: { secret: "private" } } },
    { ...value, configuration: { ...value.configuration, editableFields: ["roomsecret"] } }]) assert.throws(() => safeAdministration(bad, conversation, groups), /invalidNativeReply/);
  assert.throws(() => safeAdministration(value, null, groups), /invalidNativeReply/);
  assert.throws(() => safeAdministration(value, conversation, []), /invalidNativeReply/);
});
