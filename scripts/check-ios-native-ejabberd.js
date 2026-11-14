const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const https = require("node:https");
const { execFileSync, spawn } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { startLoginFixture } = require("./native-login-http-fixture");

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
  const listener = port => `  - port: ${port}
    ip: "127.0.0.1"
    module: ejabberd_http
    tls: true
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
${listener(trustedPort)}
modules:
  mod_ping: {}
  mod_roster: {}
  mod_admin_extra: {}
  mod_mam:
    db_type: mnesia
    default: always
  mod_muc:
    host: conference.localhost
    access_create: none
    default_room_options:
      persistent: true
      public: false
      members_only: true
  mod_muc_admin: {}
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
  const archivePeer = username + "-archive";
  const groupOutsider = username + "-outsider";
  const groupRoom = username + "-room";
  const invitationRoom = groupRoom + "-invites";
  const password = randomBytes(32).toString("hex");
  const cookie = randomBytes(32).toString("hex");
  const secrets = [password, cookie, ...[username, archivePeer, groupOutsider].map(user => Buffer.from(`\0${user}\0${password}`).toString("base64"))];
  const report = { unsigned: true, uploaded: false, productionServerContacted: false,
    transport: "Apple URLSessionWebSocketTask to loopback ejabberd over WSS",
    accountAPITested: false, physicalDevicesTested: false, passed: false,
    cleanupCompleted: false, swiftTests: 7, nativeLoginContractTests: 7,
    accountHTTPContractTested: false };
  let server;
  let loginFixture;
  let untrustedServer;
  const untrustedSockets = new Set();
  let control;
  let certificateFingerprint;
  let trustAttempted = false;
  let fixtureReady = false;
  let failure;
  const environment = { ...process.env, ERL_EPMD_ADDRESS: "127.0.0.1" };
  const execute = (command, args, timeout = 60000, extraEnvironment = {}) => execFileSync(command, args, {
    cwd: root, encoding: "utf8", timeout, maxBuffer: 8 * 1024 * 1024, stdio: "pipe",
    env: { ...environment, ...extraEnvironment }
  });
  const write = (name, value) => fs.writeFileSync(path.join(temporary, name), value, { mode: 0o600 });
  const save = (name, value) => fs.writeFileSync(path.join(reports, name), redact(String(value), secrets));
  const runSwift = (filter, reportName, extraEnvironment = {}) => new Promise((resolve, reject) => {
    let output = "";
    let overflow = false;
    const child = spawn("swift", ["test", "--package-path", path.join(root, "mobile/ios-native"),
      "--scratch-path", path.join(temporary, "SwiftBuild"), "--filter", filter], {
      cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"],
      env: { ...environment, NSUnbufferedIO: "YES", TELETYPTEL_EJABBERD_FIXTURE: path.join(temporary, "fixture.json"),
        TELETYPTEL_EJABBERD_TRUST_PHASE: "trusted", ...extraEnvironment }
    });
    const stop = () => { if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} } };
    const timeout = setTimeout(stop, 240000);
    const collect = chunk => {
      if (output.length + chunk.length > 8 * 1024 * 1024) { overflow = true; stop(); return; }
      output += chunk.toString();
      save(reportName, output);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", error => { clearTimeout(timeout); reject(error); });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      if (code === 0 && !overflow) resolve(output);
      else reject(new Error(`Swift integration failed (${signal || code}); see ${reportName}`));
    });
  });
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
    untrustedServer = https.createServer({ key: fs.readFileSync(certificate("untrusted.key")),
      cert: fs.readFileSync(certificate("untrusted.crt")) }, (_, response) => {
      response.writeHead(426);
      response.end();
    });
    untrustedServer.on("connection", socket => {
      untrustedSockets.add(socket);
      socket.once("close", () => untrustedSockets.delete(socket));
    });
    await new Promise((resolve, reject) => {
      untrustedServer.once("error", reject);
      untrustedServer.listen(untrustedPort, "127.0.0.1", resolve);
    });
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
    control("register", archivePeer, "localhost", password);
    control("register", groupOutsider, "localhost", password);
    control("create_room", groupRoom, "conference.localhost", "localhost");
    for (const user of [username, archivePeer]) control("set_room_affiliation", groupRoom, "conference.localhost", user, "localhost", "member");
    control("create_room", invitationRoom, "conference.localhost", "localhost");
    control("set_room_affiliation", invitationRoom, "conference.localhost", username, "localhost", "owner");
    control("add_rosteritem", username, "localhost", "fixture-peer", "localhost", "Fictief testcontact", "Testcontacten", "both");
    loginFixture = await startLoginFixture({ key: fs.readFileSync(certificate("server.key")),
      cert: fs.readFileSync(certificate("server.crt")), ca: fs.readFileSync(certificate("ca.crt")),
      trustedPort, username, password });
    write("fixture.json", JSON.stringify({ trustedPort, untrustedPort, accountPort: loginFixture.port, username, password, archivePeer, groupOutsider, groupRoom, invitationRoom }));
    fixtureReady = true;
    const swiftOutput = await runSwift("EjabberdIntegrationTests", "swift-progress.txt");
    save("swift-tests.txt", swiftOutput);
    if (!/Executed 7 tests, with 0 failures/.test(swiftOutput) || /[1-9][0-9]* tests? skipped/i.test(swiftOutput)) {
      throw new Error("Expected all seven real-server tests to execute without skips or failures");
    }
    const loginOutput = await runSwift("NativeLoginIntegrationTests", "native-login-tests.txt");
    if (!/Executed 7 tests, with 0 failures/.test(loginOutput) || /[1-9][0-9]* tests? skipped/i.test(loginOutput)) {
      throw new Error("Expected all seven native HTTPS/XMPP login contract tests to execute");
    }
    const jingleOutput = await runSwift("NativeJingleIntegrationTests", "native-jingle-tests.txt");
    if (!/Executed 1 test, with 0 failures/.test(jingleOutput) || /[1-9][0-9]* tests? skipped/i.test(jingleOutput)) {
      throw new Error("Expected the real two-resource Jingle transport test to execute without skips or failures");
    }
    report.nativeJingleTransportTested = true;
    report.nativeJingleTransportTests = 1;
    const archiveOutput = await runSwift("NativeArchiveIntegrationTests", "native-archive-tests.txt");
    if (!/Executed 1 test, with 0 failures/.test(archiveOutput) || /[1-9][0-9]* tests? skipped/i.test(archiveOutput)) {
      throw new Error("Expected the real two-account MAM history test to execute without skips or failures");
    }
    report.nativeArchiveTransportTested = true;
    report.nativeArchiveTransportTests = 1;
    const groupOutput = await runSwift("NativeGroupIntegrationTests", "native-group-tests.txt");
    if (!/Executed 1 test, with 0 failures/.test(groupOutput) || /[1-9][0-9]* tests? skipped/i.test(groupOutput)) {
      throw new Error("Expected the real private-room MUC test without skips or failures");
    }
    report.nativeGroupTransportTested = true;
    const invitationOutput = await runSwift("NativeInvitationIntegrationTests", "native-invitation-tests.txt");
    if (!/Executed 1 test, with 0 failures/.test(invitationOutput) || /[1-9][0-9]* tests? skipped/i.test(invitationOutput)) {
      throw new Error("Expected the real mediated invitation/decline test without skips or failures");
    }
    report.nativeInvitationTransportTested = true;
    save("account-contract-statistics.json", JSON.stringify(loginFixture.statistics, null, 2));
    const { scenarios, upgrades, unexpectedRequests, proxyErrors } = loginFixture.statistics;
    if (["success", "rejected", "twofactor", "mismatch", "redirect", "xmpp-rejected", "delayed"]
      .some(name => scenarios[name] !== 1) || upgrades !== 9 || unexpectedRequests !== 0 || proxyErrors !== 0) {
      throw new Error("Unexpected account requests, redirects or XMPP connections in native login tests");
    }
    report.accountHTTPContractTested = true;
    let remaining = "";
    for (let attempt = 0; attempt < 10; attempt++) {
      remaining = control("connected_users").trim();
      if (!remaining) break;
      await delay(500);
    }
    if (remaining) {
      save("remaining-sessions.txt", remaining);
      throw new Error("A native XMPP session remained after cancellation");
    }
    report.sessionsReleased = true;
    report.passed = true;
  } catch (error) {
    failure = error;
    save("failure.txt", [error.message, error.stdout, error.stderr].filter(Boolean).join("\n").slice(-32000));
    const serverLog = path.join(temporary, "server.log");
    if (fs.existsSync(serverLog)) save("server-failure.txt", fs.readFileSync(serverLog, "utf8").slice(-16000));
  } finally {
    const cleanupErrors = [];
    if (trustAttempted) {
      try {
        execute("sudo", ["security", "add-trusted-cert", "-d", "-r", "deny", "-k",
          "/Library/Keychains/System.keychain", path.join(temporary, "ca.crt")]);
        report.caTrustDenied = true;
        report.residualDenyRecord = "Removed with disposable hosted VM; original trust settings are not restored";
      } catch (error) {
        cleanupErrors.push("temporary CA trust revocation");
        save("trust-cleanup-error.txt", error.stderr || error.message);
      }
      try {
        execute("sudo", ["security", "delete-certificate", "-Z", certificateFingerprint, "/Library/Keychains/System.keychain"]);
        report.caCertificateRemoved = true;
      } catch (error) {
        cleanupErrors.push("temporary CA certificate removal");
        save("certificate-cleanup-error.txt", error.stderr || error.message);
      }
      if (fixtureReady && report.caTrustDenied && report.caCertificateRemoved) {
        try {
          const rejectionOutput = await runSwift("EjabberdIntegrationTests.testRealAvailabilityOverTrustedWebSocket",
            "trust-revocation-test.txt", { TELETYPTEL_EJABBERD_TRUST_PHASE: "revoked" });
          if (!/Executed 1 test, with 0 failures/.test(rejectionOutput) || /[1-9][0-9]* tests? skipped/i.test(rejectionOutput)) {
            throw new Error("Expected one non-skipped certificate rejection check");
          }
          report.caTrustRevocationVerified = true;
        } catch (error) {
          cleanupErrors.push("temporary CA revocation verification");
          save("trust-verification-error.txt", error.message);
        }
      } else {
        cleanupErrors.push("temporary CA revocation verification unavailable");
      }
    }
    if (untrustedServer) {
      for (const socket of untrustedSockets) socket.destroy();
      await new Promise(resolve => untrustedServer.close(resolve));
    }
    if (loginFixture) {
      try { await loginFixture.close(); } catch { cleanupErrors.push("login fixture closure"); }
    }
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
