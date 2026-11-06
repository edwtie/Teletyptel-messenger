<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushService.php';
$input = json_decode(stream_get_contents(STDIN), true, 512, JSON_THROW_ON_ERROR);
$pdo = new PDO('sqlite:' . $input['database'], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('PRAGMA busy_timeout = 5000');
$service = new CallPushService($pdo, base64_decode($input['key'], true), 'production', static fn() => true, static fn() => $input['now']);
try {
    $result = $service->acceptVerified('bob', $input['binding'], $input['callId'], $input['deviceId'], $input['generation'], 'bob@example.test/new-resource');
    echo $result['state'];
} catch (CallPushFailure $error) {
    if ($error->status !== 409) throw $error;
    echo 'lost';
}
