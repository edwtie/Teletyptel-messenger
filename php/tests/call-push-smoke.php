<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushService.php';

if (($argv[1] ?? '') !== '--fixture') {
    $path = tempnam(sys_get_temp_dir(), 'tt-call-push-');
    try {
        $process = proc_open([PHP_BINARY, __FILE__, '--fixture', $path], [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Cannot start isolated registry test');
        $result = proc_close($process);
    } finally {
        if (is_file($path)) unlink($path);
    }
    exit($result);
}

$path = $argv[2];
$connect = static fn() => new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo = $connect();
$checks = 0;
$check = function (bool $condition, string $label) use (&$checks): void {
    if (!$condition) throw new RuntimeException($label);
    $checks++;
};
$denied = function (Closure $operation, string $label) use ($check): void {
    try { $operation(); }
    catch (CallPushFailure | AccountAccessDenied $error) { $check(true, $label); return; }
    throw new RuntimeException('Not denied: ' . $label);
};
$now = 1800000000;
$clock = function () use (&$now): int { return $now; };
$key = random_bytes(32);
$allow = true;
$policy = function (array $call, string $operation) use (&$allow): bool {
    return $allow && ($operation !== 'accept' || $call['recipient_jid'] === 'bob@example.test/new-resource');
};
$service = new CallPushService($pdo, $key, 'production', $policy, $clock);
$deviceOne = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$deviceTwo = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
$bindingOne = str_repeat('1', 64);
$bindingTwo = str_repeat('2', 64);
$tokenOne = str_repeat('a', 64);
$tokenTwo = str_repeat('b', 64);
$registerOne = fn() => $service->register('bob', $bindingOne, $deviceOne, $tokenOne, true);
$registerTwo = fn() => $service->register('bob', $bindingTwo, $deviceTwo, $tokenTwo, true);

try {
    $pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT)');
    foreach (['alice', 'bob', 'stranger'] as $account) $pdo->prepare('INSERT INTO account_profiles VALUES (?, ?)')->execute([$account, $account . '@example.test']);
    AccountAccess::ensureSchema($pdo);
    $service->ensureSchema();
    $service->ensureSchema();
    $session = [];
    $denied(function () use ($pdo, &$session) { CallPushService::authorize($pdo, $session, 'GET', null); }, 'anonymous denied');
    $session = ['teletyptel_account_id' => 'bob', 'teletyptel_call_push_csrf' => 'csrf'];
    $check(CallPushService::authorize($pdo, $session, 'GET', null) === 'bob', 'authenticated account');
    $denied(function () use ($pdo, &$session) { CallPushService::authorize($pdo, $session, 'POST', 'wrong'); }, 'CSRF required');
    $check(CallPushService::authorize($pdo, $session, 'POST', 'csrf') === 'bob', 'CSRF accepted');
    $denied(function () use ($pdo, &$session) { CallPushService::authorize($pdo, $session, 'DELETE', null); }, 'method denied');
    $denied(fn() => new CallPushService($pdo, 'short', 'production'), 'storage key mandatory');
    $denied(fn() => new CallPushService($pdo, $key, 'anything'), 'environment explicit');
    $denied(fn() => $service->register('bob', $bindingOne, $deviceOne, $tokenOne, false), 'consent required');
    $denied(fn() => $service->register('bob', $bindingOne, $deviceOne, 'abc', true), 'invalid token');
    $denied(fn() => $service->register('unknown', $bindingOne, $deviceOne, $tokenOne, true), 'account existence');
    $denied(fn() => $service->inviteVerified('alice', 'bob', 'sid', false, 61), 'bounded invitation lifetime');
    $denied(fn() => $service->inviteVerified('alice', 'bob', 'sid', false, 0), 'expired invitation rejected');
    $denied(fn() => $service->inviteVerified('alice', 'alice', 'sid', false), 'self call rejected');
    $first = $registerOne();
    $second = $registerTwo();
    $check(count($service->devices('bob', $bindingOne)) === 1, 'only devices from this session');
    $check($service->devices('alice', $bindingOne) === [], 'no cross account device read');
    $stored = $pdo->query('SELECT * FROM call_push_devices')->fetchAll(PDO::FETCH_ASSOC);
    $check(!str_contains(json_encode($stored), $tokenOne) && !str_contains(json_encode($stored), $bindingOne), 'no plaintext tokens or session capabilities in DB');
    $check(!str_contains(json_encode($service->devices('bob', $bindingOne)), 'token'), 'no encrypted or plain token in response');
    $denied(fn() => $service->register('alice', $bindingOne, $deviceOne, $tokenOne, true), 'cannot steal device');
    $denied(fn() => $service->register('bob', $bindingOne, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', $tokenOne, true), 'cannot duplicate token');
    $denyByDefault = new CallPushService($pdo, $key, 'production', null, $clock);
    $denied(fn() => $denyByDefault->inviteVerified('alice', 'bob', 'no-policy', true), 'no trusted signaling policy means no push');
    $throwPolicy = new CallPushService($pdo, $key, 'production', static fn() => throw new RuntimeException('secret'), $clock);
    $denied(fn() => $throwPolicy->inviteVerified('alice', 'bob', 'policy-error', true), 'policy error fails closed');
    $call = $service->inviteVerified('alice', 'bob', 'sid-one', true);
    $check($service->inviteVerified('alice', 'bob', 'sid-one', true) === $call, 'duplicate Jingle invitation stable UUID');
    $check((int)$pdo->query('SELECT COUNT(*) FROM call_push_jobs')->fetchColumn() === 2, 'one job per registered device');
    $denied(fn() => $service->inviteVerified('alice', 'stranger', 'sid-one', true), 'SID cannot change recipient');
    $denied(fn() => $service->inviteVerified('stranger', 'bob', 'busy', true), 'busy recipient');
    $denied(fn() => $service->callFor('stranger', $call['callId']), 'no cross account call read');
    $denied(fn() => $service->end('stranger', $call['callId']), 'no cross account cancellation');
    $restarted = new CallPushService($connect(), $key, 'production', $policy, $clock);
    $check($restarted->callFor('bob', $call['callId']) === $call, 'durable after reopening DB');
    $sent = [];
    $send = function (string $token, array $payload) use (&$sent, $check): array {
        $check(!isset($payload['caller'], $payload['recipient'], $payload['recipient_jid']), 'minimal transport payload');
        $sent[] = [$token, $payload];
        return ['accepted' => true];
    };
    $check($service->dispatchOne($send)['state'] === 'accepted', 'first dispatch');
    $check($restarted->dispatchOne($send)['state'] === 'accepted', 'second device dispatch');
    $check($service->dispatchOne($send)['state'] === 'idle' && count($sent) === 2, 'no duplicate dispatch');
    $check(in_array($sent[0][0], [$tokenOne, $tokenTwo], true), 'decrypt only inside dispatch');
    $denied(fn() => $service->acceptVerified('bob', $bindingTwo, $call['callId'], $deviceOne, $first['generation'], 'bob@example.test/new-resource'), 'wrong session binding');
    $denied(fn() => $service->acceptVerified('bob', $bindingOne, $call['callId'], $deviceOne, $first['generation'], 'alice@example.test/new-resource'), 'wrong full JID');
    $denied(fn() => $service->acceptVerified('bob', $bindingOne, $call['callId'], $deviceOne, $first['generation'], 'bob@example.test/old-resource'), 'resource must be server verified');
    $check($service->acceptVerified('bob', $bindingOne, $call['callId'], $deviceOne, $first['generation'], 'bob@example.test/new-resource')['state'] === 'accepted', 'accept current verified resource');
    $check($service->acceptVerified('bob', $bindingOne, $call['callId'], $deviceOne, $first['generation'], 'bob@example.test/new-resource')['state'] === 'accepted', 'idempotent answer');
    $denied(fn() => $restarted->acceptVerified('bob', $bindingTwo, $call['callId'], $deviceTwo, $second['generation'], 'bob@example.test/new-resource'), 'second device cannot win');
    $service->end('alice', $call['callId']);
    $check($service->callFor('bob', $call['callId'])['state'] === 'ended', 'caller cancellation');
    $check($service->inviteVerified('alice', 'bob', 'sid-one', true)['state'] === 'ended', 'no resurrection from replay');

    $call = $service->inviteVerified('alice', 'bob', 'race-two-phones', true);
    $children = [];
    foreach ([[$deviceOne, $bindingOne, $first['generation']], [$deviceTwo, $bindingTwo, $second['generation']]] as $candidate) {
        $pipes = [];
        $process = proc_open([PHP_BINARY, __DIR__ . '/call-push-race.php'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Cannot start concurrency test');
        $children[] = [$process, $pipes, $candidate];
    }
    foreach ($children as [$process, $pipes, $candidate]) {
        fwrite($pipes[0], json_encode(['database' => $path, 'key' => base64_encode($key), 'now' => $now,
            'deviceId' => $candidate[0], 'binding' => $candidate[1], 'generation' => $candidate[2], 'callId' => $call['callId']]));
        fclose($pipes[0]);
    }
    $outcomes = [];
    foreach ($children as [$process, $pipes]) {
        $outcomes[] = trim(stream_get_contents($pipes[1]));
        $errors = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $check(proc_close($process) === 0 && $errors === '', 'parallel answer process completed');
    }
    sort($outcomes);
    $check($outcomes === ['accepted', 'lost'], 'exactly one winner under real parallel DB access');
    $check($service->dispatchOne($send)['state'] === 'idle', 'answered call no longer pushed');
    $service->end('alice', $call['callId']);

    $now += 61;
    $call = $service->inviteVerified('alice', 'bob', 'cancel-before-send', false);
    $service->end('alice', $call['callId']);
    $check($service->dispatchOne($send)['state'] === 'idle', 'cancel suppresses queued push');
    $call = $service->inviteVerified('alice', 'bob', 'dnd-before-send', false);
    $allow = false;
    $check($service->dispatchOne($send)['state'] === 'idle', 'DND/block/signaling policy rechecked before send');
    $allow = true;
    $service->end('alice', $call['callId']);
    $call = $service->inviteVerified('alice', 'bob', 'logout-before-send', false);
    $logoutSession = ['teletyptel_account_id' => 'bob', 'teletyptel_call_push_binding' => $bindingOne, 'teletyptel_call_push_csrf' => 'csrf'];
    CallPushService::revokeWebSession($pdo, $logoutSession);
    $check(!isset($logoutSession['teletyptel_call_push_binding'], $logoutSession['teletyptel_call_push_csrf']), 'logout capability removed');
    $check($service->devices('bob', $bindingOne) === [], 'logout removes this registration');
    $check(count($service->devices('bob', $bindingTwo)) === 1, 'other session unaffected by logout');
    $check($service->dispatchOne($send)['state'] === 'accepted', 'only remaining device sent');
    $check($service->dispatchOne($send)['state'] === 'idle', 'logged-out device not sent');
    $service->end('alice', $call['callId']);
    $registerOne();
    $switchSession = ['teletyptel_account_id' => 'bob', 'teletyptel_call_push_binding' => $bindingOne];
    AccountAccess::bind($pdo, 'alice', $switchSession);
    $check($service->devices('bob', $bindingOne) === [], 'login/account switch revokes old session push');

    $now += 61;
    $call = $service->inviteVerified('alice', 'bob', 'expired', false, 1);
    $now += 2;
    $check($service->dispatchOne($send)['state'] === 'idle', 'expired not sent');
    $check($service->callFor('bob', $call['callId'])['state'] === 'expired', 'expiry survives restart');
    $call = $service->inviteVerified('alice', 'bob', 'rotate-before-send', false);
    $rotated = $registerTwo();
    $check($service->dispatchOne($send)['state'] === 'idle', 'old queued generation not sent after rotation');
    $service->end('alice', $call['callId']);
    $call = $service->inviteVerified('alice', 'bob', 'unknown-outcome', false);
    $check($service->dispatchOne(static fn() => throw new RuntimeException('token-secret')) === ['state' => 'unknown'], 'sanitized unknown transport outcome');
    $check($service->dispatchOne($send)['state'] === 'idle', 'never auto retry unknown result');
    $service->end('alice', $call['callId']);
    $call = $service->inviteVerified('alice', 'bob', 'stale-apple', false);
    $check($service->dispatchOne(function () use ($registerTwo, &$now) {
        $registerTwo();
        return ['accepted' => false, 'reason' => 'Unregistered', 'invalidateDevice' => true, 'invalidatedAt' => ($now + 5) * 1000];
    })['state'] === 'rejected', 'Apple invalidation received');
    $check(count($service->devices('bob', $bindingTwo)) === 1, 'late invalidation cannot revoke replacement generation');
    $service->end('alice', $call['callId']);
    $now += 61;
    $call = $service->inviteVerified('alice', 'bob', 'old-timestamp', false);
    $service->dispatchOne(fn() => ['accepted' => false, 'reason' => 'Unregistered', 'invalidateDevice' => true, 'invalidatedAt' => ($now - 120) * 1000]);
    $check(count($service->devices('bob', $bindingTwo)) === 1, 'old invalidation timestamp ignored');
    $service->end('alice', $call['callId']);
    $call = $service->inviteVerified('alice', 'bob', 'fresh-invalidation', false);
    $service->dispatchOne(fn() => ['accepted' => false, 'reason' => 'Unregistered', 'invalidateDevice' => true, 'invalidatedAt' => ($now + 1) * 1000]);
    $check($service->devices('bob', $bindingTwo) === [], 'current generation invalidated');

    $registerOne();
    $service->end('alice', $call['callId']);
    $call = $service->inviteVerified('alice', 'bob', 'account-block', false);
    $pdo->exec("INSERT INTO account_access_controls VALUES ('bob', 1, NULL, 2, '2026-11-06')");
    $check($service->dispatchOne($send)['state'] === 'idle', 'blocked recipient not pushed');
    $denied(fn() => $registerOne(), 'blocked account cannot register');
    $pdo->exec("UPDATE account_access_controls SET web_blocked = 0 WHERE account_id = 'bob'");
    $check($service->devices('bob', $bindingOne) === [], 'unblock does not revive old access generation');
    $service->end('alice', $call['callId']);
    $now += 61;
    $first = $registerOne();
    $call = $service->inviteVerified('alice', 'bob', 'tampered-ciphertext', false);
    $pdo->exec("UPDATE call_push_devices SET token_cipher = 'corrupt'");
    $denied(fn() => $service->dispatchOne($send), 'corrupt encrypted token fails closed');
    $service->end('alice', $call['callId']);

    $now += 61;
    for ($index = 0; $index < 5; $index++) {
        $limited = $service->inviteVerified('alice', 'bob', 'limit-' . $index, false);
        $service->end('alice', $limited['callId']);
    }
    $denied(fn() => $service->inviteVerified('alice', 'bob', 'limited', false), 'caller rate limit');
    $now += 86401;
    $service->cleanup();
    foreach (['call_push_devices', 'call_push_calls', 'call_push_jobs'] as $table) {
        $check((int)$pdo->query('SELECT COUNT(*) FROM ' . $table)->fetchColumn() === 0, 'short retention: ' . $table);
    }
    $registerOne();
    $call = $service->inviteVerified('alice', 'bob', 'caller-revoked', false);
    $pdo->exec("INSERT INTO account_access_controls VALUES ('alice', 0, NULL, 2, '2026-11-06')");
    $check($service->dispatchOne($send)['state'] === 'idle', 'revoked caller session suppresses push');
    $registerTwo();
    $service->revokeDevice('stranger', $deviceOne);
    $check(count($service->devices('bob', $bindingOne)) === 1, 'another account cannot revoke this installation');
    $service->revokeDevice('bob', $deviceOne);
    $check($service->devices('bob', $bindingOne) === [], 'own device can be revoked after its old web session expired');
    $check(count($service->devices('bob', $bindingTwo)) === 1, 'device revoke keeps other installations');
    $service->revokeDevice('bob', $deviceOne);
    $check(count($service->devices('bob', $bindingTwo)) === 1, 'repeated device revoke is idempotent');
    $denied(fn() => $service->revokeDevice('bob', '../not-a-device'), 'device revoke validates identifier');
    $pdo->exec("UPDATE account_access_controls SET web_blocked = 1 WHERE account_id = 'bob'");
    $denied(fn() => $service->revokeDevice('bob', $deviceTwo), 'blocked account cannot use device endpoint');
    $pdo->exec("UPDATE account_access_controls SET web_blocked = 0 WHERE account_id = 'bob'");
    $pdo->exec('DROP TABLE call_push_devices');
    $failedLogout = ['teletyptel_call_push_binding' => $bindingOne];
    $denied(function () use ($pdo, &$failedLogout) { CallPushService::revokeWebSession($pdo, $failedLogout); }, 'failed revocation not reported as success');
    $check(isset($failedLogout['teletyptel_call_push_binding']), 'failed logout retains capability for retry');
    echo "Call push registry: {$checks} checks passed (isolated SQLite; no APNs sent).\n";
} finally {
    unset($registerOne, $registerTwo, $service, $restarted, $denyByDefault, $throwPolicy, $pdo);
}
