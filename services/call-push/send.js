"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createApnsSender } = require("./apns");

function configuration(environment) {
  const file = environment.TELETYPTEL_APNS_KEY_FILE;
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("APNs configuration unavailable");
  const resolved = fs.realpathSync(file);
  const repository = fs.realpathSync(path.resolve(__dirname, "../.."));
  const relative = path.relative(repository, resolved);
  if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) {
    throw new Error("APNs signing key must be outside the repository and web root");
  }
  if (!fs.statSync(resolved).isFile() || fs.statSync(resolved).size > 4096) throw new Error("Invalid APNs key file");
  return { keyId: environment.TELETYPTEL_APNS_KEY_ID, teamId: environment.TELETYPTEL_APNS_TEAM_ID,
    bundleId: "com.tiedragon.teletyptel", environment: environment.TELETYPTEL_CALL_PUSH_ENVIRONMENT,
    privateKey: fs.readFileSync(resolved) };
}

async function readRequest(input) {
  let source = "";
  for await (const chunk of input) {
    source += chunk.toString("utf8");
    if (Buffer.byteLength(source) > 4096) throw new Error("Invalid push request");
  }
  const request = JSON.parse(source);
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Invalid push request");
  return request;
}

async function run(input, output, sender) {
  try {
    const request = await readRequest(input);
    const result = await sender.sendIncoming(request.deviceToken, request.invitation);
    output.write(JSON.stringify(result) + "\n");
    return 0;
  } catch {
    output.write(JSON.stringify({ accepted: false, reason: "TransportUnavailable", retryable: false, invalidateDevice: false }) + "\n");
    return 1;
  }
}

if (require.main === module) {
  const timeout = setTimeout(() => process.exit(1), 15000);
  timeout.unref();
  Promise.resolve().then(() => {
    if (process.env.TELETYPTEL_CALL_PUSH_WORKER !== "1") throw new Error("Disabled");
    return run(process.stdin, process.stdout, createApnsSender(configuration(process.env)));
  }).then(code => { process.exitCode = code; clearTimeout(timeout); }).catch(() => {
    process.stderr.write("Call-push transport unavailable or disabled.\n");
    process.exitCode = 1;
    clearTimeout(timeout);
  });
}

module.exports = { run, readRequest, configuration };
