<?php
declare(strict_types=1);
require_once __DIR__ . '/call-bootstrap-fixture.php';
$previous = getenv('TELETYPTEL_CALL_SCOPE_REVOCATION');
putenv('TELETYPTEL_CALL_SCOPE_REVOCATION=1');
$checks = 0;
$check = function (bool $ok, string $label) use (&$checks): void { if (!$ok) throw new RuntimeException($label); $checks++; };
$deny = function (Closure $operation) use ($check): void {
    try { $operation(); } catch (Throwable $error) { $check(true, 'Rejected unsafe operation'); return; }
    throw new RuntimeException('Unsafe revocation accepted');
};
try {
    $fixture = new BootstrapFixture();
    $otherDevice = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; $otherBinding = str_repeat('2', 64);
    $fixture->registry->register('bob', $otherBinding, $otherDevice, str_repeat('cd', 32), true);
    $session = ['teletyptel_account_id' => 'bob', 'teletyptel_call_push_binding' => $fixture->binding];
    CallPushService::revokeWebSession($fixture->pdo, $session);
    $check(!isset($session['teletyptel_call_push_binding']), 'Logout completes after durable revocation commit');
    $check($fixture->registry->devices('bob', $fixture->binding) === [], 'Logged-out registration deleted');
    $check(count($fixture->registry->devices('bob', $otherBinding)) === 1, 'Other session preserved');
    $record = $fixture->pdo->query('SELECT * FROM call_scope_revocations')->fetch(PDO::FETCH_ASSOC);
    $check($record['device_id'] === $fixture->device && $record['generation'] === $fixture->registration['generation']
        && $record['delivered'] === null, 'Exact old generation durably queued while transport is unavailable');
    $attempts = 0; $available = false;
    $revoker = new CallScopeRevocation($fixture->pdo, $fixture->key, 'production', 'example.test', 'fixture',
        function (string $raw) use ($fixture, &$attempts, &$available, $check): array {
            $check(!$fixture->pdo->inTransaction(), 'Network never holds registry transaction');
            $attempts++; $envelope = json_decode($raw, true);
            $check(hash_equals($envelope['signature'], hash_hmac('sha256',
                'teletyptel-call-revoke-v1:production:example.test:fixture:' . $envelope['payload'], $fixture->key)), 'Purpose-specific authenticated envelope');
            $payload = strtr($envelope['payload'], '-_', '+/');
            $claims = json_decode(base64_decode($payload . str_repeat('=', (4 - strlen($payload) % 4) % 4)), true);
            $check($claims['expiresAt'] === $fixture->now + 30 && count($claims) === 9, 'Bounded metadata only');
            return ['status' => $available ? 200 : 503, 'body' => json_encode(['eventId' => $claims['eventId'], 'revoked' => true])];
        }, fn() => $fixture->now);
    $check($revoker->drain() === ['delivered' => 0, 'pending' => 1], 'Failed delivery stays pending');
    $available = true; $fixture->now += 40;
    $check($revoker->drain() === ['delivered' => 1, 'pending' => 0], 'Retry uses a fresh authenticated envelope');
    $check($revoker->drain() === ['delivered' => 0, 'pending' => 0] && $attempts === 2, 'Acknowledged event is not sent again');
    $probe = new CallScopeRevocation($fixture->pdo, $fixture->key, 'production', 'example.test', 'fixture',
        function (string $raw) use ($fixture, $check): array {
            $body = json_decode($raw, true);
            $check(isset($body['health']) && !isset($body['payload']) && hash_equals($body['signature'], hash_hmac('sha256',
                'teletyptel-call-health-v1:production:example.test:fixture:' . $body['health'], $fixture->key)), 'Health check has an independent purpose');
            $payload = strtr($body['health'], '-_', '+/');
            $claims = json_decode(base64_decode($payload . str_repeat('=', (4 - strlen($payload) % 4) % 4)), true);
            return ['status' => 200, 'body' => json_encode(['ready' => true, 'nonce' => $claims['nonce']])];
        }, fn() => $fixture->now);
    $check($probe->probe(), 'Readiness probe checks its fresh response nonce');
    $deny(fn() => $revoker->drain(['invalid']));
    $deny(fn() => CallScopeRevocation::queue($fixture->pdo, [], $fixture->now));
    $fixture->pdo->beginTransaction();
    $deny(fn() => $revoker->drain()); $fixture->pdo->rollBack();

    $fixture = new BootstrapFixture();
    $old = $fixture->registration['generation'];
    $new = $fixture->registry->register('bob', $fixture->binding, $fixture->device, str_repeat('ef', 32), true);
    $record = $fixture->pdo->query('SELECT * FROM call_scope_revocations')->fetch(PDO::FETCH_ASSOC);
    $check($record['generation'] === $old && $new['generation'] !== $old, 'Rotation revokes only the replaced generation');
    $check($fixture->registry->devices('bob', $fixture->binding)[0]['generation'] === $new['generation'], 'Replacement remains registered');
    $badAck = new CallScopeRevocation($fixture->pdo, $fixture->key, 'production', 'example.test', 'fixture',
        static fn() => ['status' => 200, 'body' => '{"revoked":true,"eventId":"wrong"}'], fn() => $fixture->now);
    $check($badAck->drain() === ['delivered' => 0, 'pending' => 1], 'Uncorrelated acknowledgement cannot clear queue');
    $fixture->pdo->exec('DROP TABLE call_scope_revocations');
    $session = ['teletyptel_call_push_binding' => $fixture->binding];
    $deny(function () use ($fixture, &$session): void { CallPushService::revokeWebSession($fixture->pdo, $session); });
    $check(isset($session['teletyptel_call_push_binding']) && count($fixture->registry->devices('bob', $fixture->binding)) === 1,
        'Failed durable enqueue rolls back logout rather than claiming revocation');
    echo "Call scope revocation: {$checks} checks passed; isolated durable outbox, no live calls or APNs.\n";
} finally { putenv($previous === false ? 'TELETYPTEL_CALL_SCOPE_REVOCATION' : 'TELETYPTEL_CALL_SCOPE_REVOCATION=' . $previous); }
