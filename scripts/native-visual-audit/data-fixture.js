"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function validateDataFixture(data) {
  const text = value => typeof value === "string" && value.length > 0 && Buffer.byteLength(value, "utf8") <= 5000;
  const keys = (value, names) => value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === names.length && names.every(name => Object.hasOwn(value, name));
  if (!keys(data, ["schema", "id", "epoch", "locale", "timezone", "account", "contact", "group", "messages", "rtt"]) ||
      data.schema !== 1 || data.id !== "teletyptel-visual-data-v1" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(data.epoch || "") ||
      !Number.isFinite(Date.parse(data.epoch)) || new Date(data.epoch).toISOString() !== data.epoch ||
      data.locale !== "nl-NL" || data.timezone !== "Europe/Amsterdam") throw new Error("Invalid visual data metadata");
  if (!keys(data.account, ["accountId", "jid", "displayName", "preferredLanguage"]) ||
      !keys(data.contact, ["jid", "name", "presence", "avatarColor", "phoneNumber"]) || !keys(data.group, ["jid", "name"]) ||
      data.account.jid !== "fixture@localhost" || data.account.accountId !== "fixture-ui" ||
      !text(data.account.displayName) || data.account.preferredLanguage !== "ned" ||
      data.contact?.jid !== "demo-contact@localhost" || !text(data.contact.name) ||
      data.contact.presence !== "online" || !/^#[a-f0-9]{6}$/i.test(data.contact.avatarColor || "") ||
      !/^\+[0-9]{8,15}$/.test(data.contact.phoneNumber || "") ||
      data.group?.jid !== "demo-room@conference.localhost" || !text(data.group.name)) throw new Error("Visual identities must be the isolated fixture accounts");
  if (!Array.isArray(data.messages) || data.messages.length !== 2 ||
      data.messages[0]?.direction !== "peer" || data.messages[1]?.direction !== "self" ||
      data.messages.some(message => !keys(message, ["direction", "body", "id"]) || !text(message.body) || !/^fixture-[a-z-]+$/.test(message.id || "")) ||
      new Set(data.messages.map(message => message.id)).size !== data.messages.length ||
      !keys(data.rtt, ["peer", "self"]) || !text(data.rtt.peer) || !text(data.rtt.self)) throw new Error("Invalid visual message data");
  return data;
}

function freeze(value) {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function readDataFixture(file = path.join(__dirname, "shared-data.json")) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 16384) throw new Error("Visual data fixture is oversized");
  const data = freeze(validateDataFixture(JSON.parse(bytes.toString("utf8"))));
  return { data, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

module.exports = { readDataFixture, validateDataFixture };
