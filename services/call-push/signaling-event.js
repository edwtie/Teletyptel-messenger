"use strict";

const { createHmac, randomBytes } = require("node:crypto");

const fields = Object.freeze({
  resource: ["type", "jid", "online", "revision", "expiresAt"],
  policy: ["type", "owner", "peer", "allowed", "revision", "expiresAt"],
  offer: ["type", "caller", "recipient", "sid", "mediaProfile", "revision", "expiresAt"],
  end: ["type", "caller", "recipient", "sid", "actor", "revision"],
  handoff: ["type", "callId", "sid", "jid", "deviceId", "generation", "revision", "expiresAt"]
});

function signEvent(event, { key, environment, domain, issuer, timestamp = Math.floor(Date.now() / 1000), nonce = randomBytes(16).toString("hex") }) {
  if (!Buffer.isBuffer(key) || key.length !== 32 || !["production", "sandbox"].includes(environment)
      || typeof domain !== "string" || !/^[a-z0-9][a-z0-9.-]{0,252}$/.test(domain)
      || typeof issuer !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(issuer)
      || !Number.isSafeInteger(timestamp) || timestamp < 1 || !/^[a-f0-9]{32}$/.test(nonce)
      || !event || typeof event !== "object" || Array.isArray(event) || !Object.hasOwn(fields, event.type)) {
    throw new Error("Invalid trusted signaling configuration or event");
  }
  const expected = fields[event.type];
  if (Object.keys(event).sort().join(",") !== [...expected].sort().join(",")
      || Object.values(event).some(value => !["string", "number", "boolean"].includes(typeof value)
        || typeof value === "string" && (Buffer.byteLength(value) > 512 || /[\x00-\x1f\x7f]/.test(value))
        || typeof value === "number" && !Number.isSafeInteger(value))) {
    throw new Error("Unexpected signaling metadata; message content and credentials are excluded");
  }
  const payload = Buffer.from(JSON.stringify({ version: 1, issuer, timestamp, nonce, event })).toString("base64");
  if (Buffer.byteLength(payload) > 12000) throw new Error("Signaling event too large");
  const signature = createHmac("sha256", key)
    .update(`teletyptel-call-signaling-v1:${environment}:${domain}:${issuer}:${payload}`).digest("hex");
  return { payload, signature };
}

module.exports = { signEvent };
