<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        readAccount();
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        writeAccount();
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()]);
}

function writeAccount(): void
{
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_json']);
        return;
    }

    if (($input['action'] ?? 'save') === 'login') {
        loginAccount($input);
        return;
    }

    saveAccount($input);
}

function readAccount(): void
{
    $accountId = cleanText($_GET['accountId'] ?? 'local-edward', 96);
    if (!isCurrentServerSession($accountId)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE account_id = :account_id');
    $statement->execute(['account_id' => $accountId]);
    $row = $statement->fetch();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found']);
        return;
    }

    echo json_encode(['ok' => true, 'account' => rowToAccount($row)], JSON_UNESCAPED_SLASHES);
}

function loginAccount(array $input): void
{
    $jid = cleanText($input['jid'] ?? '', 255);
    $password = cleanText($input['password'] ?? '', 1024);
    if ($jid === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_credentials']);
        return;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE jid = :jid');
    $statement->execute(['jid' => $jid]);
    $row = $statement->fetch();

    if (!$row || !verifyAccountPassword($pdo, $row, $password)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'invalid_credentials']);
        return;
    }

    $_SESSION['teletyptel_account_id'] = $row['account_id'];
    echo json_encode(['ok' => true, 'account' => rowToAccount($row)], JSON_UNESCAPED_SLASHES);
}

function saveAccount(array $input): void
{
    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    $existing = findExistingAccount($pdo, $input);
    if ($existing && !canUpdateExistingAccount($pdo, $existing, $input)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'invalid_credentials']);
        return;
    }

    $account = normalizeAccount($input, $existing);
    $statement = $pdo->prepare(
        'INSERT INTO account_profiles (
            account_id, jid, display_name, password_secret, password_hash, remember_password,
            phone_number, provider_id, accessibility_profile_id, preferred_language,
            relay_websocket, xmpp_websocket, xmpp_host, xmpp_port, xmpp_domain, xmpp_tls_mode,
            peer, avatar_data_url, avatar_color
        ) VALUES (
            :account_id, :jid, :display_name, :password_secret, :password_hash, :remember_password,
            :phone_number, :provider_id, :accessibility_profile_id, :preferred_language,
            :relay_websocket, :xmpp_websocket, :xmpp_host, :xmpp_port, :xmpp_domain, :xmpp_tls_mode,
            :peer, :avatar_data_url, :avatar_color
        )
        ON DUPLICATE KEY UPDATE
            jid = VALUES(jid),
            display_name = VALUES(display_name),
            password_secret = "",
            password_hash = VALUES(password_hash),
            remember_password = VALUES(remember_password),
            phone_number = VALUES(phone_number),
            provider_id = VALUES(provider_id),
            accessibility_profile_id = VALUES(accessibility_profile_id),
            preferred_language = VALUES(preferred_language),
            relay_websocket = VALUES(relay_websocket),
            xmpp_websocket = VALUES(xmpp_websocket),
            xmpp_host = VALUES(xmpp_host),
            xmpp_port = VALUES(xmpp_port),
            xmpp_domain = VALUES(xmpp_domain),
            xmpp_tls_mode = VALUES(xmpp_tls_mode),
            peer = VALUES(peer),
            avatar_data_url = VALUES(avatar_data_url),
            avatar_color = VALUES(avatar_color)'
    );
    $statement->execute($account);

    $_SESSION['teletyptel_account_id'] = $account['account_id'];
    unset($account['password_secret']);
    echo json_encode(['ok' => true, 'account' => accountToClient($account)], JSON_UNESCAPED_SLASHES);
}

function canUpdateExistingAccount(PDO $pdo, array $existing, array $input): bool
{
    if (isCurrentServerSession((string)$existing['account_id'])) {
        return true;
    }

    $password = cleanText($input['password'] ?? '', 1024);
    return $password !== '' && verifyAccountPassword($pdo, $existing, $password);
}

function isCurrentServerSession(string $accountId): bool
{
    return isset($_SESSION['teletyptel_account_id'])
        && hash_equals((string)$_SESSION['teletyptel_account_id'], $accountId);
}

