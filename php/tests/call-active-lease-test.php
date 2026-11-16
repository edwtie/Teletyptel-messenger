<?php
declare(strict_types=1);
require_once __DIR__ . '/call-bootstrap-fixture.php';
require_once dirname(__DIR__) . '/lib/CallPushRecovery.php';

$checks = 0;
$check = function (bool $value, string $label) use (&$checks): void {
    if (!$value) throw new RuntimeException($label);
    $checks++;
};
$deny = function (Closure $operation) use ($check): void {
    try { $operation(); } catch (CallPushFailure | AccountAccessDenied $error) { $check(true, 'Unsafe lease denied'); return; }
    throw new RuntimeException('Unsafe active-call lease accepted');
};
$create = function (): array {
    $fixture = new BootstrapFixture();
    $broker = new CallPushRecovery($fixture->pdo, $fixture->registry, $fixture->issuer, $fixture->ledger,
        $fixture->key, 'production', 'example.test', 'fixture', fn() => $fixture->now);
    $authorization = $broker->enroll('bob', $fixture->binding, $fixture->device);
    $input = ['action' => 'bootstrap', 'callId' => $fixture->call['callId'], 'sid' => $fixture->call['sid'],
        'mediaProfile' => 'total', 'deviceId' => $fixture->device, 'generation' => $fixture->registration['generation']];
    $grant = $broker->handle($authorization['credential'], $input);
    $full = 'bob@example.test/' . $grant['claims']['resource'];
    $fixture->event(['type' => 'resource', 'jid' => $full, 'online' => true, 'revision' => 1, 'expiresAt' => $fixture->now + 25]);
    $fixture->event(['type' => 'handoff', 'callId' => $input['callId'], 'sid' => $input['sid'], 'jid' => $full,
        'deviceId' => $fixture->device, 'generation' => $input['generation'], 'revision' => 1, 'expiresAt' => $fixture->now + 15]);
    $broker->handle($authorization['credential'], array_replace($input, ['action' => 'accept', 'fullJid' => $full]));
    $active = ['type' => 'active', 'callId' => $input['callId'], 'sid' => $input['sid'], 'jid' => $full,
        'deviceId' => $fixture->device, 'generation' => $input['generation'], 'nonce' => $grant['claims']['nonce'],
        'revision' => 1, 'expiresAt' => $fixture->now + 25];
    $leaseInput = array_replace($input, ['action' => 'lease', 'fullJid' => $full]);
    return [$fixture, $broker, $authorization, $grant, $active, $leaseInput];
};
$refresh = function (BootstrapFixture $fixture, array $active, int $revision): array {
    foreach (['alice@example.test/caller', $active['jid']] as $jid) {
        $fixture->event(['type' => 'resource', 'jid' => $jid, 'online' => true, 'revision' => $revision, 'expiresAt' => $fixture->now + 25]);
    }
    foreach ([['alice', 'bob'], ['bob', 'alice']] as [$owner, $peer]) {
        $fixture->event(['type' => 'policy', 'owner' => $owner . '@example.test', 'peer' => $peer . '@example.test',
            'allowed' => true, 'revision' => $revision, 'expiresAt' => $fixture->now + 25]);
    }
    $active = array_replace($active, ['revision' => $revision, 'expiresAt' => $fixture->now + 25]);
    $fixture->event($active);
    return $active;
};
[$fixture, $broker, $authorization, $grant, $active, $leaseInput] = $create();
$deny(fn() => $broker->handle($authorization['credential'], $leaseInput));
$fixture->event($active);
$lease = $broker->handle($authorization['credential'], $leaseInput);
$check(str_starts_with($lease['credential'], 'tcl1.') && $lease['claims']['scope'] === 'call-xmpp-active-v1', 'Purpose-isolated active lease');
$check($lease['claims']['nonce'] === $grant['claims']['nonce'] && $lease['claims']['expiresAt'] === $fixture->now + 25, 'Original nonce and short deadline');
$payload = explode('.', $lease['credential'])[1];
$check(hash_equals(explode('.', $lease['credential'])[2], hash_hmac('sha256',
    'teletyptel-call-active-v1:production:example.test:fixture:' . $payload, $fixture->key)), 'Actual issuer signature');
for ($revision = 2; $revision <= 9; $revision++) {
    $fixture->now += 10;
    $active = $refresh($fixture, $active, $revision);
    $lease = $broker->handle($authorization['credential'], $leaseInput);
    $fixture->registry->cleanup();
    $check($fixture->pdo->query('SELECT state FROM call_push_calls')->fetchColumn() === 'accepted'
        && $lease['claims']['expiresAt'] === $fixture->now + 25, 'Active call remains accepted beyond bootstrap and invitation deadline');
}
$deny(fn() => $broker->handle($authorization['credential'], array_replace($leaseInput, ['action' => 'bootstrap'])));
$deny(fn() => $fixture->issuer->answerPermit('bob', $fixture->binding, $fixture->device, $fixture->registration['generation'], $fixture->call['callId'], $active['jid']));
foreach (['deviceId' => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'generation' => str_repeat('f', 32),
    'sid' => 'other', 'fullJid' => 'bob@example.test/other', 'mediaProfile' => 'audio'] as $field => $value) {
    $deny(fn() => $broker->handle($authorization['credential'], array_replace($leaseInput, [$field => $value])));
}
foreach (['nonce' => str_repeat('f', 32), 'jid' => 'bob@example.test/other', 'generation' => str_repeat('e', 32),
    'revision' => 1, 'expiresAt' => $fixture->now + 26] as $field => $value) {
    $deny(fn() => $fixture->event(array_replace($active, ['revision' => 10], [$field => $value])));
}
$fixture->registry->end('bob', $fixture->call['callId']);
$deny(fn() => $broker->handle($authorization['credential'], $leaseInput));
$deny(fn() => $fixture->event(array_replace($active, ['revision' => 10, 'expiresAt' => $fixture->now + 25])));

foreach (['logout', 'rotation', 'account', 'policy', 'caller-offline', 'recipient-offline', 'scope-expiry', 'active-expiry'] as $case) {
    [$fixture, $broker, $authorization, $grant, $active, $leaseInput] = $create();
    $fixture->event($active);
    if ($case !== 'scope-expiry') $broker->handle($authorization['credential'], $leaseInput);
    switch ($case) {
        case 'logout': $fixture->registry->revokeSession('bob', $fixture->binding); break;
        case 'rotation': $fixture->registry->register('bob', $fixture->binding, $fixture->device, str_repeat('cd', 32), true); break;
        case 'account': $fixture->pdo->exec("INSERT INTO account_access_controls VALUES ('bob', 1, NULL, 2, '2026-11-16')"); break;
        case 'policy': $fixture->event(['type' => 'policy', 'owner' => 'bob@example.test', 'peer' => 'alice@example.test',
            'allowed' => false, 'revision' => 2, 'expiresAt' => $fixture->now + 25]); break;
        case 'caller-offline': case 'recipient-offline':
            $fixture->event(['type' => 'resource', 'jid' => $case === 'caller-offline' ? 'alice@example.test/caller' : $active['jid'],
                'online' => false, 'revision' => 2, 'expiresAt' => $fixture->now + 25]); break;
        case 'scope-expiry': $fixture->now += 20; break;
        case 'active-expiry': $fixture->now += 25; break;
    }
    $deny(fn() => $broker->handle($authorization['credential'], $leaseInput));
    $deny(fn() => $fixture->event(array_replace($active, ['revision' => 2, 'expiresAt' => $fixture->now + 25])));
}
echo "Active call leases: {$checks} checks passed; no live server or APNs changes.\n";
