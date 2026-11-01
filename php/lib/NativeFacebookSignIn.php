<?php
declare(strict_types=1);

final class NativeFacebookSignIn
{
    public const JWKS_URL = 'https://www.facebook.com/.well-known/oauth/openid/jwks/';
    public const CHALLENGE_TTL = 600;
    public const MAX_TOKEN_BYTES = 16384;

    public static function assertRequest(array $server): void
    {
        $https = strtolower((string)($server['HTTPS'] ?? ''));
        if (!in_array($https, ['on', '1'], true)) throw new InvalidArgumentException('https_required');
        if (($server['REQUEST_METHOD'] ?? '') !== 'POST') throw new InvalidArgumentException('post_required');
        $host = (string)($server['HTTP_HOST'] ?? '');
        if ($host === '' || preg_match('/[\x00-\x20\x7f\/@?#]/', $host)
            || ($server['HTTP_ORIGIN'] ?? '') !== 'https://' . $host
            || ($server['HTTP_X_TELETYPTEL_NATIVE'] ?? '') !== 'facebook'
            || strtolower(trim(explode(';', (string)($server['CONTENT_TYPE'] ?? ''))[0])) !== 'application/json'
            || (isset($server['HTTP_SEC_FETCH_SITE']) && !in_array($server['HTTP_SEC_FETCH_SITE'], ['same-origin', 'none'], true))) {
            throw new InvalidArgumentException('invalid_origin');
        }
    }

    public static function appId(array $config): string
    {
        $appId = $config['client_id'] ?? null;
        if (!is_string($appId) || !preg_match('/\A[0-9]{1,32}\z/', $appId)) {
            throw new RuntimeException('facebook_not_configured');
        }
        return $appId;
    }

    public static function begin(array &$session, int $now): string
    {
        $challenge = bin2hex(random_bytes(32));
        $session['teletyptel_native_facebook'] = ['challenge' => $challenge, 'created_at' => $now];
        return $challenge;
    }

    public static function consume(array &$session, string $challenge, int $now): void
    {
        $pending = $session['teletyptel_native_facebook'] ?? null;
        unset($session['teletyptel_native_facebook']);
        if (!is_array($pending) || !preg_match('/\A[a-f0-9]{64}\z/', $challenge)
            || !is_string($pending['challenge'] ?? null) || !hash_equals($pending['challenge'], $challenge)
            || !is_int($pending['created_at'] ?? null) || $pending['created_at'] > $now
            || $now - $pending['created_at'] >= self::CHALLENGE_TTL) {
            throw new InvalidArgumentException('invalid_challenge');
        }
    }

