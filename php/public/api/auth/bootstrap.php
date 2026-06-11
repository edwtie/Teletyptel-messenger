<?php
declare(strict_types=1);

require_once dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

const TT_AUTH_SESSION_KEY = 'teletyptel_oauth';

function ttAuthHandle(string $provider, string $step): void
{
    session_start();
    header('Cache-Control: no-store');
    try {
        if ($step === 'start') {
            ttAuthStart($provider);
            return;
        }
        if ($step === 'callback') {
            ttAuthCallback($provider);
            return;
        }
        ttAuthJson(['ok' => false, 'error' => 'unknown_auth_step'], 404);
    } catch (Throwable $error) {
        ttAuthJson(['ok' => false, 'error' => 'oauth_server_error', 'message' => $error->getMessage()], 500);
    }
}

function ttAuthStart(string $provider): void
{
    $config = ttAuthProviderConfig($provider);
    if (!$config['configured']) {
        ttAuthJson(['ok' => false, 'error' => 'provider_not_configured', 'provider' => $provider], 503);
        return;
    }

    $state = ttAuthBase64Url(random_bytes(24));
    $verifier = ttAuthBase64Url(random_bytes(48));
    $redirectUri = ttAuthRedirectUri($provider, $config);
    $_SESSION[TT_AUTH_SESSION_KEY][$provider][$state] = [
        'code_verifier' => $verifier,
        'redirect_uri' => $redirectUri,
        'created_at' => time(),
    ];
    ttAuthStorePendingState($provider, $state, $verifier, $redirectUri);

    $query = [
        'response_type' => 'code',
        'client_id' => $config['client_id'],
        'redirect_uri' => $redirectUri,
        'scope' => implode(' ', $config['scopes']),
        'state' => $state,
        'code_challenge' => ttAuthBase64Url(hash('sha256', $verifier, true)),
        'code_challenge_method' => 'S256',
    ];
    if ($provider === 'apple') {
        $query['response_mode'] = 'form_post';
    }

    header('Location: ' . $config['authorization_endpoint'] . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986), true, 302);
}

function ttAuthCallback(string $provider): void
{
    $request = array_merge($_GET, $_POST);
    if (isset($request['error'])) {
        ttAuthJson(['ok' => false, 'error' => 'provider_error', 'provider' => $provider, 'provider_error' => ttAuthClean((string)$request['error'], 128)], 400);
        return;
    }

    $state = ttAuthClean((string)($request['state'] ?? ''), 128);
    $code = ttAuthClean((string)($request['code'] ?? ''), 4096);
    $session = $_SESSION[TT_AUTH_SESSION_KEY][$provider][$state] ?? null;
    if (!is_array($session) && $state !== '') {
        $session = ttAuthLoadPendingState($provider, $state);
    }
    if ($state === '' || $code === '' || !is_array($session)) {
        ttAuthJson(['ok' => false, 'error' => 'invalid_oauth_state'], 400);
        return;
    }
    unset($_SESSION[TT_AUTH_SESSION_KEY][$provider][$state]);
    ttAuthDeletePendingState($provider, $state);
    if ((time() - (int)($session['created_at'] ?? 0)) > 600) {
        ttAuthJson(['ok' => false, 'error' => 'oauth_state_expired'], 400);
        return;
    }

    $config = ttAuthProviderConfig($provider);
    if (!$config['configured']) {
        ttAuthJson(['ok' => false, 'error' => 'provider_not_configured', 'provider' => $provider], 503);
        return;
    }

    $tokens = ttAuthExchangeCode($provider, $config, $code, (string)$session['code_verifier'], (string)$session['redirect_uri']);
    $profile = ttAuthProviderProfile($provider, $config, $tokens, $request);
    if ($profile['subject'] === '') {
        ttAuthJson(['ok' => false, 'error' => 'provider_subject_missing', 'provider' => $provider], 502);
        return;
    }

    $pdo = Database::connect();
    ttAuthEnsureAccountSchema($pdo);
    $account = ttAuthPersistProviderAccount($pdo, $provider, $profile, $config);
    $_SESSION['teletyptel_account_id'] = $account['account_id'];

    if (($request['format'] ?? '') === 'json') {
        ttAuthJson(['ok' => true, 'account' => $account]);
        return;
    }

    $loginToken = ttAuthCreateLoginToken((string)$account['account_id']);
    header(
        'Location: ' . ttAuthOrigin()
        . '/chat.html?oauth=1&accountId=' . rawurlencode((string)$account['account_id'])
        . '&loginToken=' . rawurlencode($loginToken),
        true,
        302
    );
}

