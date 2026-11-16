<?php
declare(strict_types=1);
require_once __DIR__ . '/call-bootstrap-fixture.php';
require_once dirname(__DIR__) . '/lib/CallPushActivation.php';
$checks = 0;
$check = function (bool $value, string $label) use (&$checks): void { if (!$value) throw new RuntimeException($label); $checks++; };
$settings = ['TELETYPTEL_CALL_BACKGROUND_PILOT' => '1', 'TELETYPTEL_CALL_PUSH_WORKER' => '1',
    'TELETYPTEL_CALL_PUSH_REGISTRY' => '1', 'TELETYPTEL_CALL_SCOPE_REVOCATION' => '1', 'TELETYPTEL_CALL_RECOVERY_LAB' => '1',
    'TELETYPTEL_CALL_SIGNALING' => '1', 'TELETYPTEL_CALL_PUSH_POLICY' => 'signaling-v1', 'TELETYPTEL_CALL_PUSH_ENVIRONMENT' => 'production',
    'TELETYPTEL_CALL_BACKGROUND_PILOT_ACCOUNTS' => '["bob"]'];
$previous = [];
foreach ($settings as $name => $value) $previous[$name] = getenv($name);
try {
    foreach ($settings as $name => $value) putenv($name . '=' . $value);
    $fixture = new BootstrapFixture();
    $check(!CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now), 'Missing schema cannot advertise readiness');
    CallPushActivation::ensureSchema($fixture->pdo);
    $check(!CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now), 'Missing worker heartbeat cannot advertise readiness');
    $fixture->pdo->prepare('INSERT INTO call_push_worker_health VALUES (?, ?)')->execute(['production', $fixture->now]);
    $check(CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now), 'Current heartbeat and complete explicit pilot configuration');
    $check(CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now + 5), 'Finite worker freshness window');
    $check(!CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now + 6), 'Stopped worker removes readiness');
    $check(!CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now - 1), 'Future heartbeat rejected');
    $check(!CallPushActivation::ready($fixture->pdo, 'alice', $fixture->now), 'Unlisted account cannot opt in');
    foreach ($settings as $name => $value) {
        putenv($name . '=');
        $check(!CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now), 'Every explicit deployment gate is required');
        putenv($name . '=' . $value);
    }
    foreach (['true', '{"bob":true}', '["bob",1]', '[]'] as $raw) {
        putenv('TELETYPTEL_CALL_BACKGROUND_PILOT_ACCOUNTS=' . $raw);
        $check(!CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now), 'Malformed pilot scope rejected');
    }
    putenv('TELETYPTEL_CALL_BACKGROUND_PILOT_ACCOUNTS=["bob"]');
    $fixture->pdo->exec("INSERT INTO account_access_controls VALUES ('bob', 1, NULL, 2, '2026-11-16')");
    $check(!CallPushActivation::ready($fixture->pdo, 'bob', $fixture->now), 'Blocked account cannot enable background calling');
    echo "Call push activation: {$checks} checks passed; no real enrollment or APNs.\n";
} finally { foreach ($previous as $name => $value) putenv($value === false ? $name : $name . '=' . $value); }
