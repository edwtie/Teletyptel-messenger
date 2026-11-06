"use strict";

const crypto = require("node:crypto");
const http2 = require("node:http2");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[A-Za-z0-9_-]{1,128}$/;
const mediaProfiles = Object.freeze({ audio: false, video: true, "audio-rtt": false, total: true });
const hosts = Object.freeze({ production: "https://api.push.apple.com", sandbox: "https://api.sandbox.push.apple.com" });
const appleReasons = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered", "TopicDisallowed",
  "InvalidProviderToken", "ExpiredProviderToken", "BadEnvironmentKeyInToken", "TooManyRequests",
  "InternalServerError", "ServiceUnavailable", "Shutdown"]);

function incomingPayload(invitation, now) {
  if (!Number.isSafeInteger(now) || now < 0 || !invitation
      || typeof invitation.callId !== "string" || !uuidPattern.test(invitation.callId)
      || typeof invitation.sid !== "string" || !identifierPattern.test(invitation.sid)
      || typeof invitation.hasVideo !== "boolean" || typeof invitation.mediaProfile !== "string"
      || !Object.hasOwn(mediaProfiles, invitation.mediaProfile)
      || mediaProfiles[invitation.mediaProfile] !== invitation.hasVideo || !Number.isSafeInteger(invitation.expiresAt)
      || invitation.expiresAt <= now || invitation.expiresAt > now + 60) {
    throw new Error("Invalid or expired incoming-call invitation");
  }
  return JSON.stringify({ aps: {}, type: "incoming-call", callId: invitation.callId.toLowerCase(),
    sid: invitation.sid, hasVideo: invitation.hasVideo, mediaProfile: invitation.mediaProfile, expiresAt: invitation.expiresAt });
}

function post(host, headers, body) {
  return new Promise((resolve, reject) => {
    const session = http2.connect(host);
    let request;
    let status = 0;
    let responseBody = "";
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (request && !request.destroyed) request.close();
      session.destroy();
      if (error) reject(new Error("APNs transport unavailable"));
      else resolve(result);
    };
    const timer = setTimeout(() => finish(new Error("timeout")), 10000);
    session.on("error", error => finish(error));
    session.on("goaway", () => finish(new Error("goaway")));
    session.on("close", () => { if (!settled) finish(new Error("closed")); });
    session.once("connect", () => {
      if (settled) return;
      try {
        request = session.request(headers);
        request.setEncoding("utf8");
        request.on("response", response => { status = Number(response[":status"]); });
        request.on("error", error => finish(error));
        request.on("aborted", () => finish(new Error("aborted")));
        request.on("data", chunk => {
          responseBody += chunk;
          if (Buffer.byteLength(responseBody) > 8192) finish(new Error("oversize"));
        });
        request.on("end", () => finish(null, { status, body: responseBody }));
        request.end(body);
      } catch (error) { finish(error); }
    });
  });
}

function createApnsSender({ keyId, teamId, bundleId, environment, privateKey, now = () => Math.floor(Date.now() / 1000), transport = post }) {
  if (typeof keyId !== "string" || !/^[A-Z0-9]{10}$/.test(keyId)
      || typeof teamId !== "string" || !/^[A-Z0-9]{10}$/.test(teamId)
      || typeof bundleId !== "string" || !/^[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(bundleId)
      || !Object.hasOwn(hosts, environment)) throw new Error("Invalid APNs configuration");
  let key;
  try { key = crypto.createPrivateKey(privateKey); }
  catch { throw new Error("APNs requires a readable private signing key"); }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new Error("APNs requires an ES256 P-256 signing key");
  }
  let cachedToken = "";
  let issuedAt = 0;
  function authorization(timestamp) {
    if (!cachedToken || timestamp < issuedAt || timestamp - issuedAt >= 3000) {
      const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
      const unsigned = encode({ alg: "ES256", kid: keyId }) + "." + encode({ iss: teamId, iat: timestamp });
      const signature = crypto.sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
      cachedToken = unsigned + "." + signature.toString("base64url");
      issuedAt = timestamp;
    }
    return "bearer " + cachedToken;
  }
  return Object.freeze({
    async sendIncoming(deviceToken, invitation) {
      if (typeof deviceToken !== "string" || !/^[0-9a-f]{32,512}$/i.test(deviceToken) || deviceToken.length % 2) {
        throw new Error("Invalid APNs device token");
      }
      const timestamp = now();
      const body = incomingPayload(invitation, timestamp);
      const headers = { ":method": "POST", ":path": "/3/device/" + deviceToken.toLowerCase(),
        authorization: authorization(timestamp), "apns-topic": bundleId + ".voip", "apns-push-type": "voip",
        "apns-priority": "10", "apns-expiration": "0", "apns-id": invitation.callId.toLowerCase(),
        "content-type": "application/json" };
      let response;
      try { response = await transport(hosts[environment], headers, body); }
      catch { return { accepted: false, reason: "TransportUnavailable", retryable: true, invalidateDevice: false }; }
      if (response?.status === 200) return { accepted: true, reason: "Accepted", retryable: false, invalidateDevice: false };
      let reason;
      let invalidatedAt;
      try {
        const parsed = JSON.parse(response?.body || "{}");
        reason = parsed.reason;
        if (Number.isSafeInteger(parsed.timestamp) && parsed.timestamp >= 0) invalidatedAt = parsed.timestamp;
      } catch {}
      if (!appleReasons.has(reason)) reason = "Rejected";
      return { accepted: false, reason, retryable: response?.status === 429 || response?.status >= 500,
        invalidateDevice: response?.status === 410 && reason === "Unregistered" && invalidatedAt !== undefined,
        ...(invalidatedAt !== undefined && reason === "Unregistered" ? { invalidatedAt } : {}) };
    }
  });
}

module.exports = { createApnsSender, incomingPayload };
