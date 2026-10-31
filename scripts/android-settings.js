const fs = require("node:fs");
const path = require("node:path");
const { X509Certificate } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const settingsFile = path.join(root, "mobile/android/local.config.json");

function validateAndroidSettings(settings) {
  const url = new URL(settings.serverUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
      || !url.pathname.endsWith("/chat.html") || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Use a reachable HTTPS URL ending in /chat.html, without credentials, query or fragment.");
  }
  if (!settings.caCertificate || typeof settings.caCertificate !== "string") throw new Error("Provide the public test CA certificate path.");
  return { serverUrl: url.href, hostname: url.hostname, caCertificate: path.resolve(root, settings.caCertificate) };
}

function loadAndroidSettings(file = settingsFile) {
  if (!fs.existsSync(file)) throw new Error("Copy mobile/android/local.config.example.json to local.config.json and set your LAN HTTPS URL and public CA.");
  return validateAndroidSettings(JSON.parse(fs.readFileSync(file, "utf8")));
}

function readTestCertificate(settings) {
  const input = fs.readFileSync(settings.caCertificate);
  if (/PRIVATE KEY/.test(input.toString("utf8"))) throw new Error("Never package a private key. Select the public CA certificate only.");
  const certificate = new X509Certificate(input);
  if (!certificate.ca || Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) {
    throw new Error("The test CA must be a currently valid CA certificate.");
  }
  return certificate;
}

function capacitorAndroidConfig(settings) {
  const server = new URL(settings.serverUrl);
  return {
    appId: "com.tiedragon.teletyptel",
    appName: "TeleTypTel Test",
    webDir: "mobile/android/www",
    loggingBehavior: "none",
    server: { url: server.origin, appStartPath: server.pathname, hostname: "localhost", androidScheme: "https", cleartext: false, errorPath: "offline.html" },
    android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
    plugins: { CapacitorHttp: { enabled: false } }
  };
}

module.exports = { root, settingsFile, validateAndroidSettings, loadAndroidSettings, readTestCertificate, capacitorAndroidConfig };
