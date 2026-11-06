"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Readable, Writable } = require("node:stream");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { run, configuration } = require("../services/call-push/send");
const { createApnsSender } = require("../services/call-push/apns");

const root = path.resolve(__dirname, "..");
const key = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" });
const now = 1800000000;
const invitation = { callId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", sid: "real-sid", hasVideo: true, expiresAt: now + 30 };

async function invoke(source, sender) {
  let output = "";
  const sink = new Writable({ write(chunk, encoding, callback) { output += chunk.toString(); callback(); } });
  const code = await run(Readable.from([source]), sink, sender);
  return { code, output, result: JSON.parse(output) };
}

test("Stdin dispatch uses minimal APNs payload and never echoes device token", async () => {
  let calls = 0;
  const sender = createApnsSender({ keyId: "ABCDEFGHIJ", teamId: "KLMNOPQRST", bundleId: "com.tiedragon.teletyptel",
    environment: "production", privateKey: key, now: () => now, transport: async (host, headers, body) => {
      calls++;
      assert.equal(host, "https://api.push.apple.com");
      assert.equal(headers["apns-topic"], "com.tiedragon.teletyptel.voip");
      const payload = JSON.parse(body);
      assert.equal(payload.sid, invitation.sid);
      assert.equal(payload.caller, undefined);
      return { status: 200 };
    } });
  const token = "a".repeat(64);
  const response = await invoke(JSON.stringify({ deviceToken: token, invitation }), sender);
  assert.equal(response.code, 0);
  assert.equal(response.result.accepted, true);
  assert.equal(calls, 1);
  assert.ok(!response.output.includes(token));
  assert.ok(!response.output.includes("PRIVATE KEY"));
});

test("Oversize, malformed input and sender exceptions fail closed without details", async () => {
  let calls = 0;
  const sender = { sendIncoming: async () => { calls++; throw new Error("secret test-token"); } };
  for (const input of ["{}".repeat(3000), "{", "[]", "null"]) {
    const response = await invoke(input, sender);
    assert.equal(response.code, 1);
    assert.equal(response.result.accepted, false);
    assert.equal(response.result.retryable, false);
  }
  assert.equal(calls, 0);
  const failure = await invoke(JSON.stringify({ deviceToken: "a".repeat(64), invitation }), sender);
  assert.equal(calls, 1);
  assert.ok(!failure.output.includes("secret"));
});

test("Only a key outside the repository can configure the APNs process", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tt-push-config-"));
  try {
    const file = path.join(directory, "fake-key.p8");
    fs.writeFileSync(file, key);
    const config = configuration({ TELETYPTEL_APNS_KEY_FILE: file, TELETYPTEL_APNS_KEY_ID: "ABCDEFGHIJ",
      TELETYPTEL_APNS_TEAM_ID: "KLMNOPQRST", TELETYPTEL_CALL_PUSH_ENVIRONMENT: "production" });
    assert.equal(config.bundleId, "com.tiedragon.teletyptel");
    assert.equal(config.privateKey.toString(), key);
    assert.throws(() => configuration({ TELETYPTEL_APNS_KEY_FILE: path.join(root, "package.json") }));
    assert.throws(() => configuration({ TELETYPTEL_APNS_KEY_FILE: "relative-file.p8" }));
  } finally {
    fs.unlinkSync(path.join(directory, "fake-key.p8"));
    fs.rmdirSync(directory);
  }
});

test("Real executable is opt-in, does not send or reveal configuration by default", () => {
  const result = spawnSync(process.execPath, [path.join(root, "services/call-push/send.js")], {
    env: { ...process.env, TELETYPTEL_CALL_PUSH_WORKER: "0", TELETYPTEL_APNS_KEY_FILE: "private-test-secret" },
    input: "{}", encoding: "utf8", timeout: 5000
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.ok(!result.stderr.includes("private-test-secret"));
});

test("Registration endpoint has no arbitrary invite/send action, no automatic schema migration", () => {
  const endpoint = fs.readFileSync(path.join(root, "php/public/api/call-push.php"), "utf8");
  assert.match(endpoint, /TELETYPTEL_CALL_PUSH_REGISTRY.*!== '1'/);
  assert.match(endpoint, /CallPushService::authorize/);
  assert.match(endpoint, /HTTP_X_CSRF_TOKEN/);
  assert.match(endpoint, /4097/);
  assert.match(endpoint, /\['consent'\] \?\? null\) !== true/);
  assert.doesNotMatch(endpoint, /ensureSchema|inviteVerified|acceptVerified|dispatchOne|sendIncoming/);
  const account = fs.readFileSync(path.join(root, "php/public/api/account.php"), "utf8");
  const logout = account.slice(account.indexOf("function logoutAccountSession"), account.indexOf("function readPublicProfile"));
  assert.ok(logout.indexOf("revokeWebSession") < logout.indexOf("unset("));
});
