<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__, 2) . '/php/lib/Database.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushService.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushPolicy.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushTransport.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushActivation.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushLoop.php';

try {
    $mode = $argv[1] ?? '';
    if (count($argv) !== 2 || !in_array($mode, ['--migrate', '--once', '--run'], true)) throw new RuntimeException('Use --migrate, --once or --run');
    if (getenv('TELETYPTEL_CALL_PUSH_WORKER') !== '1') throw new RuntimeException('Disabled');
    $key = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
    $environment = (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT');
    $pdo = Database::connect();
    $policy = null;
    $signaling = null;
    if ($mode !== '--migrate') {
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
        $iteration = static function () use ($pdo, $signaling, $service): void {
            if (getenv('TELETYPTEL_CALL_SCOPE_REVOCATION') === '1') CallScopeRevocation::configured($pdo)->drain();
            if ($signaling !== null && getenv('TELETYPTEL_CALL_SIGNALING_SPOOL') !== false) {
                require_once dirname(__DIR__, 2) . '/php/lib/CallPushSpool.php';
                (new CallPushSpool((string)getenv('TELETYPTEL_CALL_SIGNALING_SPOOL')))->drain($signaling);
            }
            CallPushActivation::refresh($pdo);
            $signaling?->enqueue($service);
            echo json_encode($service->dispatchOne([CallPushTransport::class, 'send'](...)), JSON_THROW_ON_ERROR) . "\n";
        };
        if ($mode === '--once') $iteration();
        else {
            $stopping = false;
            if (function_exists('pcntl_async_signals') && function_exists('pcntl_signal')) {
                pcntl_async_signals(true);
                $stop = static function () use (&$stopping): void { $stopping = true; };
                pcntl_signal(SIGTERM, $stop); pcntl_signal(SIGINT, $stop);
            }
            CallPushLoop::run($iteration, static function () use (&$stopping): bool { return $stopping; });
        }
    }
} catch (Throwable $error) {
    fwrite(STDERR, "Call-push worker unavailable: verify opt-in, storage, schema and trusted signaling configuration.\n");
    exit(1);
}
