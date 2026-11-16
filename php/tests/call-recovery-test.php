<?php
declare(strict_types=1);
require_once __DIR__ . '/call-bootstrap-fixture.php';
require_once dirname(__DIR__) . '/lib/CallPushRecovery.php';
$checks = 0;
$check = function (bool $value, string $label) use (&$checks): void { if (!$value) throw new RuntimeException($label); $checks++; };
$deny = function (Closure $operation) use ($check): void {
    try { $operation(); } catch (CallPushFailure | AccountAccessDenied $error) { $check(true, 'Denied unsafe recovery'); return; }
    throw new RuntimeException('Unsafe recovery accepted');
};
$create = function (): array {
    $fixture = new BootstrapFixture();
    $broker = new CallPushRecovery($fixture->pdo, $fixture->registry, $fixture->issuer, $fixture->ledger,
        $fixture->key, 'production', 'example.test', 'fixture', fn() => $fixture->now);
    $authorization = $broker->enroll('bob', $fixture->binding, $fixture->device);
    $input = ['action' => 'bootstrap', 'callId' => $fixture->call['callId'], 'sid' => $fixture->call['sid'],
        'mediaProfile' => 'total', 'deviceId' => $fixture->device, 'generation' => $fixture->registration['generation']];
    return [$fixture, $broker, $authorization, $input];
};
[$fixture, $broker, $authorization, $input] = $create();
$check(str_starts_with($authorization['credential'], 'tcd1.'), 'Separate purpose');
$check(!str_contains($authorization['credential'], $fixture->binding) && !str_contains($authorization['credential'], 'bob'), 'Encrypted authorization');
$check($authorization['owner'] === 'bob@example.test' && $authorization['expiresAt'] <= $fixture->now + 86400, 'Bound metadata');
$grant = $broker->handle($authorization['credential'], $input);
$check($grant['claims']['callId'] === $input['callId'], 'Actual cookie-free issuance');
$full = 'bob@example.test/' . $grant['claims']['resource'];
$accept = array_replace($input, ['action' => 'accept', 'fullJid' => $full]);
$deny(fn() => $fixture->issuer->answerPermit('bob', $fixture->binding, $fixture->device, $fixture->registration['generation'], $input['callId'], $full));
$deny(fn() => $broker->handle($authorization['credential'], $accept));
$fixture->event(['type' => 'resource', 'jid' => $full, 'online' => true, 'revision' => 1, 'expiresAt' => $fixture->now + 25]);
$fixture->event(['type' => 'handoff', 'callId' => $input['callId'], 'sid' => $input['sid'], 'jid' => $full,
    'deviceId' => $fixture->device, 'generation' => $fixture->registration['generation'], 'revision' => 1, 'expiresAt' => $fixture->now + 15]);
$reserved = $broker->handle($authorization['credential'], $accept);
$check($reserved['callerJid'] === 'alice@example.test/caller' && $reserved['recipientJid'] === $full
    && str_starts_with($reserved['answerAuthorization'], 'tca1.'), 'Actual resource proof, reservation and scoped answer permit');
$deny(fn() => $fixture->issuer->answerPermit('bob', $fixture->binding, $fixture->device, $fixture->registration['generation'], $input['callId'], 'bob@example.test/other'));
$previousPilot = getenv('TELETYPTEL_CALL_BACKGROUND_PILOT');
putenv('TELETYPTEL_CALL_BACKGROUND_PILOT=1');
try {
    $deny(fn() => $broker->handle($authorization['credential'], $input));
    $check($broker->handle($authorization['credential'], array_replace($input, ['action' => 'end']))['ended'] === true, 'Cleanup remains available when pilot readiness expires');
} finally { putenv($previousPilot === false ? 'TELETYPTEL_CALL_BACKGROUND_PILOT' : 'TELETYPTEL_CALL_BACKGROUND_PILOT=' . $previousPilot); }
$check($fixture->pdo->query('SELECT state FROM call_push_calls')->fetchColumn() === 'ended', 'Actual persisted end');
foreach (['deviceId' => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'generation' => str_repeat('f', 32),
    'sid' => 'other', 'mediaProfile' => 'audio', 'action' => 'history', 'extra' => 'forbidden'] as $field => $value) {
    [$fixture, $broker, $authorization, $input] = $create();
    $deny(fn() => $broker->handle($authorization['credential'], array_replace($input, [$field => $value])));
}
[$fixture, $broker, $authorization, $input] = $create();
foreach (['fake', $fixture->registry->controlCredential('bob', $fixture->binding, $fixture->device),
    substr($authorization['credential'], 0, -1) . '!'] as $bad) $deny(fn() => $broker->handle($bad, $input));
$deny(fn() => $broker->enroll('charlie', $fixture->binding, $fixture->device));
$fixture->registry->revokeSession('bob', $fixture->binding);
$deny(fn() => $broker->handle($authorization['credential'], $input));
[$fixture, $broker, $authorization, $input] = $create();
$fixture->registry->register('bob', $fixture->binding, $fixture->device, str_repeat('cd', 32), true);
$deny(fn() => $broker->handle($authorization['credential'], $input));
[$fixture, $broker, $authorization, $input] = $create();
$fixture->now += 86400;
$deny(fn() => $broker->handle($authorization['credential'], $input));
[$fixture, $broker, $authorization, $input] = $create();
$fixture->pdo->exec("INSERT INTO account_access_controls VALUES ('bob', 1, NULL, 2, '2026-11-16')");
$deny(fn() => $broker->handle($authorization['credential'], $input));
echo "Call recovery broker: {$checks} checks passed; isolated database, no APNs or live configuration.\n";
