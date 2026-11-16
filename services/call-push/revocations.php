<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once dirname(__DIR__, 2) . '/php/lib/Database.php';
require_once dirname(__DIR__, 2) . '/php/lib/CallPushService.php';
try {
    if (count($argv) !== 2 || !in_array($argv[1], ['--migrate', '--once'], true)
        || getenv('TELETYPTEL_CALL_SCOPE_REVOCATION') !== '1') throw new RuntimeException('Disabled');
    $pdo = Database::connect();
    if ($argv[1] === '--migrate') {
        CallScopeRevocation::ensureSchema($pdo);
        echo "Call scope revocation schema prepared; no requests sent.\n";
    } else { echo json_encode(CallScopeRevocation::configured($pdo)->drain(), JSON_THROW_ON_ERROR) . "\n"; }
} catch (Throwable $error) {
    fwrite(STDERR, "Call scope revocation unavailable; check protected configuration, schema and verified TLS route.\n"); exit(1);
}
