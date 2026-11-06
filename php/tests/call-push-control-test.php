<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushService.php';

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT)');
foreach (['alice', 'bob', 'stranger'] as $account) {
    $pdo->prepare('INSERT INTO account_profiles VALUES (?, ?)')->execute([$account, $account . '@example.test']);
}
AccountAccess::ensureSchema($pdo);
$now = 1800000000;
$clock = function () use (&$now): int { return $now; };
$key = random_bytes(32);
$allowed = true;
$policy = function () use (&$allowed): bool { return $allowed; };
$service = new CallPushService($pdo, $key, 'production', $policy, $clock);
$service->ensureSchema();
$device = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$otherDevice = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
$binding = str_repeat('1', 64);
$otherBinding = str_repeat('2', 64);
$register = fn() => $service->register('bob', $binding, $device, str_repeat('ab', 32), true);
$credential = fn() => $service->controlCredential('bob', $binding, $device);
$registration = $register();
$otherRegistration = $service->register('bob', $otherBinding, $otherDevice, str_repeat('cd', 32), true);
$token = $credential();
$otherToken = $service->controlCredential('bob', $otherBinding, $otherDevice);
$checks = 0;
$check = function (bool $value, string $label) use (&$checks): void {
    if (!$value) throw new RuntimeException($label);
    $checks++;
};
$denied = function (Closure $operation, string $label) use ($check): void {
    try { $operation(); }
    catch (CallPushFailure | AccountAccessDenied $error) { $check(true, $label); return; }
    throw new RuntimeException('Not denied: ' . $label);
};
$request = static fn(array $call, bool $end = false): array => ['callId' => $call['callId'], 'sid' => $call['sid'], 'end' => $end];
$check(strlen($token) <= 1024, 'bounded credential');
$claims = json_decode(hex2bin(explode('.', $token)[0]), true);
$check(array_keys($claims) === ['scope', 'deviceId', 'generation', 'expiresAt', 'environment'], 'credential contains no account, XMPP or web session secret');
$check($claims['scope'] === 'call-control-v1' && $claims['expiresAt'] === $registration['expiresAt'], 'narrow scope and device lease');
$denied(fn() => $service->controlCredential('stranger', $binding, $device), 'other account cannot mint');
$denied(fn() => $service->controlCredential('bob', $otherBinding, $device), 'other session cannot mint');
$call = $service->inviteVerified('alice', 'bob', 'native-control', true);
$check($service->reconcileControl($token, [$request($call)])[0]['state'] === 'ringing', 'no web session needed for scoped call check');
foreach (['', str_repeat('a', 1025), $token . '\r\n', substr($token, 0, -1) . (str_ends_with($token, '0') ? '1' : '0'),
    bin2hex(json_encode(array_merge($claims, ['deviceId' => $otherDevice]))) . '.' . explode('.', $token)[1]] as $invalid) {
    $denied(fn() => $service->reconcileControl($invalid, [$request($call)]), 'invalid signature or malformed credential');
}
$differentKey = new CallPushService($pdo, random_bytes(32), 'production', $policy, $clock);
$denied(fn() => $differentKey->reconcileControl($token, [$request($call)]), 'key rotation revokes capability');
$sandbox = new CallPushService($pdo, $key, 'sandbox', $policy, $clock);
$denied(fn() => $sandbox->reconcileControl($token, [$request($call)]), 'production capability cannot cross environments');
$allowed = false;
$check($service->reconcileControl($token, [$request($call)])[0]['state'] === 'unavailable', 'authoritative policy remains required');
$allowed = true;
$denied(fn() => $service->reconcileControl($token, array_fill(0, 65, $request($call))), 'bounded native batch');
$denied(fn() => $service->reconcileControl($token, [$request($call), $request($call)]), 'duplicates rejected');
$wrong = $request($call, true);
$wrong['sid'] = 'wrong';
$check($service->reconcileControl($token, [$wrong])[0]['state'] === 'unavailable', 'cannot cancel different SID');
$check($service->callFor('alice', $call['callId'])['state'] === 'ringing', 'different SID leaves call intact');
$foreign = $service->inviteVerified('alice', 'stranger', 'foreign', false);
$check($service->reconcileControl($token, [$request($foreign, true)])[0]['state'] === 'unavailable', 'other account call opaque');
$check($service->callFor('alice', $foreign['callId'])['state'] === 'ringing', 'other account call untouched');
$service->acceptVerified('bob', $binding, $call['callId'], $device, $registration['generation'], 'bob@example.test/phone');
$check($service->reconcileControl($otherToken, [$request($call, true)])[0]['state'] === 'answered-elsewhere', 'losing device cannot terminate accepted call');
$check($service->reconcileControl($token, [$request($call, true)])[0]['state'] === 'ended', 'winner can terminate without unlocking chat');
$check($service->reconcileControl($token, [$request($call, true)])[0]['state'] === 'ended', 'retry idempotent');
$register();
$denied(fn() => $service->reconcileControl($token, [$request($call)]), 'renewal invalidates previous generation');
$token = $credential();
$service->revokeSession('bob', $binding);
$denied(fn() => $service->reconcileControl($token, [$request($call)]), 'logout revokes scoped access');
$register();
$token = $credential();
$pdo->exec("INSERT INTO account_access_controls VALUES ('bob', 1, NULL, 2, '2026-11-06')");
$denied(fn() => $service->reconcileControl($token, [$request($call)]), 'blocked account cannot use capability');
$pdo->exec("UPDATE account_access_controls SET web_blocked = 0 WHERE account_id = 'bob'");
$denied(fn() => $service->reconcileControl($token, [$request($call)]), 'unblocking does not restore revoked access version');
$register();
$token = $credential();
$now += 86400;
$denied(fn() => $service->reconcileControl($token, [$request($call)]), 'expired capability denied');
echo "Native call control: {$checks} checks passed, isolated database only.\n";
