"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync, spawn } = require("node:child_process");
const { randomBytes, createHmac } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class FixtureClient {
  constructor(url) {
    this.socket = new WebSocket(url, "xmpp");
    this.frames = [];
    this.socket.addEventListener("message", event => this.frames.push(String(event.data)));
    this.socket.addEventListener("error", () => {});
  }
  send(frame) { this.socket.send(frame); }
  async wait(pattern) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const index = this.frames.findIndex(frame => pattern.test(frame));
      if (index >= 0) return this.frames.splice(index, 1)[0];
      await delay(100);
    }
    throw new Error("Isolated XMPP fixture response timed out");
  }
  async login(user, password, resource) {
    for (let attempt = 0; attempt < 100 && this.socket.readyState === WebSocket.CONNECTING; attempt++) await delay(50);
    assert.equal(this.socket.readyState, WebSocket.OPEN);
    const opening = "<open xmlns='urn:ietf:params:xml:ns:xmpp-framing' to='example.test' version='1.0'/>";
    this.send(opening); await this.wait(/<mechanisms/);
    this.send("<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>" + Buffer.from(`\0${user}\0${password}`).toString("base64") + "</auth>");
    await this.wait(/<success/);
    this.send(opening); await this.wait(/<bind/);
    this.send(`<iq type='set' id='bind-${resource}'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>${resource}</resource></bind></iq>`);
    await this.wait(new RegExp(`id=['"]bind-${resource}['"]`));
    this.send("<presence/>");
  }
  async preferences(enabled, dnd = false, muted = "") {
    const identifier = "pref-" + randomBytes(4).toString("hex");
    this.send(`<iq type='set' to='example.test' id='${identifier}'><preferences xmlns='urn:teletyptel:call-recovery:1' enabled='${enabled}' dnd='${dnd}'>${muted ? `<muted jid='${muted}'/>` : ""}</preferences></iq>`);
    const reply = await this.wait(new RegExp(`id=['"]${identifier}['"]`));
    assert.match(reply, /type=['"]result['"]/);
  }
  propose(sid, to = "bob@example.test", extra = "") {
    this.send(`<message type='chat' to='${to}'><propose xmlns='urn:xmpp:jingle-message:0' id='${sid}'><description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/><description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'/><description xmlns='urn:xmpp:jingle:apps:rtt-sync:0'/></propose>${extra}<store xmlns='urn:xmpp:hints'/></message>`);
  }
  close() { this.socket.close(); }
}

class RegistryFixture {
  constructor(key, bootstrapKey) {
    const php = process.env.TELETYPTEL_PHP || (process.platform === "win32" ? "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe" : "php");
    this.child = spawn(php, [path.join(root, "php/tests/call-push-ejabberd-fixture.php")], { stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = ""; this.replies = []; this.waiters = [];
    this.child.stdout.on("data", chunk => {
      this.buffer += chunk;
      while (this.buffer.includes("\n")) {
        const index = this.buffer.indexOf("\n"), reply = JSON.parse(this.buffer.slice(0, index));
        this.buffer = this.buffer.slice(index + 1);
        if (this.waiters.length) this.waiters.shift()(reply); else this.replies.push(reply);
      }
    });
    this.child.stderr.resume();
    this.child.stdin.write(JSON.stringify({ key: key.toString("base64"), bootstrapKey: bootstrapKey?.toString("base64") }) + "\n");
  }
  async reply() {
    if (this.replies.length) return this.replies.shift();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Isolated registry fixture timed out")), 10000);
      this.waiters.push(value => { clearTimeout(timer); resolve(value); });
    });
  }
  async request(value) { this.child.stdin.write(JSON.stringify(value) + "\n"); return this.reply(); }
  close() { this.child.stdin.end(); this.child.kill(); }
}

async function run() {
  if (typeof WebSocket !== "function") throw new Error("Node 22 or newer is required");
  const container = "tc-signaling-fixture-" + randomBytes(8).toString("hex");
  const image = process.env.TELETYPTEL_EJABBERD_TEST_IMAGE || "ejabberd/ecs@sha256:3d120adff1ba1f2993d1ededed6c1eb7f5f6d9c9ad645d32b3e505e8dedeec35";
  if (!/^[a-zA-Z0-9/_.:@-]+$/.test(image)) throw new Error("Invalid isolated image reference");
  const execute = args => execFileSync("docker", args, { cwd: root, encoding: "utf8", timeout: 90000, maxBuffer: 1024 * 1024, stdio: "pipe" });
  const control = args => execute(["exec", container, "ejabberdctl", "-c", "/tmp/tc/ejabberdctl.cfg", "-f", "/tmp/tc/ejabberd.yml", ...args]);
  const clients = [];
  let created = false;
  let passed = false;
  let registry;
  try {
    execute(["run", "-d", "--name", container, "--publish", "127.0.0.1::5280",
      "--mount", `type=bind,source=${path.join(root, "services/call-push/ejabberd")},target=/source,readonly`,
      "--entrypoint", "sh", image, "/source/tests/start.sh"]);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      try { ready = /is started/.test(control(["status"])); } catch {}
      if (ready) break;
      await delay(500);
    }
    assert.ok(ready, "Disposable ejabberd must start with the actual compiled module");
    const address = execute(["port", container, "5280/tcp"]).trim();
    assert.match(address, /^127\.0\.0\.1:[0-9]+$/);
    const password = randomBytes(32).toString("hex");
    for (const name of ["alice", "bob", "charlie"]) control(["register", name, "example.test", password]);
    const key = Buffer.from(execute(["exec", container, "cat", "/tmp/tc/key"]).trim(), "base64");
    registry = new RegistryFixture(key);
    const registration = await registry.reply();
    assert.match(registration.generation, /^[a-f0-9]{32}$/);
    const envelopes = () => JSON.parse(execute(["exec", container, "sh", "-c", "printf '['; first=1; for event in /tmp/tc/spool/*.json; do [ -f \"$event\" ] || continue; [ $first = 1 ] || printf ','; cat \"$event\"; first=0; done; printf ']' "]));
    const events = () => envelopes().map(envelope => {
      assert.equal(envelope.signature, createHmac("sha256", key).update("teletyptel-call-signaling-v1:production:example.test:fixture:" + envelope.payload).digest("hex"));
      return JSON.parse(Buffer.from(envelope.payload, "base64")).event;
    });
    const connect = async (name, resource) => {
      const client = new FixtureClient(`ws://${address}/xmpp-websocket`); clients.push(client);
      await client.login(name, password, resource); return client;
    };
    const alice = await connect("alice", "caller");
    const bob = await connect("bob", "first");
    await delay(250);
    assert.ok(events().some(event => event.type === "resource" && event.jid === "alice@example.test/caller" && event.online));
    alice.propose("denied-without-consent"); await delay(400);
    assert.equal(events().filter(event => event.type === "offer").length, 0);
    await alice.preferences(true); await bob.preferences(true);
    bob.close(); await delay(400);
    alice.propose("cold-start-total"); await delay(400);
    assert.ok(events().some(event => event.type === "offer" && event.sid === "cold-start-total" && event.mediaProfile === "total"));
    const awakened = await connect("bob", "new-device");
    const replay = await awakened.wait(/<propose[^>]+id=['"]cold-start-total['"]/);
    assert.match(replay, /from=['"]alice@example.test\/caller['"]/);
    assert.match(replay, /to=['"]bob@example.test\/new-device['"]/);
    assert.doesNotMatch(replay, /urn:xmpp:delay/);
    const beforeHandoff = envelopes();
    const invitation = await registry.request({ action: "ingest", envelopes: beforeHandoff });
    assert.equal(invitation.ok, true);
    const callID = invitation.result.calls.find(call => call.sid === "cold-start-total").callId;
    const unproven = await registry.request({ action: "accept", callId: callID, jid: "bob@example.test/new-device" });
    assert.equal(unproven.ok, false);
    const dispatched = await registry.request({ action: "dispatch" });
    assert.equal(dispatched.result.payload.callId, callID);
    assert.equal(dispatched.result.payload.mediaProfile, "total");
    awakened.send(`<iq type='set' to='example.test' id='proof'><handoff xmlns='urn:teletyptel:call-recovery:1' callId='${callID}' sid='cold-start-total' deviceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' generation='${registration.generation}'/></iq>`);
    assert.match(await awakened.wait(/id=['"]proof['"]/), /type=['"]result['"]/);
    await delay(400);
    assert.ok(events().some(event => event.type === "handoff" && event.jid === "bob@example.test/new-device" && event.callId === callID));
    const handoffEnvelopes = envelopes().slice(beforeHandoff.length);
    assert.equal((await registry.request({ action: "ingest", envelopes: handoffEnvelopes })).ok, true);
    const accepted = await registry.request({ action: "accept", callId: callID, jid: "bob@example.test/new-device" });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.result.state, "accepted");
    const spool = await registry.request({ action: "spool", envelopes: [...handoffEnvelopes, { payload: "tampered", signature: "0".repeat(64) }] });
    assert.equal(spool.ok, true);
    assert.equal(spool.result.processed, handoffEnvelopes.length);
    assert.equal(spool.result.rejected, 1);
    await awakened.preferences(true, true); await delay(400);
    assert.ok(events().some(event => event.type === "policy" && event.owner === "bob@example.test" && event.allowed === false));
    alice.propose("denied-dnd"); await delay(300);
    assert.ok(!events().some(event => event.type === "offer" && event.sid === "denied-dnd"));
    await awakened.preferences(true, false, "alice@example.test");
    alice.propose("denied-muted"); await delay(300);
    assert.ok(!events().some(event => event.type === "offer" && event.sid === "denied-muted"));
    await awakened.preferences(true);
    awakened.send("<iq type='set' id='block'><block xmlns='urn:xmpp:blocking'><item jid='alice@example.test'/></block></iq>");
    assert.match(await awakened.wait(/id=['"]block['"]/), /type=['"]result['"]/);
    alice.propose("denied-blocked"); await delay(400);
    assert.ok(!events().some(event => event.type === "offer" && event.sid === "denied-blocked"));
    awakened.send("<iq type='set' id='unblock'><unblock xmlns='urn:xmpp:blocking'><item jid='alice@example.test'/></unblock></iq>");
    assert.match(await awakened.wait(/id=['"]unblock['"]/), /type=['"]result['"]/);
    alice.propose("retractable"); await delay(400);
    alice.send("<message type='chat' to='bob@example.test'><retract xmlns='urn:xmpp:jingle-message:0' id='retractable'/><store xmlns='urn:xmpp:hints'/></message>");
    await delay(400);
    assert.ok(events().some(event => event.type === "end" && event.sid === "retractable" && event.actor === "alice@example.test/caller"));
    const all = events();
    assert.ok(all.every(event => !Object.hasOwn(event, "body") && !Object.hasOwn(event, "password") && !Object.hasOwn(event, "sdp")));
    assert.ok(all.every((event, index) => index === 0 || event.revision > all[index - 1].revision));
    passed = true;
    process.stdout.write("Real ejabberd/PHP signaling passed: authenticated sessions, offline proposal, mock dispatch, proven new-resource acceptance, spool replay/tampering, DND, mute, block and cancellation; no APNs.\n");
  } finally {
    for (const client of clients) client.close();
    registry?.close();
    if (created) execute(["rm", "-f", container]);
    if (!passed) process.stderr.write("Isolated call signaling failed; temporary container removed. No live server was used.\n");
  }
}

if (require.main === module) run().catch(error => { process.stderr.write(String(error.message).slice(0, 300) + "\n"); process.exitCode = 1; });
module.exports = { FixtureClient, RegistryFixture };
