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

    if (($input['action'] ?? 'save') === 'create') {
        createAccount($input);
        return;
    }

    if (($input['action'] ?? 'save') === 'request_password_reset') {
        requestPasswordReset($input);
        return;
    }

    if (($input['action'] ?? 'save') === 'reset_password') {
        resetPassword($input);
        return;
    }

    if (($input['action'] ?? 'save') === 'request_identity_verification') {
        requestIdentityVerification($input);
        return;
    }

    if (($input['action'] ?? 'save') === 'confirm_identity_verification') {
        confirmIdentityVerification($input);
        return;
    }

    if (($input['action'] ?? 'save') === 'request_two_factor_setup') {
        requestTwoFactorSetup($input);
        return;
    }

    if (($input['action'] ?? 'save') === 'confirm_two_factor_setup') {
        confirmTwoFactorSetup($input);
        return;
    }

    saveAccount($input);
}

function readAccount(): void
{
    $accountId = cleanText($_GET['accountId'] ?? 'local-edward', 96);
    if (!isCurrentServerSession($accountId) && !consumeOAuthLoginToken($accountId, cleanText($_GET['loginToken'] ?? '', 255))) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    $lookupJid = bareJid(cleanText($_GET['lookupJid'] ?? '', 255));
    if ($lookupJid !== '') {
        readPublicProfile($pdo, $lookupJid);
        return;
    }

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

function readPublicProfile(PDO $pdo, string $jid): void
{
    $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE jid = :jid LIMIT 1');
    $statement->execute(['jid' => $jid]);
    $row = $statement->fetch();

    if (!$row) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'not_found']);
        return;
    }

    echo json_encode(['ok' => true, 'profile' => rowToPublicProfile($pdo, $row)], JSON_UNESCAPED_SLASHES);
}

function consumeOAuthLoginToken(string $accountId, string $token): bool
{
    if ($accountId === '' || $token === '') {
        return false;
    }

    $directory = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'oauth-handoff';
    if (!is_dir($directory)) {
        return false;
    }

    foreach (glob($directory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
        if (!is_file($path)) {
            continue;
        }

        if ((time() - filemtime($path)) > 180) {
            unlink($path);
            continue;
        }

        $payload = json_decode((string)file_get_contents($path), true);
        if (!is_array($payload)) {
            continue;
        }

        if (($payload['account_id'] ?? '') === $accountId
            && hash_equals((string)($payload['token_hash'] ?? ''), hash('sha256', $token))) {
            $_SESSION['teletyptel_account_id'] = $accountId;
            return true;
        }
    }

    return false;
}

function loginAccount(array $input): void
{
    $jid = bareJid(cleanText($input['jid'] ?? '', 255));
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
    $authenticated = is_array($row) && verifyAccountPassword($pdo, $row, $password);

    if (!$authenticated) {
        if (verifyXmppAccountPassword($jid, $password)) {
            $account = normalizeAccount([
                'jid' => $jid,
                'password' => $password,
                'rememberPassword' => false,
                'relayWebSocket' => cleanText($input['relayWebSocket'] ?? ($row['relay_websocket'] ?? 'ws://127.0.0.1:8787'), 255),
                'xmppHost' => cleanText($input['xmppHost'] ?? ($row['xmpp_host'] ?? domainFromJid($jid)), 255),
                'xmppDomain' => cleanText($input['xmppDomain'] ?? ($row['xmpp_domain'] ?? domainFromJid($jid)), 255),
                'xmppPort' => (int)($input['xmppPort'] ?? ($row['xmpp_port'] ?? 5222)),
                'xmppTlsMode' => cleanText($input['xmppTlsMode'] ?? ($row['xmpp_tls_mode'] ?? 'starttls'), 32),
                'xmppWebSocket' => cleanText($input['xmppWebSocket'] ?? ($row['xmpp_websocket'] ?? 'ws://127.0.0.1:8787'), 255),
            ], is_array($row) ? $row : null);
            persistAccount($pdo, $account);
            $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE account_id = :account_id');
            $statement->execute(['account_id' => $account['account_id']]);
            $row = $statement->fetch();
            $authenticated = is_array($row);
        }
    }

    if (!$authenticated || !$row) {
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
    persistAccount($pdo, $account);

    $_SESSION['teletyptel_account_id'] = $account['account_id'];
    unset($account['password_secret']);
    echo json_encode(['ok' => true, 'account' => accountToClient($account)], JSON_UNESCAPED_SLASHES);
}

function createAccount(array $input): void
{
    $jid = bareJid(cleanText($input['jid'] ?? '', 255));
    $password = cleanText($input['password'] ?? '', 1024);
    if ($jid === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_credentials']);
        return;
    }

    $domain = effectiveXmppDomain($input, $jid);
    if (!hash_equals($domain, 'localhost')) {
        $externalInput = $input;
        $externalInput['jid'] = $jid;
        $externalInput['xmppDomain'] = cleanText($input['xmppDomain'] ?? $domain, 255);
        $externalInput['xmppHost'] = cleanText($input['xmppHost'] ?? $domain, 255);
        saveAccount($externalInput);
        return;
    }

    $parts = explode('@', $jid, 2);
    if (!createXmppSqlAccount($parts[0], $password)) {
        if (!verifyXmppAccountPassword($jid, $password)) {
            $pdo = Database::connect();
            ensureAccountProfileSchema($pdo);
            http_response_code(409);
            echo json_encode([
                'ok' => false,
                'error' => 'account_exists',
                'suggestions' => suggestAvailableLocalJids($pdo, $jid),
            ], JSON_UNESCAPED_SLASHES);
            return;
        }
    }

    saveAccount(array_merge($input, [
        'jid' => $jid,
        'xmppHost' => $domain,
        'xmppDomain' => $domain,
        'xmppPort' => 5222,
        'xmppTlsMode' => cleanText($input['xmppTlsMode'] ?? 'starttls', 32),
        'xmppWebSocket' => cleanText($input['xmppWebSocket'] ?? 'ws://127.0.0.1:8787', 255),
        'relayWebSocket' => cleanText($input['relayWebSocket'] ?? 'ws://127.0.0.1:8787', 255),
    ]));
}

function requestPasswordReset(array $input): void
{
    $jid = bareJid(cleanText($input['jid'] ?? '', 255));
    if ($jid === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_jid']);
        return;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    ensurePasswordResetSchema($pdo);
    ensureAccountIdentitySchema($pdo);

    if (xmppAccountExists($jid)) {
        $token = bin2hex(random_bytes(32));
        $tokenHash = hash('sha256', $token);
        $statement = $pdo->prepare(
            'INSERT INTO password_reset_tokens (jid, token_hash, expires_at, request_ip, user_agent)
             VALUES (:jid, :token_hash, DATE_ADD(NOW(), INTERVAL 30 MINUTE), :request_ip, :user_agent)'
        );
        $statement->execute([
            'jid' => $jid,
            'token_hash' => $tokenHash,
            'request_ip' => cleanText($_SERVER['REMOTE_ADDR'] ?? '', 64),
            'user_agent' => cleanText($_SERVER['HTTP_USER_AGENT'] ?? '', 255),
        ]);

        $resetLink = buildPasswordResetLink($token);
        $subject = 'TeleTypTel wachtwoord herstellen';
        $body = "Hallo,\n\nGebruik deze link om je TeleTypTel-wachtwoord te herstellen:\n{$resetLink}\n\nDeze link is 30 minuten geldig.\n\nAls je dit niet hebt aangevraagd, kun je dit bericht negeren.";
        $sent = sendPasswordResetMail($pdo, $jid, $subject, $body, $resetLink);
        echo json_encode([
            'ok' => true,
            'mailSent' => $sent,
            'logged' => true,
            'message' => 'password_reset_requested',
        ], JSON_UNESCAPED_SLASHES);
        return;
    }

    // Do not reveal whether an address exists.
    echo json_encode(['ok' => true, 'mailSent' => false, 'message' => 'password_reset_requested'], JSON_UNESCAPED_SLASHES);
}

function resetPassword(array $input): void
{
    $token = cleanText($input['token'] ?? '', 128);
    $jid = bareJid(cleanText($input['jid'] ?? '', 255));
    $password = cleanText($input['password'] ?? '', 1024);
    if ($token === '' || $jid === '' || $password === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_reset_data']);
        return;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    ensurePasswordResetSchema($pdo);

    $tokenHash = hash('sha256', $token);
    $statement = $pdo->prepare(
        'SELECT * FROM password_reset_tokens
         WHERE token_hash = :token_hash AND used_at IS NULL AND expires_at > NOW()
         ORDER BY id DESC LIMIT 1'
    );
    $statement->execute(['token_hash' => $tokenHash]);
    $row = $statement->fetch();
    if (!is_array($row) || !hash_equals((string)$row['jid'], $jid)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_reset_token']);
        return;
    }

    if (!updateXmppSqlPassword($jid, $password)) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'account_not_found']);
        return;
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    $statement = $pdo->prepare('UPDATE account_profiles SET password_hash = :password_hash, password_secret = "" WHERE jid = :jid');
    $statement->execute(['password_hash' => $passwordHash, 'jid' => $jid]);
    $statement = $pdo->prepare(
        'INSERT INTO account_credentials (account_id, password_hash, password_updated_at)
         SELECT account_id, :password_hash, NOW()
         FROM account_profiles
         WHERE jid = :jid
         ON DUPLICATE KEY UPDATE
            password_hash = VALUES(password_hash),
            password_updated_at = NOW()'
    );
    $statement->execute(['password_hash' => $passwordHash, 'jid' => $jid]);
    $statement = $pdo->prepare('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = :id');
    $statement->execute(['id' => $row['id']]);

    $existing = findExistingAccount($pdo, ['jid' => $jid]);
    if (!$existing) {
        $account = normalizeAccount([
            'jid' => $jid,
            'password' => $password,
            'rememberPassword' => false,
            'xmppHost' => domainFromJid($jid),
            'xmppDomain' => domainFromJid($jid),
            'xmppPort' => 5222,
            'xmppTlsMode' => 'starttls',
            'xmppWebSocket' => 'ws://127.0.0.1:8787',
            'relayWebSocket' => 'ws://127.0.0.1:8787',
        ], null);
        persistAccount($pdo, $account);
        $existing = findExistingAccount($pdo, ['jid' => $jid]);
    }

    if (is_array($existing)) {
        $_SESSION['teletyptel_account_id'] = $existing['account_id'];
        $existing['password_hash'] = $passwordHash;
        echo json_encode(['ok' => true, 'account' => rowToAccount($existing)], JSON_UNESCAPED_SLASHES);
        return;
    }

    echo json_encode(['ok' => true], JSON_UNESCAPED_SLASHES);
}

function requestIdentityVerification(array $input): void
{
    $purpose = cleanText($input['purpose'] ?? 'link_identity', 64);
    $targetJid = bareJid(cleanText($input['targetJid'] ?? '', 255));
    $identifier = strtolower(cleanText($input['identifier'] ?? '', 255));
    if ($targetJid === '' && $identifier === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_identity_target']);
        return;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    ensurePasswordResetSchema($pdo);
    ensureIdentityVerificationSchema($pdo);

    $targetAccount = $targetJid !== '' ? findExistingAccount($pdo, ['jid' => $targetJid]) : null;
    if (!is_array($targetAccount) && $identifier !== '') {
        $targetAccount = findAccountByVerifiedEmail($pdo, $identifier);
    }

    if (!is_array($targetAccount)) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'identity_target_not_found']);
        return;
    }

    $recipient = verifiedEmailForAccount($pdo, (string)$targetAccount['account_id']);
    if ($recipient === '') {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'verified_email_required']);
        return;
    }

    $code = (string)random_int(100000, 999999);
    $codeHash = verificationCodeHash($code, (string)$targetAccount['account_id'], $purpose, $recipient);
    $statement = $pdo->prepare(
        'INSERT INTO account_verification_codes (
            account_id, purpose, identity_type, identifier, target_jid, code_hash,
            expires_at, request_ip, user_agent
         ) VALUES (
            :account_id, :purpose, "email", :identifier, :target_jid, :code_hash,
            DATE_ADD(NOW(), INTERVAL 10 MINUTE), :request_ip, :user_agent
         )'
    );
    $statement->execute([
        'account_id' => $targetAccount['account_id'],
        'purpose' => $purpose,
        'identifier' => $recipient,
        'target_jid' => $targetAccount['jid'],
        'code_hash' => $codeHash,
        'request_ip' => cleanText($_SERVER['REMOTE_ADDR'] ?? '', 64),
        'user_agent' => cleanText($_SERVER['HTTP_USER_AGENT'] ?? '', 255),
    ]);

    $subject = 'TeleTypTel verificatiecode';
    $body = "Hallo,\n\nGebruik deze code om je TeleTypTel-account te bevestigen:\n\n{$code}\n\nDeze code is 10 minuten geldig. Deel deze code met niemand.";
    $sent = sendTeletyptelMail($pdo, $recipient, $subject, $body, 'identity-verification');

    echo json_encode([
        'ok' => true,
        'verificationId' => (int)$pdo->lastInsertId(),
        'sent' => $sent,
        'maskedRecipient' => maskEmailAddress($recipient),
        'expiresInSeconds' => 600,
    ], JSON_UNESCAPED_SLASHES);
}

