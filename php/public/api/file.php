<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

try {
    $method = $_SERVER['REQUEST_METHOD'];
    if ($method !== 'GET' && $method !== 'HEAD') {
        http_response_code(405);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Method not allowed';
        return;
    }

    $fileId = strtolower(trim((string)($_GET['id'] ?? '')));
    if (!preg_match('/^[a-f0-9]{32}$/', $fileId)) {
        http_response_code(400);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Invalid file id';
        return;
    }

    $pdo = Database::connect();
    ensureUploadedFilesSchema($pdo);
    $statement = $pdo->prepare(
        'SELECT file_id, original_name, mime_type, file_size, content
         FROM uploaded_files
         WHERE file_id = :file_id
         LIMIT 1'
    );
    $statement->execute(['file_id' => $fileId]);
    $file = $statement->fetch();
    if (!$file) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'File not found';
        return;
    }

    $name = sanitizeDownloadName((string)$file['original_name']);
    $mime = sanitizeMime((string)$file['mime_type']);
    $download = ($_GET['download'] ?? '') === '1';

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . (int)$file['file_size']);
    header('Cache-Control: private, max-age=86400');
    header('X-Content-Type-Options: nosniff');
    header(
        'Content-Disposition: ' . ($download ? 'attachment' : 'inline')
        . '; filename="' . addcslashes($name, "\\\"") . '"'
    );
    if ($method === 'HEAD') {
        return;
    }
    echo $file['content'];
} catch (Throwable $error) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Server error';
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

function sanitizeDownloadName(string $name): string
{
    $base = basename(str_replace('\\', '/', $name));
    $base = preg_replace('/[^A-Za-z0-9._ -]/', '_', $base) ?: 'download.bin';
    $base = trim($base, " .\t\n\r\0\x0B");
    return $base !== '' ? substr($base, 0, 180) : 'download.bin';
}

function sanitizeMime(string $mime): string
{
    return preg_match('/^[A-Za-z0-9.+-]+\/[A-Za-z0-9.+-]+$/', $mime) === 1
        ? $mime
        : 'application/octet-stream';
}
