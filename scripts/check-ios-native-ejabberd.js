const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { execFileSync, spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");

function requireHostedMac(platform, environment) {
  if (platform !== "darwin" || environment.GITHUB_ACTIONS !== "true" ||
      environment.RUNNER_ENVIRONMENT !== "github-hosted") {
    throw new Error("This certificate/server fixture runs only on an ephemeral GitHub-hosted macOS runner");
  }
}

function serverConfiguration(directory, trustedPort, untrustedPort) {
  if (!path.isAbsolute(directory) || ![trustedPort, untrustedPort].every(port =>
    Number.isInteger(port) && port >= 1024 && port <= 65535) || trustedPort === untrustedPort) {
    throw new Error("Invalid isolated ejabberd configuration");
  }
  const listener = (port, certificate) => `  - port: ${port}
    ip: "127.0.0.1"
    module: ejabberd_http
    tls: true
    certfile: ${JSON.stringify(path.join(directory, certificate))}
    request_handlers:
      /xmpp-websocket: ejabberd_http_ws`;
  return `hosts: ["localhost"]
loglevel: warning
auth_method: internal
auth_password_format: scram
s2s_access: none
certfiles:
  - ${JSON.stringify(path.join(directory, "trusted.pem"))}
listen:
${listener(trustedPort, "trusted.pem")}
${listener(untrustedPort, "untrusted.pem")}
modules:
  mod_ping: {}
`;
}

function redact(text, secrets) {
  for (const secret of secrets.filter(Boolean)) text = text.split(secret).join("[redacted]");
  return text;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const port = listener.address().port;
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}

const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function run() {
  requireHostedMac(process.platform, process.env);
  const root = path.resolve(__dirname, "..");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "teletyptel-native-ejabberd-"));
  fs.chmodSync(temporary, 0o700);
  const reports = path.join(root, "artifacts", "ios-native-ejabberd-" + Date.now(), "reports");
  fs.mkdirSync(reports, { recursive: true });
  const identifier = randomBytes(8).toString("hex");
  const username = "native-test-" + identifier;
  const password = randomBytes(32).toString("hex");
  const cookie = randomBytes(32).toString("hex");
  const secrets = [password, cookie, Buffer.from(`\0${username}\0${password}`).toString("base64")];
  const report = { unsigned: true, uploaded: false, productionServerContacted: false,
    transport: "Apple URLSessionWebSocketTask to loopback ejabberd over WSS",
    accountAPITested: false, physicalDevicesTested: false, passed: false,
    cleanupCompleted: false, swiftTests: 7 };
  let server;
  let control;
  let certificateFingerprint;
  let trustAttempted = false;
  let failure;
  const environment = { ...process.env, ERL_EPMD_ADDRESS: "127.0.0.1" };
  const execute = (command, args, timeout = 60000, extraEnvironment = {}) => execFileSync(command, args, {
    cwd: root, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, stdio: "pipe",
    env: { ...environment, ...extraEnvironment }
  });
  const write = (name, value) => fs.writeFileSync(path.join(temporary, name), value, { mode: 0o600 });
  const save = (name, value) => fs.writeFileSync(path.join(reports, name), redact(String(value), secrets));
  try {
    const prefix = execute("brew", ["--prefix", "ejabberd"]).trim();
    const openssl = path.join(execute("brew", ["--prefix", "openssl@3"]).trim(), "bin", "openssl");
    const metadata = JSON.parse(execute("brew", ["info", "--json=v2", "ejabberd"]));
    report.ejabberdVersion = metadata.formulae[0].installed.map(item => item.version).join(",");
    const trustedPort = await freePort();
    let untrustedPort = await freePort();
    while (untrustedPort === trustedPort) untrustedPort = await freePort();
    for (const name of ["spool", "logs"]) fs.mkdirSync(path.join(temporary, name), { mode: 0o700 });
    write("ejabberd.yml", serverConfiguration(temporary, trustedPort, untrustedPort));
    write("ejabberdctl.cfg", "INET_DIST_INTERFACE=127.0.0.1\nERL_EPMD_ADDRESS=127.0.0.1\nERL_OPTIONS=\"+S 2:2\"\n");
    write("vm.args", `-setcookie ${cookie}\n`);
    write("inetrc", "{lookup, [file, native]}.\n");
    const certificate = name => path.join(temporary, name);
    execute(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "2",
      "-subj", `/CN=TeleTypTel ephemeral CI ${identifier}`, "-addext", "basicConstraints=critical,CA:TRUE",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-keyout", certificate("ca.key"), "-out", certificate("ca.crt")]);
    execute(openssl, ["req", "-new", "-newkey", "rsa:2048", "-nodes", "-sha256", "-subj", "/CN=localhost",
      "-keyout", certificate("server.key"), "-out", certificate("server.csr")]);
    write("server.ext", "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:localhost\n");
    execute(openssl, ["x509", "-req", "-in", certificate("server.csr"), "-CA", certificate("ca.crt"),
      "-CAkey", certificate("ca.key"), "-CAcreateserial", "-days", "2", "-sha256", "-extfile", certificate("server.ext"), "-out", certificate("server.crt")]);
    write("trusted.pem", fs.readFileSync(certificate("server.key")) + "\n" +
      fs.readFileSync(certificate("server.crt")) + "\n" + fs.readFileSync(certificate("ca.crt")));
    execute(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-sha256", "-days", "2",
      "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost", "-addext", "extendedKeyUsage=serverAuth",
      "-keyout", certificate("untrusted.key"), "-out", certificate("untrusted.crt")]);
    write("untrusted.pem", fs.readFileSync(certificate("untrusted.key")) + "\n" + fs.readFileSync(certificate("untrusted.crt")));
    certificateFingerprint = execute(openssl, ["x509", "-in", certificate("ca.crt"), "-noout", "-fingerprint", "-sha1"])
      .trim().split("=").at(-1).replaceAll(":", "");
    if (!/^[0-9A-F]{40}$/i.test(certificateFingerprint)) throw new Error("Invalid temporary CA fingerprint");
    trustAttempted = true;
    execute("sudo", ["security", "add-trusted-cert", "-d", "-r", "trustRoot", "-k",
      "/Library/Keychains/System.keychain", certificate("ca.crt")]);
    const controlPath = path.join(prefix, "sbin", "ejabberdctl");
    const controlArguments = ["--node", `tttnative_${identifier}@localhost`, "--config-dir", temporary,
      "--config", certificate("ejabberd.yml"), "--ctl-config", certificate("ejabberdctl.cfg"),
      "--spool", certificate("spool"), "--logs", certificate("logs")];
    control = (...args) => execute(controlPath, [...controlArguments, ...args], 15000);
    const output = fs.openSync(certificate("server.log"), "w", 0o600);
    try {
      server = spawn(controlPath, [...controlArguments, "foreground"], {
        cwd: temporary, env: environment, detached: true, stdio: ["ignore", output, output]
      });
    } finally { fs.closeSync(output); }
    let spawnError;
    server.on("error", error => { spawnError = error; });
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      if (spawnError) throw spawnError;
      if (server.exitCode !== null) throw new Error("Isolated ejabberd exited during startup");
      try { control("status"); ready = true; break; } catch { await delay(1000); }
    }
    if (!ready) throw new Error("Isolated ejabberd did not start");
    control("register", username, "localhost", password);
    write("fixture.json", JSON.stringify({ trustedPort, untrustedPort, username, password }));
    const swiftOutput = execute("swift", ["test", "--package-path", path.join(root, "mobile/ios-native"),
      "--scratch-path", certificate("SwiftBuild"), "--filter", "EjabberdIntegrationTests"], 240000,
    { TELETYPTEL_EJABBERD_FIXTURE: certificate("fixture.json") });
    save("swift-tests.txt", swiftOutput);
    if (!/Executed 7 tests, with 0 failures/.test(swiftOutput) || /[1-9][0-9]* tests? skipped/i.test(swiftOutput)) {
      throw new Error("Expected all seven real-server tests to execute without skips or failures");
    }
    let remaining = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      remaining = control("connected_users").trim();
      if (!remaining) break;
      await delay(500);
    }
    if (remaining) throw new Error("A native XMPP session remained after cancellation");
    report.sessionsReleased = true;
    report.passed = true;
  } catch (error) {
    failure = error;
    save("failure.txt", [error.message, error.stdout, error.stderr].filter(Boolean).join("\n").slice(-32000));
    const serverLog = path.join(temporary, "server.log");
    if (fs.existsSync(serverLog)) save("server-failure.txt", fs.readFileSync(serverLog, "utf8").slice(-16000));
  } finally {
    const cleanupErrors = [];
    if (server?.pid) {
      try { control("stop"); } catch {}
      for (let attempt = 0; attempt < 30 && server.exitCode === null && server.signalCode === null; attempt++) await delay(100);
      if (server.exitCode === null && server.signalCode === null) {
        try { process.kill(-server.pid, "SIGTERM"); } catch (error) { if (error.code !== "ESRCH") cleanupErrors.push("server termination"); }
        for (let attempt = 0; attempt < 30 && server.exitCode === null && server.signalCode === null; attempt++) await delay(100);
        if (server.exitCode === null && server.signalCode === null) {
          try { process.kill(-server.pid, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") cleanupErrors.push("server termination"); }
        }
      }
    }
    if (trustAttempted) {
      try { execute("sudo", ["security", "remove-trusted-cert", "-d", path.join(temporary, "ca.crt")]); }
      catch { cleanupErrors.push("temporary CA trust removal"); }
      try { execute("sudo", ["security", "delete-certificate", "-Z", certificateFingerprint, "/Library/Keychains/System.keychain"]); }
      catch { cleanupErrors.push("temporary CA certificate removal"); }
    }
    try { fs.rmSync(temporary, { recursive: true, force: true }); }
    catch { cleanupErrors.push("temporary fixture removal"); }
    report.cleanupCompleted = cleanupErrors.length === 0;
    if (cleanupErrors.length) {
      report.cleanupErrors = cleanupErrors;
      failure ||= new Error("Isolated fixture cleanup failed");
    }
    save("result.json", JSON.stringify(report, null, 2));
    console.log("Native ejabberd evidence: " + reports);
  }
  if (failure) throw new Error("Native ejabberd integration failed; see sanitized evidence");
}

if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { requireHostedMac, serverConfiguration, redact };