function confirmIdentityVerification(array $input): void
{
    $row = consumeVerificationCode($input);
    if (!is_array($row)) {
        return;
    }

    echo json_encode([
        'ok' => true,
        'accountId' => $row['account_id'],
        'jid' => $row['target_jid'],
        'purpose' => $row['purpose'],
    ], JSON_UNESCAPED_SLASHES);
}

function consumeVerificationCode(array $input, string $requiredPurpose = ''): ?array
{
    $verificationId = (int)($input['verificationId'] ?? 0);
    $code = preg_replace('/\D+/', '', (string)($input['code'] ?? '')) ?? '';
    if ($verificationId <= 0 || strlen($code) !== 6) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_verification_code']);
        return null;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    ensureIdentityVerificationSchema($pdo);

    $statement = $pdo->prepare(
        'SELECT * FROM account_verification_codes
         WHERE id = :id AND used_at IS NULL AND expires_at > NOW()
         LIMIT 1'
    );
    $statement->execute(['id' => $verificationId]);
    $row = $statement->fetch();
    if (!is_array($row)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'verification_expired']);
        return null;
    }

    if ($requiredPurpose !== '' && !hash_equals((string)$row['purpose'], $requiredPurpose)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'wrong_verification_purpose']);
        return null;
    }

    if ((int)$row['attempt_count'] >= 5) {
        http_response_code(429);
        echo json_encode(['ok' => false, 'error' => 'too_many_verification_attempts']);
        return null;
    }

    $expected = verificationCodeHash($code, (string)$row['account_id'], (string)$row['purpose'], (string)$row['identifier']);
    if (!hash_equals((string)$row['code_hash'], $expected)) {
        $pdo->prepare('UPDATE account_verification_codes SET attempt_count = attempt_count + 1 WHERE id = :id')
            ->execute(['id' => $verificationId]);
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_verification_code']);
        return null;
    }

    $pdo->prepare('UPDATE account_verification_codes SET used_at = NOW() WHERE id = :id')
        ->execute(['id' => $verificationId]);

    return $row;
}

