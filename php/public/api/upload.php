<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

const MAX_UPLOAD_BYTES = 104_857_600;

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
        $contentLength = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
        $postMaxBytes = iniBytes((string)ini_get('post_max_size'));
        $tooLarge = $contentLength > 0 && $postMaxBytes > 0 && $contentLength > $postMaxBytes;
        http_response_code($tooLarge ? 413 : 400);
        echo json_encode([
            'ok' => false,
            'error' => $tooLarge ? 'post_too_large' : 'missing_file',
            'maxBytes' => $tooLarge ? $postMaxBytes : null,
        ]);
        return;
    }

    if (isset($_POST['uploadId'], $_POST['chunkIndex'], $_POST['totalChunks'], $_POST['originalName'], $_POST['totalSize'])) {
        handleChunkUpload($_FILES['file']);
        return;
    }

    $file = $_FILES['file'];
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        $limit = uploadErrorLimitBytes($code);
        http_response_code(in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 413 : 400);
        echo json_encode([
            'ok' => false,
            'error' => uploadErrorName($code),
            'code' => $code,
            'maxBytes' => $limit,
        ]);
        return;
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > MAX_UPLOAD_BYTES) {
        http_response_code(413);
        echo json_encode(['ok' => false, 'error' => 'file_too_large', 'maxBytes' => MAX_UPLOAD_BYTES]);
        return;
    }

    $originalName = sanitizeFileName((string)($file['name'] ?? 'upload.bin'));
    echo json_encode(['ok' => true, 'file' => persistUploadedFile((string)$file['tmp_name'], $originalName, (string)($file['type'] ?? ''), $size)], JSON_UNESCAPED_SLASHES);
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
                if ($mime === 'application/octet-stream' && $fallback !== '') {
                    return $fallback;
                }
                return $mime;
            }
        }
    }

    return $fallback !== '' ? $fallback : 'application/octet-stream';
}

function handleChunkUpload(array $file): void
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        $code = (int)($file['error'] ?? UPLOAD_ERR_NO_FILE);
        http_response_code(in_array($code, [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) ? 413 : 400);
        echo json_encode(['ok' => false, 'error' => uploadErrorName($code), 'code' => $code, 'maxBytes' => uploadErrorLimitBytes($code)]);
        return;
    }

    $uploadId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$_POST['uploadId']);
    $chunkIndex = filter_var($_POST['chunkIndex'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
    $totalChunks = filter_var($_POST['totalChunks'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 512]]);
    $totalSize = filter_var($_POST['totalSize'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => MAX_UPLOAD_BYTES]]);
    if ($uploadId === '' || !is_int($chunkIndex) || !is_int($totalChunks) || !is_int($totalSize) || $chunkIndex >= $totalChunks) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_chunk_upload']);
        return;
    }

    $chunkSize = (int)($file['size'] ?? 0);
    if ($chunkSize <= 0 || $chunkSize > 1_572_864) {
        http_response_code(413);
        echo json_encode(['ok' => false, 'error' => 'chunk_too_large', 'maxBytes' => 1_572_864]);
        return;
    }

    $chunkDir = chunkUploadDir($uploadId);
    if (!is_dir($chunkDir) && !mkdir($chunkDir, 0775, true) && !is_dir($chunkDir)) {
        throw new RuntimeException('Cannot create upload chunk directory.');
    }

    $partPath = $chunkDir . DIRECTORY_SEPARATOR . sprintf('%05d.part', $chunkIndex);
    if (!move_uploaded_file((string)$file['tmp_name'], $partPath)) {
        throw new RuntimeException('Cannot store upload chunk.');
    }

    $received = count(glob($chunkDir . DIRECTORY_SEPARATOR . '*.part') ?: []);
    if ($received < $totalChunks) {
        echo json_encode(['ok' => true, 'done' => false, 'receivedChunks' => $received, 'totalChunks' => $totalChunks]);
        return;
    }

    $assembledPath = $chunkDir . DIRECTORY_SEPARATOR . 'assembled.upload';
    $out = fopen($assembledPath, 'wb');
    if ($out === false) {
        throw new RuntimeException('Cannot assemble upload.');
    }

    for ($i = 0; $i < $totalChunks; $i++) {
        $part = $chunkDir . DIRECTORY_SEPARATOR . sprintf('%05d.part', $i);
        if (!is_file($part)) {
            fclose($out);
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'missing_upload_chunk']);
            return;
        }
        $in = fopen($part, 'rb');
        if ($in === false) {
            fclose($out);
            throw new RuntimeException('Cannot read upload chunk.');
        }
        stream_copy_to_stream($in, $out);
        fclose($in);
    }
    fclose($out);

    $actualSize = filesize($assembledPath);
    if ($actualSize !== $totalSize) {
        cleanupChunkDir($chunkDir);
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'assembled_upload_size_mismatch']);
        return;
    }

    $fileRecord = persistUploadedFile(
        $assembledPath,
        sanitizeFileName((string)$_POST['originalName']),
        (string)($_POST['mimeType'] ?? $file['type'] ?? ''),
        $actualSize
    );
    cleanupChunkDir($chunkDir);
    echo json_encode(['ok' => true, 'done' => true, 'file' => $fileRecord], JSON_UNESCAPED_SLASHES);
}

