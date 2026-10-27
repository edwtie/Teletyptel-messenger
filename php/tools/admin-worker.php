<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once dirname(__DIR__) . '/lib/Database.php';
require_once dirname(__DIR__) . '/lib/BillingManager.php';
require_once dirname(__DIR__) . '/lib/IntakeManager.php';
require_once dirname(__DIR__) . '/lib/SupportChatService.php';
require_once dirname(__DIR__) . '/lib/SupportCallService.php';
require_once dirname(__DIR__) . '/lib/SupportTranslationService.php';

$directory = dirname(__DIR__) . '/storage';
if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
    throw new RuntimeException('Worker storage unavailable.');
}
$lock = fopen($directory . '/admin-worker.lock', 'c+');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) {
    exit(0);
}
$status = ['lastRun' => gmdate('c'), 'ok' => false];
$exitCode = 0;
try {
    $pdo = Database::connect();
    $subscriptions = new SubscriptionManager($pdo);
    $subscriptions->ensureSchema();
    $billing = new BillingManager($pdo);
    $billing->ensureSchema();
    $status['subscriptions'] = $subscriptions->processDue();
    $status['billing'] = $billing->processRecurring();
    $intake = new IntakeManager($pdo);
    $intake->ensureSchema();
    $status['intakePurged'] = $intake->purgeExpired();
    $support = new SupportChatService($pdo);
    $support->ensureSchema();
    $status['supportChat'] = $support->cleanup();
    (new SupportTranslationService($pdo, new TranslationService($pdo, [])))->ensureSchema();
    $supportCalls = new SupportCallService($pdo);
    $supportCalls->ensureSchema();
    $supportCalls->cleanup();
    $status['ok'] = true;
    echo json_encode($status, JSON_THROW_ON_ERROR) . PHP_EOL;
} catch (Throwable $error) {
    fwrite(STDERR, 'TeleTypTel worker failed. Check database connectivity and server configuration.' . PHP_EOL);
    $exitCode = 1;
} finally {
    $temporary = $directory . '/admin-worker-' . bin2hex(random_bytes(8)) . '.json';
    if (file_put_contents($temporary, json_encode($status, JSON_THROW_ON_ERROR)) !== false) {
        rename($temporary, $directory . '/admin-worker.json');
    }
    flock($lock, LOCK_UN);
    fclose($lock);
}
exit($exitCode);
