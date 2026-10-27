<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/SupportChatHttp.php';
try {
    SupportChatHttp::serve(Database::connect(), false);
} catch (Throwable $error) {
    http_response_code(503);
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'message' => 'De klantenservice-chat is tijdelijk niet bereikbaar.']);
}
