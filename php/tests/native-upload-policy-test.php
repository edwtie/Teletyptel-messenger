<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/NativeUploadPolicy.php';
$path = tempnam(sys_get_temp_dir(), 'teletyptel-native-test-');
try {
    file_put_contents($path, 'Fictieve gewone tekst');
    NativeUploadPolicy::validate($path, 'test.txt', 'text/plain');
    foreach ([['test.pdf', 'text/html'], ['test.txt', 'text/html'], ['test.php', 'text/plain'], ['test.jpg', 'text/plain']] as [$name, $mime]) {
        try { NativeUploadPolicy::validate($path, $name, $mime); throw new RuntimeException('Unsafe type accepted'); } catch (InvalidArgumentException $expected) {}
    }
    $archive = new ZipArchive();
    $archive->open($path, ZipArchive::OVERWRITE);
    $archive->addFromString('[Content_Types].xml', '<Types/>');
    $archive->addFromString('word/document.xml', '<document/>');
    $archive->close();
    NativeUploadPolicy::validate($path, 'test.docx', 'application/zip');
    $archive->open($path);
    $archive->addFromString('word/vbaProject.bin', 'fictional');
    $archive->close();
    try { NativeUploadPolicy::validate($path, 'test.docx', 'application/zip'); throw new RuntimeException('Macro document accepted'); } catch (InvalidArgumentException $expected) {}
    echo "Native upload MIME, active-content and bounded document policy passed\n";
} finally {
    if (is_file($path)) { unlink($path); }
}