function ttAuthProviderConfig(string $provider): array
{
    $config = ttAuthLoadConfig();
    $oauth = is_array($config['oauth'] ?? null) ? $config['oauth'] : [];
    $providerConfig = is_array($oauth[$provider] ?? null) ? $oauth[$provider] : [];
    if (!$providerConfig && is_array($config[$provider] ?? null)) {
        $providerConfig = $config[$provider];
    }
    $defaults = [
        'google' => [
            'authorization_endpoint' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token_endpoint' => 'https://oauth2.googleapis.com/token',
            'userinfo_endpoint' => 'https://openidconnect.googleapis.com/v1/userinfo',
            'scopes' => ['openid', 'email', 'profile'],
        ],
        'facebook' => [
            'authorization_endpoint' => 'https://www.facebook.com/v19.0/dialog/oauth',
            'token_endpoint' => 'https://graph.facebook.com/v19.0/oauth/access_token',
            'userinfo_endpoint' => 'https://graph.facebook.com/me',
            'scopes' => ['email', 'public_profile'],
        ],
        'apple' => [
            'authorization_endpoint' => 'https://appleid.apple.com/auth/authorize',
            'token_endpoint' => 'https://appleid.apple.com/auth/token',
            'userinfo_endpoint' => '',
            'scopes' => ['name', 'email'],
        ],
    ];
    if (!isset($defaults[$provider])) {
        return ['configured' => false];
    }

    $merged = array_merge($defaults[$provider], $providerConfig);
    $envPrefix = 'TELETYPTEL_OAUTH_' . strtoupper($provider) . '_';
    $plainPrefix = strtoupper($provider) . '_';
    $clientIdKey = $provider === 'facebook' ? 'app_id' : 'client_id';
    $secretKey = $provider === 'facebook' ? 'app_secret' : 'client_secret';
    $clientId = ttAuthEnv($envPrefix . 'CLIENT_ID', ttAuthEnv($envPrefix . 'APP_ID', ttAuthEnv($plainPrefix . 'CLIENT_ID', ttAuthEnv($plainPrefix . 'APP_ID', (string)($merged[$clientIdKey] ?? $merged['client_id'] ?? '')))));
    $clientSecret = ttAuthEnv($envPrefix . 'CLIENT_SECRET', ttAuthEnv($envPrefix . 'APP_SECRET', ttAuthEnv($plainPrefix . 'CLIENT_SECRET', ttAuthEnv($plainPrefix . 'APP_SECRET', (string)($merged[$secretKey] ?? $merged['client_secret'] ?? '')))));

    $merged['client_id'] = $clientId;
    $merged['client_secret'] = $clientSecret;
    $merged['redirect_uri'] = ttAuthEnv($envPrefix . 'REDIRECT_URI', (string)($merged['redirect_uri'] ?? ''));
    $merged['xmpp_domain'] = (string)($oauth['xmpp_domain'] ?? $config['default_xmpp_domain'] ?? 'localhost');
    $merged['xmpp_host'] = (string)($oauth['xmpp_host'] ?? $config['default_xmpp_host'] ?? $merged['xmpp_domain']);
    $merged['xmpp_websocket'] = (string)($oauth['xmpp_websocket'] ?? $config['default_xmpp_websocket'] ?? 'wss://localhost:5443/websocket/');
    $merged['configured'] = $clientId !== '' && ($provider !== 'apple' || $clientSecret !== '');
    return $merged;
}

