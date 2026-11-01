<?php
declare(strict_types=1);

require_once dirname(__DIR__) . DIRECTORY_SEPARATOR . 'bootstrap.php';
require_once dirname(__DIR__, 4) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'NativeFacebookSignIn.php';

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    NativeFacebookSignIn::assertRequest($_SERVER);
    $body = file_get_contents('php://input', false, null, 0, 24577);
    if ($body === false || strlen($body) > 24576) throw new InvalidArgumentException('invalid_body');
    $input = json_decode($body, true, 16);
    if (!is_array($input)) throw new InvalidArgumentException('invalid_body');
    session_set_cookie_params(['httponly' => true, 'secure' => true, 'samesite' => 'Lax']);
    session_start();
    $config = ttAuthProviderConfig('facebook');
    try {
        $appId = NativeFacebookSignIn::appId($config);
    } catch (RuntimeException $error) {
        ttAuthJson(['ok' => false, 'error' => 'facebook_not_configured'], 503);
        return;
    }
    if (($input['action'] ?? '') === 'begin') {
        ttAuthJson(['ok' => true, 'challenge' => NativeFacebookSignIn::begin($_SESSION, time()), 'appId' => $appId]);
        return;
    }
    if (($input['action'] ?? '') !== 'complete' || !is_string($input['challenge'] ?? null)
        || !is_string($input['token'] ?? null)) throw new InvalidArgumentException('invalid_body');
    NativeFacebookSignIn::consume($_SESSION, $input['challenge'], time());
    $profile = NativeFacebookSignIn::verify($input['token'], $input['challenge'], $config, time());
    $pdo = Database::connect();
    AccountAccess::guardSession($pdo, $_SESSION);
    ttAuthEnsureAccountSchema($pdo);
    $account = ttAuthPersistProviderAccount($pdo, 'facebook', $profile, $config);
    ttAuthJson(ttAuthBindProviderSession($pdo, $account));
} catch (InvalidArgumentException $error) {
    ttAuthJson(['ok' => false, 'error' => $error->getMessage()], 400);
} catch (AccountAccessDenied $error) {
    ttAuthJson(['ok' => false, 'error' => 'account_access_denied'], 403);
} catch (Throwable $error) {
    ttAuthJson(['ok' => false, 'error' => 'native_facebook_failed'], 502);
}
