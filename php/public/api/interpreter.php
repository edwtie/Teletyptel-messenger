<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/InterpreterService.php';
session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Strict']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) throw new InterpreterFailure('Methode niet toegestaan.', 405);
    $pdo = Database::connect();
    $account = InterpreterService::authorize($pdo, $_SESSION, $method, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
    $_SESSION['teletyptel_interpreter_csrf'] ??= bin2hex(random_bytes(32));
    $csrf = $_SESSION['teletyptel_interpreter_csrf'];
    session_write_close();
    $service = new InterpreterService($pdo);
    $service->ensureSchema();
    if ($method === 'POST') {
        $raw = file_get_contents('php://input', false, null, 0, 65537);
        if (strlen($raw) > 65536) throw new InterpreterFailure('Aanvraag te groot.', 413);
        $input = json_decode($raw, true);
        if (!is_array($input)) throw new InterpreterFailure('Ongeldige aanvraag.');
        $result = $service->action($account, $input);
    } else {
        $room = $_GET['room'] ?? '';
        if (!is_string($room) || strlen($room) > 64) throw new InterpreterFailure('Ongeldige sessie.');
        $result = $room !== '' ? $service->room($account, $room) : $service->dashboard($account);
    }
    echo json_encode(['ok' => true, 'csrfToken' => $csrf] + $result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
} catch (InterpreterFailure $error) {
    http_response_code($error->status);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
} catch (AccountAccessDenied $error) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Dit account heeft geen toegang.']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'De tolkdienst is tijdelijk niet beschikbaar.']);
}
