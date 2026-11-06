const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createApnsSender, incomingPayload } = require("../services/call-push/apns");

const keys = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
const base = { keyId: "TESTKEY123", teamId: "TESTTEAM12", bundleId: "com.example.messenger", environment: "production", privateKey };
const invitation = { callId: "7d2d10f6-00ab-40fb-9d6f-0d46c833080e", sid: "session-123", hasVideo: true, mediaProfile: "total", expiresAt: 1050 };
const deviceToken = "ab".repeat(32);

test("Incoming-call payload contains no identity, conversation, credentials or SDP", () => {
  assert.deepEqual(JSON.parse(incomingPayload({ ...invitation, caller: "private", sdp: "private", text: "private" }, 1000)),
    { aps: {}, type: "incoming-call", ...invitation });
  for (const change of [{ callId: "invalid" }, { sid: undefined }, { sid: "../other" }, { hasVideo: 1 }, { expiresAt: 1000 },
    { expiresAt: 1061 }, { expiresAt: "1050" }]) assert.throws(() => incomingPayload({ ...invitation, ...change }, 1000));
});

test("VoIP uses production HTTP/2 headers, zero storage lifetime and verifiable ES256", async () => {
  const sender = createApnsSender({ ...base, now: () => 1000, transport: async (host, headers, body) => {
    assert.equal(host, "https://api.push.apple.com");
    assert.equal(headers[":path"], "/3/device/" + deviceToken);
    assert.equal(headers["apns-topic"], "com.example.messenger.voip");
    assert.equal(headers["apns-push-type"], "voip");
    assert.equal(headers["apns-priority"], "10");
    assert.equal(headers["apns-expiration"], "0");
    const [header, claims, signature] = headers.authorization.slice(7).split(".");
    assert.deepEqual(JSON.parse(Buffer.from(header, "base64url")), { alg: "ES256", kid: base.keyId });
    assert.deepEqual(JSON.parse(Buffer.from(claims, "base64url")), { iss: base.teamId, iat: 1000 });
    assert.ok(crypto.verify("sha256", Buffer.from(header + "." + claims),
      { key: keys.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")));
    assert.equal(JSON.parse(body).sid, invitation.sid);
    return { status: 200, body: "" };
  } });
  assert.deepEqual(await sender.sendIncoming(deviceToken, invitation),
    { accepted: true, reason: "Accepted", retryable: false, invalidateDevice: false });
});

test("Push preserves TC and audio-RTT instead of inferring text from video", () => {
  for (const [mediaProfile, hasVideo] of [["audio", false], ["video", true], ["audio-rtt", false], ["total", true]]) {
    const payload = JSON.parse(incomingPayload({ ...invitation, mediaProfile, hasVideo }, 1000));
    assert.equal(payload.mediaProfile, mediaProfile);
    assert.equal(payload.hasVideo, hasVideo);
    assert.throws(() => incomingPayload({ ...invitation, mediaProfile, hasVideo: !hasVideo }, 1000));
  }
  for (const mediaProfile of [undefined, null, "rtt", "unknown", "toString", "__proto__", ["total"]]) {
    assert.throws(() => incomingPayload({ ...invitation, mediaProfile }, 1000));
  }
});

test("Keys are cached, refreshed before expiration and invalidated after clock rollback", async () => {
  let timestamp = 1000;
  const tokens = [];
  const sender = createApnsSender({ ...base, environment: "sandbox", now: () => timestamp,
    transport: async (host, headers) => {
      assert.equal(host, "https://api.sandbox.push.apple.com");
      tokens.push(headers.authorization);
      return { status: 200 };
    } });
  for (const instant of [1000, 1100, 4000, 999]) {
    timestamp = instant;
    await sender.sendIncoming(deviceToken, { ...invitation, expiresAt: timestamp + 30 });
  }
  assert.equal(tokens[0], tokens[1]);
  assert.notEqual(tokens[1], tokens[2]);
  assert.notEqual(tokens[2], tokens[3]);
});

test("Invalid inputs cannot construct a destination or send a push", async () => {
  for (const change of [{ environment: "https://evil.test" }, { environment: "toString" }, { keyId: "x\r\ny" },
    { bundleId: "com.example/other" }, { keyId: 1234567890 }, { privateKey: "not a private key" }]) {
    assert.throws(() => createApnsSender({ ...base, ...change }));
  }
  const sender = createApnsSender({ ...base, now: () => 1000, transport: () => assert.fail("unexpected network") });
  await assert.rejects(sender.sendIncoming("../../other", invitation));
  await assert.rejects(sender.sendIncoming(deviceToken, { ...invitation, expiresAt: 999 }));
});

test("Apple errors are sanitized, not retried blindly, with timestamp-aware token invalidation", async () => {
  let response;
  let attempts = 0;
  const sender = createApnsSender({ ...base, now: () => 1000, transport: async () => { attempts++; return response; } });
  for (const [status, reason, timestamp, invalidate, retry] of [
    [410, "Unregistered", 1000000, true, false], [410, "Unregistered", undefined, false, false],
    [400, "BadDeviceToken", undefined, false, false], [403, "TopicDisallowed", undefined, false, false],
    [429, "TooManyRequests", undefined, false, true], [503, "ServiceUnavailable", undefined, false, true],
    [403, "sensitive server diagnostics", undefined, false, false]
  ]) {
    response = { status, body: JSON.stringify({ reason, timestamp }) };
    const result = await sender.sendIncoming(deviceToken, invitation);
    assert.equal(result.invalidateDevice, invalidate);
    assert.equal(result.retryable, retry);
    assert.ok(!JSON.stringify(result).includes("sensitive"));
  }
  assert.equal(attempts, 7);
});

test("Transport failures never expose tokens or keys", async () => {
  const sender = createApnsSender({ ...base, now: () => 1000,
    transport: () => { throw new Error("secret " + privateKey + deviceToken); } });
  const result = await sender.sendIncoming(deviceToken, invitation);
  assert.equal(result.reason, "TransportUnavailable");
  assert.ok(!JSON.stringify(result).includes(deviceToken));
});
