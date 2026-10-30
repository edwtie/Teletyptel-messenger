const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { assets, project, output } = require("./prepare");

test("Static asset allowlist excludes backend, personal configuration and unrelated demos", () => {
  assert.ok(assets.includes("chat-client.js"));
  for (const file of assets) {
    assert.doesNotMatch(file, /(?:\.php$|\.env|\.pem|\.key|\.cer|postnl|uploads|config\/|\.\.)/i);
    assert.ok(/\.(html|js|css|png|svg|lng)$/.test(file), file);
  }
});

test("Prepared app uses committed assets and blocks network access", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(output, "source-manifest.json"), "utf8"));
  assert.equal(manifest.source, "committed-files-only");
  assert.equal(manifest.files.length, assets.length);
  for (const entry of manifest.files) assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  const config = JSON.parse(fs.readFileSync(path.join(project, "capacitor.config.json"), "utf8"));
  assert.equal(config.server.url, undefined);
  assert.equal(config.plugins.CapacitorHttp.enabled, false);
  assert.equal(config.webDir, "www");
  const html = fs.readFileSync(path.join(project, "www/index.html"), "utf8");
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /fixture-bootstrap\.js/);
  assert.match(html, /fixture-run\.js/);
  const bootstrap = fs.readFileSync(path.join(project, "www/fixture-bootstrap.js"), "utf8");
  assert.doesNotMatch(bootstrap, /192\.168\.|dev\.teletyptel\.nl|fetch\.bind|originalFetch/);
  assert.match(bootstrap, /sam@example\.test/);
});

test("Native reporting controller is simulator-debug-only", () => {
  const swift = fs.readFileSync(path.join(__dirname, "SimulatorTestViewController.swift"), "utf8");
  assert.match(swift, /#if DEBUG && targetEnvironment\(simulator\)/);
  assert.match(swift, /message\.frameInfo\.isMainFrame/);
  assert.match(swift, /nativeSimulator/);
});
