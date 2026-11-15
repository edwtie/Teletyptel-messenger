<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/AccountAccess.php';
require_once dirname(__DIR__, 2) . '/lib/NativeProfileService.php';
require_once dirname(__DIR__, 2) . '/lib/NativeAvatarService.php';
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    $account = $_SESSION['teletyptel_account_id'] ?? '';
    if (!is_string($account) || $account === '') { http_response_code(401); echo json_encode(['ok' => false, 'error' => 'not_authenticated']); return; }
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if (!in_array($method, ['GET', 'POST'], true)) { http_response_code(405); echo json_encode(['ok' => false, 'error' => 'method_not_allowed']); return; }
    if ($_GET !== []) throw new InvalidArgumentException('Unexpected query');
    if ($method === 'POST' && !NativeProfileService::checkCsrf($_SESSION, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        http_response_code(403); echo json_encode(['ok' => false, 'error' => 'csrf_failed']); return;
    }
    $pdo = Database::connect();
    AccountAccess::guardSession($pdo, $_SESSION);
    if ($method === 'GET') {
        $profile = NativeAvatarService::read($pdo, $account);
    } elseif ($method === 'POST') {
        $raw = file_get_contents('php://input', false, null, 0, 525313);
        $input = json_decode($raw ?: '', true);
        if (strlen($raw ?: '') > 525312 || !is_array($input)) throw new InvalidArgumentException('Invalid body');
        $profile = NativeAvatarService::update($pdo, $account, $input);
    } else { http_response_code(405); echo json_encode(['ok' => false, 'error' => 'method_not_allowed']); return; }
    echo json_encode(['ok' => true, 'accountId' => $account, 'profile' => $profile, 'csrfToken' => NativeProfileService::csrf($_SESSION)], JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (InvalidArgumentException $error) {
    http_response_code(400); echo json_encode(['ok' => false, 'error' => 'invalid_avatar']);
} catch (AccountAccessDenied $error) {
    http_response_code(403); echo json_encode(['ok' => false, 'error' => 'account_access_denied']);
} catch (Throwable $error) {
    http_response_code(500); echo json_encode(['ok' => false, 'error' => 'avatar_unavailable']);
}
