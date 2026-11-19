const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const baseline = JSON.parse(fs.readFileSync(path.join(root, "mobile/ios-hybrid/ui-baseline.json"), "utf8"));
const entryFiles = Object.freeze([
  "chat.html", "chat-client.css", "chat-client.js", "chat-dialer.css", "chat-dialer.js",
  "jingle-history.js", "jingle-session.js", "jingle-t140.js", "jingle-webrtc-audio.js", "jingle-call-router.js",
  "chat-xmpp-translation.js", "chat-translation.js", "native-google.js", "native-facebook.js",
  "xmpp-availability.js", "xmpp-availability.css", "native-biometric.js", "native-call-push.js",
  "chat-tablet.css", "call-controls-menu.css", "call-controls-menu.js", "chat-interpreter.js",
  "chat-modal.js", "mobile-navigation.js", "vendor/qrcode.js", "favicon.ico"
]);
const git = args => execFileSync("git", args, { cwd: root, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });

function validate(reference) {
  if (reference?.schemaVersion !== 1 || reference.stage !== "reference-only"
      || !/^[a-f0-9]{40}$/.test(reference.revision || "") || reference.entrypoint !== "chat.html"
      || reference.referenceBuild !== "16.9" || reference.evidence?.buildNumber !== reference.referenceBuild
      || reference.evidence?.runId !== "42213575105" || reference.evidence?.jobId !== "127881680684"
      || reference.policy?.preserveNativeEngine !== true || reference.policy?.allowBrowserSignalingInApp !== false
      || reference.policy?.allowBrowserMediaInApp !== false || reference.policy?.allowTestFlightUpload !== false) {
    throw new Error("Invalid or unsafe hybrid UI baseline.");
  }
  const fingerprints = reference.fingerprints;
  if (!fingerprints || Object.keys(fingerprints).length !== 3 || ["chat.html", "chat-client.css", "chat-client.js"].some(file => !/^[a-f0-9]{64}$/.test(fingerprints[file] || ""))) {
    throw new Error("Missing UI source fingerprints.");
  }
}

function allowed(file) {
  return typeof file === "string" && !file.split("/").some(segment => segment === "." || segment === "..")
    && (entryFiles.includes(file) || /^(?:assets\/(?:brand|backgrounds|icons)\/|smileys\/)[a-zA-Z0-9_@./-]+\.(?:png|svg|gif|jpg|webp)$/.test(file)
      || /^lang\/[a-z]+\.lng$/.test(file));
}

function sourceTree(reference, run) {
  const output = run(["ls-tree", "-r", "-l", "-z", reference.revision, "--", "php/public"]).toString("utf8");
  const entries = [];
  for (const record of output.split("\0").filter(Boolean)) {
    const match = /^(\d{6}) blob ([a-f0-9]{40})\s+(\d+)\tphp\/public\/(.+)$/.exec(record);
    if (!match || !allowed(match[4])) continue;
    if (match[1] !== "100644") throw new Error("UI reference must contain regular non-executable files only.");
    entries.push({ file: match[4], bytes: Number(match[3]) });
  }
  return entries;
}

function readReference(file, reference = baseline, run = git) {
  validate(reference);
  if (!allowed(file)) throw new Error("File is outside the UI reference allowlist.");
  if (!sourceTree(reference, run).some(entry => entry.file === file)) throw new Error("UI reference file is missing.");
  return run(["show", reference.revision + ":php/public/" + file]);
}

function check(reference = baseline, run = git) {
  validate(reference);
  if (run(["cat-file", "-t", reference.revision]).toString("utf8").trim() !== "commit") throw new Error("UI reference revision is not a commit.");
  const entries = sourceTree(reference, run);
  for (const file of entryFiles) {
    if (!entries.some(entry => entry.file === file)) throw new Error("UI reference is incomplete: " + file);
  }
  for (const [file, expected] of Object.entries(reference.fingerprints)) {
    const content = run(["show", reference.revision + ":php/public/" + file]);
    if (crypto.createHash("sha256").update(content).digest("hex") !== expected) throw new Error("UI source fingerprint mismatch: " + file);
  }
  return { referenceBuild: reference.referenceBuild, revision: reference.revision, stage: reference.stage,
    fileCount: entries.length, sourceBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    nativeIntegrationComplete: false, testFlightReady: false };
}

function requireRuntimeReady(reference = baseline) {
  validate(reference);
  throw new Error("Reference only: native engine integration is not complete; this is not a releasable app.");
}

if (require.main === module) {
  try { process.stdout.write(JSON.stringify(check(), null, 2) + "\n"); }
  catch (error) { process.stderr.write(error.message + "\n"); process.exitCode = 1; }
}

module.exports = { baseline, entryFiles, allowed, readReference, check, requireRuntimeReady };
