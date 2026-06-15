const assert = require("node:assert/strict");
const jh = require("../php/public/jingle-history.js");

class FakeElement {
  constructor(namespaceURI, localName, ownerDocument = null) {
    this.namespaceURI = namespaceURI;
    this.localName = localName;
    this.ownerDocument = ownerDocument || fakeDocument;
    this.attributes = [];
    this.children = [];
  }

  setAttribute(name, value) {
    const existing = this.attributes.find((item) => item.name === name);
    if (existing) {
      existing.value = String(value);
    } else {
      this.attributes.push({ name, value: String(value) });
    }
  }

  getAttribute(name) {
    return this.attributes.find((item) => item.name === name)?.value ?? null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  getElementsByTagNameNS(namespaceURI, localName) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (child.namespaceURI === namespaceURI && child.localName === localName) {
          matches.push(child);
        }
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

const fakeDocument = {
  createElementNS(namespaceURI, localName) {
    return new FakeElement(namespaceURI, localName, fakeDocument);
  }
};

function element(attrs = {}, namespace = jh.NS_JINGLE_HISTORY) {
  const item = new FakeElement(namespace, "jingle-history", fakeDocument);
  for (const [key, value] of Object.entries(attrs)) {
    item.setAttribute(key, value);
  }
  return item;
}

function run(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

run("parse missed video call XML", () => {
  const parsed = jh.parseJingleHistory(element({
    sid: "a73sjjvkla37jfea",
    direction: "incoming",
    disposition: "missed",
    media: "audio video",
    profile: "video",
    started: "2026-06-15T14:03:10Z",
    ended: "2026-06-15T14:03:42Z",
    duration: "32",
    recording: "none",
    transcript: "none"
  }));
  assert.equal(parsed.sid, "a73sjjvkla37jfea");
  assert.equal(parsed.disposition, "missed");
  assert.deepEqual(parsed.media, ["audio", "video"]);
  assert.equal(parsed.duration, 32);
});

run("serialize completed Total Conversation call", () => {
  global.document = fakeDocument;
  const serialized = jh.serializeJingleHistory({
    sid: "tc-908812",
    direction: "outgoing",
    disposition: "completed",
    media: ["audio", "video", "rtt", "captions"],
    profile: "total-conversation",
    started: "2026-06-15T14:10:00Z",
    ended: "2026-06-15T14:22:44Z",
    duration: 764,
    recording: "none",
    transcript: "local"
  });
  assert.equal(serialized.namespaceURI, jh.NS_JINGLE_HISTORY);
  assert.equal(serialized.getAttribute("media"), "audio video rtt captions");
  assert.equal(serialized.getAttribute("profile"), "total-conversation");
  assert.equal(serialized.getAttribute("duration"), "764");
  assert.equal(serialized.getAttribute("transcript"), "local");
});

run("render missed video call", () => {
  assert.equal(jh.renderJingleHistorySummary({
    sid: "m1",
    direction: "incoming",
    disposition: "missed",
    media: ["audio", "video"],
    createdAt: "2026-06-15T14:03:42Z"
  }), "Missed video call");
});

run("render Total Conversation call with duration", () => {
  assert.equal(jh.renderJingleHistorySummary({
    sid: "tc1",
    direction: "outgoing",
    disposition: "completed",
    media: ["audio", "video", "rtt"],
    profile: "total-conversation",
    duration: 502,
    createdAt: "2026-06-15T14:03:42Z"
  }), "Total Conversation call · 8:22");
});

run("duration formatting 32 sec", () => {
  assert.equal(jh.formatCallDuration(32), "0:32");
});

run("duration formatting 764 sec", () => {
  assert.equal(jh.formatCallDuration(764), "12:44");
});

run("invalid XML returns null", () => {
  assert.equal(jh.parseJingleHistory(element({ sid: "x" }, "urn:wrong")), null);
  assert.equal(jh.parseJingleHistory(element({ direction: "incoming" })), null);
});

run("unknown optional attributes do not crash", () => {
  const parsed = jh.parseJingleHistory(element({
    sid: "x",
    direction: "incoming",
    disposition: "missed",
    media: "audio experimental-media",
    "future-flag": "yes"
  }));
  assert.deepEqual(parsed.media, ["audio", "experimental-media"]);
  assert.equal(parsed.extraAttributes["future-flag"], "yes");
});

run("groupchat event builds correct message", () => {
  const xml = jh.buildJingleHistoryMessage({
    sid: "group-abc",
    direction: "outgoing",
    disposition: "completed",
    media: ["audio", "video"],
    profile: "group-call",
    duration: 1320,
    createdAt: "2026-06-15T16:22:00Z"
  }, {
    from: "room@conference.example.org/romeo",
    to: "room@conference.example.org",
    type: "groupchat",
    id: "group-call-001"
  });
  assert.match(xml, /type="groupchat"/);
  assert.match(xml, /<body>Group video call · 22:00<\/body>/);
  assert.match(xml, /profile="group-call"/);
});

run("emergency event supports location and policy-based recording", () => {
  const xml = jh.buildJingleHistoryMessage({
    sid: "em-112-001",
    direction: "outgoing",
    disposition: "emergency",
    media: ["audio", "video", "rtt", "captions", "location"],
    profile: "emergency",
    recording: "policy-based",
    transcript: "policy-based",
    emergency: true,
    emergencyService: "112",
    createdAt: "2026-06-15T17:10:00Z"
  }, { to: "112@example.org", type: "chat", id: "emergency-call-001" });
  assert.match(xml, /Emergency Total Conversation call/);
  assert.match(xml, /media="audio video rtt captions location"/);
  assert.match(xml, /recording="policy-based"/);
  assert.match(xml, /emergency-service="112"/);
});

run("local-only event is not sent to XMPP sender", () => {
  const payload = jh.createJingleHistorySyncPayload({
    sid: "local-fail",
    direction: "outgoing",
    disposition: "failed",
    media: ["audio"],
    localOnly: true,
    createdAt: "2026-06-15T17:10:00Z"
  }, { to: "peer@example.org", type: "chat" });
  assert.equal(payload.localOnly, true);
  assert.equal(payload.message, "");
});

run("synchronized event builds archiveable message", () => {
  const payload = jh.createJingleHistorySyncPayload({
    sid: "sync-1",
    direction: "outgoing",
    disposition: "completed",
    media: ["audio"],
    duration: 23,
    createdAt: "2026-06-15T17:10:00Z"
  }, { to: "peer@example.org", type: "chat", id: "sync-msg" });
  assert.equal(payload.localOnly, false);
  assert.match(payload.message, /<message /);
  assert.match(payload.message, /<jingle-history xmlns="urn:xmpp:jingle-history:0"/);
  assert.match(payload.message, /<store xmlns="urn:xmpp:hints"\/>/);
});
