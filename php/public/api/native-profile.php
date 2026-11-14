<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/NativeProfileService.php';
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
try {
    $pdo = Database::connect();
    AccountAccess::guardSession($pdo, $_SESSION);
    $accountId = (string)($_SESSION['teletyptel_account_id'] ?? '');
    if ($accountId === '') {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    if ($method === 'GET') {
        $profile = NativeProfileService::read($pdo, $accountId);
    } elseif ($method === 'POST') {
        if (!NativeProfileService::checkCsrf($_SESSION, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'csrf_failed']);
            return;
        }
        $body = file_get_contents('php://input', false, null, 0, 8193);
        $input = json_decode($body ?: '', true);
        if (strlen($body ?: '') > 8192 || !is_array($input)) {
            throw new InvalidArgumentException('Invalid input');
        }
        $profile = NativeProfileService::update($pdo, $accountId, $input);
    } else {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
        return;
    }
    echo json_encode(['ok' => true, 'profile' => $profile, 'csrfToken' => NativeProfileService::csrf($_SESSION)], JSON_UNESCAPED_SLASHES);
} catch (InvalidArgumentException $error) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'invalid_profile']);
} catch (AccountAccessDenied $error) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'account_access_denied']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'profile_unavailable']);
}
