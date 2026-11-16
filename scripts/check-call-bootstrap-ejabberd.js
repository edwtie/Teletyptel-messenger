"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const tls = require("node:tls");
const net = require("node:net");
const fs = require("node:fs");
const os = require("node:os");
const http = require("node:http");
const { execFileSync, spawnSync } = require("node:child_process");
const { randomBytes, createHmac } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

class BootstrapClient {
  constructor(port, ca, encrypted = true) {
    this.buffer = ""; this.closed = false;
    this.socket = encrypted ? tls.connect({ host: "127.0.0.1", port, servername: "example.test", ca }) : net.connect({ host: "127.0.0.1", port });
    this.socket.on("data", chunk => {
      this.buffer += chunk.toString();
      if (this.buffer.length > 131072) this.socket.destroy();
    });
    this.socket.on("close", () => { this.closed = true; });
    this.socket.on("error", () => {});
    this.connected = new Promise((resolve, reject) => {
      this.socket.once(encrypted ? "secureConnect" : "connect", resolve);
      this.socket.once("error", () => reject(new Error("Isolated TLS transport failed")));
    });
  }
  send(frame) { this.socket.write(frame); }
  async wait(pattern, timeout = 6000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const match = pattern.exec(this.buffer);
      if (match) { this.buffer = this.buffer.slice(match.index + match[0].length); return match[0]; }
      if (this.closed) throw new Error("Isolated call stream closed before expected reply");
      await delay(10);
    }
    throw new Error("Isolated call stream response timed out");
  }
  async authenticate(user, credential) {
    await this.connected;
    this.send("<stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' to='example.test' version='1.0'>");
    await this.wait(/<stream:features\b[^>]*>[\s\S]*?<\/stream:features>/);
    this.send("<auth xmlns='urn:ietf:params:xml:ns:xmpp-sasl' mechanism='PLAIN'>" + Buffer.from(`\0${user}\0${credential}`).toString("base64") + "</auth>");
    const result = await this.wait(/<(?:success|failure)\b[^>]*(?:\/>|>[\s\S]*?<\/(?:success|failure)>)/);
    return result.startsWith("<success");
  }
  async bind(resource) {
    this.send("<stream:stream xmlns='jabber:client' xmlns:stream='http://etherx.jabber.org/streams' to='example.test' version='1.0'>");
    await this.wait(/<stream:features\b[^>]*>[\s\S]*?<\/stream:features>/);
    this.send(`<iq type='set' id='bind'><bind xmlns='urn:ietf:params:xml:ns:xmpp-bind'><resource>${resource}</resource></bind></iq>`);
    return this.wait(/<iq\b(?=[^>]*\bid=['"]bind['"])[^>]*(?:\/>|>[\s\S]*?<\/iq>)/);
  }
  close() { this.socket.destroy(); }
}

async function run() {
  const name = "tc-bootstrap-fixture-" + randomBytes(8).toString("hex");
  const image = "ejabberd/ecs@sha256:3d120adff1ba1f2993d1ededed6c1eb7f5f6d9c9ad645d32b3e505e8dedeec35";
  const execute = args => execFileSync("docker", args, { cwd: root, encoding: "utf8", timeout: 90000, maxBuffer: 1024 * 1024, stdio: "pipe" });
  const control = args => execute(["exec", name, "ejabberdctl", "-c", "/tmp/tc/ejabberdctl.cfg", "-f", "/tmp/tc/ejabberd.yml", ...args]);
  const clients = []; let created = false; let checks = 0; let stage = "startup"; let caDirectory; let lastCheck = "startup";
  const check = (value, label) => { lastCheck = label; assert.ok(value, label); checks++; };
  const php = process.env.TELETYPTEL_PHP || (process.platform === "win32" ? "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe" : "php");
  try {
    execute(["run", "-d", "--name", name, "--publish", "127.0.0.1::5223", "--publish", "127.0.0.1::5222", "--publish", "127.0.0.1::5443", "--publish", "127.0.0.1::5444",
      "--mount", `type=bind,source=${path.join(root, "services/call-push/ejabberd")},target=/source,readonly`,
      "--entrypoint", "sh", image, "/source/tests/bootstrap-start.sh"]);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      try { ready = /is started/.test(control(["status"])); } catch {}
      if (ready) break;
      if (execute(["inspect", "--format", "{{.State.Running}}", name]).trim() !== "true") {
        throw new Error("Isolated bootstrap startup failed: " + execute(["logs", name]).slice(-2500));
      }
      await delay(500);
    }
    check(ready, "Actual restricted auth backend must boot");
    const port = Number(execute(["port", name, "5223/tcp"]).trim().split(":").at(-1));
    const plainPort = Number(execute(["port", name, "5222/tcp"]).trim().split(":").at(-1));
    const ca = execute(["exec", name, "cat", "/tmp/tc/tls.crt"]);
    const key = execute(["exec", name, "cat", "/tmp/tc/bootstrap.key"]).trim();
    const password = randomBytes(24).toString("hex");
    for (const user of ["alice", "bob", "charlie"]) control(["register", user, "example.test", password]);
    const client = (encrypted = true) => { const value = new BootstrapClient(encrypted ? port : plainPort, ca, encrypted); clients.push(value); return value; };
    const mint = profile => {
      const reply = spawnSync(php, [path.join(root, "php/tests/call-bootstrap-ejabberd-fixture.php")], {
        cwd: root, encoding: "utf8", timeout: 10000, input: JSON.stringify({ key, profile }), maxBuffer: 16384
      });
      assert.equal(reply.status, 0, "Actual isolated PHP issuer must succeed");
      return JSON.parse(reply.stdout);
    };
    stage = "verified scoped WebSocket";
    const wssPort = Number(execute(["port", name, "5443/tcp"]).trim().split(":").at(-1));
    const httpPort = Number(execute(["port", name, "5444/tcp"]).trim().split(":").at(-1));
    caDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "tc-bootstrap-ca-"));
    const caFile = path.join(caDirectory, "public-ca.pem"); fs.writeFileSync(caFile, ca);
    for (const scoped of [true, false]) {
      const result = spawnSync(process.execPath, [path.join(__dirname, "call-bootstrap-wss-fixture.js")], {
        cwd: root, env: { ...process.env, NODE_EXTRA_CA_CERTS: caFile }, encoding: "utf8", timeout: 15000,
        input: JSON.stringify({ port: wssPort, scoped, grant: mint("total") }), maxBuffer: 8192
      });
      if (result.status !== 0) process.stderr.write(result.stderr);
      check(result.status === 0, "Real WSS must enforce verified local TLS attestation");
      check(Object.values(JSON.parse(result.stdout)).every(value => value === true), "WSS bind, ping and roster isolation must pass");
    }
    const insecureStatus = await new Promise((resolve, reject) => {
      const request = http.get({ hostname: "127.0.0.1", port: httpPort, path: "/xmpp-call-websocket",
        headers: { Host: "example.test", "X-Forwarded-Proto": "https", "x-teletyptel-tls-attestation": "spoofed" } }, response => { response.resume(); resolve(response.statusCode); });
      request.on("error", reject); request.setTimeout(3000, () => request.destroy(new Error("HTTP fixture timed out")));
    });
    check(insecureStatus === 403, "Spoofed proxy/TLS headers cannot authorize cleartext WebSocket transport");
    const sign = claims => {
      const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
      return "tcr1." + payload + "." + createHmac("sha256", Buffer.from(key, "base64"))
        .update("teletyptel-call-xmpp-v1:production:example.test:fixture:" + payload).digest("hex");
    };
    const scoped = async (profile, authorize = true) => {
      const grant = mint(profile), connection = client();
      check(await connection.authenticate("bob", grant.credential), "Call credential authenticated");
      check(/type=['"]result['"]/.test(await connection.bind(grant.claims.resource)), "Signed resource bound");
      if (authorize) {
        connection.send(`<iq type='set' to='example.test' id='authorize'><authorize xmlns='urn:teletyptel:call-recovery:1'>${grant.answerAuthorization}</authorize></iq>`);
        check(/type=['"]result['"]/.test(await connection.wait(/<iq\b(?=[^>]*\bid=['"]authorize['"])[^>]*(?:\/>|>[\s\S]*?<\/iq>)/)), "Server-signed winning-resource authorization acknowledged");
      }
      return { grant, connection };
    };
    stage = "ordinary login";
    const alice = client(); check(await alice.authenticate("alice", password), "Normal password login preserved");
    await alice.bind("caller"); alice.send("<presence/>");
    const charlie = client(); check(await charlie.authenticate("charlie", password), "Other ordinary account preserved"); await charlie.bind("other");
    stage = "profiles";
    for (const profile of ["audio", "video", "audio-rtt", "total"]) {
      const { grant, connection } = await scoped(profile), claims = grant.claims;
      connection.send(`<message type='chat' to='${claims.peer}'><proceed xmlns='urn:xmpp:jingle-message:0' id='${claims.sid}'/><store xmlns='urn:xmpp:hints'/></message>`);
      await alice.wait(/<message\b[^>]*>[\s\S]*?<proceed\b[\s\S]*?<\/message>/);
      const kinds = ["audio", ...(["video", "total"].includes(profile) ? ["video"] : []), ...(["audio-rtt", "total"].includes(profile) ? ["rtt"] : [])];
      const content = kinds.map(kind => `<content creator='initiator' name='${kind}'><description xmlns='${kind === "rtt" ? "urn:xmpp:jingle:apps:rtt-sync:0" : "urn:xmpp:jingle:apps:rtp:1"}'${kind === "rtt" ? "" : ` media='${kind}'`}/></content>`).join("");
      alice.send(`<iq type='set' to='${claims.owner}/${claims.resource}' id='offer'><jingle xmlns='urn:xmpp:jingle:1' action='session-initiate' sid='${claims.sid}'>${content}</jingle></iq>`);
      const received = await connection.wait(/<iq\b(?=[^>]*\bid=['"]offer['"])[^>]*>[\s\S]*?<\/iq>/);
      check(received.includes(claims.sid), "Only this call's matching Jingle is delivered");
      connection.send(`<iq type='result' to='${claims.peer}' id='offer'/>`);
      await alice.wait(/<iq\b(?=[^>]*\bid=['"]offer['"])[^>]*(?:\/>|>[\s\S]*?<\/iq>)/);
      connection.close();
      const replay = client(); check(!await replay.authenticate("bob", grant.credential), "Grant replay denied across resources"); replay.close();
    }
    stage = "negative scopes";
    const premature = await scoped("total", false);
    premature.connection.send(`<message type='chat' to='${premature.grant.claims.peer}'><proceed xmlns='urn:xmpp:jingle-message:0' id='${premature.grant.claims.sid}'/></message>`);
    for (let attempt = 0; attempt < 100 && !premature.connection.closed; attempt++) await delay(10);
    check(premature.connection.closed, "Bootstrap alone cannot answer before a server-signed reservation permit");
    const mismatched = await scoped("total", false), otherPermit = mint("total").answerAuthorization;
    mismatched.connection.send(`<iq type='set' to='example.test' id='wrong-permit'><authorize xmlns='urn:teletyptel:call-recovery:1'>${otherPermit}</authorize></iq>`);
    for (let attempt = 0; attempt < 100 && !mismatched.connection.closed; attempt++) await delay(10);
    check(mismatched.connection.closed, "A winning-device permit cannot authorize another call/resource/nonce");
    const forbidden = [
      "<iq type='get' to='example.test' id='forbidden'><query xmlns='jabber:iq:roster'/></iq>",
      "<iq type='set' to='example.test' id='forbidden'><query xmlns='urn:xmpp:mam:2'/></iq>",
      "<iq type='set' to='example.test' id='forbidden'><query xmlns='jabber:iq:register'><remove/></query></iq>",
      "<iq type='set' to='example.test' id='forbidden'><preferences xmlns='urn:teletyptel:call-recovery:1' enabled='true' dnd='false'/></iq>",
      "<message type='chat' to='charlie@example.test/other'><body>must-not-be-sent</body></message>",
      "<presence/>", "<enable xmlns='urn:xmpp:sm:3' resume='true'/>",
      "<iq type='result' to='alice@example.test/caller' id='unsolicited'/>",
      "<iq type='set' to='alice@example.test/caller' id='forbidden'><jingle xmlns='urn:xmpp:jingle:1' action='session-info' sid='wrong-call'/></iq>"
    ];
    for (const frame of forbidden) {
      const { connection } = await scoped("total"); connection.send(frame);
      for (let attempt = 0; attempt < 100 && !connection.closed; attempt++) await delay(10);
      check(connection.closed, "Out-of-scope requests cannot keep a call-authenticated stream alive");
      check(!charlie.buffer.includes("must-not-be-sent"), "No chat is sent to another person");
    }
    stage = "inbound privacy";
    const { grant, connection } = await scoped("total"), destination = grant.claims.owner + "/" + grant.claims.resource;
    alice.send(`<message type='chat' to='${destination}'><body>private-chat-not-for-call</body></message>`);
    charlie.send(`<iq type='set' to='${destination}' id='foreign'><jingle xmlns='urn:xmpp:jingle:1' action='session-info' sid='${grant.claims.sid}'/></iq>`);
    alice.send(`<iq type='set' to='${destination}' id='wrong-sid'><jingle xmlns='urn:xmpp:jingle:1' action='session-info' sid='other-session'/></iq>`);
    alice.send(`<iq type='set' to='${destination}' id='wrong-profile'><jingle xmlns='urn:xmpp:jingle:1' action='session-initiate' sid='${grant.claims.sid}'><content creator='initiator' name='audio'><description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/></content></jingle></iq>`);
    await delay(150);
    check(!connection.buffer.includes("private-chat-not-for-call") && !connection.buffer.includes("id='foreign'") && !connection.buffer.includes('id="foreign"'), "Private chat and another caller are not delivered");
    check(!connection.buffer.includes("other-session"), "Different Jingle SID is not delivered");
    check(!/id=['"]wrong-profile['"]/.test(connection.buffer), "Total Conversation cannot silently downgrade to audio");
    stage = "revocation";
    const unredeemed = { ...grant.claims, nonce: randomBytes(16).toString("hex") };
    unredeemed.resource = "tc-call-" + unredeemed.nonce;
    execute(["exec", name, "erl", "-boot", "/home/ejabberd/bin/start_clean", "-boot_var", "RELEASE_LIB", "/home/ejabberd/lib",
      "-sname", "tc_bootstrap_revoke@localhost", "-noshell", "-eval",
      `case rpc:call('ejabberd@localhost', ejabberd_auth_teletyptel_calls, revoke_device, [<<"example.test">>, <<"${grant.claims.deviceId}">>, <<"${grant.claims.generation}">>]) of ok -> halt(0); _ -> halt(1) end.`]);
    for (let attempt = 0; attempt < 100 && !connection.closed; attempt++) await delay(10);
    check(connection.closed, "Trusted device/generation revocation closes the actual stream");
    const revoked = client(); check(!await revoked.authenticate("bob", sign(unredeemed)), "Revocation also blocks an unredeemed grant from the same device generation"); revoked.close();
    stage = "invalid grants";
    const original = mint("total");
    let passwordCheckDenied = false;
    try { control(["check_password", "bob", "example.test", original.credential]); }
    catch { passwordCheckDenied = true; }
    check(passwordCheckDenied, "Grant cannot pass a generic password check outside encrypted c2s authentication");
    for (const changes of [{ owner: "alice@example.test" }, { domain: "elsewhere.test" }, { environment: "sandbox" },
      { expiresAt: original.claims.issuedAt + 3600 }, { scope: "call-control-v1" }, { resource: "arbitrary-resource" }, { profile: "unknown" }]) {
      const bad = client(); check(!await bad.authenticate("bob", sign({ ...original.claims, ...changes })), "Malformed or overbroad signed grant denied"); bad.close();
    }
    const wrongAccount = client(); check(!await wrongAccount.authenticate("alice", original.credential), "Credential cannot authenticate another owner"); wrongAccount.close();
    const tampered = client(); check(!await tampered.authenticate("bob", original.credential.slice(0, -1) + (original.credential.endsWith("0") ? "1" : "0")), "Signature tampering denied"); tampered.close();
    const plain = client(false); check(!await plain.authenticate("bob", original.credential), "Plaintext transport cannot redeem a grant"); plain.close();
    const fresh = client(); check(await fresh.authenticate("bob", original.credential), "Failed plaintext attempt did not consume a valid TLS grant");
    stage = "wrong resource";
    let wrongResourceReply;
    try { wrongResourceReply = await fresh.bind("not-the-signed-resource"); }
    catch { check(fresh.closed, "Wrong resource closes stream"); }
    if (wrongResourceReply !== undefined) check(!/type=['"]result['"]/.test(wrongResourceReply), "Wrong resource not bound");
    stage = "expiry";
    const last = await scoped("total");
    const deadline = Date.now() + 22000;
    while (!last.connection.closed && Date.now() < deadline) await delay(50);
    check(last.connection.closed, "Idle scoped stream closes at the signed deadline");
    check(!last.connection.buffer.includes("private-chat"), "Expiry does not flush stored chat");
    process.stdout.write(`Scoped call bootstrap: ${checks} checks passed against real ejabberd over verified TLS; no APNs or production data.\n`);
  } catch (error) {
    throw new Error("Scoped bootstrap fixture failed at " + stage + ": " + (stage === "startup" ? error.message : error.name + " (" + lastCheck + ")"));
  } finally {
    for (const connection of clients) connection.close();
    if (created) execute(["rm", "-f", name]);
    if (caDirectory) { fs.unlinkSync(path.join(caDirectory, "public-ca.pem")); fs.rmdirSync(caDirectory); }
  }
}

if (require.main === module) run().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
module.exports = { BootstrapClient };