function requestTwoFactorSetup(array $input): void
{
    $method = cleanText($input['method'] ?? 'authenticator', 32);
    if (!in_array($method, ['authenticator', 'email_code'], true)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'unsupported_two_factor_method']);
        return;
    }

    $accountId = cleanText($input['accountId'] ?? ($_SESSION['teletyptel_account_id'] ?? ''), 96);
    if ($accountId === '' || !isCurrentServerSession($accountId)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $pdo = Database::connect();
    ensureAccountProfileSchema($pdo);
    ensurePasswordResetSchema($pdo);
    ensureIdentityVerificationSchema($pdo);

    if ($method === 'authenticator') {
        $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE account_id = :account_id LIMIT 1');
        $statement->execute(['account_id' => $accountId]);
        $profile = $statement->fetch();
        if (!is_array($profile)) {
            http_response_code(404);
            echo json_encode(['ok' => false, 'error' => 'account_not_found']);
            return;
        }

        $secret = totpGenerateSecret();
        $issuer = 'TeleTypTel';
        $label = $issuer . ':' . bareJid((string)$profile['jid']);
        $uri = buildTotpUri($issuer, $label, $secret);
        $pdo->prepare(
            'INSERT INTO account_security_settings (
                account_id, two_factor_enabled, two_factor_method, two_factor_pending_secret
             ) VALUES (
                :account_id, 0, "authenticator", :secret
             )
             ON DUPLICATE KEY UPDATE
                two_factor_method = "authenticator",
                two_factor_pending_secret = VALUES(two_factor_pending_secret)'
        )->execute([
            'account_id' => $accountId,
            'secret' => $secret,
        ]);

        echo json_encode([
            'ok' => true,
            'method' => 'authenticator',
            'otpauthUri' => $uri,
            'manualSecret' => $secret,
            'issuer' => $issuer,
            'accountName' => bareJid((string)$profile['jid']),
        ], JSON_UNESCAPED_SLASHES);
        return;
    }

    $recipient = verifiedEmailForAccount($pdo, $accountId);
    if ($recipient === '') {
        http_response_code(409);
        echo json_encode(['ok' => false, 'error' => 'verified_email_required']);
        return;
    }

    $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE account_id = :account_id LIMIT 1');
    $statement->execute(['account_id' => $accountId]);
    $profile = $statement->fetch();
    $jid = is_array($profile) ? (string)$profile['jid'] : '';
    $code = (string)random_int(100000, 999999);
    $codeHash = verificationCodeHash($code, $accountId, 'two_factor_setup', $recipient);
    $statement = $pdo->prepare(
        'INSERT INTO account_verification_codes (
            account_id, purpose, identity_type, identifier, target_jid, code_hash,
            expires_at, request_ip, user_agent
         ) VALUES (
            :account_id, "two_factor_setup", "email", :identifier, :target_jid, :code_hash,
            DATE_ADD(NOW(), INTERVAL 10 MINUTE), :request_ip, :user_agent
         )'
    );
    $statement->execute([
        'account_id' => $accountId,
        'identifier' => $recipient,
        'target_jid' => $jid,
        'code_hash' => $codeHash,
        'request_ip' => cleanText($_SERVER['REMOTE_ADDR'] ?? '', 64),
        'user_agent' => cleanText($_SERVER['HTTP_USER_AGENT'] ?? '', 255),
    ]);

    $subject = 'TeleTypTel 2FA instellen';
    $body = "Hallo,\n\nGebruik deze code om twee-factor-authenticatie voor TeleTypTel in te schakelen:\n\n{$code}\n\nDeze code is 10 minuten geldig.";
    $sent = sendTeletyptelMail($pdo, $recipient, $subject, $body, 'two-factor-setup');

    echo json_encode([
        'ok' => true,
        'method' => 'email_code',
        'verificationId' => (int)$pdo->lastInsertId(),
        'sent' => $sent,
        'maskedRecipient' => maskEmailAddress($recipient),
        'expiresInSeconds' => 600,
    ], JSON_UNESCAPED_SLASHES);
}

function confirmTwoFactorSetup(array $input): void
{
    $method = cleanText($input['method'] ?? 'authenticator', 32);
    if ($method === 'authenticator') {
        confirmAuthenticatorTwoFactorSetup($input);
        return;
    }

    $row = consumeVerificationCode($input, 'two_factor_setup');
    if (!is_array($row)) {
        return;
    }

    if (!isCurrentServerSession((string)$row['account_id'])) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $pdo = Database::connect();
    ensureIdentityVerificationSchema($pdo);
    $pdo->prepare(
        'INSERT INTO account_security_settings (account_id, two_factor_enabled, two_factor_method, two_factor_confirmed_at, recovery_email)
         VALUES (:account_id, 1, "email_code", NOW(), :recovery_email)
         ON DUPLICATE KEY UPDATE
            two_factor_enabled = 1,
            two_factor_method = "email_code",
            two_factor_confirmed_at = NOW(),
            recovery_email = VALUES(recovery_email)'
    )->execute([
        'account_id' => $row['account_id'],
        'recovery_email' => $row['identifier'],
    ]);

    echo json_encode([
        'ok' => true,
        'accountId' => $row['account_id'],
        'twoFactorEnabled' => true,
        'method' => 'email_code',
    ], JSON_UNESCAPED_SLASHES);
}

function confirmAuthenticatorTwoFactorSetup(array $input): void
{
    $accountId = cleanText($input['accountId'] ?? ($_SESSION['teletyptel_account_id'] ?? ''), 96);
    $code = preg_replace('/\D+/', '', (string)($input['code'] ?? '')) ?? '';
    if ($accountId === '' || !isCurrentServerSession($accountId)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    if (strlen($code) !== 6) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_verification_code']);
        return;
    }

    $pdo = Database::connect();
    ensureIdentityVerificationSchema($pdo);
    $statement = $pdo->prepare(
        'SELECT two_factor_pending_secret
         FROM account_security_settings
         WHERE account_id = :account_id
         LIMIT 1'
    );
    $statement->execute(['account_id' => $accountId]);
    $row = $statement->fetch();
    $secret = is_array($row) ? cleanText($row['two_factor_pending_secret'] ?? '', 64) : '';
    if ($secret === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'two_factor_setup_missing']);
        return;
    }

    if (!totpVerifyCode($secret, $code)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_verification_code']);
        return;
    }

    $pdo->prepare(
        'UPDATE account_security_settings
         SET two_factor_enabled = 1,
             two_factor_method = "authenticator",
             two_factor_secret = two_factor_pending_secret,
             two_factor_pending_secret = "",
             two_factor_confirmed_at = NOW()
         WHERE account_id = :account_id'
    )->execute(['account_id' => $accountId]);

    echo json_encode([
        'ok' => true,
        'accountId' => $accountId,
        'twoFactorEnabled' => true,
        'method' => 'authenticator',
    ], JSON_UNESCAPED_SLASHES);
}

