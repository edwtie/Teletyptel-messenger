<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
require_once dirname(__DIR__) . '/lib/Database.php';
require_once dirname(__DIR__) . '/lib/IntakeManager.php';

try {
    if (in_array('--schema', $argv, true)) {
        $pdo = Database::connect();
        (new IntakeManager($pdo))->ensureSchema();
        $statement = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'can_review_intake'");
        if ((int)$statement->fetchColumn() === 0) {
            $pdo->exec('ALTER TABLE admin_users ADD COLUMN can_review_intake TINYINT NOT NULL DEFAULT 0');
        }
        $statement = $pdo->query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'admin_users' AND COLUMN_NAME = 'session_version'");
        if ((int)$statement->fetchColumn() === 0) {
            $pdo->exec('ALTER TABLE admin_users ADD COLUMN session_version INT NOT NULL DEFAULT 1');
        }
        echo "Intake schema ready. No plans published, no staff permissions granted. Active owners/admins have role-based review access.\n";
    } elseif (in_array('--key', $argv, true)) {
        $directory = dirname(__DIR__) . '/storage';
        if (!is_dir($directory) && !mkdir($directory, 0700, true)) {
            throw new RuntimeException('Storage unavailable.');
        }
        $path = $directory . '/intake.key';
        $key = base64_encode(random_bytes(32)) . PHP_EOL;
        $handle = @fopen($path, 'x');
        if ($handle === false) {
            throw new RuntimeException('Key already exists or storage is not writable.');
        }
        try {
            if (PHP_OS_FAMILY !== 'Windows' && !chmod($path, 0600)) {
                throw new RuntimeException('Unable to protect key permissions.');
            }
            if (fwrite($handle, $key) !== strlen($key)) {
                throw new RuntimeException('Unable to write key.');
            }
        } finally {
            fclose($handle);
        }
        echo "Key created outside public/. Restrict filesystem ACLs and arrange a separate encrypted backup before activation.\n";
    } else {
        echo "Usage: php php/tools/intake-setup.php --schema OR --key\n";
        exit(2);
    }
} catch (Throwable $error) {
    fwrite(STDERR, 'Intake setup failed: ' . $error->getMessage() . PHP_EOL);
    exit(1);
}