function ttAuthExchangeCode(string $provider, array $config, string $code, string $verifier, string $redirectUri): array
{
    $fields = [
        'grant_type' => 'authorization_code',
        'code' => $code,
        'redirect_uri' => $redirectUri,
        'client_id' => $config['client_id'],
        'code_verifier' => $verifier,
    ];
    if (($config['client_secret'] ?? '') !== '') {
        $fields['client_secret'] = (string)$config['client_secret'];
    }

    $response = ttAuthHttp('POST', $config['token_endpoint'], $fields);
    if (!isset($response['access_token']) && !isset($response['id_token'])) {
        throw new RuntimeException('OAuth token response did not contain tokens.');
    }
    return $response;
}

function ttAuthProviderProfile(string $provider, array $config, array $tokens, array $request): array
{
    if ($provider === 'apple') {
        $claims = ttAuthDecodeJwtPayload((string)($tokens['id_token'] ?? ''));
        $user = isset($request['user']) ? json_decode((string)$request['user'], true) : null;
        $name = is_array($user) ? trim((string)($user['name']['firstName'] ?? '') . ' ' . (string)($user['name']['lastName'] ?? '')) : '';
        return ttAuthProfile((string)($claims['sub'] ?? ''), (string)($claims['email'] ?? ''), filter_var($claims['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN), $name);
    }
    if ($provider === 'facebook') {
        $query = http_build_query(['fields' => 'id,name,email', 'access_token' => (string)($tokens['access_token'] ?? '')], '', '&', PHP_QUERY_RFC3986);
        $profile = ttAuthHttp('GET', $config['userinfo_endpoint'] . '?' . $query);
        return ttAuthProfile((string)($profile['id'] ?? ''), (string)($profile['email'] ?? ''), isset($profile['email']), (string)($profile['name'] ?? ''));
    }

    $profile = [];
    if (($tokens['access_token'] ?? '') !== '') {
        $profile = ttAuthHttp('GET', $config['userinfo_endpoint'], null, ['Authorization: Bearer ' . (string)$tokens['access_token']]);
    }
    if (!isset($profile['sub'])) {
        $profile = ttAuthDecodeJwtPayload((string)($tokens['id_token'] ?? ''));
    }
    return ttAuthProfile((string)($profile['sub'] ?? ''), (string)($profile['email'] ?? ''), filter_var($profile['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN), (string)($profile['name'] ?? ''));
}

function ttAuthProfile(string $subject, string $email, bool $emailVerified, string $displayName): array
{
    return [
        'subject' => ttAuthClean($subject, 255),
        'email' => ttAuthClean($email, 255),
        'email_verified' => $emailVerified,
        'display_name' => ttAuthClean($displayName, 255),
    ];
}

function ttAuthPersistProviderAccount(PDO $pdo, string $provider, array $profile, array $config): array
{
    $email = $profile['email'];
    $displayName = $profile['display_name'] !== '' ? $profile['display_name'] : ($email !== '' ? $email : ucfirst($provider) . ' gebruiker');
    $domain = ttAuthClean((string)$config['xmpp_domain'], 255);
    $xmppDomain = $domain !== '' ? $domain : 'localhost';
    $linkedAccount = ttAuthExistingLinkedAccount($pdo, $provider, $profile['subject'])
        ?? ttAuthAccountForVerifiedEmail($pdo, $email, $profile['email_verified']);
    $accountId = is_array($linkedAccount)
        ? (string)$linkedAccount['account_id']
        : 'oauth-' . $provider . '-' . substr(hash('sha256', $profile['subject']), 0, 24);
    $jid = is_array($linkedAccount) && (string)($linkedAccount['jid'] ?? '') !== ''
        ? (string)$linkedAccount['jid']
        : ttAuthChooseAvailableLocalJid($pdo, ttAuthLocalpart($email !== '' ? $email : $accountId), $xmppDomain, $accountId);
    $host = ttAuthClean((string)$config['xmpp_host'], 255);
    $websocket = ttAuthClean((string)$config['xmpp_websocket'], 255);
    $passwordHash = password_hash(bin2hex(random_bytes(32)), PASSWORD_DEFAULT);

    $pdo->beginTransaction();
    try {
        $pdo->prepare(
            'INSERT INTO accounts (account_id, display_name, provider_id, preferred_language, status)
             VALUES (:account_id, :display_name, :provider_id, "nl", "active")
             ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                provider_id = VALUES(provider_id),
                status = "active"'
        )->execute(['account_id' => $accountId, 'display_name' => $displayName, 'provider_id' => $provider]);
        $pdo->prepare(
            'INSERT INTO account_identities (account_id, provider, provider_subject, email, email_verified, display_name, last_used_at)
             VALUES (:account_id, :provider, :subject, :email, :verified, :display_name, NOW())
             ON DUPLICATE KEY UPDATE account_id = VALUES(account_id), email = VALUES(email), email_verified = VALUES(email_verified), display_name = VALUES(display_name), last_used_at = NOW()'
        )->execute(['account_id' => $accountId, 'provider' => $provider, 'subject' => $profile['subject'], 'email' => $email, 'verified' => $profile['email_verified'] ? 1 : 0, 'display_name' => $displayName]);
        $pdo->prepare(
            'INSERT INTO account_credentials (account_id, password_hash, password_updated_at)
             VALUES (:account_id, :password_hash, NOW())
             ON DUPLICATE KEY UPDATE account_id = account_id'
        )->execute(['account_id' => $accountId, 'password_hash' => $passwordHash]);
        $pdo->prepare(
            'INSERT INTO account_xmpp (account_id, xmpp_jid, xmpp_domain, xmpp_host, xmpp_port, xmpp_tls_mode, xmpp_websocket, peer)
             VALUES (:account_id, :jid, :domain, :host, 5222, "websocket", :websocket, "relay@localhost")
             ON DUPLICATE KEY UPDATE xmpp_jid = VALUES(xmpp_jid), xmpp_domain = VALUES(xmpp_domain), xmpp_host = VALUES(xmpp_host), xmpp_websocket = VALUES(xmpp_websocket)'
        )->execute(['account_id' => $accountId, 'jid' => $jid, 'domain' => $xmppDomain, 'host' => $host, 'websocket' => $websocket]);
        $pdo->prepare(
            'INSERT INTO account_profiles (
                account_id, display_name, jid, peer, relay_websocket, xmpp_host,
                xmpp_domain, xmpp_websocket, provider_id, preferred_language, password_hash
             )
             VALUES (
                :account_id, :display_name, :jid, "relay@localhost", "ws://127.0.0.1:8787",
                :host, :domain, :websocket, :provider_id, "nl", :password_hash
             )
             ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                jid = VALUES(jid),
                xmpp_host = VALUES(xmpp_host),
                xmpp_domain = VALUES(xmpp_domain),
                xmpp_websocket = VALUES(xmpp_websocket),
                provider_id = VALUES(provider_id)'
        )->execute([
            'account_id' => $accountId,
            'display_name' => $displayName,
            'jid' => $jid,
            'host' => $host,
            'domain' => $xmppDomain,
            'websocket' => $websocket,
            'provider_id' => $provider,
            'password_hash' => $passwordHash,
        ]);
        $pdo->commit();
    } catch (Throwable $error) {
        $pdo->rollBack();
        throw $error;
    }

    return ['account_id' => $accountId, 'displayName' => $displayName, 'jid' => $jid, 'xmppHost' => $host, 'xmppDomain' => $xmppDomain, 'xmppWebSocket' => $websocket, 'identityProvider' => $provider, 'email' => $email, 'linkedExistingAccount' => is_array($linkedAccount)];
}

function ttAuthExistingLinkedAccount(PDO $pdo, string $provider, string $subject): ?array
{
    $statement = $pdo->prepare(
        'SELECT p.account_id, p.jid
         FROM account_identities i
         JOIN account_profiles p ON p.account_id = i.account_id
         WHERE i.provider = :provider AND i.provider_subject = :subject
         LIMIT 1'
    );
    $statement->execute(['provider' => $provider, 'subject' => $subject]);
    $row = $statement->fetch();
    return is_array($row) ? $row : null;
}

function ttAuthAccountForVerifiedEmail(PDO $pdo, string $email, bool $emailVerified): ?array
{
    $normalizedEmail = strtolower(ttAuthClean($email, 255));
    if (!$emailVerified || !filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL)) {
        return null;
    }

    $statement = $pdo->prepare(
        'SELECT p.account_id, p.jid
         FROM account_identities i
         JOIN account_profiles p ON p.account_id = i.account_id
         WHERE LOWER(i.email) = :email AND i.email_verified = 1
         ORDER BY i.last_used_at DESC, i.id DESC
         LIMIT 1'
    );
    $statement->execute(['email' => $normalizedEmail]);
    $row = $statement->fetch();
    return is_array($row) ? $row : null;
}

function ttAuthChooseAvailableLocalJid(PDO $pdo, string $baseLocalpart, string $domain, string $accountId): string
{
    $base = ttAuthLocalpart($baseLocalpart);
    $xmppDomain = $domain !== '' ? strtolower($domain) : 'localhost';
    for ($index = 0; $index < 1000; $index++) {
        $localpart = $index === 0 ? $base : $base . $index;
        $jid = $localpart . '@' . $xmppDomain;
        if (!ttAuthJidInUse($pdo, $jid, $localpart, $accountId)) {
            return $jid;
        }
    }

    return 'user-' . substr(hash('sha256', $accountId), 0, 12) . '@' . $xmppDomain;
}

function ttAuthJidInUse(PDO $pdo, string $jid, string $localpart, string $accountId): bool
{
    $statement = $pdo->prepare('SELECT account_id FROM account_profiles WHERE jid = :jid LIMIT 1');
    $statement->execute(['jid' => $jid]);
    $row = $statement->fetch();
    if (is_array($row) && !hash_equals((string)($row['account_id'] ?? ''), $accountId)) {
        return true;
    }

    $statement = $pdo->prepare('SELECT account_id FROM account_xmpp WHERE xmpp_jid = :jid LIMIT 1');
    $statement->execute(['jid' => $jid]);
    $row = $statement->fetch();
    if (is_array($row) && !hash_equals((string)($row['account_id'] ?? ''), $accountId)) {
        return true;
    }

    try {
        $xmpp = Database::connectXmpp();
        $statement = $xmpp->prepare('SELECT username FROM users WHERE username = :username LIMIT 1');
        $statement->execute(['username' => $localpart]);
        return is_array($statement->fetch());
    } catch (Throwable) {
        return false;
    }
}

function ttAuthEnsureAccountSchema(PDO $pdo): void
{
    $pdo->exec('CREATE TABLE IF NOT EXISTS accounts (account_id VARCHAR(96) NOT NULL PRIMARY KEY, display_name VARCHAR(120) NOT NULL DEFAULT "", phone_number VARCHAR(64) NOT NULL DEFAULT "", birth_date VARCHAR(10) NOT NULL DEFAULT "", provider_id VARCHAR(96) NOT NULL DEFAULT "example-provider", accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT "default-live-text", preferred_language VARCHAR(16) NOT NULL DEFAULT "nl", avatar_data_url MEDIUMTEXT NULL, avatar_color VARCHAR(32) NOT NULL DEFAULT "#2563eb", status VARCHAR(32) NOT NULL DEFAULT "active", created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('CREATE TABLE IF NOT EXISTS account_identities (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, account_id VARCHAR(96) NOT NULL, provider VARCHAR(32) NOT NULL, provider_subject VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL DEFAULT "", email_verified TINYINT(1) NOT NULL DEFAULT 0, display_name VARCHAR(120) NOT NULL DEFAULT "", linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, last_used_at DATETIME NULL, UNIQUE KEY uq_account_identities_provider_subject (provider, provider_subject), KEY ix_account_identities_account_id (account_id), KEY ix_account_identities_email (email)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('CREATE TABLE IF NOT EXISTS account_credentials (account_id VARCHAR(96) NOT NULL PRIMARY KEY, password_hash VARCHAR(255) NOT NULL DEFAULT "", password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('CREATE TABLE IF NOT EXISTS account_xmpp (account_id VARCHAR(96) NOT NULL PRIMARY KEY, xmpp_jid VARCHAR(255) NOT NULL, xmpp_domain VARCHAR(255) NOT NULL DEFAULT "localhost", xmpp_host VARCHAR(255) NOT NULL DEFAULT "localhost", xmpp_port INT NOT NULL DEFAULT 5222, xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT "websocket", xmpp_websocket VARCHAR(255) NOT NULL DEFAULT "wss://localhost:5443/websocket/", peer VARCHAR(255) NOT NULL DEFAULT "relay@localhost", updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, UNIQUE KEY uq_account_xmpp_jid (xmpp_jid)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    $pdo->exec('CREATE TABLE IF NOT EXISTS account_profiles (account_id VARCHAR(96) NOT NULL PRIMARY KEY, jid VARCHAR(255) NOT NULL, display_name VARCHAR(120) NOT NULL DEFAULT "", password_secret TEXT NULL, remember_password TINYINT(1) NOT NULL DEFAULT 0, phone_number VARCHAR(64) NOT NULL DEFAULT "", provider_id VARCHAR(96) NOT NULL DEFAULT "local", accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT "", preferred_language VARCHAR(16) NOT NULL DEFAULT "nl", relay_websocket VARCHAR(255) NOT NULL DEFAULT "ws://127.0.0.1:8787", xmpp_websocket VARCHAR(255) NOT NULL DEFAULT "wss://localhost:5443/websocket/", peer VARCHAR(255) NOT NULL DEFAULT "relay@localhost", created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, avatar_data_url MEDIUMTEXT NULL, avatar_color VARCHAR(32) NOT NULL DEFAULT "#2563eb", password_hash VARCHAR(255) NOT NULL DEFAULT "", xmpp_host VARCHAR(255) NOT NULL DEFAULT "localhost", xmpp_port INT NOT NULL DEFAULT 5222, xmpp_domain VARCHAR(255) NOT NULL DEFAULT "localhost", xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT "websocket", live_rtt_enabled TINYINT(1) NOT NULL DEFAULT 1, show_smileys TINYINT(1) NOT NULL DEFAULT 1, birth_date VARCHAR(10) NOT NULL DEFAULT "", UNIQUE KEY uq_account_profiles_jid (jid)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    ttAuthMigrateAccountSchema($pdo);
}

function ttAuthMigrateAccountSchema(PDO $pdo): void
{
    if (ttAuthColumnExists($pdo, 'accounts', 'id') && !ttAuthColumnExists($pdo, 'accounts', 'account_id')) {
        $pdo->exec('ALTER TABLE accounts CHANGE id account_id VARCHAR(96) NOT NULL');
    }

    if (ttAuthColumnExists($pdo, 'account_credentials', 'updated_at') && !ttAuthColumnExists($pdo, 'account_credentials', 'password_updated_at')) {
        $pdo->exec('ALTER TABLE account_credentials CHANGE updated_at password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }

    if (ttAuthColumnExists($pdo, 'account_xmpp', 'jid') && !ttAuthColumnExists($pdo, 'account_xmpp', 'xmpp_jid')) {
        $pdo->exec('ALTER TABLE account_xmpp CHANGE jid xmpp_jid VARCHAR(255) NOT NULL');
    }

    ttAuthEnsureTableColumn($pdo, 'accounts', 'display_name', 'display_name VARCHAR(120) NOT NULL DEFAULT ""');
    ttAuthEnsureTableColumn($pdo, 'accounts', 'phone_number', 'phone_number VARCHAR(64) NOT NULL DEFAULT ""');
    ttAuthEnsureTableColumn($pdo, 'accounts', 'birth_date', 'birth_date VARCHAR(10) NOT NULL DEFAULT ""');
    ttAuthEnsureTableColumn($pdo, 'accounts', 'provider_id', 'provider_id VARCHAR(96) NOT NULL DEFAULT "example-provider"');
    ttAuthEnsureTableColumn($pdo, 'accounts', 'accessibility_profile_id', 'accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT "default-live-text"');
    ttAuthEnsureTableColumn($pdo, 'accounts', 'preferred_language', 'preferred_language VARCHAR(16) NOT NULL DEFAULT "nl"');
    ttAuthEnsureTableColumn($pdo, 'accounts', 'avatar_data_url', 'avatar_data_url MEDIUMTEXT NULL');
    ttAuthEnsureTableColumn($pdo, 'accounts', 'avatar_color', 'avatar_color VARCHAR(32) NOT NULL DEFAULT "#2563eb"');
    ttAuthEnsureTableColumn($pdo, 'account_identities', 'display_name', 'display_name VARCHAR(120) NOT NULL DEFAULT ""');
    ttAuthEnsureTableColumn($pdo, 'account_identities', 'last_used_at', 'last_used_at DATETIME NULL');
    ttAuthEnsureTableColumn($pdo, 'account_credentials', 'password_updated_at', 'password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    ttAuthEnsureTableColumn($pdo, 'account_xmpp', 'xmpp_port', 'xmpp_port INT NOT NULL DEFAULT 5222');
    ttAuthEnsureTableColumn($pdo, 'account_xmpp', 'xmpp_tls_mode', 'xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT "websocket"');
    ttAuthEnsureTableColumn($pdo, 'account_xmpp', 'peer', 'peer VARCHAR(255) NOT NULL DEFAULT "relay@localhost"');
}

function ttAuthEnsureTableColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    if (!ttAuthColumnExists($pdo, $table, $column)) {
        $pdo->exec('ALTER TABLE ' . preg_replace('/[^a-zA-Z0-9_]/', '', $table) . ' ADD COLUMN ' . $definition);
    }
}

function ttAuthColumnExists(PDO $pdo, string $table, string $column): bool
{
    $quotedTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
    if ($quotedTable === '') {
        throw new InvalidArgumentException('Invalid table name');
    }

    $statement = $pdo->query('SHOW COLUMNS FROM ' . $quotedTable . ' LIKE ' . $pdo->quote($column));
    return (bool)($statement && $statement->fetch());
}

function ttAuthHttp(string $method, string $url, ?array $fields = null, array $headers = []): array
{
    $options = ['http' => ['method' => $method, 'ignore_errors' => true, 'timeout' => 15, 'header' => array_merge(['Accept: application/json'], $headers)]];
    if ($fields !== null) {
        $options['http']['header'][] = 'Content-Type: application/x-www-form-urlencoded';
        $options['http']['content'] = http_build_query($fields, '', '&', PHP_QUERY_RFC3986);
    }
    $raw = file_get_contents($url, false, stream_context_create($options));
    if ($raw === false) {
        throw new RuntimeException('OAuth HTTP request failed.');
    }
    $json = json_decode($raw, true);
    if (!is_array($json)) {
        throw new RuntimeException('OAuth HTTP response was not JSON.');
    }
    if (isset($json['error'])) {
        throw new RuntimeException('OAuth provider returned error: ' . (string)$json['error']);
    }
    return $json;
}

function ttAuthRedirectUri(string $provider, array $config): string
{
    $configured = trim((string)($config['redirect_uri'] ?? ''));
    if ($configured === '') {
        return ttAuthOrigin() . '/api/auth/' . rawurlencode($provider) . '/callback';
    }

    $configuredHost = parse_url($configured, PHP_URL_HOST);
    $requestHost = ttAuthRequestHost();
    if (
        is_string($configuredHost)
        && ttAuthIsLocalHost($configuredHost)
        && $requestHost !== ''
        && !ttAuthIsLocalHost($requestHost)
    ) {
        $path = parse_url($configured, PHP_URL_PATH);
        return ttAuthOrigin() . ($path !== null && $path !== false ? $path : '/api/auth/' . rawurlencode($provider) . '/callback');
    }

    return $configured;
}

function ttAuthStorePendingState(string $provider, string $state, string $verifier, string $redirectUri): void
{
    ttAuthPrunePendingStates();
    $payload = [
        'provider' => $provider,
        'state' => $state,
        'code_verifier' => $verifier,
        'redirect_uri' => $redirectUri,
        'created_at' => time(),
    ];
    file_put_contents(ttAuthPendingStatePath($provider, $state), json_encode($payload, JSON_UNESCAPED_SLASHES), LOCK_EX);
}

function ttAuthCreateLoginToken(string $accountId): string
{
    $token = ttAuthBase64Url(random_bytes(32));
    $payload = [
        'account_id' => $accountId,
        'token_hash' => hash('sha256', $token),
        'created_at' => time(),
    ];
    $directory = ttAuthHandoffDirectory();
    file_put_contents($directory . DIRECTORY_SEPARATOR . hash('sha256', $accountId . ':' . $token) . '.json', json_encode($payload, JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $token;
}

function ttAuthHandoffDirectory(): string
{
    $directory = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'oauth-handoff';
    if (!is_dir($directory)) {
        mkdir($directory, 0700, true);
    }

    return $directory;
}

function ttAuthLoadPendingState(string $provider, string $state): ?array
{
    $path = ttAuthPendingStatePath($provider, $state);
    if (!is_file($path)) {
        return null;
    }

    $payload = json_decode((string)file_get_contents($path), true);
    if (!is_array($payload) || ($payload['provider'] ?? '') !== $provider || ($payload['state'] ?? '') !== $state) {
        return null;
    }

    return [
        'code_verifier' => (string)($payload['code_verifier'] ?? ''),
        'redirect_uri' => (string)($payload['redirect_uri'] ?? ''),
        'created_at' => (int)($payload['created_at'] ?? 0),
    ];
}

function ttAuthDeletePendingState(string $provider, string $state): void
{
    $path = ttAuthPendingStatePath($provider, $state);
    if (is_file($path)) {
        unlink($path);
    }
}

function ttAuthPendingStatePath(string $provider, string $state): string
{
    $directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'teletyptel-oauth-state';
    if (!is_dir($directory)) {
        mkdir($directory, 0700, true);
    }

    return $directory . DIRECTORY_SEPARATOR . hash('sha256', $provider . ':' . $state) . '.json';
}

function ttAuthPrunePendingStates(): void
{
    $directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'teletyptel-oauth-state';
    if (!is_dir($directory)) {
        return;
    }

    foreach (glob($directory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
        if (is_file($path) && (time() - filemtime($path)) > 900) {
            unlink($path);
        }
    }
}

function ttAuthOrigin(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || ((int)($_SERVER['SERVER_PORT'] ?? 0) === 443);
    return ($https ? 'https' : 'http') . '://' . (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
}

function ttAuthRequestHost(): string
{
    $host = (string)($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? '');
    if (str_contains($host, ':')) {
        $host = explode(':', $host, 2)[0];
    }

    return strtolower(trim($host, "[] \t\n\r\0\x0B"));
}

function ttAuthIsLocalHost(string $host): bool
{
    $normalized = strtolower(trim($host, "[] \t\n\r\0\x0B"));
    return $normalized === 'localhost'
        || $normalized === '127.0.0.1'
        || $normalized === '::1';
}

function ttAuthLoadConfig(): array
{
    $path = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($path)) {
        return [];
    }
    $config = require $path;
    return is_array($config) ? $config : [];
}

function ttAuthEnv(string $key, string $fallback): string
{
    $value = getenv($key);
    return $value === false || $value === '' ? $fallback : $value;
}

function ttAuthBase64Url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function ttAuthDecodeJwtPayload(string $jwt): array
{
    $parts = explode('.', $jwt);
    if (count($parts) < 2) {
        return [];
    }
    $payload = strtr($parts[1], '-_', '+/');
    $payload .= str_repeat('=', (4 - strlen($payload) % 4) % 4);
    $decoded = base64_decode($payload, true);
    $json = $decoded === false ? null : json_decode($decoded, true);
    return is_array($json) ? $json : [];
}

function ttAuthLocalpart(string $value): string
{
    $candidate = strtolower(trim(explode('@', $value, 2)[0]));
    $candidate = preg_replace('/[^a-z0-9._-]+/', '-', $candidate) ?? '';
    $candidate = trim($candidate, '.-_');
    return $candidate !== '' ? substr($candidate, 0, 64) : 'user-' . substr(hash('sha256', $value), 0, 12);
}

function ttAuthClean(string $value, int $limit): string
{
    return mb_substr(trim($value), 0, $limit);
}

function ttAuthJson(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
}
