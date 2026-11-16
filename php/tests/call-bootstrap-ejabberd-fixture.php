<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/call-bootstrap-fixture.php';
try {
    $input = json_decode(stream_get_contents(STDIN, 4097), true, 8, JSON_THROW_ON_ERROR);
    $key = base64_decode($input['key'] ?? '', true);
    if ($key === false || strlen($key) !== 32) throw new RuntimeException('Invalid fixture key');
    $fixture = new BootstrapFixture(time(), $key, $input['profile'] ?? 'total');
    $issued = $fixture->issue(); $full = 'bob@example.test/' . $issued['claims']['resource'];
    $fixture->event(['type' => 'resource', 'jid' => $full, 'online' => true, 'revision' => 1, 'expiresAt' => $fixture->now + 25]);
    $fixture->event(['type' => 'handoff', 'callId' => $fixture->call['callId'], 'sid' => $fixture->call['sid'], 'jid' => $full,
        'deviceId' => $fixture->device, 'generation' => $fixture->registration['generation'], 'revision' => 1, 'expiresAt' => $fixture->now + 15]);
    $fixture->registry->acceptVerified('bob', $fixture->binding, $fixture->call['callId'], $fixture->device, $fixture->registration['generation'], $full);
    $issued['answerAuthorization'] = $fixture->issuer->answerPermit('bob', $fixture->binding, $fixture->device,
        $fixture->registration['generation'], $fixture->call['callId'], $full);
    echo json_encode($issued, JSON_THROW_ON_ERROR);
} catch (Throwable $error) { fwrite(STDERR, "Isolated bootstrap fixture failed\n"); exit(1); }
