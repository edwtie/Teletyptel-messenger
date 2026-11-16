"use strict";
const fs = require("node:fs");
const path = require("node:path");

function protectedFile(file, maximum, roots = [path.resolve(__dirname, "../..")]) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("Protected absolute configuration path required");
  const stat = fs.lstatSync(file), resolved = fs.realpathSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maximum
      || process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error("Unsafe protected configuration file");
  for (const root of roots.filter(Boolean)) {
    const relative = path.relative(path.resolve(root), resolved);
    if (!relative || relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative)) {
      throw new Error("Private configuration must remain outside repository and web roots");
    }
  }
  return resolved;
}

function settings(environment) {
  if (!environment.TELETYPTEL_CALL_PUSH_APNS_CONFIG_FILE) return environment;
  const roots = [path.resolve(__dirname, "../.."), environment.DOCUMENT_ROOT];
  const file = protectedFile(environment.TELETYPTEL_CALL_PUSH_APNS_CONFIG_FILE, 4096, roots);
  const config = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!config || typeof config !== "object" || Array.isArray(config)
      || Object.keys(config).sort().join(",") !== "environment,keyFile,keyId,teamId,version"
      || config.version !== 1 || config.environment !== "production" || config.keyId !== "P23DMHKUQW"
      || config.teamId !== "H29RTRBD9D") throw new Error("Unexpected APNs production configuration");
  protectedFile(config.keyFile, 4096, roots);
  return { ...environment, TELETYPTEL_APNS_KEY_FILE: config.keyFile, TELETYPTEL_APNS_KEY_ID: config.keyId,
    TELETYPTEL_APNS_TEAM_ID: config.teamId, TELETYPTEL_CALL_PUSH_ENVIRONMENT: config.environment };
}

module.exports = { protectedFile, settings };
