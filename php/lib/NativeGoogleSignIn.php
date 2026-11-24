<?php
declare(strict_types=1);

final class NativeGoogleSignIn
{
    public const BROWSER_STATE_PREFIX = 'tt-ios-';
    public const BROWSER_CALLBACK = 'teletyptel-google://signin/complete';

    public static function assertRequest(array $server): void
    {
        $https = strtolower((string)($server['HTTPS'] ?? ''));
        if ($https === '' || $https === 'off') throw new InvalidArgumentException('https_required');
        if (($server['REQUEST_METHOD'] ?? '') !== 'POST') throw new InvalidArgumentException('post_required');
        $origin = 'https://' . (string)($server['HTTP_HOST'] ?? '');
        if (($server['HTTP_ORIGIN'] ?? '') !== $origin
            || ($server['HTTP_X_TELETYPTEL_NATIVE'] ?? '') !== 'google'
            || strtolower(trim(explode(';', (string)($server['CONTENT_TYPE'] ?? ''))[0])) !== 'application/json') {
            throw new InvalidArgumentException('invalid_origin');
        }
    }

    public static function begin(array &$session, int $now, ?string $browserChallenge = null): string
    {
        if ($browserChallenge !== null && !self::validBrowserProof($browserChallenge)) {
            throw new InvalidArgumentException('invalid_browser_challenge');
        }
        $challenge = bin2hex(random_bytes(32));
        $session['teletyptel_native_google'] = [
            'challenge' => $challenge, 'created_at' => $now, 'browser_challenge' => $browserChallenge,
        ];
        return $challenge;
    }

    public static function consume(array &$session, string $challenge, int $now, ?string $browserVerifier = null): void
    {
        $pending = $session['teletyptel_native_google'] ?? null;
        unset($session['teletyptel_native_google']);
        if (!is_array($pending) || $challenge === ''
            || !hash_equals((string)($pending['challenge'] ?? ''), $challenge)
            || $now - (int)($pending['created_at'] ?? 0) > 600
            || $now < (int)($pending['created_at'] ?? 0)) {
            throw new InvalidArgumentException('invalid_challenge');
        }
        $browserChallenge = $pending['browser_challenge'] ?? null;
        if (($browserChallenge === null) !== ($browserVerifier === null)
            || ($browserVerifier !== null && (!self::validBrowserProof($browserVerifier)
                || !hash_equals((string)$browserChallenge, self::browserChallenge($browserVerifier))))) {
            throw new InvalidArgumentException('invalid_browser_verifier');
        }
    }

    public static function validBrowserProof(string $value): bool
    {
        return preg_match('/\A[A-Za-z0-9_-]{43}\z/', $value) === 1;
    }

    public static function browserChallenge(string $verifier): string
    {
        return rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '=');
    }

    public static function supportsBrowserChoice(string $redirectUri, string $origin): bool
    {
        return in_array($redirectUri, [
            $origin . '/api/auth/google/callback',
            $origin . '/api/auth/google/callback.php',
        ], true) && str_starts_with($origin, 'https://');
    }

    public static function startBrowser(array &$session, string $challenge, string $proof, int $now): string
    {
        if (preg_match('/\A[a-f0-9]{64}\z/', $challenge) !== 1 || !self::validBrowserProof($proof)) {
            throw new InvalidArgumentException('invalid_browser_challenge');
        }
        $state = self::BROWSER_STATE_PREFIX . $challenge;
        $session['teletyptel_google_browser_state'] = ['state' => $state, 'created_at' => $now];
        return $state;
    }

    public static function redirectBrowser(array &$session, string $state, array $request, int $now): string
    {
        $pending = $session['teletyptel_google_browser_state'] ?? null;
        if (!is_array($pending) || !hash_equals($pending['state'], $state)
            || $now < $pending['created_at'] || $now - $pending['created_at'] > 600) {
            throw new InvalidArgumentException('invalid_browser_state');
        }
        unset($session['teletyptel_google_browser_state']);
        $code = $request['code'] ?? null;
        $query = ['state' => $state];
        if (!isset($request['error']) && is_string($code) && self::validCode($code)) {
            $query['code'] = $code;
        } else {
            $query['error'] = ($request['error'] ?? null) === 'access_denied' ? 'access_denied' : 'provider_error';
        }
        return self::BROWSER_CALLBACK . '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    private static function validCode(string $code): bool
    {
        return $code !== '' && strlen($code) <= 4096 && !preg_match('/[\x00-\x20\x7f]/', $code);
    }

    public static function exchange(string $code, array $config, callable $http, string $redirectUri = '', ?string $verifier = null): array
    {
        if (!self::validCode($code)) {
            throw new InvalidArgumentException('invalid_code');
        }
        if (empty($config['client_id']) || empty($config['client_secret'])) {
            throw new RuntimeException('google_not_configured');
        }
        $fields = [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'client_id' => $config['client_id'],
            'client_secret' => $config['client_secret'],
            'redirect_uri' => $redirectUri,
        ];
        if ($verifier !== null) {
            $fields['code_verifier'] = $verifier;
        }
        $tokens = $http('POST', 'https://oauth2.googleapis.com/token', $fields, []);
        if (!is_string($tokens['access_token'] ?? null) || $tokens['access_token'] === ''
            || preg_match('/[\r\n]/', $tokens['access_token']) || isset($tokens['error'])) {
            throw new RuntimeException('google_exchange_failed');
        }
        $profile = $http('GET', 'https://openidconnect.googleapis.com/v1/userinfo', null,
            ['Authorization: Bearer ' . $tokens['access_token']]);
        if (!is_string($profile['sub'] ?? null) || $profile['sub'] === '' || strlen($profile['sub']) > 255
            || !is_string($profile['email'] ?? null) || !filter_var($profile['email'], FILTER_VALIDATE_EMAIL)
            || ($profile['email_verified'] ?? false) !== true || isset($profile['error'])) {
            throw new RuntimeException('google_profile_invalid');
        }
        $authoritative = str_ends_with(strtolower($profile['email']), '@gmail.com')
            || (is_string($profile['hd'] ?? null) && $profile['hd'] !== '');
        return [
            'subject' => $profile['sub'],
            'email' => $profile['email'],
            'email_verified' => $authoritative,
            'display_name' => mb_substr((string)($profile['name'] ?? ''), 0, 255),
        ];
    }
}
