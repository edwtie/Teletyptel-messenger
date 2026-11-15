const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

function executable(candidates, argument) {
  for (const candidate of candidates.filter(Boolean)) {
    try { execFileSync(candidate, [argument], { timeout: 10000, stdio: "pipe" }); return candidate; } catch {}
  }
}

test("Synthetic AAC/MP4 recordings pass the actual PHP upload policy, disguised text does not", context => {
  const php = executable([process.env.PHP_BINARY, "C:/wamp64/bin/php/php8.4.15/php.exe", "php"], "--version");
  const ffmpeg = executable([process.env.FFMPEG_BINARY, "C:/Windows/ffmpeg.exe", "ffmpeg"], "-version");
  if (!php || !ffmpeg) { context.skip("Requires PHP and FFmpeg; no real microphone, camera or server used"); return; }
  const parent = path.resolve(os.tmpdir());
  const directory = fs.mkdtempSync(path.join(parent, "teletyptel-native-upload-"));
  assert.equal(path.dirname(directory), parent);
  const voice = path.join(directory, "voice.m4a");
  const video = path.join(directory, "video.mp4");
  const fake = path.join(directory, "fake.mp4");
  const policy = path.resolve(__dirname, "../php/lib/NativeUploadPolicy.php");
  const run = args => execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-nostdin", ...args], { timeout: 15000, stdio: "pipe" });
  try {
    run(["-f", "lavfi", "-i", "sine=frequency=1000:duration=0.5", "-ac", "1", "-c:a", "aac", "-b:a", "64k", voice]);
    run(["-f", "lavfi", "-i", "color=c=blue:s=128x96:r=5:d=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", video]);
    for (const file of [voice, video]) {
      const output = execFileSync(php, ["-r", 'require $argv[1]; NativeUploadPolicy::validate($argv[2], basename($argv[2]), mime_content_type($argv[2])); echo "accepted";', "--", policy, file], { timeout: 10000, encoding: "utf8" });
      assert.equal(output, "accepted");
      assert.ok(fs.statSync(file).size < 20971520);
    }
    fs.writeFileSync(fake, "<html>Fictional non-media content</html>");
    const rejected = execFileSync(php, ["-r", 'require $argv[1]; try { NativeUploadPolicy::validate($argv[2], "fake.mp4", "video/mp4"); exit(1); } catch (InvalidArgumentException $error) { echo "rejected"; }', "--", policy, fake], { timeout: 10000, encoding: "utf8" });
    assert.equal(rejected, "rejected");
  } finally {
    for (const file of [voice, video, fake]) {
      assert.equal(path.dirname(file), directory);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    fs.rmdirSync(directory);
  }
});