function persistAccount(PDO $pdo, array $account): void
{
    ensureAccountIdentitySchema($pdo);
    $statement = $pdo->prepare(
        'INSERT INTO account_profiles (
            account_id, jid, display_name, password_secret, password_hash, remember_password,
            phone_number, birth_date, provider_id, accessibility_profile_id, preferred_language,
            live_rtt_enabled, show_smileys,
            relay_websocket, xmpp_websocket, xmpp_host, xmpp_port, xmpp_domain, xmpp_tls_mode,
            peer, avatar_data_url, avatar_color
        ) VALUES (
            :account_id, :jid, :display_name, :password_secret, :password_hash, :remember_password,
            :phone_number, :birth_date, :provider_id, :accessibility_profile_id, :preferred_language,
            :live_rtt_enabled, :show_smileys,
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
            birth_date = VALUES(birth_date),
            provider_id = VALUES(provider_id),
            accessibility_profile_id = VALUES(accessibility_profile_id),
            preferred_language = VALUES(preferred_language),
            live_rtt_enabled = VALUES(live_rtt_enabled),
            show_smileys = VALUES(show_smileys),
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
    persistAccountIdentityModel($pdo, $account);
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
    ensureAccountIdentitySchema($pdo);
    $accountId = cleanText($input['accountId'] ?? '', 96);
    $jid = bareJid(cleanText($input['jid'] ?? '', 255));
    if ($accountId !== '') {
        $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE account_id = :account_id LIMIT 1');
        $statement->execute(['account_id' => $accountId]);
        $row = $statement->fetch();
        if (is_array($row) && bareJid((string)$row['jid']) === $jid) {
            return $row;
        }
    }

    if ($jid === '') {
        return null;
    }

    $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE jid = :jid LIMIT 1');
    $statement->execute(['jid' => $jid]);
    $row = $statement->fetch();
    if (is_array($row)) {
        return $row;
    }

    $identity = findAccountByIdentity($pdo, 'email', $jid);
    return is_array($identity) ? $identity : null;
}

function normalizeAccount(array $input, ?array $existing): array
{
    $jid = bareJid(cleanText($input['jid'] ?? '', 255));
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

    $xmppDomain = effectiveXmppDomain($input, $jid);
    $xmppHost = cleanText($input['xmppHost'] ?? $xmppDomain, 255);
    $xmppWebSocket = cleanText($input['xmppWebSocket'] ?? 'wss://localhost:5443/websocket/', 255);
    if (isLocalXmppDomain($xmppHost) || isLocalXmppWebSocketUrl($xmppWebSocket)) {
        $xmppHost = 'localhost';
    }
    $accountId = is_array($existing)
        ? cleanText($existing['account_id'] ?? accountIdFromJid($jid), 96)
        : accountIdFromJid($jid);
    $displayName = cleanText($input['displayName'] ?? displayNameFromJid($jid), 120);

    return [
        'account_id' => $accountId,
        'jid' => $jid,
        'display_name' => $displayName,
        'password_secret' => '',
        'password_hash' => $passwordHash,
        'remember_password' => ($input['rememberPassword'] ?? false) === true ? 1 : 0,
        'phone_number' => cleanText($input['phoneNumber'] ?? '', 64),
        'birth_date' => normalizeBirthDate($input['birthDate'] ?? ''),
        'provider_id' => cleanText($input['providerId'] ?? 'example-provider', 96),
        'accessibility_profile_id' => cleanText($input['accessibilityProfileId'] ?? 'default-live-text', 96),
        'preferred_language' => cleanText($input['preferredLanguage'] ?? 'nl', 16),
        'live_rtt_enabled' => boolToTinyInt($input['liveRttEnabled'] ?? true),
        'show_smileys' => boolToTinyInt($input['showSmileys'] ?? true),
        'relay_websocket' => cleanText($input['relayWebSocket'] ?? 'ws://127.0.0.1:8787', 255),
        'xmpp_websocket' => $xmppWebSocket,
        'xmpp_host' => $xmppHost,
        'xmpp_port' => normalizePort($input['xmppPort'] ?? 5222),
        'xmpp_domain' => $xmppDomain,
        'xmpp_tls_mode' => normalizeTlsMode($input['xmppTlsMode'] ?? 'websocket'),
        'peer' => cleanText($input['peer'] ?? 'relay@localhost', 255),
        'avatar_data_url' => cleanText($input['avatarDataUrl'] ?? '', 524288),
        'avatar_color' => normalizeColor($input['avatarColor'] ?? '#2563eb'),
    ];
}

function rowToAccount(array $row): array
{
    $security = accountSecuritySummary((string)$row['account_id']);
    return [
        'accountId' => $row['account_id'],
        'jid' => $row['jid'],
        'displayName' => $row['display_name'],
        'rememberPassword' => (bool)$row['remember_password'],
        'password' => (bool)$row['remember_password'] ? (string)$row['password_secret'] : '',
        'phoneNumber' => $row['phone_number'],
        'birthDate' => $row['birth_date'] ?? '',
        'providerId' => $row['provider_id'],
        'accessibilityProfileId' => $row['accessibility_profile_id'],
        'preferredLanguage' => $row['preferred_language'],
        'liveRttEnabled' => (bool)($row['live_rtt_enabled'] ?? true),
        'showSmileys' => (bool)($row['show_smileys'] ?? true),
        'relayWebSocket' => $row['relay_websocket'],
        'xmppWebSocket' => $row['xmpp_websocket'],
        'xmppHost' => $row['xmpp_host'] ?? '',
        'xmppPort' => (int)($row['xmpp_port'] ?? 5222),
        'xmppDomain' => $row['xmpp_domain'] ?? '',
        'xmppTlsMode' => $row['xmpp_tls_mode'] ?? 'starttls',
        'peer' => $row['peer'],
        'avatarDataUrl' => $row['avatar_data_url'] ?? '',
        'avatarColor' => $row['avatar_color'] ?? '#2563eb',
        'twoFactorEnabled' => $security['twoFactorEnabled'],
        'twoFactorMethod' => $security['twoFactorMethod'],
        'savedInDatabase' => true,
    ];
}

function rowToPublicProfile(PDO $pdo, array $row): array
{
    return [
        'jid' => $row['jid'],
        'email' => publicEmailForAccount($pdo, (string)$row['account_id'], (string)$row['jid']),
        'displayName' => $row['display_name'],
        'phoneNumber' => $row['phone_number'],
        'preferredLanguage' => $row['preferred_language'],
        'avatarDataUrl' => $row['avatar_data_url'] ?? '',
        'avatarColor' => $row['avatar_color'] ?? '#2563eb',
    ];
}

function publicEmailForAccount(PDO $pdo, string $accountId, string $fallbackJid): string
{
    try {
        $statement = $pdo->prepare(
            'SELECT email
             FROM account_identities
             WHERE account_id = :account_id AND email <> ""
             ORDER BY email_verified DESC, last_used_at DESC, linked_at DESC
             LIMIT 1'
        );
        $statement->execute(['account_id' => $accountId]);
        $email = $statement->fetchColumn();
        if (is_string($email) && trim($email) !== '') {
            return trim($email);
        }
    } catch (Throwable) {
    }

    return filter_var($fallbackJid, FILTER_VALIDATE_EMAIL) ? $fallbackJid : '';
}

function accountToClient(array $account): array
{
    $security = accountSecuritySummary((string)$account['account_id']);
    return [
        'accountId' => $account['account_id'],
        'jid' => $account['jid'],
        'displayName' => $account['display_name'],
        'rememberPassword' => (bool)$account['remember_password'],
        'phoneNumber' => $account['phone_number'],
        'birthDate' => $account['birth_date'] ?? '',
        'providerId' => $account['provider_id'],
        'accessibilityProfileId' => $account['accessibility_profile_id'],
        'preferredLanguage' => $account['preferred_language'],
        'liveRttEnabled' => (bool)$account['live_rtt_enabled'],
        'showSmileys' => (bool)$account['show_smileys'],
        'relayWebSocket' => $account['relay_websocket'],
        'xmppWebSocket' => $account['xmpp_websocket'],
        'xmppHost' => $account['xmpp_host'],
        'xmppPort' => (int)$account['xmpp_port'],
        'xmppDomain' => $account['xmpp_domain'],
        'xmppTlsMode' => $account['xmpp_tls_mode'],
        'peer' => $account['peer'],
        'avatarDataUrl' => $account['avatar_data_url'] ?? '',
        'avatarColor' => $account['avatar_color'] ?? '#2563eb',
        'twoFactorEnabled' => $security['twoFactorEnabled'],
        'twoFactorMethod' => $security['twoFactorMethod'],
        'savedInDatabase' => true,
    ];
}

function accountSecuritySummary(string $accountId): array
{
    if ($accountId === '') {
        return ['twoFactorEnabled' => false, 'twoFactorMethod' => ''];
    }

    try {
        $pdo = Database::connect();
        ensureIdentityVerificationSchema($pdo);
        $statement = $pdo->prepare(
            'SELECT two_factor_enabled, two_factor_method
             FROM account_security_settings
             WHERE account_id = :account_id
             LIMIT 1'
        );
        $statement->execute(['account_id' => $accountId]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            return ['twoFactorEnabled' => false, 'twoFactorMethod' => ''];
        }

        return [
            'twoFactorEnabled' => (bool)$row['two_factor_enabled'],
            'twoFactorMethod' => (string)$row['two_factor_method'],
        ];
    } catch (Throwable) {
        return ['twoFactorEnabled' => false, 'twoFactorMethod' => ''];
    }
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
    ensureColumn($pdo, 'live_rtt_enabled', 'live_rtt_enabled TINYINT(1) NOT NULL DEFAULT 1');
    ensureColumn($pdo, 'show_smileys', 'show_smileys TINYINT(1) NOT NULL DEFAULT 1');
    ensureColumn($pdo, 'birth_date', 'birth_date VARCHAR(10) NOT NULL DEFAULT \'\'');
    ensureAccountIdentitySchema($pdo);
    $checked = true;
}

function ensureAccountIdentitySchema(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS accounts (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            display_name VARCHAR(120) NOT NULL DEFAULT "",
            phone_number VARCHAR(64) NOT NULL DEFAULT "",
            birth_date VARCHAR(10) NOT NULL DEFAULT "",
            provider_id VARCHAR(96) NOT NULL DEFAULT "example-provider",
            accessibility_profile_id VARCHAR(96) NOT NULL DEFAULT "default-live-text",
            preferred_language VARCHAR(16) NOT NULL DEFAULT "nl",
            avatar_data_url MEDIUMTEXT NULL,
            avatar_color VARCHAR(32) NOT NULL DEFAULT "#2563eb",
            status VARCHAR(32) NOT NULL DEFAULT "active",
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_identities (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(96) NOT NULL,
            provider VARCHAR(32) NOT NULL,
            provider_subject VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL DEFAULT "",
            email_verified TINYINT(1) NOT NULL DEFAULT 0,
            linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_used_at DATETIME NULL,
            UNIQUE KEY uq_account_identity_provider_subject (provider, provider_subject(190)),
            KEY idx_account_identity_account (account_id),
            KEY idx_account_identity_email (email(190)),
            CONSTRAINT fk_account_identity_account
                FOREIGN KEY (account_id) REFERENCES accounts(account_id)
                ON DELETE CASCADE
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_credentials (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            password_hash VARCHAR(255) NOT NULL,
            password_updated_at DATETIME NOT NULL,
            CONSTRAINT fk_account_credentials_account
                FOREIGN KEY (account_id) REFERENCES accounts(account_id)
                ON DELETE CASCADE
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_xmpp (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            xmpp_jid VARCHAR(255) NOT NULL,
            xmpp_domain VARCHAR(255) NOT NULL DEFAULT "localhost",
            xmpp_host VARCHAR(255) NOT NULL DEFAULT "localhost",
            xmpp_port INT NOT NULL DEFAULT 5222,
            xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT "starttls",
            xmpp_websocket VARCHAR(255) NOT NULL DEFAULT "ws://127.0.0.1:8787",
            peer VARCHAR(255) NOT NULL DEFAULT "relay@localhost",
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_account_xmpp_jid (xmpp_jid),
            CONSTRAINT fk_account_xmpp_account
                FOREIGN KEY (account_id) REFERENCES accounts(account_id)
                ON DELETE CASCADE
        )'
    );
    migrateAccountIdentityTables($pdo);
    backfillAccountIdentityModel($pdo);
    $checked = true;
}

function migrateAccountIdentityTables(PDO $pdo): void
{
    if (tableColumnExists($pdo, 'accounts', 'id') && !tableColumnExists($pdo, 'accounts', 'account_id')) {
        $pdo->exec('ALTER TABLE accounts CHANGE id account_id VARCHAR(96) NOT NULL');
    }

    if (tableColumnExists($pdo, 'account_credentials', 'updated_at') && !tableColumnExists($pdo, 'account_credentials', 'password_updated_at')) {
        $pdo->exec('ALTER TABLE account_credentials CHANGE updated_at password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    }

    if (tableColumnExists($pdo, 'account_xmpp', 'jid') && !tableColumnExists($pdo, 'account_xmpp', 'xmpp_jid')) {
        $pdo->exec('ALTER TABLE account_xmpp CHANGE jid xmpp_jid VARCHAR(255) NOT NULL');
    }

    ensureTableColumn($pdo, 'account_identities', 'last_used_at', 'last_used_at DATETIME NULL');
    ensureTableColumn($pdo, 'account_credentials', 'password_updated_at', 'password_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
    ensureTableColumn($pdo, 'account_xmpp', 'xmpp_port', 'xmpp_port INT NOT NULL DEFAULT 5222');
    ensureTableColumn($pdo, 'account_xmpp', 'xmpp_tls_mode', 'xmpp_tls_mode VARCHAR(32) NOT NULL DEFAULT "starttls"');
    ensureTableColumn($pdo, 'account_xmpp', 'peer', 'peer VARCHAR(255) NOT NULL DEFAULT "relay@localhost"');
}

function persistAccountIdentityModel(PDO $pdo, array $account): void
{
    $pdo->prepare(
        'INSERT INTO accounts (
            account_id, display_name, phone_number, birth_date, provider_id,
            accessibility_profile_id, preferred_language, avatar_data_url, avatar_color, status
        ) VALUES (
            :account_id, :display_name, :phone_number, :birth_date, :provider_id,
            :accessibility_profile_id, :preferred_language, :avatar_data_url, :avatar_color, "active"
        )
        ON DUPLICATE KEY UPDATE
            display_name = VALUES(display_name),
            phone_number = VALUES(phone_number),
            birth_date = VALUES(birth_date),
            provider_id = VALUES(provider_id),
            accessibility_profile_id = VALUES(accessibility_profile_id),
            preferred_language = VALUES(preferred_language),
            avatar_data_url = VALUES(avatar_data_url),
            avatar_color = VALUES(avatar_color),
            status = "active"'
    )->execute([
        'account_id' => $account['account_id'],
        'display_name' => $account['display_name'],
        'phone_number' => $account['phone_number'],
        'birth_date' => $account['birth_date'],
        'provider_id' => $account['provider_id'],
        'accessibility_profile_id' => $account['accessibility_profile_id'],
        'preferred_language' => $account['preferred_language'],
        'avatar_data_url' => $account['avatar_data_url'],
        'avatar_color' => $account['avatar_color'],
    ]);

    $pdo->prepare(
        'INSERT INTO account_credentials (account_id, password_hash, password_updated_at)
         VALUES (:account_id, :password_hash, NOW())
         ON DUPLICATE KEY UPDATE
            password_hash = VALUES(password_hash),
            password_updated_at = IF(password_hash <> VALUES(password_hash), NOW(), password_updated_at)'
    )->execute([
        'account_id' => $account['account_id'],
        'password_hash' => $account['password_hash'],
    ]);

    $pdo->prepare(
        'INSERT INTO account_identities (account_id, provider, provider_subject, email, email_verified, last_used_at)
         VALUES (:account_id, "email", :provider_subject, :email, :email_verified, NOW())
         ON DUPLICATE KEY UPDATE
            account_id = VALUES(account_id),
            email = VALUES(email),
            email_verified = VALUES(email_verified),
            last_used_at = NOW()'
    )->execute([
        'account_id' => $account['account_id'],
        'provider_subject' => $account['jid'],
        'email' => filter_var($account['jid'], FILTER_VALIDATE_EMAIL) ? $account['jid'] : '',
        'email_verified' => domainFromJid((string)$account['jid']) === 'localhost' ? 0 : 1,
    ]);

    $pdo->prepare(
        'INSERT INTO account_xmpp (
            account_id, xmpp_jid, xmpp_domain, xmpp_host, xmpp_port, xmpp_tls_mode, xmpp_websocket, peer
        ) VALUES (
            :account_id, :xmpp_jid, :xmpp_domain, :xmpp_host, :xmpp_port, :xmpp_tls_mode, :xmpp_websocket, :peer
        )
        ON DUPLICATE KEY UPDATE
            xmpp_jid = VALUES(xmpp_jid),
            xmpp_domain = VALUES(xmpp_domain),
            xmpp_host = VALUES(xmpp_host),
            xmpp_port = VALUES(xmpp_port),
            xmpp_tls_mode = VALUES(xmpp_tls_mode),
            xmpp_websocket = VALUES(xmpp_websocket),
            peer = VALUES(peer)'
    )->execute([
        'account_id' => $account['account_id'],
        'xmpp_jid' => $account['jid'],
        'xmpp_domain' => $account['xmpp_domain'],
        'xmpp_host' => $account['xmpp_host'],
        'xmpp_port' => $account['xmpp_port'],
        'xmpp_tls_mode' => $account['xmpp_tls_mode'],
        'xmpp_websocket' => $account['xmpp_websocket'],
        'peer' => $account['peer'],
    ]);
}

function backfillAccountIdentityModel(PDO $pdo): void
{
    $rows = $pdo->query('SELECT * FROM account_profiles')->fetchAll();
    foreach ($rows as $row) {
        if (!is_array($row)) {
            continue;
        }

        persistAccountIdentityModel($pdo, [
            'account_id' => $row['account_id'],
            'jid' => $row['jid'],
            'display_name' => $row['display_name'],
            'password_hash' => $row['password_hash'] ?? '',
            'phone_number' => $row['phone_number'] ?? '',
            'birth_date' => $row['birth_date'] ?? '',
            'provider_id' => $row['provider_id'] ?? 'example-provider',
            'accessibility_profile_id' => $row['accessibility_profile_id'] ?? 'default-live-text',
            'preferred_language' => $row['preferred_language'] ?? 'nl',
            'avatar_data_url' => $row['avatar_data_url'] ?? '',
            'avatar_color' => $row['avatar_color'] ?? '#2563eb',
            'xmpp_domain' => $row['xmpp_domain'] ?? domainFromJid((string)$row['jid']),
            'xmpp_host' => $row['xmpp_host'] ?? domainFromJid((string)$row['jid']),
            'xmpp_port' => (int)($row['xmpp_port'] ?? 5222),
            'xmpp_tls_mode' => $row['xmpp_tls_mode'] ?? 'starttls',
            'xmpp_websocket' => $row['xmpp_websocket'] ?? 'ws://127.0.0.1:8787',
            'peer' => $row['peer'] ?? 'relay@localhost',
        ]);
    }
}

function findAccountByIdentity(PDO $pdo, string $provider, string $subject): ?array
{
    $statement = $pdo->prepare(
        'SELECT p.*
         FROM account_identities i
         JOIN account_profiles p ON p.account_id = i.account_id
         WHERE i.provider = :provider AND i.provider_subject = :provider_subject
         LIMIT 1'
    );
    $statement->execute([
        'provider' => $provider,
        'provider_subject' => $subject,
    ]);
    $row = $statement->fetch();
    return is_array($row) ? $row : null;
}

function findAccountByVerifiedEmail(PDO $pdo, string $email): ?array
{
    $normalizedEmail = strtolower(cleanText($email, 255));
    if (!filter_var($normalizedEmail, FILTER_VALIDATE_EMAIL)) {
        return null;
    }

    $statement = $pdo->prepare(
        'SELECT p.*
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

function verifiedEmailForAccount(PDO $pdo, string $accountId): string
{
    $statement = $pdo->prepare(
        'SELECT email
         FROM account_identities
         WHERE account_id = :account_id AND email_verified = 1 AND email <> ""
         ORDER BY last_used_at DESC, id DESC
         LIMIT 1'
    );
    $statement->execute(['account_id' => $accountId]);
    $row = $statement->fetch();
    return is_array($row) ? strtolower(cleanText((string)$row['email'], 255)) : '';
}

function ensurePasswordResetSchema(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            jid VARCHAR(255) NOT NULL,
            token_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            request_ip VARCHAR(64) NOT NULL DEFAULT "",
            user_agent VARCHAR(255) NOT NULL DEFAULT "",
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_password_reset_token_hash (token_hash),
            KEY idx_password_reset_jid_created (jid(190), created_at)
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_mail_log (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            jid VARCHAR(255) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            body MEDIUMTEXT NOT NULL,
            reset_link VARCHAR(1024) NOT NULL DEFAULT "",
            sent TINYINT(1) NOT NULL DEFAULT 0,
            error_text VARCHAR(512) NOT NULL DEFAULT "",
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            KEY idx_account_mail_log_jid_created (jid(190), created_at)
        )'
    );
    ensureTableColumn($pdo, 'account_mail_log', 'error_text', 'error_text VARCHAR(512) NOT NULL DEFAULT ""');
    $checked = true;
}

function ensureIdentityVerificationSchema(PDO $pdo): void
{
    static $checked = false;
    if ($checked) {
        return;
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_verification_codes (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(96) NOT NULL DEFAULT "",
            purpose VARCHAR(64) NOT NULL,
            identity_type VARCHAR(32) NOT NULL DEFAULT "email",
            identifier VARCHAR(255) NOT NULL,
            target_jid VARCHAR(255) NOT NULL DEFAULT "",
            code_hash CHAR(64) NOT NULL,
            expires_at DATETIME NOT NULL,
            used_at DATETIME NULL,
            attempt_count INT NOT NULL DEFAULT 0,
            request_ip VARCHAR(64) NOT NULL DEFAULT "",
            user_agent VARCHAR(255) NOT NULL DEFAULT "",
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uq_account_verification_code_hash (code_hash),
            KEY idx_account_verification_identifier (identifier(190), purpose, created_at),
            KEY idx_account_verification_account (account_id, created_at)
        )'
    );
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_security_settings (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            two_factor_enabled TINYINT(1) NOT NULL DEFAULT 0,
            two_factor_method VARCHAR(32) NOT NULL DEFAULT "email_code",
            two_factor_secret VARCHAR(128) NOT NULL DEFAULT "",
            two_factor_pending_secret VARCHAR(128) NOT NULL DEFAULT "",
            two_factor_confirmed_at DATETIME NULL,
            recovery_email VARCHAR(255) NOT NULL DEFAULT "",
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )'
    );
    ensureTableColumn($pdo, 'account_security_settings', 'two_factor_secret', 'two_factor_secret VARCHAR(128) NOT NULL DEFAULT ""');
    ensureTableColumn($pdo, 'account_security_settings', 'two_factor_pending_secret', 'two_factor_pending_secret VARCHAR(128) NOT NULL DEFAULT ""');
    $checked = true;
}

function ensureColumn(PDO $pdo, string $column, string $definition): void
{
    ensureTableColumn($pdo, 'account_profiles', $column, $definition);
}

function ensureTableColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    $quotedTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
    if ($quotedTable === '') {
        throw new InvalidArgumentException('Invalid table name');
    }

    if (tableColumnExists($pdo, $quotedTable, $column)) {
        return;
    }

    $pdo->exec('ALTER TABLE ' . $quotedTable . ' ADD COLUMN ' . $definition);
}

function tableColumnExists(PDO $pdo, string $table, string $column): bool
{
    $quotedTable = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
    if ($quotedTable === '') {
        throw new InvalidArgumentException('Invalid table name');
    }

    $statement = $pdo->query('SHOW COLUMNS FROM ' . $quotedTable . ' LIKE ' . $pdo->quote($column));
    return (bool)($statement && $statement->fetch());
}

function normalizeColor(mixed $value): string
{
    $color = trim((string)$value);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1 ? $color : '#2563eb';
}

function normalizeBirthDate(mixed $value): string
{
    $date = trim((string)$value);
    return preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) === 1 ? $date : '';
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

function boolToTinyInt(mixed $value): int
{
    if (is_bool($value)) {
        return $value ? 1 : 0;
    }

    $normalized = strtolower(trim((string)$value));
    return in_array($normalized, ['1', 'true', 'yes', 'on'], true) ? 1 : 0;
}

function domainFromJid(string $jid): string
{
    $bare = bareJid($jid);
    $parts = explode('@', $bare, 2);
    return count($parts) === 2 && $parts[1] !== '' ? $parts[1] : 'localhost';
}

function effectiveXmppDomain(array $input, string $jid): string
{
    $domain = cleanText($input['xmppDomain'] ?? domainFromJid($jid), 255);
    $host = cleanText($input['xmppHost'] ?? $domain, 255);
    $webSocket = cleanText($input['xmppWebSocket'] ?? '', 255);
    if (isLocalXmppDomain($host) || isLocalXmppWebSocketUrl($webSocket)) {
        return 'localhost';
    }

    return $domain !== '' ? $domain : domainFromJid($jid);
}

function isLocalXmppDomain(string $domain): bool
{
    $normalized = strtolower(trim($domain));
    return in_array($normalized, ['localhost', '127.0.0.1', '::1'], true);
}

function isLocalXmppWebSocketUrl(string $url): bool
{
    if ($url === '') {
        return false;
    }

    $host = parse_url($url, PHP_URL_HOST);
    return is_string($host) && isLocalXmppDomain($host);
}

function accountIdFromJid(string $jid): string
{
    $bare = strtolower(bareJid($jid));
    $id = preg_replace('/[^a-z0-9._-]+/', '-', $bare) ?? '';
    $id = trim($id, '-._');
    return $id !== '' ? 'jid-' . $id : 'local-account';
}

function displayNameFromJid(string $jid): string
{
    $bare = bareJid($jid);
    $parts = explode('@', $bare, 2);
    return $parts[0] !== '' ? $parts[0] : 'Me';
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

function verifyXmppAccountPassword(string $jid, string $password): bool
{
    $bare = strtolower(bareJid($jid));
    $parts = explode('@', $bare, 2);
    if (count($parts) !== 2 || $parts[0] === '' || $parts[1] === '') {
        return false;
    }

    try {
        $pdo = Database::connectXmpp();
        $statement = $pdo->prepare(
            'SELECT username, type, password, serverkey, salt, iterationcount
             FROM users
             WHERE username = :username
             LIMIT 1'
        );
        $statement->execute(['username' => $parts[0]]);
        $row = $statement->fetch();
    } catch (Throwable) {
        return false;
    }

    if (!is_array($row)) {
        return false;
    }

    $storedPassword = (string)($row['password'] ?? '');
    $serverKey = (string)($row['serverkey'] ?? '');
    $salt = (string)($row['salt'] ?? '');
    $iterations = (int)($row['iterationcount'] ?? 0);

    if ($serverKey === '' && $salt === '' && $iterations <= 0) {
        return hash_equals($storedPassword, $password);
    }

    // ejabberd stores SCRAM material in the same table when SCRAM password
    // storage is enabled. We do not have enough data here to authenticate
    // every SCRAM variant locally, so the browser XMPP login remains the final
    // authority for those accounts.
    return false;
}

function xmppAccountExists(string $jid): bool
{
    $parts = explode('@', bareJid($jid), 2);
    if (count($parts) !== 2 || $parts[0] === '') {
        return false;
    }

    try {
        $pdo = Database::connectXmpp();
        $statement = $pdo->prepare('SELECT username FROM users WHERE username = :username LIMIT 1');
        $statement->execute(['username' => $parts[0]]);
        return is_array($statement->fetch());
    } catch (Throwable) {
        return false;
    }
}

/**
 * @return list<string>
 */
function suggestAvailableLocalJids(PDO $pdo, string $jid, int $limit = 3): array
{
    $parts = explode('@', strtolower(bareJid($jid)), 2);
    if (count($parts) !== 2 || $parts[0] === '') {
        return [];
    }

    $base = preg_replace('/[^a-z0-9._-]+/', '', $parts[0]) ?? '';
    $base = trim($base, '._-');
    if ($base === '') {
        $base = 'gebruiker';
    }

    $suggestions = [];
    for ($index = 1; $index <= 99 && count($suggestions) < $limit; $index++) {
        $candidate = $base . $index . '@localhost';
        if (!xmppAccountExists($candidate) && !accountProfileJidExists($pdo, $candidate)) {
            $suggestions[] = $candidate;
        }
    }

    return $suggestions;
}

function accountProfileJidExists(PDO $pdo, string $jid): bool
{
    $statement = $pdo->prepare('SELECT jid FROM account_profiles WHERE jid = :jid LIMIT 1');
    $statement->execute(['jid' => bareJid($jid)]);
    return is_array($statement->fetch());
}

function createXmppSqlAccount(string $username, string $password): bool
{
    $username = strtolower(cleanText($username, 191));
    if ($username === '' || !preg_match('/^[a-z0-9._-]+$/', $username)) {
        return false;
    }

    try {
        $pdo = Database::connectXmpp();
        $statement = $pdo->prepare(
            'INSERT INTO users (username, type, password, serverkey, salt, iterationcount)
             VALUES (:username, 1, :password, "", "", 0)'
        );
        return $statement->execute([
            'username' => $username,
            'password' => $password,
        ]);
    } catch (PDOException $error) {
        if ($error->getCode() === '23000') {
            return false;
        }

        throw $error;
    }
}

function updateXmppSqlPassword(string $jid, string $password): bool
{
    $parts = explode('@', bareJid($jid), 2);
    if (count($parts) !== 2 || $parts[0] === '') {
        return false;
    }

    $pdo = Database::connectXmpp();
    $statement = $pdo->prepare(
        'UPDATE users
         SET password = :password, serverkey = "", salt = "", iterationcount = 0
         WHERE username = :username'
    );
    $statement->execute([
        'password' => $password,
        'username' => $parts[0],
    ]);
    return $statement->rowCount() > 0;
}

function buildPasswordResetLink(string $token): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['SERVER_PORT'] ?? '') === '443');
    $scheme = $https ? 'https' : 'http';
    $host = cleanText($_SERVER['HTTP_HOST'] ?? 'teletyptel', 255);
    $path = strtok((string)($_SERVER['REQUEST_URI'] ?? '/api/account.php'), '?') ?: '/api/account.php';
    $basePath = preg_replace('#/api/account\.php$#', '/chat.html', $path) ?: '/chat.html';
    return "{$scheme}://{$host}{$basePath}?reset=" . rawurlencode($token);
}

function sendPasswordResetMail(PDO $pdo, string $jid, string $subject, string $body, string $resetLink): bool
{
    $mailError = '';
    $recipient = passwordResetMailRecipient($jid);
    return sendTeletyptelMail($pdo, $recipient, $subject, $body, $resetLink, $mailError, $jid);
}

function sendTeletyptelMail(PDO $pdo, string $recipient, string $subject, string $body, string $reference = '', string &$mailError = '', string $logIdentity = ''): bool
{
    $sent = sendConfiguredSmtpMail($recipient, $subject, $body, $mailError);
    if (!$sent && function_exists('mail')) {
        $from = mailFromAddress();
        $headers = [
            'From: ' . $from,
            'Content-Type: text/plain; charset=UTF-8',
        ];
        $sent = @mail($recipient, $subject, $body, implode("\r\n", $headers));
        if (!$sent && $mailError === '') {
            $mailError = 'PHP mail() returned false';
        }
    }

    $statement = $pdo->prepare(
        'INSERT INTO account_mail_log (jid, subject, body, reset_link, sent, error_text)
         VALUES (:jid, :subject, :body, :reset_link, :sent, :error_text)'
    );
    $statement->execute([
        'jid' => $logIdentity !== '' ? $logIdentity : $recipient,
        'subject' => $subject,
        'body' => $body,
        'reset_link' => $reference,
        'sent' => $sent ? 1 : 0,
        'error_text' => cleanText($mailError, 512),
    ]);
    return $sent;
}

function verificationCodeHash(string $code, string $accountId, string $purpose, string $identifier): string
{
    return hash('sha256', $accountId . '|' . $purpose . '|' . strtolower($identifier) . '|' . $code);
}

function totpGenerateSecret(int $bytes = 20): string
{
    return base32Encode(random_bytes($bytes));
}

function buildTotpUri(string $issuer, string $label, string $secret): string
{
    return 'otpauth://totp/'
        . rawurlencode($label)
        . '?secret=' . rawurlencode($secret)
        . '&issuer=' . rawurlencode($issuer)
        . '&algorithm=SHA1&digits=6&period=30';
}

function totpVerifyCode(string $secret, string $code, int $window = 1): bool
{
    $timeStep = intdiv(time(), 30);
    for ($offset = -$window; $offset <= $window; $offset++) {
        if (hash_equals(totpCodeAt($secret, $timeStep + $offset), $code)) {
            return true;
        }
    }

    return false;
}

function totpCodeAt(string $secret, int $timeStep): string
{
    $key = base32Decode($secret);
    if ($key === '') {
        return '000000';
    }

    $counter = pack('N*', 0, $timeStep);
    $hash = hash_hmac('sha1', $counter, $key, true);
    $offset = ord(substr($hash, -1)) & 0x0f;
    $binary = ((ord($hash[$offset]) & 0x7f) << 24)
        | ((ord($hash[$offset + 1]) & 0xff) << 16)
        | ((ord($hash[$offset + 2]) & 0xff) << 8)
        | (ord($hash[$offset + 3]) & 0xff);
    return str_pad((string)($binary % 1000000), 6, '0', STR_PAD_LEFT);
}

function base32Encode(string $bytes): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $bits = '';
    $output = '';
    for ($index = 0, $length = strlen($bytes); $index < $length; $index++) {
        $bits .= str_pad(decbin(ord($bytes[$index])), 8, '0', STR_PAD_LEFT);
    }

    for ($index = 0, $length = strlen($bits); $index < $length; $index += 5) {
        $chunk = substr($bits, $index, 5);
        if (strlen($chunk) < 5) {
            $chunk = str_pad($chunk, 5, '0', STR_PAD_RIGHT);
        }
        $output .= $alphabet[bindec($chunk)];
    }

    return $output;
}

