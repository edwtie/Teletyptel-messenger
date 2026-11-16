"use strict";
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const https = require("node:https");
const http = require("node:http");
const { execFileSync } = require("node:child_process");
const { randomBytes, createHmac } = require("node:crypto");
const { BootstrapClient } = require("./check-call-bootstrap-ejabberd");
const { RegistryFixture } = require("./check-call-signaling-ejabberd");
const root = path.resolve(__dirname, "..");
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function run() {
  const name = "tc-active-fixture-" + randomBytes(8).toString("hex");
  const image = "ejabberd/ecs@sha256:3d120adff1ba1f2993d1ededed6c1eb7f5f6d9c9ad645d32b3e505e8dedeec35";
  const execute = args => execFileSync("docker", args, { cwd: root, encoding: "utf8", timeout: 90000, maxBuffer: 2097152, stdio: "pipe" });
  const control = args => execute(["exec", name, "ejabberdctl", "-c", "/tmp/tc/ejabberdctl.cfg", "-f", "/tmp/tc/ejabberd.yml", ...args]);
  const clients = []; let created = false; let registry; let stage = "startup"; let checks = 0; let temporary;
  let lastCheck = "startup";
  const check = (value, label) => { lastCheck = label; assert.ok(value, label); checks++; };
  try {
    execute(["run", "-d", "--name", name, "--publish", "127.0.0.1::5223", "--publish", "127.0.0.1::5443", "--publish", "127.0.0.1::5444", "--env", "TELETYPTEL_CALL_ACTIVE_FIXTURE=1",
      "--mount", `type=bind,source=${path.join(root, "services/call-push/ejabberd")},target=/source,readonly`,
      "--entrypoint", "sh", image, "/source/tests/bootstrap-start.sh"]);
    created = true;
    let ready = false;
    for (let attempt = 0; attempt < 45; attempt++) {
      try { ready = /is started/.test(control(["status"])); } catch {}
      if (ready) break;
      if (execute(["inspect", "--format", "{{.State.Running}}", name]).trim() !== "true") {
        throw new Error("Isolated active startup failed: " + execute(["logs", name]).slice(-2500));
      }
      await delay(500);
    }
    check(ready, "Actual producer and scoped backend boot together");
    const port = Number(execute(["port", name, "5223/tcp"]).trim().split(":").at(-1));
    const ca = execute(["exec", name, "cat", "/tmp/tc/tls.crt"]);
    const signingKey = Buffer.from(execute(["exec", name, "cat", "/tmp/tc/signaling.key"]).trim(), "base64");
    const bootstrapKey = Buffer.from(execute(["exec", name, "cat", "/tmp/tc/bootstrap.key"]).trim(), "base64");
    const password = randomBytes(24).toString("hex");
    for (const user of ["alice", "bob"]) control(["register", user, "example.test", password]);
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), "tc-active-revocation-"));
    const keyFile = path.join(temporary, "bootstrap.key"), caFile = path.join(temporary, "ca.pem");
    fs.writeFileSync(keyFile, bootstrapKey.toString("base64"), { mode: 0o600 });
    fs.writeFileSync(caFile, ca, { mode: 0o600 });
    const httpsPort = Number(execute(["port", name, "5443/tcp"]).trim().split(":").at(-1));
    const httpPort = Number(execute(["port", name, "5444/tcp"]).trim().split(":").at(-1));
    registry = new RegistryFixture(signingKey, bootstrapKey, { keyFile, caFile, url: `https://127.0.0.1:${httpsPort}/call-revocations` });
    const registration = await registry.reply();
    const health = await registry.request({ action: "health" });
    check(health.ok && health.result.ready, "Actual signed readiness probe confirms producer, scoped backend and TLS without sending a call");
    stage = "revocation ingress guards";
    const revokeBody = changes => {
      const now = Math.floor(Date.now() / 1000);
      const payload = Buffer.from(JSON.stringify({ version: 1, environment: "production", domain: "example.test", issuer: "fixture",
        eventId: randomBytes(16).toString("hex"), deviceId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", generation: "a".repeat(32),
        issuedAt: now, expiresAt: now + 30, ...changes })).toString("base64url");
      return JSON.stringify({ payload, signature: createHmac("sha256", bootstrapKey).update("teletyptel-call-revoke-v1:production:example.test:fixture:" + payload).digest("hex") });
    };
    const request = (body, encrypted = true, method = "POST") => new Promise((resolve, reject) => {
      const transport = encrypted ? https : http;
      const operation = transport.request({ hostname: "127.0.0.1", port: encrypted ? httpsPort : httpPort,
        path: "/call-revocations", method, ca, headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" } }, response => {
        response.resume(); response.on("end", () => resolve(response.statusCode));
      });
      operation.on("error", () => reject(new Error("Revocation fixture transport failed")));
      operation.setTimeout(2000, () => operation.destroy(new Error("Revocation fixture timed out"))); operation.end(body);
    });
    check(await request(revokeBody({}), false) === 403, "Cleartext and spoofed forwarding header cannot revoke");
    check(await request("{}") === 403, "Unsigned revocation denied");
    check(await request(revokeBody({ environment: "sandbox" })) === 403, "Wrong environment denied");
    check(await request(revokeBody({ expiresAt: Math.floor(Date.now() / 1000) + 3600 })) === 403, "Long-lived revocation permission denied");
    check(await request(revokeBody({}), true, "GET") === 403, "GET cannot change a call scope");
    const tampered = JSON.parse(revokeBody({})); tampered.signature = "0".repeat(64);
    check(await request(JSON.stringify(tampered)) === 403, "Forged revocation signature denied");
    const idempotent = revokeBody({});
    check(await request(idempotent) === 200 && await request(idempotent) === 200, "Authenticated generation revocation is safely idempotent");
    const connect = async (user, secret, resource) => {
      const client = new BootstrapClient(port, ca); clients.push(client);
      check(await client.authenticate(user, secret), "Encrypted c2s authenticated");
      check(/type=['"]result['"]/.test(await client.bind(resource)), "Expected resource bound");
      return client;
    };
    const iq = async (client, content) => {
      const identifier = "control-" + randomBytes(6).toString("hex");
      client.send(`<iq type='set' to='example.test' id='${identifier}'>${content}</iq>`);
      const reply = await client.wait(new RegExp(`<iq\\b(?=[^>]*\\bid=['"]${identifier}['"])[^>]*(?:\\/>|>[\\s\\S]*?<\\/iq>)`));
      check(/type=['"]result['"]/.test(reply), "Scoped control acknowledged");
    };
    const alice = await connect("alice", password, "caller"); alice.send("<presence/>");
    const owner = await connect("bob", password, "settings"); owner.send("<presence/>");
    for (const client of [alice, owner]) await iq(client, "<preferences xmlns='urn:teletyptel:call-recovery:1' enabled='true' dnd='false'/>");
    const seen = new Set();
    const ingest = async () => {
      const envelopes = JSON.parse(execute(["exec", name, "sh", "-c", "printf '['; first=1; for event in /tmp/tc/spool/*.json; do [ -f \"$event\" ] || continue; [ $first = 1 ] || printf ','; cat \"$event\"; first=0; done; printf ']' "]));
      const fresh = envelopes.filter(envelope => !seen.has(JSON.parse(Buffer.from(envelope.payload, "base64")).nonce));
      const reply = await registry.request({ action: "ingest", envelopes: fresh });
      check(reply.ok, "Actual signed producer events ingested by PHP");
      for (const envelope of fresh) seen.add(JSON.parse(Buffer.from(envelope.payload, "base64")).nonce);
      return reply.result.calls;
    };
    const sid = "active-" + randomBytes(6).toString("hex");
    alice.send(`<message type='chat' to='bob@example.test'><propose xmlns='urn:xmpp:jingle-message:0' id='${sid}'><description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'/><description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'/><description xmlns='urn:xmpp:jingle:apps:rtt-sync:0'/></propose></message>`);
    await delay(300);
    const call = (await ingest()).find(value => value.sid === sid);
    check(call?.state === "ringing", "Real offer becomes a ringing registry call");
    const recover = async (operation, jid) => registry.request({ action: "recovery", operation, callId: call.callId, ...(jid ? { jid } : {}) });
    const reply = await recover("bootstrap"); check(reply.ok, "Actual broker issues bootstrap");
    const grant = reply.result, full = grant.claims.owner + "/" + grant.claims.resource;
    const scoped = await connect("bob", grant.credential, grant.claims.resource);
    await scoped.wait(/<message\b[^>]*>[\s\S]*?<propose\b[\s\S]*?<\/message>/);
    stage = "resource proof and reservation";
    await iq(scoped, `<handoff xmlns='urn:teletyptel:call-recovery:1' callId='${call.callId}' sid='${sid}' deviceId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' generation='${registration.generation}'/>`);
    await delay(150); await ingest();
    const accepted = await recover("accept", full); check(accepted.ok, "Actual broker verifies producer proof and reserves winner");
    await iq(scoped, `<authorize xmlns='urn:teletyptel:call-recovery:1'>${accepted.result.answerAuthorization}</authorize>`);
    check(!(await recover("lease", full)).ok, "Reservation alone cannot extend access without observed proceed");
    scoped.send(`<message type='chat' to='alice@example.test/caller'><proceed xmlns='urn:xmpp:jingle-message:0' id='${sid}'/></message>`);
    await alice.wait(/<message\b[^>]*>[\s\S]*?<proceed\b[\s\S]*?<\/message>/);
    stage = "active lease renewal";
    const started = Date.now();
    for (let renewal = 0; renewal < 8; renewal++) {
      if (renewal > 0) await delay(8000);
      stage = "active keepalive " + renewal;
      await iq(scoped, "<keepalive xmlns='urn:teletyptel:call-recovery:1'/>");
      stage = "active ingest " + renewal;
      await delay(150); await ingest();
      stage = "active broker lease " + renewal;
      const lease = await recover("lease", full); check(lease.ok, "Fresh authenticated producer state authorizes short lease");
      check(lease.result.claims.expiresAt <= Math.floor(Date.now() / 1000) + 25, "No long-lived scope is minted");
      stage = "active scope acknowledgement " + renewal;
      await iq(scoped, `<lease xmlns='urn:teletyptel:call-recovery:1'>${lease.result.credential}</lease>`);
      check(!scoped.closed, "Renewal survives older expiry timers");
    }
    check(Date.now() - started > 45000, "Accepted call lasts beyond both bootstrap and invitation deadlines");
    stage = "direct logout revocation";
    const beforeLogout = Date.now();
    const logout = await registry.request({ action: "web-logout" });
    check(logout.ok && logout.result.signedOut && logout.result.pending === 0, "Actual PHP logout synchronously delivers and acknowledges durable scope revocation");
    for (let attempt = 0; attempt < 100 && !scoped.closed; attempt++) await delay(25);
    check(scoped.closed && Date.now() - beforeLogout < 3000, "Logout closes the actual active stream without waiting for its 25-second lease");
    await delay(150); await ingest();
    check(!(await recover("lease", full)).ok, "Ended or revoked active call cannot renew");
    await iq(owner, "<preferences xmlns='urn:teletyptel:call-recovery:1' enabled='true' dnd='false'/>");
    check(!owner.closed && !alice.closed, "Logout revokes only that device generation, not other authenticated sessions");
    process.stdout.write(`Active call integration: ${checks} checks passed; real TLS, producer, PHP broker and repeated scope renewal beyond 45 seconds; no APNs.\n`);
  } catch (error) {
    throw new Error("Isolated active call failed at " + stage + ": " + (stage === "startup" ? error.message : error.name + " (" + lastCheck + ")"));
  } finally {
    for (const client of clients) client.close();
    registry?.close();
    if (created) execute(["rm", "-f", name]);
    if (temporary) { fs.unlinkSync(path.join(temporary, "bootstrap.key")); fs.unlinkSync(path.join(temporary, "ca.pem")); fs.rmdirSync(temporary); }
  }
}
if (require.main === module) run().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
