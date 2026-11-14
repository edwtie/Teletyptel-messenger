<?php
declare(strict_types=1);

final class NativeUploadPolicy
{
    public static function validate(string $path, string $name, string $mime): void
    {
        $types = ['jpg' => ['image/jpeg'], 'jpeg' => ['image/jpeg'], 'png' => ['image/png'],
            'heic' => ['image/heic', 'image/heif'], 'pdf' => ['application/pdf'],
            'doc' => ['application/msword', 'application/CDFV2', 'application/x-ole-storage'],
            'docx' => ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/zip'],
            'txt' => ['text/plain']];
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));
        if (!isset($types[$extension]) || !in_array($mime, $types[$extension], true)
            || !is_file($path) || filesize($path) < 1 || filesize($path) > 20971520) {
            throw new InvalidArgumentException('Unsupported native file content');
        }
        if ($extension === 'docx') {
            $archive = new ZipArchive();
            if ($archive->open($path) !== true) {
                throw new InvalidArgumentException('Invalid document');
            }
            try {
                $total = 0;
                if ($archive->numFiles > 2048 || $archive->locateName('[Content_Types].xml') === false || $archive->locateName('word/document.xml') === false) {
                    throw new InvalidArgumentException('Invalid document structure');
                }
                for ($index = 0; $index < $archive->numFiles; $index++) {
                    $entry = $archive->statIndex($index);
                    if (!$entry || str_contains(strtolower($entry['name']), 'vbaproject')) {
                        throw new InvalidArgumentException('Macro document not supported');
                    }
                    $total += (int)$entry['size'];
                    if ($total > 209715200) {
                        throw new InvalidArgumentException('Expanded document too large');
                    }
                }
            } finally {
                $archive->close();
            }
        }
    }
}
