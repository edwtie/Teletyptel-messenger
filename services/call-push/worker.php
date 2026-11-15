<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__, 2) . '/php/lib/Database.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushService.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushPolicy.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushTransport.php';

try {
    $mode = $argv[1] ?? '';
    if (count($argv) !== 2 || !in_array($mode, ['--migrate', '--once'], true)) throw new RuntimeException('Use --migrate or --once');
    if (getenv('TELETYPTEL_CALL_PUSH_WORKER') !== '1') throw new RuntimeException('Disabled');
    $key = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
    $environment = (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT');
    $pdo = Database::connect();
    $policy = null;
    $signaling = null;
    if ($mode === '--once') {
        $policy = CallPushPolicy::load($pdo);
    }
    if (getenv('TELETYPTEL_CALL_PUSH_POLICY') === 'signaling-v1') {
        require_once dirname(__DIR__, 2) . '/php/lib/CallPushSignaling.php';
        $signaling = CallPushSignaling::configured($pdo);
    }
    $service = new CallPushService($pdo, $key === false ? '' : $key, $environment, $policy);
    if ($mode === '--migrate') {
        $service->ensureSchema();
        $signaling?->ensureSchema();
        echo "Call-push schema prepared. No pushes sent.\n";
    } else {
        $signaling?->enqueue($service);
        echo json_encode($service->dispatchOne([CallPushTransport::class, 'send'](...)), JSON_THROW_ON_ERROR) . "\n";
    }
} catch (Throwable $error) {
    fwrite(STDERR, "Call-push worker unavailable: verify opt-in, storage, schema and trusted signaling configuration.\n");
    exit(1);
}
