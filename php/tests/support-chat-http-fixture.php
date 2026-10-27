<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli-server' || !getenv('TELETYPTEL_SUPPORT_TEST_DB') || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/SupportChatHttp.php';
require_once dirname(__DIR__) . '/lib/SupportCallHttp.php';
$pdo = new PDO('sqlite:' . getenv('TELETYPTEL_SUPPORT_TEST_DB'), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE IF NOT EXISTS admin_users (admin_id TEXT PRIMARY KEY, display_name TEXT, role TEXT, enabled INTEGER, session_version INTEGER)');
foreach (['staff1' => 'staff', 'staff2' => 'staff', 'owner' => 'owner'] as $identifier => $role) {
    $pdo->prepare('INSERT OR IGNORE INTO admin_users VALUES (?, ?, ?, 1, 1)')->execute([$identifier, ucfirst($identifier) . ' (test)', $role]);
}
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (in_array($path, ['/api/support-call.php', '/admin/support-call-api.php', '/api/support-call-interpreter.php'], true)) {
    SupportCallHttp::serve($pdo, $path === '/api/support-call.php' ? 'visitor' : ($path === '/admin/support-call-api.php' ? 'staff' : 'interpreter')); exit;
}
if ($path === '/api/rtc-config.php') { header('Content-Type: application/json'); echo json_encode(['ok' => true, 'iceServers' => [], 'iceTransportPolicy' => 'all']); exit; }
if ($path === '/fixture/interpreter') {
    (new SupportCallService($pdo))->ensureSchema();
    $pdo->exec('CREATE TABLE IF NOT EXISTS account_profiles (account_id TEXT PRIMARY KEY, display_name TEXT, jid TEXT)');
    $pdo->exec("INSERT OR IGNORE INTO account_profiles VALUES ('test-tolk', 'Gebarentolk (test)', 'tolk@example.test')");
    $pdo->prepare("INSERT OR IGNORE INTO interpreter_profiles VALUES ('test-tolk', 'enabled', 1, ?)")->execute([time()]);
    session_start(); session_regenerate_id(true); $_SESSION['teletyptel_account_id'] = 'test-tolk'; $_SESSION['teletyptel_access_version'] = 1;
    echo 'test interpreter'; exit;
}
if ($path === '/fixture/block-interpreter') { $pdo->exec("UPDATE interpreter_profiles SET status = 'blocked', available = 0 WHERE account_id = 'test-tolk'"); echo 'blocked'; exit; }
if ($path === '/api/interpreter.php') {
    header('Content-Type: application/json'); session_start();
    try {
        $method = $_SERVER['REQUEST_METHOD'];
        $account = InterpreterService::authorize($pdo, $_SESSION, $method, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
        $_SESSION['teletyptel_interpreter_csrf'] ??= bin2hex(random_bytes(32)); $csrf = $_SESSION['teletyptel_interpreter_csrf']; session_write_close();
        $service = new InterpreterService($pdo); $service->ensureSchema();
        $result = $method === 'POST' ? $service->action($account, json_decode(file_get_contents('php://input'), true)) : $service->dashboard($account);
        echo json_encode(['ok' => true, 'csrfToken' => $csrf] + $result);
    } catch (InterpreterFailure $error) { http_response_code($error->status); echo json_encode(['ok' => false, 'error' => $error->getMessage()]); }
    exit;
}
if (in_array($path, ['/api/support-chat.php', '/admin/support-chat-api.php'], true)) {
    $translator = new TranslationService($pdo, ['enabled' => true, 'apiKey' => 'fixture-only'], static function (array $input): array {
        return ['data' => ['translations' => [['translatedText' => '[' . $input['target'] . '] ' . $input['q'], 'detectedSourceLanguage' => 'en']]]];
    });
    SupportChatHttp::serve($pdo, $path === '/admin/support-chat-api.php', $translator); exit;
}
if ($path === '/fixture/block') {
    $pdo->exec("UPDATE admin_users SET enabled = 0, session_version = session_version + 1 WHERE admin_id = 'staff1'");
    echo 'blocked'; exit;
}
if ($path === '/admin/api.php') {
    header('Content-Type: application/json'); header('Cache-Control: no-store');
    session_name('teletyptel_admin'); session_start();
    $_SESSION['fixture_csrf'] ??= bin2hex(random_bytes(32));
    $body = json_decode(file_get_contents('php://input') ?: '{}', true);
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals($_SESSION['fixture_csrf'], $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) { http_response_code(403); echo json_encode(['ok' => false]); exit; }
        if (($body['action'] ?? '') === 'login') {
            $identifier = explode('@', $body['email'] ?? '')[0];
            if (!in_array($identifier, ['staff1', 'staff2', 'owner'], true) || ($body['password'] ?? '') !== 'fixture-password-only') { http_response_code(403); echo json_encode(['ok' => false]); exit; }
            session_regenerate_id(true);
            $_SESSION['teletyptel_admin_id'] = $identifier; $_SESSION['teletyptel_admin_session_version'] = 1; $_SESSION['teletyptel_admin_last_activity'] = time();
        } elseif (($body['action'] ?? '') === 'logout') {
            $_SESSION = ['fixture_csrf' => bin2hex(random_bytes(32))]; session_regenerate_id(true);
        } else { http_response_code(403); echo json_encode(['ok' => false]); exit; }
    }
    $admin = AdminSession::current($pdo, $_SESSION);
    echo json_encode(['ok' => true, 'csrfToken' => $_SESSION['fixture_csrf'], 'admin' => $admin ? ['adminId' => $admin['admin_id'], 'role' => $admin['role'], 'displayName' => $admin['display_name']] : null]); exit;
}
$root = realpath(dirname(__DIR__) . '/public');
if ($path === '/') $path = '/index.php';
if ($path === '/tolk/') $path = '/tolk/index.php';
$file = realpath($root . $path);
if (!$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)
    || !preg_match('~^/(index\.php|demo\.html|site\.css|support-(chat|call|translation|language|attachments)\.(js|css)|admin/support-chat\.(php|css|js)|tolk/|aanmelden/intake(-ui\.js|\.css)|assets/|favicon\.ico|manifest\.webmanifest)~', $path)) { http_response_code(404); exit; }
$extension = pathinfo($file, PATHINFO_EXTENSION);
if ($extension === 'php') {
    if (!in_array($path, ['/index.php', '/admin/support-chat.php', '/tolk/index.php', '/tolk/support.php'], true)) { http_response_code(404); exit; }
    require $file;
} else {
    $mime = ['js' => 'text/javascript', 'css' => 'text/css', 'svg' => 'image/svg+xml', 'png' => 'image/png', 'ico' => 'image/x-icon', 'webmanifest' => 'application/manifest+json', 'html' => 'text/html'];
    if (!isset($mime[$extension])) { http_response_code(404); exit; }
    header('Content-Type: ' . $mime[$extension]); readfile($file);
}
