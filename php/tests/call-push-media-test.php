<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushService.php';

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT)');
$pdo->exec("INSERT INTO account_profiles VALUES ('alice', 'alice@example.test'), ('bob', 'bob@example.test')");
AccountAccess::ensureSchema($pdo);
$checks = 0;
$check = function (bool $condition, string $label) use (&$checks): void {
    if (!$condition) throw new RuntimeException($label);
    $checks++;
};
$denied = function (Closure $operation, string $label) use ($check): void {
    try { $operation(); }
    catch (CallPushFailure $error) { $check(true, $label); return; }
    throw new RuntimeException('Not denied: ' . $label);
};
$now = 1800000000;
$seen = [];
$service = new CallPushService($pdo, random_bytes(32), 'production',
    function (array $call, string $operation) use (&$seen): bool {
        $seen[$operation] = $call['media_profile'] ?? null;
        return true;
    }, function () use (&$now): int { return $now; });
$service->ensureSchema();
$pdo->exec('ALTER TABLE call_push_calls DROP COLUMN media_profile');
$service->ensureSchema();
$service->ensureSchema();
$check(in_array('media_profile', array_column($pdo->query('PRAGMA table_info(call_push_calls)')->fetchAll(PDO::FETCH_ASSOC), 'name'), true), 'explicit legacy schema migration');
$device = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
$binding = str_repeat('1', 64);
$registration = $service->register('bob', $binding, $device, str_repeat('ab', 32), true);
foreach (['audio' => false, 'video' => true, 'audio-rtt' => false, 'total' => true] as $profile => $video) {
    $now += 61;
    $call = $service->inviteVerified('alice', 'bob', 'session-' . $profile, $video, 45, $profile);
    $check($call['mediaProfile'] === $profile && $call['hasVideo'] === $video, 'profile retained');
    $check($seen['invite'] === $profile, 'authoritative adapter sees profile');
    $check($service->callFor('bob', $call['callId'])['mediaProfile'] === $profile, 'authenticated lookup retains profile');
    $check($service->inviteVerified('alice', 'bob', 'session-' . $profile, $video, 45, $profile)['callId'] === $call['callId'], 'idempotent retry');
    $downgrade = $video ? ($profile === 'total' ? 'video' : 'total') : ($profile === 'audio-rtt' ? 'audio' : 'audio-rtt');
    $denied(fn() => $service->inviteVerified('alice', 'bob', 'session-' . $profile, $video, 45, $downgrade), 'same SID cannot change text profile');
    $service->dispatchOne(function (string $token, array $payload) use ($check, $profile): array {
        $check($payload['mediaProfile'] === $profile, 'outbox preserves media');
        return ['accepted' => true];
    });
    $accepted = $service->acceptVerified('bob', $binding, $call['callId'], $device, $registration['generation'], 'bob@example.test/new-resource');
    $check($accepted['mediaProfile'] === $profile, 'answer reservation retains profile');
}
foreach ([['total', false], ['audio-rtt', true], ['video', false], ['audio', true], ['rtt', false], ['unknown', false]] as [$profile, $video]) {
    $denied(fn() => $service->inviteVerified('alice', 'bob', 'invalid', $video, 45, $profile), 'invalid or inconsistent media');
}
$now += 61;
$legacy = $service->inviteVerified('alice', 'bob', 'legacy', true);
$check($legacy['mediaProfile'] === 'video', 'legacy boolean cannot promise TC');
$pdo->exec('UPDATE call_push_calls SET media_profile = NULL');
$denied(fn() => $service->callFor('bob', $legacy['callId']), 'unknown historical media not guessed');
$check($service->dispatchOne(fn() => throw new RuntimeException('Must not send legacy unknown media'))['state'] === 'idle', 'old queued job safely skipped');
echo "Call media: $checks checks passed.\n";