    public static function verify(string $token, string $challenge, array $config, int $now, ?callable $http = null): array
    {
        $appId = self::appId($config);
        if (strlen($token) > self::MAX_TOKEN_BYTES || !preg_match('/\A[a-f0-9]{64}\z/', $challenge)) {
            throw new InvalidArgumentException('invalid_token');
        }
        $parts = explode('.', $token);
        if (count($parts) !== 3 || strlen($parts[0]) > 1024 || strlen($parts[2]) > 1366) {
            throw new InvalidArgumentException('invalid_token');
        }
        $header = self::decodeObject(self::decodeBase64Url($parts[0]));
        $claims = self::decodeObject(self::decodeBase64Url($parts[1]));
        $signature = self::decodeBase64Url($parts[2]);
        if (($header['alg'] ?? '') !== 'RS256'
            || !is_string($header['kid'] ?? null) || !preg_match('/\A[A-Za-z0-9_-]{1,128}\z/', $header['kid'])
            || (array_key_exists('typ', $header) && $header['typ'] !== 'JWT')
            || array_diff(array_keys($header), ['alg', 'kid', 'typ'])
            || strlen($signature) < 256) {
            throw new InvalidArgumentException('invalid_token');
        }
        if (($claims['iss'] ?? '') !== 'https://www.facebook.com' || ($claims['aud'] ?? '') !== $appId
            || !is_int($claims['exp'] ?? null) || $claims['exp'] <= $now
            || !is_int($claims['iat'] ?? null) || $claims['iat'] < $now - self::CHALLENGE_TTL
            || $claims['iat'] > $now + 60 || $claims['iat'] >= $claims['exp']
            || (array_key_exists('nbf', $claims) && (!is_int($claims['nbf']) || $claims['nbf'] > $now))
            || !is_string($claims['nonce'] ?? null) || !hash_equals($challenge, $claims['nonce'])
            || !is_string($claims['sub'] ?? null) || !preg_match('/\A[^\x00-\x20\x7f]{1,255}\z/', $claims['sub'])
            || !is_string($claims['jti'] ?? null) || $claims['jti'] === '' || strlen($claims['jti']) > 255) {
            throw new InvalidArgumentException('invalid_token');
        }
        $jwks = ($http ?? [self::class, 'http'])('GET', self::JWKS_URL, null, ['Accept: application/json']);
        $publicKey = self::publicKey($jwks, $header['kid']);
        if (openssl_verify($parts[0] . '.' . $parts[1], $signature, $publicKey, OPENSSL_ALGO_SHA256) !== 1) {
            throw new InvalidArgumentException('invalid_token');
        }
        $email = $claims['email'] ?? '';
        $name = $claims['name'] ?? '';
        if (!is_string($email) || strlen($email) > 255 || ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL))
            || !is_string($name)) {
            throw new InvalidArgumentException('invalid_token');
        }
        return [
            'subject' => $claims['sub'],
            'email' => $email,
            'email_verified' => false,
            'display_name' => mb_substr($name, 0, 255),
        ];
    }

    public static function http(string $method, string $url, ?array $fields = null, array $headers = []): array
    {
        if ($method !== 'GET' || $url !== self::JWKS_URL || $fields !== null || $headers !== ['Accept: application/json']) {
            throw new RuntimeException('facebook_keys_unavailable');
        }
        $context = stream_context_create([
            'http' => [
                'method' => 'GET', 'header' => 'Accept: application/json', 'timeout' => 10,
                'follow_location' => 0, 'max_redirects' => 0, 'ignore_errors' => true,
            ],
            'ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'allow_self_signed' => false],
        ]);
        $http_response_header = [];
        $body = @file_get_contents(self::JWKS_URL, false, $context, 0, 65537);
        if ($body === false || strlen($body) > 65536
            || !preg_match('/\AHTTP\/\S+ 200(?: |$)/', $http_response_header[0] ?? '')) {
            throw new RuntimeException('facebook_keys_unavailable');
        }
        try {
            return self::decodeObject($body);
        } catch (InvalidArgumentException $error) {
            throw new RuntimeException('facebook_keys_unavailable');
        }
    }

    private static function decodeObject(string $json): array
    {
        try {
            $object = json_decode($json, false, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new InvalidArgumentException('invalid_token');
        }
        if (!$object instanceof stdClass) throw new InvalidArgumentException('invalid_token');
        return (array)$object;
    }

    private static function decodeBase64Url(string $encoded): string
    {
        if ($encoded === '' || !preg_match('/\A[A-Za-z0-9_-]+\z/', $encoded)) {
            throw new InvalidArgumentException('invalid_token');
        }
        $decoded = base64_decode(strtr($encoded, '-_', '+/'), true);
        if ($decoded === false || rtrim(strtr(base64_encode($decoded), '+/', '-_'), '=') !== $encoded) {
            throw new InvalidArgumentException('invalid_token');
        }
        return $decoded;
    }

    private static function publicKey(array $jwks, string $kid): OpenSSLAsymmetricKey
    {
        if (isset($jwks['error']) || !is_array($jwks['keys'] ?? null) || count($jwks['keys']) > 32) {
            throw new RuntimeException('facebook_keys_unavailable');
        }
        $matches = [];
        foreach ($jwks['keys'] as $candidate) {
            if ($candidate instanceof stdClass) $candidate = (array)$candidate;
            if (is_array($candidate) && ($candidate['kid'] ?? null) === $kid) $matches[] = $candidate;
        }
        if (count($matches) !== 1) throw new InvalidArgumentException('invalid_token');
        $key = $matches[0];
        if (($key['kty'] ?? '') !== 'RSA'
            || (array_key_exists('alg', $key) && $key['alg'] !== 'RS256')
            || (array_key_exists('use', $key) && $key['use'] !== 'sig')
            || (array_key_exists('key_ops', $key) && $key['key_ops'] !== ['verify'])
            || !is_string($key['n'] ?? null) || strlen($key['n']) > 1366
            || !is_string($key['e'] ?? null) || strlen($key['e']) > 8) {
            throw new InvalidArgumentException('invalid_token');
        }
        $modulus = self::decodeBase64Url($key['n']);
        $exponent = self::decodeBase64Url($key['e']);
        if (strlen($modulus) < 256 || $modulus[0] === "\x00" || $exponent[0] === "\x00") {
            throw new InvalidArgumentException('invalid_token');
        }
        $rsa = self::der(0x30, self::derInteger($modulus) . self::derInteger($exponent));
        $der = self::der(0x30, hex2bin('300d06092a864886f70d0101010500') . self::der(0x03, "\x00" . $rsa));
        $pem = "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
        $publicKey = openssl_pkey_get_public($pem);
        $details = $publicKey === false ? false : openssl_pkey_get_details($publicKey);
        if ($publicKey === false || $details === false || $details['type'] !== OPENSSL_KEYTYPE_RSA
            || $details['bits'] < 2048 || $details['bits'] > 8192) {
            throw new InvalidArgumentException('invalid_token');
        }
        return $publicKey;
    }

    private static function derInteger(string $integer): string
    {
        return self::der(0x02, (ord($integer[0]) > 127 ? "\x00" : '') . $integer);
    }

    private static function der(int $tag, string $value): string
    {
        $length = strlen($value);
        if ($length < 128) return chr($tag) . chr($length) . $value;
        $bytes = ltrim(pack('N', $length), "\x00");
        return chr($tag) . chr(0x80 | strlen($bytes)) . $bytes . $value;
    }
}
