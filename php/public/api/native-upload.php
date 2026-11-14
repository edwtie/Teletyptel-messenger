<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/NativeProfileService.php';
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
try {
    AccountAccess::guardSession(Database::connect(), $_SESSION);
    $accountId = (string)($_SESSION['teletyptel_account_id'] ?? '');
    if ($accountId === '' || ($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST'
        || !NativeProfileService::checkCsrf($_SESSION, (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) {
        http_response_code(403);
        echo json_encode(['ok' => false, 'error' => 'upload_not_authorized']);
        return;
    }
    $size = filter_var($_POST['totalSize'] ?? null, FILTER_VALIDATE_INT);
    $chunks = filter_var($_POST['totalChunks'] ?? null, FILTER_VALIDATE_INT);
    $index = filter_var($_POST['chunkIndex'] ?? null, FILTER_VALIDATE_INT);
    $uploadId = (string)($_POST['uploadId'] ?? '');
    $name = (string)($_POST['originalName'] ?? '');
    $extensions = ['jpg', 'jpeg', 'png', 'heic', 'pdf', 'doc', 'docx', 'txt'];
    if (!is_int($size) || $size < 1 || $size > 20971520 || !is_int($chunks) || $chunks !== (int)ceil($size / 262144)
        || !is_int($index) || $index < 0 || $index >= $chunks || !preg_match('/^[a-f0-9-]{36}$/iD', $uploadId)
        || !in_array(strtolower(pathinfo($name, PATHINFO_EXTENSION)), $extensions, true)
        || (int)($_FILES['file']['size'] ?? 0) !== min(262144, $size - $index * 262144)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_native_upload']);
        return;
    }
    $_POST['uploadId'] = hash_hmac('sha256', $accountId . ':' . $uploadId, (string)$_SESSION['teletyptel_native_csrf']);
    session_write_close();
    require __DIR__ . '/upload.php';
} catch (AccountAccessDenied $error) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'account_access_denied']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'upload_unavailable']);
}
