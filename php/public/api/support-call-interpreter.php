<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/SupportCallHttp.php';
try { SupportCallHttp::serve(Database::connect(), 'interpreter'); }
catch (Throwable $error) {
    http_response_code(503); header('Content-Type: application/json'); header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'message' => 'Oproepen zijn tijdelijk niet bereikbaar.']);
}
