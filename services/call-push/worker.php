<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__, 2) . '/php/lib/Database.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushService.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushPolicy.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushTransport.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushActivation.php';

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
        if (getenv('TELETYPTEL_CALL_BACKGROUND_PILOT') === '1') {
            $verified = $policy;
            $policy = static fn(array $call, string $operation): bool => CallPushActivation::ready($pdo, (string)($call['recipient'] ?? ''))
                && $verified($call, $operation) === true;
        }
    }
    if (getenv('TELETYPTEL_CALL_PUSH_POLICY') === 'signaling-v1') {
        require_once dirname(__DIR__, 2) . '/php/lib/CallPushSignaling.php';
        $signaling = CallPushSignaling::configured($pdo);
    }
    $service = new CallPushService($pdo, $key === false ? '' : $key, $environment, $policy);
    if ($mode === '--migrate') {
        $service->ensureSchema();
        $signaling?->ensureSchema();
        CallPushActivation::ensureSchema($pdo);
        echo "Call-push schema prepared. No pushes sent.\n";
    } else {
        if (getenv('TELETYPTEL_CALL_SCOPE_REVOCATION') === '1') CallScopeRevocation::configured($pdo)->drain();
        if ($signaling !== null && getenv('TELETYPTEL_CALL_SIGNALING_SPOOL') !== false) {
            require_once dirname(__DIR__, 2) . '/php/lib/CallPushSpool.php';
            (new CallPushSpool((string)getenv('TELETYPTEL_CALL_SIGNALING_SPOOL')))->drain($signaling);
        }
        CallPushActivation::refresh($pdo);
        $signaling?->enqueue($service);
        echo json_encode($service->dispatchOne([CallPushTransport::class, 'send'](...)), JSON_THROW_ON_ERROR) . "\n";
    }
} catch (Throwable $error) {
    fwrite(STDERR, "Call-push worker unavailable: verify opt-in, storage, schema and trusted signaling configuration.\n");
    exit(1);
}
