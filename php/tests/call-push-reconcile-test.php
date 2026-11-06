<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushService.php';
require_once dirname(__DIR__) . '/lib/CallPushPolicy.php';

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT)');
foreach (['alice', 'bob', 'stranger'] as $account) {
    $pdo->prepare('INSERT INTO account_profiles VALUES (?, ?)')->execute([$account, $account . '@example.test']);
}
AccountAccess::ensureSchema($pdo);
$now = 1800000000;
$allowed = true;
$key = random_bytes(32);
$clock = function () use (&$now): int { return $now; };
$policy = function () use (&$allowed): bool { return $allowed; };
$service = new CallPushService($pdo, $key, 'production', $policy, $clock);
$service->ensureSchema();
$device = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$otherDevice = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
$binding = str_repeat('1', 64);
$otherBinding = str_repeat('2', 64);
$register = fn() => $service->register('bob', $binding, $device, str_repeat('ab', 32), true);
$registration = $register();
$service->register('bob', $otherBinding, $otherDevice, str_repeat('cd', 32), true);
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
$request = static fn(array $call, bool $end = false): array => [
    'callId' => $call['callId'], 'sid' => $call['sid'], 'end' => $end
];
$reconcile = fn(array $requests) => $service->reconcileDevice('bob', $binding, $device, $requests);
$invite = function (string $sid) use ($service, &$now): array {
    $now += 61;
    return $service->inviteVerified('alice', 'bob', $sid, true);
};
$call = $invite('pending');
$check($reconcile([$request($call)])[0]['state'] === 'ringing', 'verified live invitation remains ringing');
$check(array_keys($reconcile([$request($call)])[0]) === ['callId', 'sid', 'state'], 'no identities, tokens or SDP exposed');
$denied(fn() => $service->reconcileDevice('stranger', $binding, $device, [$request($call)]), 'other account rejected');
$denied(fn() => $service->reconcileDevice('bob', $otherBinding, $device, [$request($call)]), 'other session rejected');
$denied(fn() => $reconcile(array_fill(0, 65, $request($call))), 'bounded request count');
$denied(fn() => $reconcile([$request($call), $request($call)]), 'duplicate identity rejected');
$denied(fn() => $reconcile([['callId' => $call['callId'], 'sid' => '../bad', 'end' => true]]), 'bad SID rejected');
$denied(fn() => $reconcile([['callId' => $call['callId'], 'sid' => $call['sid'], 'end' => 'true']]), 'strict end boolean');
$wrongSid = $request($call, true);
$wrongSid['sid'] = 'another-sid';
$check($reconcile([$wrongSid])[0]['state'] === 'unavailable', 'SID mismatch is opaque');
$check($service->callFor('alice', $call['callId'])['state'] === 'ringing', 'SID mismatch cannot cancel');
$allowed = false;
$check($reconcile([$request($call)])[0]['state'] === 'unavailable', 'changed recipient policy suppresses ringing');
$allowed = true;
$noPolicy = new CallPushService($pdo, $key, 'production', null, $clock);
$check($noPolicy->reconcileDevice('bob', $binding, $device, [$request($call)])[0]['state'] === 'unavailable', 'missing policy fails closed');
$check($reconcile([$request($call, true)])[0]['state'] === 'ended', 'decline terminates invitation');
$check($reconcile([$request($call, true)])[0]['state'] === 'ended', 'decline retry idempotent');
$sent = 0;
$service->dispatchOne(function () use (&$sent): array { $sent++; return ['accepted' => true]; });
$check($sent === 0, 'decline cancels queued APNs without another push');
$call = $invite('caller-cancelled');
$service->end('alice', $call['callId']);
$check($reconcile([$request($call)])[0]['state'] === 'ended', 'caller cancellation reaches waking device');
$call = $invite('expired');
$now += 46;
$check($reconcile([$request($call)])[0]['state'] === 'expired', 'stale push does not keep ringing');
$call = $invite('other-winner');
$service->acceptVerified('bob', $binding, $call['callId'], $device, $registration['generation'], 'bob@example.test/phone');
$denied(fn() => $service->acceptVerified('bob', $binding, $call['callId'], $device,
    $registration['generation'], 'bob@example.test/replacement'), 'accepted call cannot silently move XMPP resources');
