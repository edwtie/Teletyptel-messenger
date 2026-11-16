"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { signEvent } = require("../services/call-push/signaling-event");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const now = 1800000000;
const configuration = () => ({ key: randomBytes(32), environment: "production", domain: "example.test", issuer: "fixture", timestamp: now });
const resource = { type: "resource", jid: "alice@example.test/browser", online: true, revision: 1, expiresAt: now + 30 };

function phpRuntime(context) {
  for (const candidate of [process.env.PHP_BINARY, "C:/wamp64/bin/php/php8.4.15/php.exe", "php"].filter(Boolean)) {
    const result = spawnSync(candidate, ["--version"], { timeout: 10000, encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  context.skip("PHP unavailable; runtime interoperability was not exercised");
}

test("Trusted signaling signer pins issuer/domain/environment and excludes chat content", () => {
  const options = configuration();
  const signed = signEvent(resource, options);
  assert.equal(signed.signature.length, 64);
  assert.deepEqual(JSON.parse(Buffer.from(signed.payload, "base64")).event, resource);
  for (const change of [{ key: Buffer.alloc(31) }, { environment: "other" }, { issuer: "bad/issuer" },
    { domain: "evil.test/path" }, { timestamp: Infinity }, { nonce: "invalid" }]) {
    assert.throws(() => signEvent(resource, { ...options, ...change }));
  }
  for (const change of [{ body: "private text" }, { sdp: "v=0" }, { password: "not-allowed" }, { nested: {} }]) {
    assert.throws(() => signEvent({ ...resource, ...change }, options));
  }
  assert.throws(() => signEvent({ ...resource, jid: "a".repeat(513) }, options));
  assert.throws(() => signEvent({ ...resource, jid: "alice\n@example.test" }, options));
  assert.throws(() => signEvent({ ...resource, revision: 1.5 }, options));
  assert.throws(() => signEvent({ type: "__proto__" }, options));
  const duplicateNonce = "a".repeat(32);
  const original = signEvent(resource, { ...options, nonce: duplicateNonce });
  assert.notEqual(original.signature, signEvent(resource, { ...options, nonce: duplicateNonce, environment: "sandbox" }).signature);
  assert.notEqual(original.signature, signEvent(resource, { ...options, nonce: duplicateNonce, issuer: "other" }).signature);
});

test("Real Node envelopes are processed by the actual PHP ledger without network access", context => {
  const php = phpRuntime(context); if (!php) return;
  const options = configuration();
  const envelope = signEvent(resource, options);
  const run = signed => spawnSync(php, [path.join(root, "php/tests/call-push-signaling-test.php"), "--node-fixture"],
    { input: JSON.stringify({ key: options.key.toString("base64"), envelope: signed }), encoding: "utf8", timeout: 15000 });
  const accepted = run(envelope);
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.deepEqual(JSON.parse(accepted.stdout), { accepted: true, duplicate: false });
  assert.equal(run({ ...envelope, signature: "0".repeat(64) }).status, 1);
  const oversizedLease = run(signEvent({ ...resource, expiresAt: now + 31 }, options));
  assert.equal(oversizedLease.status, 1);
});

test("Durable signaling policy exercises revocation, expiry, replay and winning-device scope", context => {
  const php = phpRuntime(context); if (!php) return;
  const result = spawnSync(php, [path.join(root, "php/tests/call-push-signaling-test.php")], { encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /checks passed; isolated SQLite, fake registrations, no live server or APNs/);
});

test("Server ingress is CLI-only and disabled before database access; native control remains status/end only", context => {
  const php = phpRuntime(context); if (!php) return;
  const result = spawnSync(php, [path.join(root, "services/call-push/signaling.php"), "--ingest"], {
    input: "DO-NOT-LOG-fixture-content", encoding: "utf8", timeout: 10000,
    env: { ...process.env, TELETYPTEL_CALL_SIGNALING: "0" }
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.doesNotMatch(result.stderr, /DO-NOT-LOG|password|mysql:|SQLSTATE/);
  const source = read("services/call-push/signaling.php");
  assert.match(source, /PHP_SAPI !== 'cli'/);
  assert.ok(source.indexOf("getenv('TELETYPTEL_CALL_SIGNALING')") < source.indexOf("Database::connect()"));
  assert.match(source, /stream_get_contents\(STDIN, 16385\)/);
  assert.doesNotMatch(source, /dispatchOne|CallPushTransport|createApnsSender/);
  const endpoint = read("php/public/api/call-push.php");
  assert.match(endpoint, /getenv\('TELETYPTEL_CALL_PUSH_POLICY'\) !== 'signaling-v1'/);
  assert.match(endpoint, /\$signaling->accept\(\$service, \$account, \$binding, \$input\)/);
  assert.doesNotMatch(read("php/public/api/call-control.php"), /acceptVerified|->accept\(|inviteVerified|session_start/);
  assert.doesNotMatch(endpoint, /ensureSchema|dispatchOne|inviteVerified/);
  assert.match(endpoint, /if \(CallPushActivation::ready\(\$pdo, \$account\)\) \$result\['capabilities'\] = \['backgroundAnswerRecovery' => true\]/);
  const activation = read("php/lib/CallPushActivation.php");
  assert.match(activation, /TELETYPTEL_CALL_BACKGROUND_PILOT_ACCOUNTS/);
  assert.match(activation, /in_array\(\$account, \$accounts, true\)/);
  assert.match(activation, /\$now - 5/);
  assert.doesNotMatch(activation, /sendIncoming|->register\(|dispatchOne/);
});
