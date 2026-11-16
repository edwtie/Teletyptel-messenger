"use strict";
const http2 = require("node:http2");
const { configuration } = require("./send");
const { createApnsSender } = require("./apns");

async function check(environment = process.env) {
  const config = configuration(environment);
  createApnsSender(config);
  if (config.environment !== "production") throw new Error("Explicit production APNs configuration required");
  await new Promise((resolve, reject) => {
    const session = http2.connect("https://api.push.apple.com");
    let finished = false;
    const complete = error => {
      if (finished) return; finished = true; clearTimeout(timer); session.destroy();
      if (error) reject(new Error("Verified APNs HTTP/2 connection unavailable")); else resolve();
    };
    const timer = setTimeout(() => complete(true), 10000);
    session.once("error", () => complete(true));
    session.once("connect", () => complete(session.socket.alpnProtocol !== "h2"));
  });
  return { signingKeyConfigured: true, appleTLSConnected: true, environment: "production",
    appleProviderAuthenticated: false, deviceTestRequired: true, pushSent: false };
}
if (require.main === module) check().then(value => process.stdout.write(JSON.stringify(value) + "\n"))
  .catch(() => { process.stderr.write("APNs preflight failed; no push was sent.\n"); process.exitCode = 1; });
module.exports = { check };
