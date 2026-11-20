const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const candidates = [process.env.PHP_BINARY, "C:/wamp64/bin/php/php8.4.27/php.exe", "php"].filter(Boolean);
let php;
for (const candidate of candidates) {
  try {
    execFileSync(candidate, ["-r", "exit(extension_loaded('pdo_sqlite') ? 0 : 2);"], { timeout: 10000, stdio: "pipe" });
    php = candidate;
    break;
  } catch {}
}

test("Native cloud API uses existing history, bounded authenticated routes and conditional updates", () => {
  const service = read("php/lib/NativeCloudHistory.php");
  const endpoint = read("php/public/api/native-history.php");
  assert.match(service, /message_history/);
  assert.match(service, /hash_equals/);
  assert.match(service, /expectedVersion/);
  assert.doesNotMatch(service, /CREATE TABLE|ALTER TABLE|save_recipient/i);
  assert.match(endpoint, /NativeCloudHistory::serve\(\)/);
  assert.match(service, /NativeProfileService::checkCsrf/);
  assert.match(service, /Cache-Control: no-store/);
  assert.doesNotMatch(endpoint, /getMessage\(\).*server_error|error_log\(.*input/);
  const session = read("mobile/ios-native/Sources/TeleTypTelCore/NativeAccountWebSession.swift");
  assert.match(session, /case history = "api\/native-history\.php"/);
  assert.match(session, /NativeWebSessionRedirectGuard/);
  assert.match(session, /historyBefore/);
});

test("Native cloud loads cannot manufacture XMPP receipt or membership authority", () => {
  const login = read("mobile/ios-native/Sources/TeleTypTelCore/NativeLoginModel.swift");
  const cloud = read("mobile/ios-native/Sources/TeleTypTelCore/NativeCloudSync.swift");
  assert.match(login, /configureCloudHistory/);
  assert.match(login, /queueCloudChanges\(previous\)/);
  assert.match(login, /cloudHistory\.configure\(nil, owner: nil\)/);
  assert.match(cloud, /self\.generation == attempt/);
  assert.match(cloud, /expectedVersion: base\?\.version/);
  assert.doesNotMatch(cloud, /sendReceipt|\.displayed\(|sendMessage\(/);
  const generator = read("scripts/prepare-ios-native.js");
  for (const source of ["NativeCloudRecord.swift", "NativeCloudHistory.swift", "NativeCloudSync.swift", "App/NativeCloudHistoryView.swift"]) {
    assert.ok(generator.includes(source), source);
  }
  assert.match(read("scripts/check-ios-native-media.js"), /NativeCloudRecord\.swift/);
  assert.match(read("scripts/check-ios-native.js"), /TELETYPTEL_NATIVE_CLOUD_UI_FIXTURE/);
  assert.match(read("mobile/ios-native/App/NativeCloudHistoryView.swift"), /minHeight: 58/);
  assert.match(read("mobile/ios-native/App/NativeCloudHistoryView.swift"), /\.accessibilityElement\(children: \.combine\)/);
  assert.doesNotMatch(read("mobile/ios-native/App/NativeCloudHistoryView.swift"), /}\s*\.accessibilityIdentifier\(state\.ready/);
  assert.match(read("mobile/ios-native/App/NativeCloudHistoryView.swift"), /\.foregroundStyle\(selected == conversation\.peer \? NativeWebStyle\.selectionText : NativeWebStyle\.muted\)/);
  assert.match(read("mobile/ios-native/App/NativeTranslationView.swift"), /NativeHistoricalContacts\([^\n]*selected: selected, archived: archive\.entries\)/);
});

for (const file of ["native-cloud-history-test.php", "native-cloud-history-http-test.php"]) {
  test("Shared online history isolated PHP validation: " + file, { skip: !php && "PHP with pdo_sqlite is required; no live database is substituted" }, () => {
    const output = execFileSync(php, [path.join(root, "php/tests", file)], { cwd: root, encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024 });
    assert.match(output, /passed/i);
  });
}
