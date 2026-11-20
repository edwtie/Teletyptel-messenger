const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { baseline, allowed, readReference, check, requireRuntimeReady } = require("../scripts/ios-hybrid/check-baseline");

test("hybrid UI reference matches the source of verified TestFlight build 16.9", () => {
  const result = check();
  assert.equal(result.revision, "334688e73c5218be27ad6270c7f96809c94de460");
  assert.equal(result.referenceBuild, "16.9");
  assert.ok(result.fileCount > 26);
  assert.ok(result.sourceBytes > 0);
  assert.equal(result.nativeIntegrationComplete, false);
  assert.equal(result.testFlightReady, false);
  assert.equal(crypto.createHash("sha256").update(readReference("chat.html")).digest("hex"), baseline.fingerprints["chat.html"]);
});

test("UI reads use the pinned Git revision, never working-tree source or HEAD", () => {
  const commands = [];
  const run = args => {
    commands.push(args);
    if (args[0] === "ls-tree") return Buffer.from("100644 blob " + "a".repeat(40) + " 7\tphp/public/chat.html\0");
    assert.deepEqual(args, ["show", baseline.revision + ":php/public/chat.html"]);
    return Buffer.from("fixture");
  };
  assert.equal(readReference("chat.html", baseline, run).toString(), "fixture");
  assert.equal(commands.some(args => args.includes("HEAD") || args.includes("ls-files")), false);
});

test("server files, secrets, demos and path traversal are excluded before reading Git", () => {
  for (const file of ["../config.php", "config.php", "admin/index.php", "postnl-demo.html", "private-label.json", "facebook.local.json", "C:/private/file.png", "/chat.html", "assets/brand/../key.png", "assets/brand/../../config.php", "assets/brand/logo.png\n", "assets/brand/%2e%2e/key.png"]) {
    assert.equal(allowed(file), false, file);
    assert.throws(() => readReference(file, baseline, () => { throw new Error("Git must not be called"); }), /allowlist/);
  }
  for (const file of ["assets/brand/teletyptel-logo-header@2x.png", "lang/ned.lng", "smileys/wave.gif"]) assert.equal(allowed(file), true);
});

test("unsafe policies, revision names and mismatched source fingerprints fail closed", () => {
  for (const change of [{ revision: "HEAD" }, { stage: "ready" }, { referenceBuild: "16.8" }, { fingerprints: {} },
    { policy: { ...baseline.policy, allowBrowserSignalingInApp: true } }, { policy: { ...baseline.policy, allowBrowserMediaInApp: true } },
    { policy: { ...baseline.policy, allowTestFlightUpload: true } }]) assert.throws(() => check({ ...baseline, ...change }), /baseline|fingerprints/);
  const altered = { ...baseline, fingerprints: { ...baseline.fingerprints, "chat.html": "0".repeat(64) } };
  assert.throws(() => check(altered), /fingerprint mismatch/);
});

test("symbolic links and executable UI files are rejected", () => {
  for (const mode of ["120000", "100755"]) {
    const run = args => {
      assert.equal(args[0], "ls-tree");
      return Buffer.from(mode + " blob " + "a".repeat(40) + " 7\tphp/public/chat.html\0");
    };
    assert.throws(() => readReference("chat.html", baseline, run), /regular non-executable/);
  }
});

test("a pinned UI reference cannot be advertised as a finished native app", () => {
  assert.throws(() => requireRuntimeReady(), /native engine integration is not complete/);
});