function findExistingAccount(PDO $pdo, array $input): ?array
{
    $accountId = cleanText($input['accountId'] ?? '', 96);
    $jid = cleanText($input['jid'] ?? '', 255);
    if ($accountId !== '') {
        $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE account_id = :account_id LIMIT 1');
        $statement->execute(['account_id' => $accountId]);
        $row = $statement->fetch();
        if (is_array($row)) {
            return $row;
        }
    }

    if ($jid === '') {
        return null;
    }

    $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE jid = :jid LIMIT 1');
    $statement->execute(['jid' => $jid]);
    $row = $statement->fetch();
    return is_array($row) ? $row : null;
}

function normalizeAccount(array $input, ?array $existing): array
{
    $jid = cleanText($input['jid'] ?? '', 255);
    $password = cleanText($input['password'] ?? '', 1024);
    $passwordHash = $password !== ''
        ? password_hash($password, PASSWORD_DEFAULT)
        : (string)($existing['password_hash'] ?? '');

    if ($jid === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_jid']);
        exit;
    }

    if ($passwordHash === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'password_required']);
        exit;
    }

    $xmppDomain = cleanText($input['xmppDomain'] ?? domainFromJid($jid), 255);

    return [
        'account_id' => cleanText($input['accountId'] ?? 'local-account', 96),
        'jid' => $jid,
        'display_name' => cleanText($input['displayName'] ?? 'Me', 120),
        'password_secret' => '',
        'password_hash' => $passwordHash,
        'remember_password' => ($input['rememberPassword'] ?? false) === true ? 1 : 0,
        'phone_number' => cleanText($input['phoneNumber'] ?? '', 64),
        'provider_id' => cleanText($input['providerId'] ?? 'example-provider', 96),
        'accessibility_profile_id' => cleanText($input['accessibilityProfileId'] ?? 'default-live-text', 96),
        'preferred_language' => cleanText($input['preferredLanguage'] ?? 'nl', 16),
        'relay_websocket' => cleanText($input['relayWebSocket'] ?? 'ws://127.0.0.1:8787', 255),
        'xmpp_websocket' => cleanText($input['xmppWebSocket'] ?? 'ws://127.0.0.1:8787', 255),
        'xmpp_host' => cleanText($input['xmppHost'] ?? $xmppDomain, 255),
        'xmpp_port' => normalizePort($input['xmppPort'] ?? 5222),
        'xmpp_domain' => $xmppDomain,
        'xmpp_tls_mode' => normalizeTlsMode($input['xmppTlsMode'] ?? 'starttls'),
        'peer' => cleanText($input['peer'] ?? 'relay@localhost', 255),
        'avatar_data_url' => cleanText($input['avatarDataUrl'] ?? '', 524288),
        'avatar_color' => normalizeColor($input['avatarColor'] ?? '#2563eb'),
    ];
}

function rowToAccount(array $row): array
{
    return [
        'accountId' => $row['account_id'],
        'jid' => $row['jid'],
        'displayName' => $row['display_name'],
        'rememberPassword' => (bool)$row['remember_password'],
        'password' => (bool)$row['remember_password'] ? (string)$row['password_secret'] : '',
        'phoneNumber' => $row['phone_number'],
        'providerId' => $row['provider_id'],
        'accessibilityProfileId' => $row['accessibility_profile_id'],
        'preferredLanguage' => $row['preferred_language'],
        'relayWebSocket' => $row['relay_websocket'],
        'xmppWebSocket' => $row['xmpp_websocket'],
        'xmppHost' => $row['xmpp_host'] ?? '',
        'xmppPort' => (int)($row['xmpp_port'] ?? 5222),
        'xmppDomain' => $row['xmpp_domain'] ?? '',
        'xmppTlsMode' => $row['xmpp_tls_mode'] ?? 'starttls',
        'peer' => $row['peer'],
        'avatarDataUrl' => $row['avatar_data_url'] ?? '',
        'avatarColor' => $row['avatar_color'] ?? '#2563eb',
        'savedInDatabase' => true,
    ];
}

