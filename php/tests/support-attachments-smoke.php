<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/SupportAttachment.php';
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE admin_users (admin_id TEXT PRIMARY KEY, display_name TEXT, role TEXT, enabled INTEGER, session_version INTEGER)');
$pdo->exec("INSERT INTO admin_users VALUES ('agent', 'Agent', 'staff', 1, 1), ('other', 'Other', 'staff', 1, 1)");
$chat = new SupportChatService($pdo); $chat->ensureSchema();
$thread = $chat->visitorAction('visitor', '127.0.0.1', ['action' => 'start', 'name' => 'Sam', 'acknowledged' => true])['threadId'];
$staff = $pdo->query("SELECT * FROM admin_users WHERE admin_id = 'agent'")->fetch(PDO::FETCH_ASSOC);
$other = $pdo->query("SELECT * FROM admin_users WHERE admin_id = 'other'")->fetch(PDO::FETCH_ASSOC);
$checks = 0;
function checkFile(bool $value, string $message): void { global $checks; if (!$value) throw new RuntimeException($message); $checks++; }
function denyFile(callable $operation, int $status): void {
    try { $operation(); } catch (SupportChatFailure $failure) { checkFile($failure->status === $status, $failure->getMessage()); return; }
    throw new RuntimeException('Expected rejection');
}
$pdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF";
$file = SupportAttachment::validate('../../rapport.pdf', $pdf);
checkFile($file['name'] === 'rapport.pdf', 'No path in filename');
$input = ['action' => 'send', 'threadId' => $thread, 'clientId' => 'file-request-one'];
$chat->visitorAction('visitor', '127.0.0.1', $input, $file);
$chat->visitorAction('visitor', '127.0.0.1', $input, $file);
checkFile((int)$pdo->query('SELECT COUNT(*) FROM support_chat_attachments')->fetchColumn() === 1, 'Retry is idempotent');
$message = $chat->visitorView('visitor', $thread)['messages'][0];
checkFile($message['attachment']['name'] === 'rapport.pdf' && !isset($message['attachment']['content']), 'History exposes metadata, not contents');
denyFile(fn() => $chat->attachment('stranger', null, $thread, $file['id']), 404);
denyFile(fn() => $chat->attachment('', $other, $thread, $file['id']), 403);
$chat->staffAction($staff, ['action' => 'claim', 'threadId' => $thread]);
checkFile(base64_decode($chat->attachment('', $staff, $thread, $file['id'])['content']) === $pdf, 'Assigned staff can download');
denyFile(fn() => SupportAttachment::validate('fake.pdf', '<script>alert(1)</script>'), 400);
denyFile(fn() => SupportAttachment::validate('file.php', $pdf), 400);
denyFile(fn() => SupportAttachment::validate('photo.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>'), 400);
denyFile(fn() => SupportAttachment::validate('huge.pdf', str_repeat('a', SupportAttachment::MAX_BYTES + 1)), 413);
$photo = imagecreatetruecolor(4, 4); ob_start(); imagepng($photo); $png = ob_get_clean(); imagedestroy($photo);
$image = SupportAttachment::validate('foto.png', $png . 'private trailing metadata');
checkFile($image['mime'] === 'image/png' && !str_contains(base64_decode($image['content']), 'private trailing metadata'), 'Photos are re-encoded');
$temporary = tempnam(sys_get_temp_dir(), 'ttt-test-word-');
try {
    $zip = new ZipArchive(); $zip->open($temporary, ZipArchive::OVERWRITE);
    $zip->addFromString('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    $zip->addFromString('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>'); $zip->close();
    checkFile(SupportAttachment::validate('brief.docx', file_get_contents($temporary))['mime'] === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'DOCX supported');
    $zip->open($temporary); $zip->addFromString('word/vbaProject.bin', 'macro'); $zip->close();
    denyFile(fn() => SupportAttachment::validate('macro.docx', file_get_contents($temporary)), 400);
} finally { unlink($temporary); }
$pdo->exec("UPDATE support_chat_attachments SET size = 20971520");
denyFile(fn() => $chat->visitorAction('visitor', '127.0.0.1', array_replace($input, ['clientId' => 'new-file-request']), $image), 413);
$chat->visitorAction('visitor', '127.0.0.1', ['action' => 'close', 'threadId' => $thread]);
denyFile(fn() => $chat->visitorAction('visitor', '127.0.0.1', array_replace($input, ['clientId' => 'closed-file-request']), $image), 409);
$pdo->exec("UPDATE admin_users SET enabled = 0 WHERE admin_id = 'agent'");
denyFile(fn() => $chat->attachment('', $staff, $thread, $file['id']), 401);
$pdo->exec('UPDATE support_chat_threads SET closed_at = ' . (time() - 31 * 86400)); $chat->cleanup();
checkFile((int)$pdo->query('SELECT COUNT(*) FROM support_chat_attachments')->fetchColumn() === 0, 'Retention removes stored file bytes');
echo "Support attachments passed: $checks checks; isolated SQLite, no real customer files.\n";