$check($service->acceptVerified('bob', $binding, $call['callId'], $device,
    $registration['generation'], 'bob@example.test/phone')['state'] === 'accepted', 'same-resource acceptance retry remains idempotent');
$loser = $service->reconcileDevice('bob', $otherBinding, $otherDevice, [$request($call, true)]);
$check($loser[0]['state'] === 'answered-elsewhere', 'losing device cannot cancel winning handoff');
$check($service->callFor('bob', $call['callId'])['state'] === 'accepted', 'winning handoff survives other-device decline');
$check($reconcile([$request($call)])[0]['state'] === 'accepted', 'winning device can reconcile');
$register();
$check($reconcile([$request($call, true)])[0]['state'] === 'answered-elsewhere', 'new generation cannot cancel old reservation');
$foreign = $service->inviteVerified('alice', 'stranger', 'foreign-recipient', false);
$check($reconcile([$request($foreign, true)])[0]['state'] === 'unavailable', 'other recipient state stays opaque');
$check($service->callFor('alice', $foreign['callId'])['state'] === 'ringing', 'other recipient call cannot be ended');
$call = $invite('account-revoked');
$pdo->exec("INSERT INTO account_access_controls VALUES ('bob', 1, NULL, 2, '2026-11-06')");
$denied(fn() => $reconcile([$request($call)]), 'blocked account cannot reconcile');
$pdo->exec("UPDATE account_access_controls SET web_blocked = 0 WHERE account_id = 'bob'");
$denied(fn() => $reconcile([$request($call)]), 'revoked generation cannot reconcile');
$register();
$now += 86401;
$denied(fn() => $reconcile([$request($call)]), 'expired device registration cannot reconcile');

$previousPolicy = getenv('TELETYPTEL_CALL_PUSH_POLICY_FILE');
$previousRoot = $_SERVER['DOCUMENT_ROOT'] ?? null;
$policyFile = tempnam(sys_get_temp_dir(), 'tt-call-policy-');
try {
    foreach (['', __FILE__] as $file) {
        putenv('TELETYPTEL_CALL_PUSH_POLICY_FILE=' . $file);
        try { CallPushPolicy::load($pdo); throw new LogicException('Unsafe policy accepted'); }
        catch (RuntimeException $error) { $check(true, 'missing/repository policy file denied'); }
    }
    file_put_contents($policyFile, '<?php return static fn(PDO $pdo): Closure => static fn(): bool => false;');
    putenv('TELETYPTEL_CALL_PUSH_POLICY_FILE=' . $policyFile);
    $_SERVER['DOCUMENT_ROOT'] = dirname(__DIR__) . '/public';
    $check(CallPushPolicy::load($pdo)([], 'read') === false, 'trusted external factory is loaded without weakening its decisions');
    $_SERVER['DOCUMENT_ROOT'] = dirname($policyFile);
    try { CallPushPolicy::load($pdo); throw new LogicException('Public policy accepted'); }
    catch (RuntimeException $error) { $check(true, 'policy inside an additional web root denied'); }
    $_SERVER['DOCUMENT_ROOT'] = dirname(__DIR__) . '/public';
    file_put_contents($policyFile, '<?php return true;');
    try { CallPushPolicy::load($pdo); throw new LogicException('Invalid factory accepted'); }
    catch (RuntimeException $error) { $check(true, 'non-factory policy denied'); }
} finally {
    putenv($previousPolicy === false ? 'TELETYPTEL_CALL_PUSH_POLICY_FILE' : 'TELETYPTEL_CALL_PUSH_POLICY_FILE=' . $previousPolicy);
    if ($previousRoot === null) unset($_SERVER['DOCUMENT_ROOT']); else $_SERVER['DOCUMENT_ROOT'] = $previousRoot;
    if (is_file($policyFile)) unlink($policyFile);
}
echo "Call reconciliation: {$checks} checks passed (isolated SQLite; no Apple requests).\n";
