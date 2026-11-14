const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const assert = require("node:assert/strict");
const { spawn, execFileSync } = require("node:child_process");
const { randomBytes, randomUUID } = require("node:crypto");

function requireHostedLinux(platform = process.platform, environment = process.env) {
  if (platform !== "linux" || environment.GITHUB_ACTIONS !== "true" || environment.RUNNER_ENVIRONMENT !== "github-hosted"
      || environment.TELETYPTEL_DB_HOST !== "127.0.0.1" || environment.TELETYPTEL_DB_NAME !== "native_feature_test") {
    throw new Error("Only an ephemeral hosted Linux test database is permitted");
  }
}
async function run() {
  requireHostedLinux();
  const root = path.resolve(__dirname, "..");
  const artifacts = path.join(root, "artifacts"); fs.mkdirSync(artifacts, { recursive: true });
  const directory = fs.mkdtempSync(path.join(artifacts, "native-feature-http-"));
  const temporary = path.join(directory, "temporary"); fs.mkdirSync(temporary, { mode: 0o700 });
  const sessions = path.join(temporary, "sessions"); fs.mkdirSync(sessions, { mode: 0o700 });
  const report = { passed: false, productionServerContacted: false, actualPHP: true, actualMySQL: true, fictionalSessionsOnly: true, cleanupCompleted: false };
  const token = randomBytes(32).toString("hex");
  const environment = { ...process.env, TELETYPTEL_NATIVE_FIXTURE_TOKEN: token };
  let server;
  try {
    execFileSync("php", ["php/tests/native-feature-seed.php"], { cwd: root, env: environment, stdio: "pipe" });
    const port = await new Promise(resolve => { const socket = net.createServer(); socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); }); });
    server = spawn("php", ["-d", "session.save_path=" + sessions, "-d", "sys_temp_dir=" + temporary, "-S", "127.0.0.1:" + port, "php/tests/native-feature-router.php"], { cwd: root, env: environment, stdio: "ignore" });
    const origin = "http://127.0.0.1:" + port;
    const request = (route, options = {}) => fetch(origin + route, { ...options, redirect: "manual", signal: AbortSignal.timeout(15000) });
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await request("/ready"); break; } catch { if (attempt === 99) throw new Error("PHP fixture did not start"); await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.equal((await request("/api/native-profile.php")).status, 401);
    async function login(user) {
      const response = await request("/__fixture/session", { method: "POST", headers: { "X-Fixture-Token": token }, body: user });
      assert.equal(response.status, 200);
      const cookie = response.headers.getSetCookie().filter(value => value.startsWith("PHPSESSID=")).at(-1).split(";")[0];
      const profile = await (await request("/api/native-profile.php", { headers: { Cookie: cookie } })).json();
      assert.equal(profile.profile.accountId, user);
      return { cookie, csrf: profile.csrfToken };
    }
    const one = await login("fiction-one"); const two = await login("fiction-two");
    const update = { displayName: "Bijgewerkt", phoneNumber: "+31612345678", preferredLanguage: "en", avatarColor: "#aabbcc" };
    const profilePost = (body, csrf) => request("/api/native-profile.php", { method: "POST", headers: { Cookie: one.cookie, "X-CSRF-Token": csrf, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await profilePost(update, "invalid")).status, 403);
    assert.equal((await profilePost({ ...update, accountId: "fiction-two" }, one.csrf)).status, 400);
    const saved = await (await profilePost(update, one.csrf)).json();
    assert.equal(saved.profile.displayName, update.displayName); assert.equal(saved.profile.jid, "one@localhost");
    const unchanged = await (await request("/api/native-profile.php", { headers: { Cookie: two.cookie } })).json();
    assert.equal(unchanged.profile.displayName, "Two");
    const bytes = Buffer.alloc(262161, 65); const upload = randomUUID();
    async function chunk(user, data, index, identifier = upload, name = "fiction.txt", csrf = user.csrf) {
      const form = new FormData();
      for (const [key, value] of Object.entries({ uploadId: identifier, chunkIndex: String(index), totalChunks: String(Math.ceil(data.length / 262144)), originalName: name, totalSize: String(data.length), mimeType: "text/plain" })) form.set(key, value);
      form.set("file", new Blob([data.subarray(index * 262144, (index + 1) * 262144)]), "part");
      const response = await request("/api/native-upload.php", { method: "POST", headers: { Cookie: user.cookie, "X-CSRF-Token": csrf }, body: form });
      return { status: response.status, body: await response.json() };
    }
    assert.equal((await chunk(one, bytes, 0, upload, "fiction.txt", two.csrf)).status, 403);
    assert.equal((await chunk(one, bytes, 0)).body.file, undefined);
    assert.equal((await chunk(two, bytes, 1)).body.file, undefined);
    const completed = await chunk(one, bytes, 1);
    assert.equal(completed.status, 200); assert.equal(completed.body.ok, true); assert.equal(completed.body.file.size, bytes.length);
    assert.match(completed.body.file.id, /^[a-f0-9]{32}$/);
    const download = await request("/" + completed.body.file.url);
    assert.equal(download.status, 200); assert.match(download.headers.get("content-type"), /^text\/plain(?:;|$)/);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
    const active = await chunk(one, Buffer.from("<html><body><script>alert('fiction')</script></body></html>"), 0, randomUUID(), "disguised.txt");
    assert.notEqual(active.body.ok, true);
    await request("/__fixture/block", { method: "POST", headers: { "X-Fixture-Token": token } });
    assert.equal((await request("/api/native-profile.php", { headers: { Cookie: one.cookie } })).status, 403);
    assert.equal((await chunk(one, bytes, 0, randomUUID())).status, 403);
    report.passed = true;
  } finally {
    if (server && server.exitCode === null) { server.kill(); await new Promise(resolve => { server.once("exit", resolve); setTimeout(resolve, 3000); }); }
    const resolved = path.resolve(temporary);
    if (!resolved.startsWith(path.resolve(artifacts) + path.sep)) throw new Error("Unsafe fixture cleanup path");
    fs.rmSync(resolved, { recursive: true, force: true }); report.cleanupCompleted = true;
    fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(report, null, 2));
    process.stdout.write(JSON.stringify(report) + "\n");
  }
}
if (require.main === module) run().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
module.exports = { requireHostedLinux };
