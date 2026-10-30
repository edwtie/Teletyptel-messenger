<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'bootstrap.php';
require_once dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'NativeGoogleSignIn.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    NativeGoogleSignIn::assertRequest($_SERVER);
    $body = file_get_contents('php://input', false, null, 0, 8193);
    if ($body === false || strlen($body) > 8192) throw new InvalidArgumentException('invalid_body');
    $input = json_decode($body, true);
    if (!is_array($input)) throw new InvalidArgumentException('invalid_body');
    session_set_cookie_params(['httponly' => true, 'secure' => true, 'samesite' => 'Lax']);
    session_start();
    $config = ttAuthProviderConfig('google');
    if (empty($config['client_id']) || empty($config['client_secret'])) {
        ttAuthJson(['ok' => false, 'error' => 'google_not_configured'], 503);
        return;
    }
    if (($input['action'] ?? '') === 'begin') {
        ttAuthJson(['ok' => true, 'challenge' => NativeGoogleSignIn::begin($_SESSION, time()), 'serverClientId' => $config['client_id']]);
        return;
    }
    if (($input['action'] ?? '') !== 'complete' || !is_string($input['challenge'] ?? null)
        || !is_string($input['code'] ?? null)) throw new InvalidArgumentException('invalid_body');
    NativeGoogleSignIn::consume($_SESSION, $input['challenge'], time());
    $profile = NativeGoogleSignIn::exchange($input['code'], $config, 'ttAuthHttp');
    $pdo = Database::connect();
    AccountAccess::guardSession($pdo, $_SESSION);
    ttAuthEnsureAccountSchema($pdo);
    $account = ttAuthPersistProviderAccount($pdo, 'google', $profile, $config);
    ttAuthJson(ttAuthBindProviderSession($pdo, $account));
} catch (InvalidArgumentException $error) {
    ttAuthJson(['ok' => false, 'error' => $error->getMessage()], 400);
} catch (AccountAccessDenied $error) {
    ttAuthJson(['ok' => false, 'error' => 'account_access_denied'], 403);
} catch (Throwable $error) {
    ttAuthJson(['ok' => false, 'error' => 'native_google_failed'], 502);
}
