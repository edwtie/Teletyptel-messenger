<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

const MAX_UPLOAD_BYTES = 10_485_760;

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
        return;
    }

    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_file']);
        return;
    }

    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'upload_failed', 'code' => $file['error'] ?? null]);
        return;
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > MAX_UPLOAD_BYTES) {
        http_response_code(413);
        echo json_encode(['ok' => false, 'error' => 'file_too_large', 'maxBytes' => MAX_UPLOAD_BYTES]);
        return;
    }

    $tmpName = (string)($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        throw new RuntimeException('Uploaded temporary file is not available.');
    }

    $originalName = sanitizeFileName((string)($file['name'] ?? 'upload.bin'));
    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $fileId = bin2hex(random_bytes(16));
    $storedName = $fileId . ($extension !== '' ? '.' . $extension : '');
    $mime = detectMime($tmpName, (string)($file['type'] ?? ''));
    $content = file_get_contents($tmpName);
    if ($content === false) {
        throw new RuntimeException('Cannot read uploaded file.');
    }

    $pdo = Database::connect();
    ensureUploadedFilesSchema($pdo);
    $statement = $pdo->prepare(
        'INSERT INTO uploaded_files (
            file_id, uploader_account_id, original_name, stored_name, mime_type, file_size, content
        ) VALUES (
            :file_id, :uploader_account_id, :original_name, :stored_name, :mime_type, :file_size, :content
        )'
    );
    $statement->bindValue('file_id', $fileId);
    $statement->bindValue('uploader_account_id', currentAccountId());
    $statement->bindValue('original_name', $originalName);
    $statement->bindValue('stored_name', $storedName);
    $statement->bindValue('mime_type', $mime);
    $statement->bindValue('file_size', $size, PDO::PARAM_INT);
    $statement->bindValue('content', $content, PDO::PARAM_LOB);
    $statement->execute();

    echo json_encode([
        'ok' => true,
        'file' => [
            'id' => $fileId,
            'name' => $originalName,
            'storedName' => $storedName,
            'url' => 'api/file.php?id=' . rawurlencode($fileId),
            'downloadUrl' => 'api/file.php?id=' . rawurlencode($fileId) . '&download=1',
            'size' => $size,
            'type' => $mime,
            'storage' => 'database',
            'uploadedAt' => gmdate('c'),
        ],
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()]);
}

function ensureUploadedFilesSchema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS uploaded_files (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            file_id CHAR(32) NOT NULL,
            uploader_account_id VARCHAR(96) NOT NULL DEFAULT "",
            original_name VARCHAR(180) NOT NULL,
            stored_name VARCHAR(220) NOT NULL,
            mime_type VARCHAR(120) NOT NULL DEFAULT "application/octet-stream",
            file_size INT UNSIGNED NOT NULL,
            content LONGBLOB NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_uploaded_files_file_id (file_id),
            KEY idx_uploaded_files_uploader_created (uploader_account_id, created_at)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
}

function currentAccountId(): string
{
    $value = $_SESSION['teletyptel_account_id'] ?? '';
    return is_string($value) ? substr($value, 0, 96) : '';
}

function sanitizeFileName(string $name): string
{
    $base = basename(str_replace('\\', '/', $name));
    $base = preg_replace('/[^A-Za-z0-9._ -]/', '_', $base) ?: 'upload.bin';
    $base = trim($base, " .\t\n\r\0\x0B");
    return $base !== '' ? substr($base, 0, 180) : 'upload.bin';
}

function detectMime(string $path, string $fallback): string
{
    if (function_exists('finfo_open')) {
        $info = finfo_open(FILEINFO_MIME_TYPE);
        if ($info !== false) {
            $mime = finfo_file($info, $path);
            if (is_string($mime) && $mime !== '') {
                return $mime;
            }
        }
    }

    return $fallback !== '' ? $fallback : 'application/octet-stream';
}
