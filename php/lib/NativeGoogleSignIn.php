<?php
declare(strict_types=1);

final class NativeGoogleSignIn
{
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

    public static function begin(array &$session, int $now): string
    {
        $challenge = bin2hex(random_bytes(32));
        $session['teletyptel_native_google'] = ['challenge' => $challenge, 'created_at' => $now];
        return $challenge;
    }

    public static function consume(array &$session, string $challenge, int $now): void
    {
        $pending = $session['teletyptel_native_google'] ?? null;
        unset($session['teletyptel_native_google']);
        if (!is_array($pending) || $challenge === ''
            || !hash_equals((string)($pending['challenge'] ?? ''), $challenge)
            || $now - (int)($pending['created_at'] ?? 0) > 600
            || $now < (int)($pending['created_at'] ?? 0)) {
            throw new InvalidArgumentException('invalid_challenge');
        }
    }

    public static function exchange(string $code, array $config, callable $http): array
    {
        if ($code === '' || strlen($code) > 4096 || preg_match('/[\x00-\x20\x7f]/', $code)) {
            throw new InvalidArgumentException('invalid_code');
        }
        if (empty($config['client_id']) || empty($config['client_secret'])) {
            throw new RuntimeException('google_not_configured');
        }
        $tokens = $http('POST', 'https://oauth2.googleapis.com/token', [
            'grant_type' => 'authorization_code',
            'code' => $code,
            'client_id' => $config['client_id'],
            'client_secret' => $config['client_secret'],
            'redirect_uri' => '',
        ], []);
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
