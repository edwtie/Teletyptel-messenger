const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { accountReply, startLoginFixture } = require("../scripts/native-login-http-fixture");

const fixture = { username: "native-test-abcd", password: "fictional-only", origin: "https://localhost:15280" };
const request = scenario => ({ action: "login", password: fixture.password, rememberPassword: false,
  jid: (scenario === "success" ? fixture.username : `${scenario}-${fixture.username}`) + "@localhost",
  xmppDomain: "localhost", xmppTlsMode: "websocket", xmppWebSocket: "wss://localhost:15280/xmpp-websocket" });

test("Contract fixture accepts only its fictional credentials and expected native request", () => {
  const reply = accountReply(request("success"), fixture);
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.body.account, { jid: request("success").jid, password: fixture.password });
  for (const override of [{ password: "wrong" }, { action: "create" }, { rememberPassword: true },
    { xmppDomain: "remote.invalid" }, { xmppWebSocket: "wss://remote.invalid/xmpp-websocket" },
    { xmppTlsMode: "plain" }, { jid: "real@localhost" }]) {
    assert.equal(accountReply({ ...request("success"), ...override }, fixture).status, 400);
  }
});

test("Contract fixture supplies explicit negative and delayed responses", () => {
  assert.equal(accountReply(request("rejected"), fixture).status, 401);
  const twofactor = accountReply(request("twofactor"), fixture);
  assert.equal(twofactor.body.twoFactorRequired, true);
  assert.ok(twofactor.body.account, "challenge must dominate even if account fields are present");
  assert.notEqual(accountReply(request("mismatch"), fixture).body.account.jid, request("mismatch").jid);
  assert.equal(accountReply(request("redirect"), fixture).location, fixture.origin + "/unexpected");
  assert.equal(accountReply(request("delayed"), fixture).delay, 2000);
  assert.equal(accountReply(request("xmpp-rejected"), fixture).body.account.jid, request("xmpp-rejected").jid);
});

test("Login fixture rejects arbitrary accounts before opening a listener", async () => {
  for (const override of [{ username: "real-user" }, { trustedPort: 80 }, { password: "" }]) {
    await assert.rejects(startLoginFixture({ ...fixture, trustedPort: 15281, ...override }), /Invalid local/);
  }
});

test("Native login integration uses real defaults and retains a separate PHP verification gate", () => {
  const root = path.resolve(__dirname, "..");
  const swift = fs.readFileSync(path.join(root, "mobile/ios-native/Tests/NativeXMPPIntegrationTests/NativeLoginIntegrationTests.swift"), "utf8");
  assert.equal((swift.match(/func test/g) || []).length, 7);
  assert.match(swift, /NativeLoginModel\(\)/);
  assert.doesNotMatch(swift, /authenticator:|checker:|connection:|URLProtocol|URLCredential|SecTrust/);
  assert.match(swift, /XCTSkip/);
  const harness = fs.readFileSync(path.join(root, "scripts/check-ios-native-ejabberd.js"), "utf8");
  assert.match(harness, /accountAPITested: false/);
  assert.match(harness, /upgrades !== 9/);
  assert.match(harness, /accountHTTPContractTested = true/);
  const proxy = fs.readFileSync(path.join(root, "scripts/native-login-http-fixture.js"), "utf8");
  assert.match(proxy, /rejectUnauthorized: true/);
  assert.match(proxy, /hostname: "127.0.0.1", servername: "localhost"/);
  assert.match(proxy, /server.listen\(0, "127.0.0.1"/);
});