function persistUploadedFile(string $path, string $originalName, string $fallbackMime, int $size): array
{
    if ($path === '' || !is_file($path)) {
        throw new RuntimeException('Uploaded file is not available.');
    }

    if ($size <= 0 || $size > MAX_UPLOAD_BYTES) {
        http_response_code(413);
        throw new RuntimeException('file_too_large');
    }

    $extension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
    $fileId = bin2hex(random_bytes(16));
    $storedName = $fileId . ($extension !== '' ? '.' . $extension : '');
    $mime = detectMime($path, $fallbackMime);
    $content = file_get_contents($path);
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

    return [
        'id' => $fileId,
        'name' => $originalName,
        'storedName' => $storedName,
        'url' => 'api/file.php?id=' . rawurlencode($fileId),
        'downloadUrl' => 'api/file.php?id=' . rawurlencode($fileId) . '&download=1',
        'size' => $size,
        'type' => $mime,
        'storage' => 'database',
        'uploadedAt' => gmdate('c'),
    ];
}

function chunkUploadDir(string $uploadId): string
{
    return sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'teletyptel-upload-chunks' . DIRECTORY_SEPARATOR . $uploadId;
}

function cleanupChunkDir(string $dir): void
{
    foreach (glob($dir . DIRECTORY_SEPARATOR . '*') ?: [] as $file) {
        if (is_file($file)) {
            @unlink($file);
        }
    }
    @rmdir($dir);
}

function uploadErrorName(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE => 'file_exceeds_server_limit',
        UPLOAD_ERR_FORM_SIZE => 'file_exceeds_form_limit',
        UPLOAD_ERR_PARTIAL => 'upload_partial',
        UPLOAD_ERR_NO_FILE => 'missing_file',
        UPLOAD_ERR_NO_TMP_DIR => 'missing_temp_directory',
        UPLOAD_ERR_CANT_WRITE => 'cannot_write_upload',
        UPLOAD_ERR_EXTENSION => 'upload_blocked_by_extension',
        default => 'upload_failed',
    };
}

function uploadErrorLimitBytes(int $code): ?int
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE => iniBytes((string)ini_get('upload_max_filesize')),
        UPLOAD_ERR_FORM_SIZE => MAX_UPLOAD_BYTES,
        default => null,
    };
}

function iniBytes(string $value): int
{
    $value = trim($value);
    if ($value === '') {
        return 0;
    }

    $unit = strtolower($value[strlen($value) - 1]);
    $number = (float)$value;
    return match ($unit) {
        'g' => (int)($number * 1024 * 1024 * 1024),
        'm' => (int)($number * 1024 * 1024),
        'k' => (int)($number * 1024),
        default => (int)$number,
    };
}
