<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli-server' || !getenv('TELETYPTEL_INTERPRETER_TEST_DB') || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) { http_response_code(404); exit; }
require_once dirname(__DIR__) . '/lib/InterpreterService.php';
$pdo = new PDO('sqlite:' . getenv('TELETYPTEL_INTERPRETER_TEST_DB'), null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE IF NOT EXISTS account_profiles (account_id TEXT PRIMARY KEY, jid TEXT, display_name TEXT)');
foreach (['alice', 'bob', 'tolk', 'stranger'] as $account) $pdo->prepare('INSERT OR IGNORE INTO account_profiles VALUES (?, ?, ?)')->execute([$account, $account . '@example.test', ucfirst($account) . ' (test)']);
AccountAccess::ensureSchema($pdo);
$service = new InterpreterService($pdo);
$service->ensureSchema();
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
session_start();
if ($path === '/fixture/login') {
    $account = $_GET['account'] ?? '';
    if (!in_array($account, ['alice', 'bob', 'tolk', 'stranger', 'admin', 'staff'], true)) { http_response_code(403); exit; }
    session_regenerate_id(true);
    $_SESSION = ['teletyptel_account_id' => $account, 'fixture_role' => $account];
    echo 'fixture';
    exit;
}
if ($path === '/api/interpreter.php' || $path === '/admin/interpreters-api.php') {
    header('Content-Type: application/json');
    header('Cache-Control: no-store');
    try {
        $method = $_SERVER['REQUEST_METHOD'];
        $admin = $path === '/admin/interpreters-api.php';
        if ($admin) {
            if (($_SESSION['fixture_role'] ?? '') !== 'admin') throw new InterpreterFailure('Alleen beheerder.', 403);
            if ($method === 'POST' && !hash_equals($_SESSION['teletyptel_interpreter_csrf'] ?? '-', $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) throw new InterpreterFailure('CSRF', 403);
        } else $account = InterpreterService::authorize($pdo, $_SESSION, $method, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
        $_SESSION['teletyptel_interpreter_csrf'] ??= bin2hex(random_bytes(32));
        $csrf = $_SESSION['teletyptel_interpreter_csrf'];
        session_write_close();
        $input = json_decode(file_get_contents('php://input') ?: '{}', true);
        if ($admin) {
            if ($method === 'POST') $service->administer('admin', $input['accountId'], $input['status']);
            $result = ['interpreters' => $service->adminList()];
        } elseif ($method === 'POST') $result = $service->action($account, $input);
        else $result = empty($_GET['room']) ? $service->dashboard($account) : $service->room($account, $_GET['room']);
        echo json_encode(['ok' => true, 'csrfToken' => $csrf] + $result);
    } catch (InterpreterFailure $error) {
        http_response_code($error->status);
        echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
    }
    exit;
}
if ($path === '/api/rtc-config.php') { header('Content-Type: application/json'); echo json_encode(['ok' => true, 'iceServers' => [], 'iceTransportPolicy' => 'all']); exit; }
$root = realpath(dirname(__DIR__) . '/public');
if ($path === '/tolk/') $path = '/tolk/index.php';
$file = realpath($root . $path);
if (!$file || !str_starts_with($file, $root . DIRECTORY_SEPARATOR) || !is_file($file)
    || !preg_match('~^/(tolk/|admin/interpreters\.|chat\.html$|chat-client\.css$|chat-interpreter\.js$)~', $path)) { http_response_code(404); exit; }
$extension = pathinfo($file, PATHINFO_EXTENSION);
if ($path === '/chat.html') {
    header('Content-Type: text/html');
    echo preg_replace('~<script\b[^>]*>[\s\S]*?</script>~', '', file_get_contents($file));
} elseif ($extension === 'php') {
    if (!in_array($path, ['/tolk/index.php', '/admin/interpreters.php'], true)) { http_response_code(404); exit; }
    require $file;
} elseif (in_array($extension, ['js', 'css'], true)) {
    header('Content-Type: ' . ($extension === 'js' ? 'text/javascript' : 'text/css'));
    readfile($file);
} else http_response_code(404);
