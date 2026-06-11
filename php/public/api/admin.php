<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $pdo = Database::connect();
    ensureAdminSchema($pdo);
    $requestInput = null;

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $requestInput = json_decode(file_get_contents('php://input') ?: '', true);
        if (!is_array($requestInput)) {
            jsonResponse(['ok' => false, 'error' => 'invalid_json'], 400);
            return;
        }

        $action = cleanAdminText($requestInput['action'] ?? 'update_account', 32);
        if ($action === 'login') {
            loginAdmin($pdo, $requestInput);
            return;
        }
        if ($action === 'logout') {
            logoutAdmin();
            return;
        }
    }

    requireAdminAccess($pdo);

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        readAdminData($pdo);
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && is_array($requestInput)) {
        updateAccountAdminFields($pdo, $requestInput);
        return;
    }

    jsonResponse(['ok' => false, 'error' => 'method_not_allowed'], 405);
} catch (Throwable $error) {
    jsonResponse(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()], 500);
}

function requireAdminAccess(PDO $pdo): void
{
    if (currentAdminUser($pdo) !== null) {
        return;
    }

    $configuredToken = adminToken();
    $providedToken = cleanAdminText($_SERVER['HTTP_X_TELETYPTEL_ADMIN_TOKEN'] ?? ($_GET['token'] ?? ''), 255);
    if ($configuredToken !== '') {
        if (!hash_equals($configuredToken, $providedToken)) {
            jsonResponse(['ok' => false, 'error' => 'admin_token_required'], 401);
            exit;
        }
        return;
    }

    if (isLocalRequest() && scalarInt($pdo, 'SELECT COUNT(*) FROM admin_users WHERE enabled = 1') === 0) {
        return;
    }

    if (isLocalRequest()) {
        jsonResponse(['ok' => false, 'error' => 'admin_login_required', 'message' => 'Log in met het admin-account.'], 401);
        exit;
    }

    if (!isLocalRequest()) {
        jsonResponse([
            'ok' => false,
            'error' => 'admin_login_required',
            'message' => 'Log in met het admin-account of configureer TELETYPTEL_ADMIN_TOKEN voor noodbeheer.'
        ], 403);
        exit;
    }
}

function loginAdmin(PDO $pdo, array $input): void
{
    $email = strtolower(cleanAdminText($input['email'] ?? '', 255));
    $password = cleanAdminText($input['password'] ?? '', 1024);
    if ($email === '' || $password === '') {
        jsonResponse(['ok' => false, 'error' => 'missing_credentials'], 400);
        return;
    }

    $statement = $pdo->prepare('SELECT * FROM admin_users WHERE email = :email AND enabled = 1 LIMIT 1');
    $statement->execute(['email' => $email]);
    $row = $statement->fetch();
    if (!is_array($row) || !password_verify($password, (string)($row['password_hash'] ?? ''))) {
        jsonResponse(['ok' => false, 'error' => 'invalid_credentials'], 401);
        return;
    }

    session_regenerate_id(true);
    $_SESSION['teletyptel_admin_id'] = (string)$row['admin_id'];
    $pdo->prepare('UPDATE admin_users SET last_login_at = NOW() WHERE admin_id = :admin_id')
        ->execute(['admin_id' => $row['admin_id']]);
    jsonResponse(['ok' => true, 'admin' => adminUserToClient($row)]);
}

function logoutAdmin(): void
{
    unset($_SESSION['teletyptel_admin_id']);
    jsonResponse(['ok' => true]);
}

function currentAdminUser(PDO $pdo): ?array
{
    $adminId = cleanAdminText($_SESSION['teletyptel_admin_id'] ?? '', 96);
    if ($adminId === '') {
        return null;
    }

    $statement = $pdo->prepare('SELECT * FROM admin_users WHERE admin_id = :admin_id AND enabled = 1 LIMIT 1');
    $statement->execute(['admin_id' => $adminId]);
    $row = $statement->fetch();
    return is_array($row) ? $row : null;
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
    $admin = currentAdminUser($pdo);
    jsonResponse([
        'ok' => true,
        'generatedAt' => gmdate('c'),
        'admin' => $admin !== null ? adminUserToClient($admin) : null,
        'server' => serverSummary(),
        'stats' => statsSummary($pdo),
        'accounts' => accountRows($pdo),
        'logs' => logRows($pdo),
    ]);
}

