<?php
declare(strict_types=1);
require_once __DIR__ . '/call-bootstrap-fixture.php';
$checks = 0;
$check = function (bool $value, string $label) use (&$checks): void { if (!$value) throw new RuntimeException($label); $checks++; };
$denied = function (Closure $operation, string $label) use ($check): void {
    try { $operation(); } catch (CallPushFailure | AccountAccessDenied $error) { $check(true, $label); return; }
    throw new RuntimeException('Not denied: ' . $label);
};
foreach (['audio', 'video', 'audio-rtt', 'total'] as $profile) {
    $fixture = new BootstrapFixture(profile: $profile);
    $issued = $fixture->issue(); $claims = $issued['claims'];
    $check(strlen($issued['credential']) <= 1024, 'bounded credential');
    $check($claims['profile'] === $profile && $claims['owner'] === 'bob@example.test' && $claims['peer'] === 'alice@example.test/caller', 'authoritative identities/profile');
    $check($claims['expiresAt'] === $fixture->now + 20 && $claims['resource'] === 'tc-call-' . $claims['nonce'], 'short lifetime and fixed resource');
    [$prefix, $payload, $signature] = explode('.', $issued['credential']);
    $check($prefix === 'tcr1' && hash_equals(hash_hmac('sha256', 'teletyptel-call-xmpp-v1:production:example.test:fixture:' . $payload, $fixture->key), $signature), 'separate domain-bound signature');
    $check(!str_contains(json_encode($claims), $fixture->binding) && !str_contains(json_encode($claims), 'password') && !str_contains(json_encode($claims), 'controlToken'), 'not normal login or status/end token');
    $check($fixture->registry->callFor('bob', $fixture->call['callId'])['state'] === 'ringing', 'grant does not reserve answer or mark media connected');
}
$fixture = new BootstrapFixture();
foreach ([['charlie', $fixture->binding, $fixture->device, $fixture->registration['generation'], $fixture->call['callId']],
    ['bob', str_repeat('2', 64), $fixture->device, $fixture->registration['generation'], $fixture->call['callId']],
    ['bob', $fixture->binding, $fixture->device, str_repeat('f', 32), $fixture->call['callId']],
    ['bob', $fixture->binding, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', $fixture->registration['generation'], $fixture->call['callId']]] as $arguments) {
    $denied(fn() => $fixture->issuer->issue(...$arguments), 'account/session/device/generation mismatch');
}
for ($attempt = 0; $attempt < 3; $attempt++) $fixture->issue();
$denied(fn() => $fixture->issue(), 'issuance rate bounded');
foreach (['ended', 'expired', 'accepted'] as $state) {
    $fixture = new BootstrapFixture();
    $fixture->pdo->prepare('UPDATE call_push_calls SET state = ?')->execute([$state]);
    $denied(fn() => $fixture->issue(), 'not a fresh ringing invitation');
}
$fixture = new BootstrapFixture();
$fixture->event(['type' => 'policy', 'owner' => 'bob@example.test', 'peer' => 'alice@example.test', 'allowed' => false, 'revision' => 2, 'expiresAt' => $fixture->now + 30]);
$denied(fn() => $fixture->issue(), 'revoked policy');
$fixture = new BootstrapFixture();
$fixture->registry->revokeSession('bob', $fixture->binding);
$denied(fn() => $fixture->issue(), 'logged out session');
$fixture = new BootstrapFixture();
$fixture->pdo->exec("INSERT INTO account_access_controls VALUES ('bob', 1, NULL, 2, '2026-11-16')");
$denied(fn() => $fixture->issue(), 'blocked account/access version');
$fixture = new BootstrapFixture();
$fixture->now += 30;
$denied(fn() => $fixture->issue(), 'expired trusted caller/policy lease');
$fixture = new BootstrapFixture();
$issuer = new CallPushBootstrap($fixture->pdo, $fixture->ledger, $fixture->signalingKey, 'production', 'example.test', 'fixture', fn() => $fixture->now);
$denied(fn() => $issuer->issue('bob', $fixture->binding, $fixture->device, $fixture->registration['generation'], $fixture->call['callId']), 'no reuse of producer signing key');
$issuer = new CallPushBootstrap($fixture->pdo, $fixture->ledger, $fixture->key, 'production', 'wrong.test', 'fixture', fn() => $fixture->now);
$denied(fn() => $issuer->issue('bob', $fixture->binding, $fixture->device, $fixture->registration['generation'], $fixture->call['callId']), 'wrong pinned domain');
$check(!$fixture->pdo->inTransaction(), 'failed issuance rolls transaction back');
echo "Call bootstrap: {$checks} checks passed; no public endpoint, native push or normal login credentials.\n";