function base32Decode(string $secret): string
{
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $secret = strtoupper(preg_replace('/[^A-Z2-7]/i', '', $secret) ?? '');
    $bits = '';
    for ($index = 0, $length = strlen($secret); $index < $length; $index++) {
        $value = strpos($alphabet, $secret[$index]);
        if ($value === false) {
            continue;
        }
        $bits .= str_pad(decbin($value), 5, '0', STR_PAD_LEFT);
    }

    $output = '';
    for ($index = 0, $length = strlen($bits) - 7; $index < $length; $index += 8) {
        $output .= chr(bindec(substr($bits, $index, 8)));
    }

    return $output;
}

function maskEmailAddress(string $email): string
{
    $parts = explode('@', $email, 2);
    if (count($parts) !== 2) {
        return '***';
    }

    $name = $parts[0];
    $prefix = mb_substr($name, 0, 2, 'UTF-8');
    return $prefix . str_repeat('*', max(2, mb_strlen($name, 'UTF-8') - 2)) . '@' . $parts[1];
}

function passwordResetMailRecipient(string $jid): string
{
    $bare = bareJid($jid);
    $domain = domainFromJid($bare);
    if (filter_var($bare, FILTER_VALIDATE_EMAIL) && $domain !== 'localhost' && str_contains($domain, '.')) {
        return $bare;
    }

    $smtp = appConfig()['smtp'] ?? [];
    $fallback = cleanText($smtp['local_recipient'] ?? '', 255);
    if ($fallback !== '') {
        return $fallback;
    }

    $username = cleanText($smtp['username'] ?? '', 255);
    return $username !== '' ? $username : $bare;
}

