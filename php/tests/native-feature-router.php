<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli-server' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('RUNNER_ENVIRONMENT') !== 'github-hosted'
    || getenv('TELETYPTEL_DB_NAME') !== 'native_feature_test' || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
    http_response_code(404);
    exit;
}
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/__fixture/session' || $path === '/__fixture/block') {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || !hash_equals((string)getenv('TELETYPTEL_NATIVE_FIXTURE_TOKEN'), (string)($_SERVER['HTTP_X_FIXTURE_TOKEN'] ?? ''))) {
        http_response_code(403);
        exit;
    }
    if ($path === '/__fixture/block') {
        require_once dirname(__DIR__) . '/lib/Database.php';
        Database::connect()->exec("UPDATE account_access_controls SET web_blocked=1, version=2 WHERE account_id='fiction-one'");
        echo json_encode(['ok' => true]);
        exit;
    }
    $user = file_get_contents('php://input');
    if (!in_array($user, ['fiction-one', 'fiction-two'], true)) { http_response_code(400); exit; }
    session_start();
    session_regenerate_id(true);
    $_SESSION = ['teletyptel_account_id' => $user, 'teletyptel_access_version' => 1];
    echo json_encode(['ok' => true]);
    exit;
}
if (in_array($path, ['/api/native-profile.php', '/api/native-upload.php', '/api/file.php'], true)) {
    require dirname(__DIR__) . '/public' . $path;
    exit;
}
http_response_code(404);
