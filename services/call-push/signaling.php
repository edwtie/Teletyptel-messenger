<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__, 2) . '/php/lib/Database.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushSignaling.php';

try {
    $mode = $argv[1] ?? '';
    if (count($argv) !== 2 || !in_array($mode, ['--migrate', '--ingest', '--enqueue'], true)) throw new RuntimeException('Invalid command');
    if (getenv('TELETYPTEL_CALL_SIGNALING') !== '1') throw new RuntimeException('Disabled');
    $pdo = Database::connect();
    $signaling = CallPushSignaling::configured($pdo);
    $key = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
    $service = new CallPushService($pdo, $key === false ? '' : $key,
        (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT'), $signaling->allows(...));
    if ($mode === '--migrate') {
        $service->ensureSchema(); $signaling->ensureSchema();
        echo "Call signaling schema prepared. No pushes sent.\n";
    } else {
        if ($mode === '--ingest') {
            $input = stream_get_contents(STDIN, 16385);
            if (!is_string($input)) throw new RuntimeException('Missing input');
            $result = $signaling->ingest($input);
        } else { $result = []; }
        echo json_encode($result + $signaling->enqueue($service), JSON_THROW_ON_ERROR) . "\n";
    }
} catch (Throwable $error) {
    fwrite(STDERR, "Call signaling unavailable: verify opt-in, schema and trusted producer configuration.\n");
    exit(1);
}