function sendConfiguredSmtpMail(string $to, string $subject, string $body, string &$error = ''): bool
{
    $smtp = appConfig()['smtp'] ?? [];
    if (($smtp['enabled'] ?? false) !== true || empty($smtp['host'])) {
        $error = 'SMTP disabled or host missing';
        return false;
    }

    $host = cleanText($smtp['host'] ?? '', 255);
    $port = (int)($smtp['port'] ?? 587);
    $encryption = strtolower(cleanText($smtp['encryption'] ?? 'starttls', 16));
    $timeout = max(3, (int)($smtp['timeout'] ?? 10));
    $target = $encryption === 'ssl' ? "ssl://{$host}:{$port}" : "tcp://{$host}:{$port}";
    $socket = @stream_socket_client($target, $errno, $errstr, $timeout, STREAM_CLIENT_CONNECT);
    if (!is_resource($socket)) {
        $error = "SMTP connect failed: {$errno} {$errstr}";
        return false;
    }

    stream_set_timeout($socket, $timeout);
    try {
        smtpExpect($socket, [220]);
        $serverName = cleanText($_SERVER['SERVER_NAME'] ?? 'teletyptel.local', 255);
        smtpCommand($socket, "EHLO {$serverName}", [250]);
        if ($encryption === 'starttls') {
            smtpCommand($socket, 'STARTTLS', [220]);
            if (!@stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                $error = 'SMTP STARTTLS failed';
                return false;
            }
            smtpCommand($socket, "EHLO {$serverName}", [250]);
        }

        $username = cleanText($smtp['username'] ?? '', 255);
        $password = cleanText($smtp['password'] ?? '', 1024);
        if ($username === '' || $password === '') {
            $error = 'SMTP username or password missing';
            return false;
        }

        smtpCommand($socket, 'AUTH LOGIN', [334]);
        smtpCommand($socket, base64_encode($username), [334]);
        smtpCommand($socket, base64_encode($password), [235]);

        $fromAddress = extractEmailAddress(mailFromAddress());
        smtpCommand($socket, 'MAIL FROM:<' . $fromAddress . '>', [250]);
        smtpCommand($socket, 'RCPT TO:<' . $to . '>', [250, 251]);
        smtpCommand($socket, 'DATA', [354]);
        $message = buildSmtpMessage($to, $subject, $body);
        fwrite($socket, $message . "\r\n.\r\n");
        smtpExpect($socket, [250]);
        smtpCommand($socket, 'QUIT', [221]);
        return true;
    } catch (Throwable $smtpError) {
        $error = $smtpError->getMessage();
        return false;
    } finally {
        fclose($socket);
    }
}