function updateAccountAdminFields(PDO $pdo, array $input): void
{
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
    $config = loadAdminConfig();
    return [
        'phpVersion' => PHP_VERSION,
        'os' => PHP_OS_FAMILY,
        'host' => $_SERVER['HTTP_HOST'] ?? '',
        'https' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'pdoMysql' => extension_loaded('pdo_mysql'),
        'openssl' => extension_loaded('openssl'),
        'adminTokenConfigured' => adminToken() !== '',
        'adminSession' => isset($_SESSION['teletyptel_admin_id']),
        'localRequest' => isLocalRequest(),
        'ejabberd' => ejabberdSipSummary($config),
    ];
}

function ejabberdSipSummary(array $config): array
{
    $xmppMysql = is_array($config['xmpp_mysql'] ?? null) ? $config['xmpp_mysql'] : [];
    $oauth = is_array($config['oauth'] ?? null) ? $config['oauth'] : [];
    $sip = is_array($config['sip'] ?? null) ? $config['sip'] : [];
    $host = cleanAdminText($sip['host'] ?? $oauth['xmpp_domain'] ?? $xmppMysql['host'] ?? 'localhost', 255);
    $sipPort = normalizePort($sip['port'] ?? 5060, 5060);
    $sipsPort = normalizePort($sip['tls_port'] ?? 5061, 5061);

    return [
        'xmppDomain' => cleanAdminText($oauth['xmpp_domain'] ?? '', 255),
        'xmppWebSocket' => cleanAdminText($oauth['xmpp_websocket'] ?? '', 255),
        'xmppDatabaseHost' => cleanAdminText($xmppMysql['host'] ?? '', 255),
        'xmppDatabase' => cleanAdminText($xmppMysql['database'] ?? '', 255),
        'ejabberdCtlAvailable' => commandExists('ejabberdctl'),
        'ejabberdService' => ejabberdServiceStatus(),
        'sipHost' => $host,
        'sipPort' => $sipPort,
        'sipsPort' => $sipsPort,
        'sipConfigured' => (bool)($sip['enabled'] ?? false),
        'sipPortOpen' => tcpPortOpen($host, $sipPort),
        'sipsPortOpen' => tcpPortOpen($host, $sipsPort),
        'moduleHint' => 'ejabberd_sip / mod_sip',
        'gatewayRole' => 'SIP is gatewaylaag voor telefonie/relay, niet de browser-client zelf.',
    ];
}

function loadAdminConfig(): array
{
    $path = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($path)) {
        return [];
    }
    $config = require $path;
    return is_array($config) ? $config : [];
}

function normalizePort(mixed $value, int $fallback): int
{
    $port = filter_var($value, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1, 'max_range' => 65535],
    ]);
    return $port === false ? $fallback : (int)$port;
}

function tcpPortOpen(string $host, int $port): bool
{
    if ($host === '') {
        return false;
    }
    $errno = 0;
    $errstr = '';
    $socket = @fsockopen($host, $port, $errno, $errstr, 0.35);
    if (is_resource($socket)) {
        fclose($socket);
        return true;
    }
    return false;
}

function ejabberdServiceStatus(): string
{
    if (PHP_OS_FAMILY !== 'Linux') {
        return 'alleen op Linux-server te controleren';
    }
    if (!commandExists('systemctl')) {
        return commandExists('ejabberdctl') ? 'ejabberdctl aanwezig' : 'systemctl niet beschikbaar';
    }
    $status = trim((string)runAdminCommand('systemctl is-active ejabberd 2>/dev/null'));
    return $status !== '' ? $status : 'onbekend';
}

function commandExists(string $command): bool
{
    $probe = PHP_OS_FAMILY === 'Windows' ? "where {$command} 2>NUL" : "command -v {$command} 2>/dev/null";
    return trim((string)runAdminCommand($probe)) !== '';
}

function runAdminCommand(string $command): ?string
{
    if (!function_exists('shell_exec')) {
        return null;
    }
    return shell_exec($command);
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

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS admin_users (
            admin_id VARCHAR(96) NOT NULL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            display_name VARCHAR(120) NOT NULL DEFAULT "",
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(32) NOT NULL DEFAULT "owner",
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME NULL,
            UNIQUE KEY uq_admin_users_email (email(190))
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
}

function adminUserToClient(array $row): array
{
    return [
        'adminId' => $row['admin_id'],
        'email' => $row['email'],
        'displayName' => $row['display_name'],
        'role' => $row['role'],
    ];
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
