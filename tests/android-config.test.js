const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const { root, validateAndroidSettings, readTestCertificate, capacitorAndroidConfig } = require("../scripts/android-settings");

test("LAN settings require an explicit HTTPS Messenger URL", () => {
  const input = { serverUrl: "https://192.168.0.105/chat.html", caCertificate: "public-test-ca.cer" };
  assert.equal(validateAndroidSettings(input).hostname, "192.168.0.105");
  for (const serverUrl of ["http://192.168.0.105/chat.html", "https://localhost/chat.html", "https://127.0.0.1/chat.html",
    "https://[::1]/chat.html", "https://user:secret@example.test/chat.html", "https://example.test/chat.html?key=secret",
    "https://example.test/chat.html#token", "https://example.test/admin/", "not a URL"]) {
    assert.throws(() => validateAndroidSettings({ ...input, serverUrl }), serverUrl);
  }
  assert.throws(() => validateAndroidSettings({ ...input, caCertificate: "" }));
});

test("Android packages only the offline shell, with no insecure native HTTP bridge", () => {
  const settings = validateAndroidSettings({ serverUrl: "https://192.168.0.105/chat.html", caCertificate: "public-test-ca.cer" });
  const config = capacitorAndroidConfig(settings);
  assert.equal(config.webDir, "mobile/android/www");
  assert.equal(config.server.url, new URL(settings.serverUrl).origin);
  assert.equal(config.server.appStartPath, "/chat.html");
  assert.equal(config.server.cleartext, false);
  assert.equal(config.android.allowMixedContent, false);
  assert.equal(config.android.webContentsDebuggingEnabled, false);
  assert.equal(config.plugins.CapacitorHttp.enabled, false);
  const allowed = new Set(["index.html", "offline.html", "shell.css", "shell.js", "connection.js"]);
  for (const name of fs.readdirSync(path.join(root, config.webDir))) assert.ok(allowed.has(name), name);
});

test("Certificate loader refuses private keys before parsing", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-android-test-"));
  const caCertificate = path.join(directory, "invalid.pem");
  try {
    fs.writeFileSync(caCertificate, "-----BEGIN PRIVATE KEY-----\nnot-a-real-key\n-----END PRIVATE KEY-----");
    assert.throws(() => readTestCertificate({ caCertificate }), /Never package a private key/);
  } finally {
    fs.unlinkSync(caCertificate);
    fs.rmdirSync(directory);
  }
});

test("Release trust stays system-only; custom CA assets are ignored", () => {
  const security = fs.readFileSync(path.join(root, "android/app/src/main/res/xml/network_security_config.xml"), "utf8");
  assert.match(security, /cleartextTrafficPermitted="false"/);
  assert.match(security, /src="system"/);
  assert.doesNotMatch(security, /@raw|src="user"/);
  const ignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  for (const entry of ["mobile/android/local.config.json", "android/app/src/debug/res/raw/", "android/app/src/main/assets/"]) {
    assert.ok(ignore.includes(entry), entry);
  }
});

test("WebView account data is excluded from backup and device transfer", () => {
  const manifest = fs.readFileSync(path.join(root, "android/app/src/main/AndroidManifest.xml"), "utf8");
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:fullBackupContent="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  const rules = fs.readFileSync(path.join(root, "android/app/src/main/res/xml/data_extraction_rules.xml"), "utf8");
  for (const section of ["cloud-backup", "device-transfer"]) {
    const body = rules.split("<" + section + ">")[1]?.split("</" + section + ">")[0];
    assert.ok(body, section);
    for (const domain of ["root", "file", "database", "sharedpref", "external", "device_root", "device_file", "device_database", "device_sharedpref"]) {
      assert.ok(body.includes('domain="' + domain + '" path="."'), section + ": " + domain);
    }
  }
});

test("Android XMPP uses the HTTPS proxy without changing browser or external endpoints", () => {
  const source = fs.readFileSync(path.join(root, "php/public/chat-client.js"), "utf8");
  const start = source.indexOf("  function normalizeLocalXmppWebSocketUrlForCurrentHost(");
  const end = source.indexOf("  function normalizeXmppPort(", start);
  assert.ok(start >= 0 && end > start);
  const context = vm.createContext({
    URL, location: new URL("https://192.168.0.105/chat.html"),
    window: { Capacitor: { getPlatform: () => "android" } },
    isLocalAccountDomain: (hostname) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname)
  });
  vm.runInContext(source.slice(start, end), context);
  for (const input of ["", "wss://localhost:5443/websocket/", "wss://192.168.0.105:5443/websocket/"]) {
    assert.equal(context.normalizeLocalXmppWebSocketUrlForCurrentHost(input), "wss://192.168.0.105/xmpp-websocket");
  }
  assert.equal(context.normalizeLocalXmppWebSocketUrlForCurrentHost("wss://xmpp.example.test/websocket/"), "wss://xmpp.example.test/websocket/");
  context.window.Capacitor = undefined;
  assert.equal(context.defaultXmppWebSocketUrlForCurrentHost(), "wss://192.168.0.105:5443/websocket/");
});