function smtpCommand(mixed $socket, string $command, array $expectedCodes): string
{
    fwrite($socket, $command . "\r\n");
    return smtpExpect($socket, $expectedCodes);
}

function smtpExpect(mixed $socket, array $expectedCodes): string
{
    $response = '';
    do {
        $line = fgets($socket, 2048);
        if ($line === false) {
            throw new RuntimeException('SMTP connection closed');
        }

        $response .= $line;
        $code = (int)substr($line, 0, 3);
        $more = strlen($line) > 3 && $line[3] === '-';
    } while ($more);

    if (!in_array($code, $expectedCodes, true)) {
        throw new RuntimeException('SMTP unexpected response: ' . trim($response));
    }

    return $response;
}

function buildSmtpMessage(string $to, string $subject, string $body): string
{
    $from = mailFromAddress();
    $headers = [
        'From: ' . $from,
        'To: ' . $to,
        'Subject: ' . encodeMailHeader($subject),
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
    ];
    $safeBody = preg_replace('/^\./m', '..', str_replace(["\r\n", "\r"], "\n", $body)) ?? $body;
    return implode("\r\n", $headers) . "\r\n\r\n" . str_replace("\n", "\r\n", $safeBody);
}

function encodeMailHeader(string $value): string
{
    return '=?UTF-8?B?' . base64_encode($value) . '?=';
}

function mailFromAddress(): string
{
    $smtp = appConfig()['smtp'] ?? [];
    return cleanText($smtp['from'] ?? 'TeleTypTel <no-reply@teletyptel.local>', 255);
}

function extractEmailAddress(string $value): string
{
    if (preg_match('/<([^>]+)>/', $value, $matches)) {
        return cleanText($matches[1], 255);
    }

    return cleanText($value, 255);
}

function appConfig(): array
{
    static $config = null;
    if (is_array($config)) {
        return $config;
    }

    $path = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($path)) {
        $config = [];
        return $config;
    }

    $loaded = require $path;
    $config = is_array($loaded) ? $loaded : [];
    $localPath = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.local.php';
    if (is_file($localPath)) {
        $local = require $localPath;
        if (is_array($local)) {
            $config = array_replace_recursive($config, $local);
        }
    }
    return $config;
}

function bareJid(string $jid): string
{
    return strtolower(trim(explode('/', $jid, 2)[0]));
}

function cleanText(mixed $value, int $maxLength): string
{
    $text = trim((string)$value);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }

    return substr($text, 0, $maxLength);
}