function accountToClient(array $account): array
{
    return [
        'accountId' => $account['account_id'],
        'jid' => $account['jid'],
        'displayName' => $account['display_name'],
        'rememberPassword' => (bool)$account['remember_password'],
        'phoneNumber' => $account['phone_number'],
        'providerId' => $account['provider_id'],
        'accessibilityProfileId' => $account['accessibility_profile_id'],
        'preferredLanguage' => $account['preferred_language'],
        'relayWebSocket' => $account['relay_websocket'],
        'xmppWebSocket' => $account['xmpp_websocket'],
        'xmppHost' => $account['xmpp_host'],
        'xmppPort' => (int)$account['xmpp_port'],
        'xmppDomain' => $account['xmpp_domain'],
        'xmppTlsMode' => $account['xmpp_tls_mode'],
        'peer' => $account['peer'],
        'avatarDataUrl' => $account['avatar_data_url'] ?? '',
        'avatarColor' => $account['avatar_color'] ?? '#2563eb',
        'savedInDatabase' => true,
    ];
}

function ensureAccountProfileSchema(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    ensureColumn($pdo, 'avatar_data_url', 'avatar_data_url MEDIUMTEXT NULL');
    ensureColumn($pdo, 'avatar_color', "avatar_color VARCHAR(32) NOT NULL DEFAULT '#2563eb'");
    ensureColumn($pdo, 'password_hash', 'password_hash VARCHAR(255) NOT NULL DEFAULT \'\'');
    ensureColumn($pdo, 'xmpp_host', "xmpp_host VARCHAR(255) NOT NULL DEFAULT 'localhost'");
    ensureColumn($pdo, 'xmpp_port', 'xmpp_port INT NOT NULL DEFAULT 5222');
    ensureColumn($pdo, 'xmpp_domain', "xmpp_domain VARCHAR(255) NOT NULL DEFAULT 'localhost'");
    ensureColumn($pdo, 'xmpp_tls_mode', "xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT 'starttls'");
    $checked = true;
}

function ensureColumn(PDO $pdo, string $column, string $definition): void
{
    $statement = $pdo->query('SHOW COLUMNS FROM account_profiles LIKE ' . $pdo->quote($column));
    if ($statement && $statement->fetch()) {
        return;
    }

    $pdo->exec('ALTER TABLE account_profiles ADD COLUMN ' . $definition);
}

function normalizeColor(mixed $value): string
{
    $color = trim((string)$value);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1 ? $color : '#2563eb';
}

function normalizePort(mixed $value): int
{
    $port = (int)$value;
    return $port >= 1 && $port <= 65535 ? $port : 5222;
}

function normalizeTlsMode(mixed $value): string
{
    $mode = strtolower(trim((string)$value));
    return in_array($mode, ['starttls', 'direct-tls', 'websocket'], true) ? $mode : 'starttls';
}

function domainFromJid(string $jid): string
{
    $bare = explode('/', $jid, 2)[0];
    $parts = explode('@', $bare, 2);
    return count($parts) === 2 && $parts[1] !== '' ? $parts[1] : 'localhost';
}

function verifyAccountPassword(PDO $pdo, array $row, string $password): bool
{
    $hash = (string)($row['password_hash'] ?? '');
    if ($hash !== '' && password_verify($password, $hash)) {
        return true;
    }

    $legacySecret = (string)($row['password_secret'] ?? '');
    if ($hash === '' && $legacySecret !== '' && hash_equals($legacySecret, $password)) {
        $newHash = password_hash($password, PASSWORD_DEFAULT);
        $statement = $pdo->prepare('UPDATE account_profiles SET password_hash = :password_hash, password_secret = "" WHERE account_id = :account_id');
        $statement->execute(['password_hash' => $newHash, 'account_id' => $row['account_id']]);
        return true;
    }

    return false;
}

function cleanText(mixed $value, int $maxLength): string
{
    $text = trim((string)$value);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }

    return substr($text, 0, $maxLength);
}
