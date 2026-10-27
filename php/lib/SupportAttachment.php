<?php
declare(strict_types=1);

require_once __DIR__ . '/SupportChatService.php';

final class SupportAttachment
{
    public const MAX_BYTES = 5 * 1024 * 1024;

    public static function upload(array $file): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) throw new SupportChatFailure('Upload mislukt of bestand te groot / Upload failed or file too large.', 413);
        if (!is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name']) || !is_string($file['name'] ?? null)) throw new SupportChatFailure('Ongeldig bestand / Invalid file.');
        $size = filesize($file['tmp_name']);
        if (!$size || $size > self::MAX_BYTES) throw new SupportChatFailure('Maximaal 5 MB per bestand / Maximum 5 MB per file.', 413);
        $orientation = 1;
        if (function_exists('exif_read_data') && in_array(strtolower(pathinfo($file['name'], PATHINFO_EXTENSION)), ['jpg', 'jpeg'], true)) $orientation = (int)(@exif_read_data($file['tmp_name'])['Orientation'] ?? 1);
        return self::validate($file['name'], (string)file_get_contents($file['tmp_name']), $orientation);
    }

    public static function validate(string $name, string $bytes, int $orientation = 1): array
    {
        if ($bytes === '' || strlen($bytes) > self::MAX_BYTES) throw new SupportChatFailure('Maximaal 5 MB per bestand / Maximum 5 MB per file.', 413);
        $name = basename(str_replace('\\', '/', $name));
        $name = preg_replace('/[^\p{L}\p{N} ._()-]/u', '_', $name) ?: 'bestand';
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        $name = mb_substr(pathinfo($name, PATHINFO_FILENAME), 0, 100) . '.' . $extension;
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        $allowed = ['pdf' => ['application/pdf'], 'doc' => ['application/msword', 'application/x-ole-storage', 'application/CDFV2'],
            'docx' => ['application/zip', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            'jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'], 'webp' => ['image/webp']];
        if (!isset($allowed[$extension]) || !in_array($mime, $allowed[$extension], true)) throw new SupportChatFailure('Kies PDF, DOC, DOCX, JPG, PNG of WebP / Choose PDF, DOC, DOCX, JPG, PNG or WebP.');
        if ($extension === 'pdf' && !str_starts_with($bytes, '%PDF-')) throw new SupportChatFailure('Ongeldige PDF / Invalid PDF.');
        if ($extension === 'doc' && (!str_starts_with($bytes, "\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1") || !str_contains($bytes, "W\0o\0r\0d\0D\0o\0c\0u\0m\0e\0n\0t\0"))) throw new SupportChatFailure('Ongeldig Word-bestand / Invalid Word file.');
        if ($extension === 'docx') {
            $temporary = tempnam(sys_get_temp_dir(), 'ttt-docx-');
            if ($temporary === false) throw new SupportChatFailure('Upload niet beschikbaar / Upload unavailable.', 503);
            $zip = new ZipArchive(); $opened = false;
            try {
                file_put_contents($temporary, $bytes);
                $opened = $zip->open($temporary) === true;
                if (!$opened || $zip->numFiles > 500 || $zip->locateName('[Content_Types].xml') === false || $zip->locateName('word/document.xml') === false) throw new SupportChatFailure('Ongeldig Word-bestand / Invalid Word file.');
                $expanded = 0;
                for ($index = 0; $index < $zip->numFiles; $index++) {
                    $entry = $zip->statIndex($index);
                    $expanded += $entry['size'];
                    if ($expanded > 20 * 1024 * 1024 || preg_match('~(^/|\.\.|\\\\|vbaProject|embeddings/|\.exe$)~i', $entry['name'])) throw new SupportChatFailure('Dit Word-bestand is niet toegestaan / This Word file is not allowed.');
                }
            } finally {
                if ($opened) $zip->close();
                unlink($temporary);
            }
            $mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        } elseif ($extension === 'doc') $mime = 'application/msword';
        if (str_starts_with($mime, 'image/')) {
            $info = @getimagesizefromstring($bytes);
            if (!$info || $info[0] * $info[1] > 16000000) throw new SupportChatFailure('Foto te groot of ongeldig / Photo too large or invalid.');
            $photo = @imagecreatefromstring($bytes);
            if (!$photo) throw new SupportChatFailure('Ongeldige foto / Invalid photo.');
            try {
                if (in_array($orientation, [2, 5, 7], true)) imageflip($photo, IMG_FLIP_HORIZONTAL);
                if ($orientation === 4) imageflip($photo, IMG_FLIP_VERTICAL);
                $angle = [3 => 180, 5 => 90, 6 => -90, 7 => -90, 8 => 90][$orientation] ?? 0;
                if ($angle) {
                    $rotated = imagerotate($photo, $angle, 0);
                    if (!$rotated) throw new SupportChatFailure('Ongeldige foto / Invalid photo.');
                    imagedestroy($photo); $photo = $rotated;
                }
                imagesavealpha($photo, true);
                ob_start();
                try {
                    $saved = $mime === 'image/jpeg' ? imagejpeg($photo, null, 90) : ($mime === 'image/png' ? imagepng($photo) : imagewebp($photo, null, 90));
                    $bytes = (string)ob_get_contents();
                } finally { ob_end_clean(); }
                if (!$saved || $bytes === '' || strlen($bytes) > self::MAX_BYTES) throw new SupportChatFailure('Foto te groot / Photo too large.', 413);
            } finally { imagedestroy($photo); }
        }
        return ['id' => bin2hex(random_bytes(24)), 'name' => $name, 'mime' => $mime, 'size' => strlen($bytes), 'content' => base64_encode($bytes)];
    }
}
