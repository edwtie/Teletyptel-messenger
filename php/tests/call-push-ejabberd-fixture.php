<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/CallPushSpool.php';
require_once dirname(__DIR__) . '/lib/CallPushRecovery.php';

try {
    $configuration = json_decode(fgets(STDIN, 4096), true, 8, JSON_THROW_ON_ERROR);
    $key = base64_decode($configuration['key'], true);
    if ($key === false || strlen($key) !== 32) throw new RuntimeException('Invalid fixture');
    $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT)');
    foreach (['alice', 'bob', 'charlie'] as $name) $pdo->prepare('INSERT INTO account_profiles VALUES (?, ?)')->execute([$name, $name . '@example.test']);
    AccountAccess::ensureSchema($pdo);
    $signaling = new CallPushSignaling($pdo, $key, 'production', 'example.test', 'fixture');
    $service = new CallPushService($pdo, random_bytes(32), 'production', $signaling->allows(...));
    $service->ensureSchema(); $signaling->ensureSchema();
    $device = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    $binding = str_repeat('1', 64);
    $registration = $service->register('bob', $binding, $device, str_repeat('ab', 32), true);
    $broker = null; $authorization = null;
    if (isset($configuration['bootstrapKey'])) {
        $bootstrapKey = base64_decode($configuration['bootstrapKey'], true);
        if ($bootstrapKey === false || strlen($bootstrapKey) !== 32) throw new RuntimeException('Invalid bootstrap fixture');
        $issuer = new CallPushBootstrap($pdo, $signaling, $bootstrapKey, 'production', 'example.test', 'fixture');
        $issuer->ensureSchema();
        $broker = new CallPushRecovery($pdo, $service, $issuer, $signaling, $bootstrapKey, 'production', 'example.test', 'fixture');
        $authorization = $broker->enroll('bob', $binding, $device);
    }
    echo json_encode(['generation' => $registration['generation']], JSON_THROW_ON_ERROR) . "\n";
    while (($line = fgets(STDIN, 2097152)) !== false) {
        $input = json_decode($line, true, 16, JSON_THROW_ON_ERROR);
        try {
            if ($input['action'] === 'ingest') {
                foreach ($input['envelopes'] as $envelope) $signaling->ingest(json_encode($envelope, JSON_THROW_ON_ERROR));
                $signaling->enqueue($service);
                $query = $pdo->query('SELECT call_id AS callId, sid, state FROM call_push_calls');
                $result = ['calls' => $query->fetchAll(PDO::FETCH_ASSOC)];
            } elseif ($input['action'] === 'dispatch') {
                $payload = null;
                $service->dispatchOne(static function (string $token, array $call) use (&$payload): array {
                    $payload = $call;
                    return ['accepted' => true];
                });
                $result = ['payload' => $payload];
            } elseif ($input['action'] === 'accept') {
                $result = $signaling->accept($service, 'bob', $binding, ['action' => 'accept', 'callId' => $input['callId'],
                    'deviceId' => $device, 'generation' => $registration['generation'], 'fullJid' => $input['jid']]);
            } elseif ($input['action'] === 'recovery' && $broker !== null) {
                $call = $pdo->prepare('SELECT sid, media_profile FROM call_push_calls WHERE call_id = ?');
                $call->execute([$input['callId']]); $row = $call->fetch(PDO::FETCH_ASSOC);
                if (!$row) throw new CallPushFailure('Unknown fixture call');
                $body = ['action' => $input['operation'], 'callId' => $input['callId'], 'sid' => $row['sid'], 'mediaProfile' => $row['media_profile'],
                    'deviceId' => $device, 'generation' => $registration['generation']];
                if (isset($input['jid'])) $body['fullJid'] = $input['jid'];
                $result = $broker->handle($authorization['credential'], $body);
            } elseif ($input['action'] === 'revoke') {
                $service->revokeSession('bob', $binding); $result = ['revoked' => true];
            } elseif ($input['action'] === 'spool') {
                $directory = sys_get_temp_dir() . '/tc-signaling-spool-' . bin2hex(random_bytes(12));
                mkdir($directory, 0700);
                try {
                    foreach ($input['envelopes'] as $index => $envelope) {
                        $name = $directory . '/' . sprintf('%020d', $index) . '_' . bin2hex(random_bytes(16)) . '.json';
                        file_put_contents($name, json_encode($envelope, JSON_THROW_ON_ERROR)); chmod($name, 0600);
                    }
                    $result = (new CallPushSpool($directory))->drain($signaling);
                } finally {
                    foreach (scandir($directory) as $name) if ($name !== '.' && $name !== '..') unlink($directory . '/' . $name);
                    rmdir($directory);
                }
            } else { throw new RuntimeException('Invalid fixture action'); }
            echo json_encode(['ok' => true, 'result' => $result], JSON_THROW_ON_ERROR) . "\n";
        } catch (CallPushFailure $error) { echo json_encode(['ok' => false, 'status' => $error->status], JSON_THROW_ON_ERROR) . "\n"; }
    }
} catch (Throwable $error) { fwrite(STDERR, "Isolated call fixture failed.\n"); exit(1); }
