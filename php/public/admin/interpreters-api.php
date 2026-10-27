<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/AdminSession.php';
require_once dirname(__DIR__, 2) . '/lib/InterpreterService.php';
session_name('teletyptel_admin');
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Strict']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    $pdo = Database::connect();
    $admin = AdminSession::current($pdo, $_SESSION);
    if (!$admin || !in_array($admin['role'], ['owner', 'admin'], true)) throw new InterpreterFailure('Alleen een ingelogde beheerder mag tolken beheren.', 403);
    $_SESSION['teletyptel_interpreter_admin_csrf'] ??= bin2hex(random_bytes(32));
    $csrf = $_SESSION['teletyptel_interpreter_admin_csrf'];
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) throw new InterpreterFailure('Methode niet toegestaan.', 405);
    if ($method === 'POST' && !hash_equals($csrf, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) throw new InterpreterFailure('Ververs de beheerpagina.', 403);
    session_write_close();
    $service = new InterpreterService($pdo);
    $service->ensureSchema();
    if ($method === 'POST') {
        $input = json_decode(file_get_contents('php://input', false, null, 0, 4097) ?: '', true);
        if (!is_array($input) || !is_string($input['accountId'] ?? null) || !is_string($input['status'] ?? null)) throw new InterpreterFailure('Ongeldige aanvraag.');
        $service->administer($admin['admin_id'], $input['accountId'], $input['status']);
    }
    echo json_encode(['ok' => true, 'csrfToken' => $csrf, 'interpreters' => $service->adminList()], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
} catch (InterpreterFailure $error) {
    http_response_code($error->status);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Tolkbeheer is tijdelijk niet beschikbaar.']);
}
