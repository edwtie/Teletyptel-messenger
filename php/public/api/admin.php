<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    requireAdminAccess();
    $pdo = Database::connect();
    ensureAdminSchema($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        readAdminData($pdo);
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        updateAccountAdminFields($pdo);
        return;
    }

    jsonResponse(['ok' => false, 'error' => 'method_not_allowed'], 405);
} catch (Throwable $error) {
    jsonResponse(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()], 500);
}

function requireAdminAccess(): void
{
    $configuredToken = adminToken();
    $providedToken = cleanAdminText($_SERVER['HTTP_X_TELETYPTEL_ADMIN_TOKEN'] ?? ($_GET['token'] ?? ''), 255);
    if ($configuredToken !== '') {
        if (!hash_equals($configuredToken, $providedToken)) {
            jsonResponse(['ok' => false, 'error' => 'admin_token_required'], 401);
            exit;
        }
        return;
    }

    if (!isLocalRequest()) {
        jsonResponse([
            'ok' => false,
            'error' => 'admin_token_not_configured',
            'message' => 'Configureer TELETYPTEL_ADMIN_TOKEN of admin.token in php/config.php voor publiek beheer.'
        ], 403);
        exit;
    }
}

function adminToken(): string
{
    $env = getenv('TELETYPTEL_ADMIN_TOKEN');
    if (is_string($env) && $env !== '') {
        return $env;
    }

    $path = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($path)) {
        return '';
    }

    $config = require $path;
    if (!is_array($config)) {
        return '';
    }

    $admin = $config['admin'] ?? [];
    return is_array($admin) ? cleanAdminText($admin['token'] ?? '', 255) : '';
}

function isLocalRequest(): bool
{
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $host = preg_replace('/:\d+$/', '', $host) ?: $host;
    return in_array($remote, ['127.0.0.1', '::1', 'localhost', ''], true)
        && in_array($host, ['127.0.0.1', '::1', 'localhost', ''], true);
}

function readAdminData(PDO $pdo): void
{
    jsonResponse([
        'ok' => true,
        'generatedAt' => gmdate('c'),
        'server' => serverSummary(),
        'stats' => statsSummary($pdo),
        'accounts' => accountRows($pdo),
        'logs' => logRows($pdo),
    ]);
}

function updateAccountAdminFields(PDO $pdo): void
{
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        jsonResponse(['ok' => false, 'error' => 'invalid_json'], 400);
        return;
    }

    $accountId = cleanAdminText($input['accountId'] ?? '', 96);
    if ($accountId === '') {
        jsonResponse(['ok' => false, 'error' => 'missing_account_id'], 400);
        return;
    }

    $subscriptionPlan = normalizeSubscriptionPlan($input['subscriptionPlan'] ?? 'free');
    $accountStatus = normalizeAccountStatus($input['accountStatus'] ?? 'active');
    $subscriptionExpiresAt = normalizeDateOrNull($input['subscriptionExpiresAt'] ?? '');
    $adminNote = cleanAdminText($input['adminNote'] ?? '', 1000);

    $statement = $pdo->prepare(
        'UPDATE account_profiles
         SET subscription_plan = :subscription_plan,
             account_status = :account_status,
             subscription_expires_at = :subscription_expires_at,
             admin_note = :admin_note
         WHERE account_id = :account_id'
    );
    $statement->execute([
        'account_id' => $accountId,
        'subscription_plan' => $subscriptionPlan,
        'account_status' => $accountStatus,
        'subscription_expires_at' => $subscriptionExpiresAt,
        'admin_note' => $adminNote,
    ]);

    jsonResponse(['ok' => true, 'updated' => $statement->rowCount()]);
}

function statsSummary(PDO $pdo): array
{
    return [
        'accounts' => scalarInt($pdo, 'SELECT COUNT(*) FROM account_profiles'),
        'activeAccounts' => scalarInt($pdo, 'SELECT COUNT(*) FROM account_profiles WHERE account_status = "active"'),
        'messages' => tableExists($pdo, 'message_history') ? scalarInt($pdo, 'SELECT COUNT(*) FROM message_history') : 0,
        'uploads' => tableExists($pdo, 'uploaded_files') ? scalarInt($pdo, 'SELECT COUNT(*) FROM uploaded_files') : 0,
        'failedMails' => tableExists($pdo, 'account_mail_log') ? scalarInt($pdo, 'SELECT COUNT(*) FROM account_mail_log WHERE sent = 0') : 0,
    ];
}

