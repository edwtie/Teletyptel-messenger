const fs = require("node:fs");
const path = require("node:path");
const https = require("node:https");
const { spawnSync } = require("node:child_process");
const { root, loadAndroidSettings, readTestCertificate } = require("./android-settings");

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, { cwd: root, windowsHide: true, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(command + " failed (" + result.status + ").");
}

function verifyServer(settings, certificate) {
  return new Promise((resolve, reject) => {
    const request = https.get(settings.serverUrl, { ca: certificate.toString(), timeout: 10000 }, (response) => {
      response.resume();
      if (response.statusCode !== 200) reject(new Error("Messenger returned HTTP " + response.statusCode));
      else resolve();
    });
    request.on("timeout", () => request.destroy(new Error("The local HTTPS server did not respond.")));
    request.on("error", reject);
  });
}

async function main() {
  const action = process.argv[2] || "sync";
  if (!["add", "sync", "build", "open", "check"].includes(action)) throw new Error("Use add, sync, build, open or check.");
  const settings = loadAndroidSettings(), certificate = readTestCertificate(settings);
  if (["check", "build"].includes(action)) {
    await verifyServer(settings, certificate);
    console.log("Verified HTTPS connection to " + settings.serverUrl);
    if (action === "check") return;
  }
  const www = path.join(root, "mobile/android/www");
  fs.writeFileSync(path.join(www, "connection.js"), "window.teletyptelAndroidServer = " + JSON.stringify(settings.serverUrl) + ";\n");
  const environment = { ...process.env, TELETYPTEL_MOBILE_TARGET: "android" };
  const cli = path.join(root, "node_modules/@capacitor/cli/bin/capacitor");
  run(process.execPath, [cli, action === "add" ? "add" : action === "open" ? "open" : "sync", "android"], { env: environment });
  if (action === "open") return;
  const resources = path.join(root, "android/app/src/debug/res");
  fs.mkdirSync(path.join(resources, "raw"), { recursive: true });
  fs.mkdirSync(path.join(resources, "xml"), { recursive: true });
  fs.writeFileSync(path.join(resources, "raw/teletyptel_test_ca.cer"), certificate.raw);
  fs.writeFileSync(path.join(resources, "xml/network_security_config.xml"),
    '<?xml version="1.0" encoding="utf-8"?>\n<network-security-config>\n'
    + '  <base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system"/></trust-anchors></base-config>\n'
    + '  <domain-config cleartextTrafficPermitted="false"><domain includeSubdomains="false">' + settings.hostname
    + '</domain><trust-anchors><certificates src="@raw/teletyptel_test_ca"/></trust-anchors></domain-config>\n'
    + '</network-security-config>\n');
  console.log("Test CA SHA-256: " + certificate.fingerprint256);
  if (action !== "build") return;
  const portableTools = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "TeleTypTel/tools") : "";
  const portableJava = portableTools && fs.existsSync(portableTools)
    ? fs.readdirSync(portableTools).filter((name) => name.startsWith("jdk-21")).sort().reverse().map((name) => path.join(portableTools, name)) : [];
  const candidates = [process.env.JAVA_HOME, ...portableJava, "C:/Program Files/Android/openjdk/jdk-21.0.8"].filter(Boolean);
  const javaHome = candidates.find((candidate) => spawnSync(path.join(candidate, "bin", process.platform === "win32" ? "java.exe" : "java"),
    ["-version"], { windowsHide: true, stdio: "ignore" }).status === 0);
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
    || (process.platform === "win32" ? "C:/Program Files (x86)/Android/android-sdk" : "");
  if (!javaHome || !sdk || !fs.existsSync(javaHome) || !fs.existsSync(sdk)) throw new Error("Set JAVA_HOME (JDK 21) and ANDROID_HOME (SDK 36).");
  const buildEnvironment = { ...environment, JAVA_HOME: javaHome, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk };
  const android = path.join(root, "android");
  if (process.platform === "win32") run("cmd.exe", ["/d", "/c", "gradlew.bat", "--no-daemon", "assembleDebug"], { cwd: android, env: buildEnvironment });
  else run("./gradlew", ["--no-daemon", "assembleDebug"], { cwd: android, env: buildEnvironment });
  const output = path.join(root, "artifacts/android");
  fs.mkdirSync(output, { recursive: true });
  fs.copyFileSync(path.join(android, "app/build/outputs/apk/debug/app-debug.apk"), path.join(output, "TeleTypTel-Android-test.apk"));
  console.log("APK: " + path.join(output, "TeleTypTel-Android-test.apk"));
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyServer };
