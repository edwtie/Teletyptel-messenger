"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const backend = () => read("services/call-push/ejabberd/ejabberd_auth_teletyptel_calls.erl");

test("The actual issuer rejects wrong account, session, device, call state and stale policy", () => {
  const php = process.env.TELETYPTEL_PHP || (process.platform === "win32" ? "C:\\wamp64\\bin\\php\\php8.4.15\\php.exe" : "php");
  const result = spawnSync(php, ["php/tests/call-bootstrap-test.php"], { cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /39 checks passed/);
});

test("Scoped credentials are verified before SASL and filtered before server handlers", () => {
  const source = backend();
  assert.match(source, /Host = erase\(\{\?MODULE, transport\}\)/);
  assert.match(source, /stream_encrypted := true/);
  assert.match(source, /crypto:hash_equals\(Expected, Signature\)/);
  assert.match(source, /mnesia:write_lock_table\(\?TABLE\)/);
  assert.match(source, /\{revoked, maps:get\(<<"deviceId">>, Claims\), maps:get\(<<"generation">>, Claims\)\}/);
  assert.match(source, /use_cache\(_\) -> false/);
  for (const hook of ["c2s_handle_bind", "c2s_authenticated_packet", "c2s_filter_send", "c2s_unbinded_packet", "c2s_handle_sasl2_inline"]) {
    assert.ok(source.includes(hook), hook);
  }
  assert.match(source, /Resource =:= maps:get\(<<"resource">>, Claims\)/);
  assert.match(source, /Expires =< Issued \+ 20/);
  assert.match(source, /permitted\(_, _, _\) -> error\(outside_call_scope\)/);
  assert.match(source, /false = gen_mod:is_loaded\(Host, mod_auth_fast\)/);
  assert.match(source, /false = gen_mod:is_loaded\(Host, mod_sasl2\)/);
});

test("The native foundation stays ephemeral, call-only and separate from normal account credentials", () => {
  const source = read("mobile/ios-native/Sources/TeleTypTelCore/NativeCallBootstrapGrant.swift");
  assert.match(source, /NativeCallBootstrapGrant\(redacted\)/);
  assert.match(source, /claims.deviceId == registration.deviceID/);
  assert.match(source, /claims.profile == invitation.media/);
  assert.doesNotMatch(source, /UserDefaults|SecItemAdd|Keychain|PHPSESSID|NativeAuthenticatedAccount\(/);
  const stream = read("mobile/ios-native/Sources/TeleTypTelCore/XMPPSessionStream.swift");
  assert.match(stream, /init\(bootstrap: NativeCallBootstrapGrant/);
  assert.match(stream, /resource = bootstrap.resource/);
  assert.match(stream, /self.bootstrap = nil/);
  assert.match(stream, /bootstrapExpiry == nil \|\| parts\[1\] == resource/);
  assert.ok(require("../scripts/prepare-ios-native").projectText().project.includes("Core/NativeCallBootstrapGrant.swift"));
});

test("Integration fixture uses a real pinned isolated server and verified TLS without live activation", () => {
  const source = read("scripts/check-call-bootstrap-ejabberd.js");
  assert.match(source, /ejabberd\/ecs@sha256:[0-9a-f]{64}/);
  assert.match(source, /127\.0\.0\.1::5223/);
  assert.match(source, /servername: "example.test", ca/);
  assert.doesNotMatch(source, /rejectUnauthorized|NODE_TLS_REJECT_UNAUTHORIZED/);
  assert.match(source, /if \(created\) execute\(\["rm", "-f", name\]\)/);
  assert.match(source, /Revocation also blocks an unredeemed grant/);
  assert.doesNotMatch(read("mobile/ios-native/App/Info.plist"), /aps-environment/);
  assert.doesNotMatch(read("php/public/api/call-push.php"), /'callResourceRecovery'\s*=>\s*true/);
  assert.doesNotMatch(read("php/public/api/call-control.php"), /CallPushBootstrap|tcr1\./);
});