function accountRows(PDO $pdo): array
{
    $selects = [
        'p.account_id',
        'p.jid',
        'p.display_name',
        'p.provider_id',
        'p.preferred_language',
        'p.created_at',
        'p.updated_at',
        'p.subscription_plan',
        'p.account_status',
        'p.subscription_expires_at',
        'p.admin_note',
        '0 AS message_count',
        '0 AS upload_count',
    ];
    $joins = [];

    if (tableExists($pdo, 'message_history')) {
        $selects[11] = 'COALESCE(m.message_count, 0) AS message_count';
        $joins[] = 'LEFT JOIN (
             SELECT account_id, COUNT(*) AS message_count
             FROM message_history
             GROUP BY account_id
         ) m ON m.account_id = p.account_id';
    }

    if (tableExists($pdo, 'uploaded_files')) {
        $selects[12] = 'COALESCE(u.upload_count, 0) AS upload_count';
        $joins[] = 'LEFT JOIN (
             SELECT uploader_account_id AS account_id, COUNT(*) AS upload_count
             FROM uploaded_files
             GROUP BY uploader_account_id
         ) u ON u.account_id = p.account_id';
    }

    $statement = $pdo->query(
        'SELECT ' . implode(', ', $selects)
        . ' FROM account_profiles p '
        . implode(' ', $joins)
        . ' ORDER BY p.updated_at DESC LIMIT 200'
    );

    return $statement->fetchAll() ?: [];
}

function logRows(PDO $pdo): array
{
    $logs = [];
    if (tableExists($pdo, 'account_mail_log')) {
        $statement = $pdo->query(
            'SELECT "mail" AS source, jid AS subject, error_text AS detail, created_at
             FROM account_mail_log
             ORDER BY created_at DESC
             LIMIT 50'
        );
        $logs = array_merge($logs, $statement->fetchAll() ?: []);
    }

    if (tableExists($pdo, 'message_history')) {
        $statement = $pdo->query(
            'SELECT "message" AS source, account_id AS subject, CONCAT(status, " ", conversation_peer) AS detail, created_at
             FROM message_history
             ORDER BY created_at DESC
             LIMIT 50'
        );
        $logs = array_merge($logs, $statement->fetchAll() ?: []);
    }

    usort($logs, static fn(array $a, array $b): int => strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? '')));
    return array_slice($logs, 0, 80);
}

function serverSummary(): array
{
    return [
        'phpVersion' => PHP_VERSION,
        'os' => PHP_OS_FAMILY,
        'host' => $_SERVER['HTTP_HOST'] ?? '',
        'https' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'pdoMysql' => extension_loaded('pdo_mysql'),
        'openssl' => extension_loaded('openssl'),
        'adminTokenConfigured' => adminToken() !== '',
        'localRequest' => isLocalRequest(),
    ];
}

function ensureAdminSchema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_profiles (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            jid VARCHAR(255) NOT NULL,
            display_name VARCHAR(120) NOT NULL DEFAULT "",
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_account_profiles_jid (jid)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );

    ensureColumn($pdo, 'account_profiles', 'subscription_plan', 'subscription_plan VARCHAR(32) NOT NULL DEFAULT "free"');
    ensureColumn($pdo, 'account_profiles', 'account_status', 'account_status VARCHAR(32) NOT NULL DEFAULT "active"');
    ensureColumn($pdo, 'account_profiles', 'subscription_expires_at', 'subscription_expires_at DATE NULL');
    ensureColumn($pdo, 'account_profiles', 'admin_note', 'admin_note TEXT NULL');
    ensureColumn($pdo, 'account_profiles', 'display_name', 'display_name VARCHAR(120) NOT NULL DEFAULT ""');
    ensureColumn($pdo, 'account_profiles', 'provider_id', 'provider_id VARCHAR(96) NOT NULL DEFAULT "local"');
    ensureColumn($pdo, 'account_profiles', 'preferred_language', 'preferred_language VARCHAR(16) NOT NULL DEFAULT "nl"');
    ensureColumn($pdo, 'account_profiles', 'created_at', 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    ensureColumn($pdo, 'account_profiles', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

}

function ensureColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    if (columnExists($pdo, $table, $column)) {
        return;
    }
    $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN {$definition}");
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name'
    );
    $statement->execute(['table_name' => $table, 'column_name' => $column]);
    return (int)$statement->fetchColumn() > 0;
}

function tableExists(PDO $pdo, string $table): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name'
    );
    $statement->execute(['table_name' => $table]);
    return (int)$statement->fetchColumn() > 0;
}

function scalarInt(PDO $pdo, string $sql): int
{
    return (int)$pdo->query($sql)->fetchColumn();
}

function normalizeSubscriptionPlan(mixed $value): string
{
    $value = cleanAdminText($value, 32);
    return in_array($value, ['free', 'pro', 'business', 'subsidy', 'disabled'], true) ? $value : 'free';
}

function normalizeAccountStatus(mixed $value): string
{
    $value = cleanAdminText($value, 32);
    return in_array($value, ['active', 'trial', 'suspended', 'closed'], true) ? $value : 'active';
}

function normalizeDateOrNull(mixed $value): ?string
{
    $value = cleanAdminText($value, 10);
    if ($value === '') {
        return null;
    }

    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $value) === 1 ? $value : null;
}

function cleanAdminText(mixed $value, int $maxLength): string
{
    $text = trim((string)$value);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $text) ?? '';
    return substr($text, 0, $maxLength);
}

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
