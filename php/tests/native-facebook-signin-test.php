<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/NativeFacebookSignIn.php';

$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function rejects(callable $operation, string $message, string $expected = 'invalid_token'): void
{
    try {
        $operation();
    } catch (InvalidArgumentException | RuntimeException $error) {
        check($error->getMessage() === $expected, $message . ': unexpected error ' . $error->getMessage());
        return;
    }
    throw new RuntimeException('Expected rejection: ' . $message);
}
function base64Url(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}
function signFixture(string $header, string $claims, OpenSSLAsymmetricKey $privateKey): string
{
    $input = base64Url($header) . '.' . base64Url($claims);
    if (!openssl_sign($input, $signature, $privateKey, OPENSSL_ALGO_SHA256)) {
        throw new RuntimeException('Could not sign fixture');
    }
    return $input . '.' . base64Url($signature);
}

$request = ['HTTPS' => 'on', 'REQUEST_METHOD' => 'POST', 'HTTP_HOST' => 'server.test:8443',
    'HTTP_ORIGIN' => 'https://server.test:8443', 'HTTP_X_TELETYPTEL_NATIVE' => 'facebook', 'CONTENT_TYPE' => 'application/json'];
NativeFacebookSignIn::assertRequest($request);
NativeFacebookSignIn::assertRequest(array_replace($request, ['HTTPS' => '1', 'CONTENT_TYPE' => 'application/json; charset=utf-8', 'HTTP_SEC_FETCH_SITE' => 'same-origin']));
check(true, 'same-origin HTTPS JSON requests accepted');
foreach (['HTTPS' => 'https_required', 'REQUEST_METHOD' => 'post_required', 'HTTP_HOST' => 'invalid_origin',
    'HTTP_ORIGIN' => 'invalid_origin', 'HTTP_X_TELETYPTEL_NATIVE' => 'invalid_origin', 'CONTENT_TYPE' => 'invalid_origin'] as $key => $error) {
    $missing = $request;
    unset($missing[$key]);
    rejects(fn() => NativeFacebookSignIn::assertRequest($missing), 'missing ' . $key, $error);
}
foreach (['', 'off', '0', 'false'] as $https) {
    rejects(fn() => NativeFacebookSignIn::assertRequest(array_replace($request, ['HTTPS' => $https])), 'insecure request', 'https_required');
}
foreach (['GET', 'OPTIONS', 'PUT'] as $method) {
    rejects(fn() => NativeFacebookSignIn::assertRequest(array_replace($request, ['REQUEST_METHOD' => $method])), 'wrong method', 'post_required');
}
foreach (['https://evil.test', 'null', 'http://server.test:8443', 'https://server.test', 'https://server.test:8443.evil.test', 'https://server.test:8443/'] as $origin) {
    rejects(fn() => NativeFacebookSignIn::assertRequest(array_replace($request, ['HTTP_ORIGIN' => $origin])), 'wrong origin', 'invalid_origin');
}
foreach (['HTTP_X_TELETYPTEL_NATIVE' => 'google', 'CONTENT_TYPE' => 'text/plain', 'HTTP_SEC_FETCH_SITE' => 'cross-site', 'HTTP_HOST' => 'server.test/path'] as $key => $value) {
    rejects(fn() => NativeFacebookSignIn::assertRequest(array_replace($request, [$key => $value])), 'invalid request ' . $key, 'invalid_origin');
}

$now = 1800000000;
$session = ['unrelated' => true];
$challenge = NativeFacebookSignIn::begin($session, $now);
check(preg_match('/\A[a-f0-9]{64}\z/', $challenge) === 1, '256-bit raw nonce');
check($session['teletyptel_native_facebook']['challenge'] === $challenge, 'nonce is not hashed');
NativeFacebookSignIn::consume($session, $challenge, $now + 599);
check($session === ['unrelated' => true], 'only the pending challenge is removed');
rejects(function () use (&$session, $challenge, $now) { NativeFacebookSignIn::consume($session, $challenge, $now); }, 'challenge replay', 'invalid_challenge');
foreach ([-1, 600, 601] as $offset) {
    $challenge = NativeFacebookSignIn::begin($session, $now);
    rejects(function () use (&$session, $challenge, $now, $offset) { NativeFacebookSignIn::consume($session, $challenge, $now + $offset); }, 'challenge time boundary', 'invalid_challenge');
    check(!isset($session['teletyptel_native_facebook']), 'expired challenge consumed');
}
foreach (['', 'wrong', str_repeat('A', 64), str_repeat('0', 65)] as $invalidChallenge) {
    NativeFacebookSignIn::begin($session, $now);
    rejects(function () use (&$session, $invalidChallenge, $now) { NativeFacebookSignIn::consume($session, $invalidChallenge, $now); }, 'invalid challenge', 'invalid_challenge');
    check(!isset($session['teletyptel_native_facebook']), 'invalid challenge consumed');
}
$first = NativeFacebookSignIn::begin($session, $now);
$second = NativeFacebookSignIn::begin($session, $now);
check($first !== $second, 'begin replaces the challenge with new randomness');
rejects(function () use (&$session, $first, $now) { NativeFacebookSignIn::consume($session, $first, $now); }, 'superseded challenge', 'invalid_challenge');
$sessionA = [];
$sessionB = [];
$challenge = NativeFacebookSignIn::begin($sessionA, $now);
NativeFacebookSignIn::begin($sessionB, $now);
rejects(function () use (&$sessionB, $challenge, $now) { NativeFacebookSignIn::consume($sessionB, $challenge, $now); }, 'cross-session challenge', 'invalid_challenge');
NativeFacebookSignIn::consume($sessionA, $challenge, $now);
check(!isset($sessionA['teletyptel_native_facebook']), 'original session retains its own challenge');
foreach ([null, [], ['challenge' => [], 'created_at' => $now], ['challenge' => $challenge, 'created_at' => (string)$now]] as $pending) {
    $session['teletyptel_native_facebook'] = $pending;
    rejects(function () use (&$session, $challenge, $now) { NativeFacebookSignIn::consume($session, $challenge, $now); }, 'malformed pending state', 'invalid_challenge');
}

$config = ['client_id' => '123456789012345'];
check(NativeFacebookSignIn::appId($config) === $config['client_id'], 'app ID from client_id without a secret');
foreach ([[], ['client_id' => ''], ['client_id' => 123], ['client_id' => 'not-an-app'], ['client_id' => "123\n"], ['client_id' => str_repeat('1', 33)]] as $invalidConfig) {
    rejects(fn() => NativeFacebookSignIn::appId($invalidConfig), 'invalid app configuration', 'facebook_not_configured');
}
$privateKey = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048]);
$otherKey = openssl_pkey_new(['private_key_type' => OPENSSL_KEYTYPE_RSA, 'private_key_bits' => 2048]);
if ($privateKey === false || $otherKey === false) throw new RuntimeException('RSA fixture generation failed');
$details = openssl_pkey_get_details($privateKey);
$key = ['kty' => 'RSA', 'kid' => 'fixture-key', 'alg' => 'RS256', 'use' => 'sig',
    'n' => base64Url($details['rsa']['n']), 'e' => base64Url($details['rsa']['e'])];
$jwks = ['keys' => [$key]];
$calls = [];
$http = function ($method, $url, $fields, $headers) use (&$calls, $jwks): array {
    $calls[] = [$method, $url, $fields, $headers];
    return $jwks;
};
$header = ['alg' => 'RS256', 'kid' => 'fixture-key', 'typ' => 'JWT'];
$claims = ['iss' => 'https://www.facebook.com', 'aud' => $config['client_id'], 'sub' => 'app-scoped-subject',
    'jti' => 'fixture-token-id', 'iat' => $now, 'exp' => $now + 3600, 'nonce' => $challenge,
    'email' => 'fixture@example.test', 'email_verified' => true, 'name' => 'Fixture'];
$token = signFixture(json_encode($header), json_encode($claims), $privateKey);
$verify = fn(string $candidate) => NativeFacebookSignIn::verify($candidate, $challenge, $config, $now, $http);
$profile = $verify($token);
check($profile === ['subject' => 'app-scoped-subject', 'email' => 'fixture@example.test', 'email_verified' => false, 'display_name' => 'Fixture'], 'verified profile never authorizes email linking');
check($calls === [['GET', NativeFacebookSignIn::JWKS_URL, null, ['Accept: application/json']]], 'only fixed HTTPS JWKS requested without token or kid in URL');
check(!array_intersect(['token', 'access_token', 'refresh_token', 'id_token', 'nonce', 'jti'], array_keys($profile)), 'no tokens or nonce in returned profile');
$hostileConfig = $config + ['jwks_uri' => 'http://evil.test/keys', 'userinfo_endpoint' => 'file:///etc/passwd'];
check(NativeFacebookSignIn::verify($token, $challenge, $hostileConfig, $now, $http) === $profile, 'config cannot override JWKS');
check($calls[1][1] === NativeFacebookSignIn::JWKS_URL, 'config URL ignored');
check(NativeFacebookSignIn::verify($token, $challenge, $config, $now, fn() => json_decode(json_encode($jwks), false) instanceof stdClass ? (array)json_decode(json_encode($jwks)) : []) === $profile, 'HTTP-decoded JWK objects supported');
check(NativeFacebookSignIn::verify($token, $challenge, $config, $now, fn() => ['keys' => [array_diff_key($key, ['alg' => true, 'use' => true])]]) === $profile, 'optional JWK metadata may be absent');
check(NativeFacebookSignIn::verify($token, $challenge, $config, $now, fn() => ['keys' => [$key + ['key_ops' => ['verify']]]]) === $profile, 'verify-only key accepted');

foreach (['aud' => 'other-app', 'iss' => 'https://evil.test', 'nonce' => 'wrong', 'exp' => $now, 'iat' => $now + 61,
    'sub' => '', 'jti' => ''] as $claim => $value) {
    rejects(fn() => $verify(signFixture(json_encode($header), json_encode(array_replace($claims, [$claim => $value])), $privateKey)), 'invalid ' . $claim);
}
foreach (['iss', 'aud', 'sub', 'jti', 'iat', 'exp', 'nonce'] as $claim) {
    $missing = $claims;
    unset($missing[$claim]);
    rejects(fn() => $verify(signFixture(json_encode($header), json_encode($missing), $privateKey)), 'missing ' . $claim);
}
foreach ([['aud' => [$config['client_id']]], ['aud' => (int)$config['client_id']], ['iss' => 'http://www.facebook.com'],
    ['iss' => 'https://www.facebook.com/'], ['iss' => 'https://www.facebook.com.evil.test'],
    ['nonce' => hash('sha256', $challenge)], ['nonce' => [$challenge]], ['nonce' => strtoupper($challenge)],
    ['iat' => $now - 601], ['iat' => (string)$now], ['iat' => true], ['iat' => $now + 0.5],
    ['exp' => $now - 1], ['exp' => (string)($now + 3600)], ['iat' => $now + 60, 'exp' => $now + 60],
    ['nbf' => $now + 1], ['nbf' => (string)$now], ['nbf' => null],
    ['sub' => []], ['sub' => str_repeat('s', 256)], ['sub' => "subject\n"], ['jti' => str_repeat('j', 256)],
    ['email' => []], ['email' => 'not-an-email'], ['email' => str_repeat('e', 256)], ['name' => []]] as $changes) {
    rejects(fn() => $verify(signFixture(json_encode($header), json_encode(array_replace($claims, $changes)), $privateKey)), 'malformed or mismatched claims');
}
foreach ([['iat' => $now - 600], ['iat' => $now + 60], ['exp' => $now + 1], ['nbf' => $now]] as $changes) {
    check($verify(signFixture(json_encode($header), json_encode(array_replace($claims, $changes)), $privateKey)) === $profile, 'valid timestamp boundary');
}
$minimal = array_diff_key($claims, ['email' => true, 'email_verified' => true, 'name' => true]);
$minimalProfile = $verify(signFixture(json_encode($header), json_encode($minimal), $privateKey));
check($minimalProfile['email'] === '' && $minimalProfile['display_name'] === '' && !$minimalProfile['email_verified'], 'email and name optional');
$longName = $claims;
$longName['name'] = str_repeat('é', 300);
check(mb_strlen($verify(signFixture(json_encode($header), json_encode($longName), $privateKey))['display_name']) === 255, 'display name safely truncated');

$callsBefore = count($calls);
foreach ([['alg' => 'none'], ['alg' => 'HS256'], ['alg' => 'RS512'], ['alg' => []], ['kid' => ''], ['kid' => []],
    ['kid' => str_repeat('k', 129)], ['kid' => '../../key.pem'], ['kid' => 'https://evil.test/key'], ['kid' => "key\n"],
    ['typ' => 'JWE'], ['typ' => null], ['jku' => 'https://evil.test/jwks'], ['x5u' => 'https://evil.test/cert'],
    ['jwk' => $key], ['x5c' => ['fake-certificate']], ['crit' => ['b64']], ['b64' => false]] as $changes) {
    rejects(fn() => $verify(signFixture(json_encode(array_replace($header, $changes)), json_encode($claims), $privateKey)), 'untrusted JWT header');
}
foreach (['alg', 'kid'] as $field) {
    $missing = $header;
    unset($missing[$field]);
    rejects(fn() => $verify(signFixture(json_encode($missing), json_encode($claims), $privateKey)), 'missing header ' . $field);
}
foreach (['', 'opaque-access-token', 'a.b', $token . '.extra', str_repeat('a', 16385), " $token", "$token\n", 'a.b.c'] as $invalidToken) {
    rejects(fn() => $verify($invalidToken), 'malformed token');
}
$parts = explode('.', $token);
foreach ([$parts[0] . '=.' . $parts[1] . '.' . $parts[2], $parts[0] . '.' . $parts[1] . '.',
    $parts[0] . '.' . $parts[1] . '.AA', str_repeat('a', 1025) . '.' . $parts[1] . '.' . $parts[2],
    $parts[0] . '.' . $parts[1] . '.' . str_repeat('a', 1367)] as $invalidToken) {
    rejects(fn() => $verify($invalidToken), 'invalid segment encoding or size');
}
foreach (['[]', 'null', '"string"', '{broken', '{"alg":"RS256",}'] as $json) {
    rejects(fn() => $verify(signFixture($json, json_encode($claims), $privateKey)), 'invalid header JSON');
    rejects(fn() => $verify(signFixture(json_encode($header), $json, $privateKey)), 'invalid claims JSON');
}
check(count($calls) === $callsBefore, 'invalid format and headers rejected without network');
rejects(fn() => $verify(signFixture(json_encode($header), json_encode($claims), $otherKey)), 'wrong RSA signature');
$tamperedClaims = array_replace($claims, ['sub' => 'attacker']);
rejects(fn() => $verify($parts[0] . '.' . base64Url(json_encode($tamperedClaims)) . '.' . $parts[2]), 'tampered payload');
$signature = base64_decode(strtr($parts[2], '-_', '+/'));
$signature[0] = chr(ord($signature[0]) ^ 1);
rejects(fn() => $verify($parts[0] . '.' . $parts[1] . '.' . base64Url($signature)), 'tampered signature');
rejects(fn() => $verify(signFixture(json_encode(array_replace($header, ['kid' => 'unknown'])), json_encode($claims), $privateKey)), 'unknown key');
foreach ([[], ['keys' => null], ['keys' => 'invalid'], ['keys' => array_fill(0, 33, $key)], ['error' => 'bad', 'keys' => [$key]]] as $invalidJwks) {
    rejects(fn() => NativeFacebookSignIn::verify($token, $challenge, $config, $now, fn() => $invalidJwks), 'invalid JWKS', 'facebook_keys_unavailable');
}
foreach ([['keys' => []], ['keys' => [$key, $key]], ['keys' => [null, 'bad']]] as $invalidJwks) {
    rejects(fn() => NativeFacebookSignIn::verify($token, $challenge, $config, $now, fn() => $invalidJwks), 'missing or ambiguous signing key');
}
foreach ([['kty' => 'EC'], ['alg' => 'HS256'], ['alg' => null], ['use' => 'enc'], ['key_ops' => ['sign']],
    ['n' => ''], ['n' => []], ['n' => 'not+base64'], ['n' => str_repeat('a', 1367)], ['n' => base64Url(str_repeat("\x01", 255))],
    ['n' => base64Url("\x00" . $details['rsa']['n'])], ['e' => ''], ['e' => 'AA'], ['e' => str_repeat('a', 9)]] as $changes) {
    rejects(fn() => NativeFacebookSignIn::verify($token, $challenge, $config, $now, fn() => ['keys' => [array_replace($key, $changes)]]), 'unsafe RSA key');
}
rejects(fn() => NativeFacebookSignIn::verify($token, '', $config, $now, $http), 'empty expected nonce');
rejects(fn() => NativeFacebookSignIn::verify($token, $challenge, $config, $now, function () { throw new RuntimeException('facebook_keys_unavailable'); }), 'network failure', 'facebook_keys_unavailable');

$session = [];
$challenge = NativeFacebookSignIn::begin($session, $now);
$claims['nonce'] = $challenge;
$token = signFixture(json_encode($header), json_encode($claims), $privateKey);
$complete = function (string $candidate) use (&$session, $challenge, $config, $now, $http): array {
    NativeFacebookSignIn::consume($session, $challenge, $now);
    return NativeFacebookSignIn::verify($candidate, $challenge, $config, $now, $http);
};
check($complete($token)['subject'] === $claims['sub'], 'complete consumes challenge before verifying signed token');
rejects(fn() => $complete($token), 'signed token replay', 'invalid_challenge');
$challenge = NativeFacebookSignIn::begin($session, $now);
$completeFailure = function (string $candidate) use (&$session, $challenge, $config, $now, $http): array {
    NativeFacebookSignIn::consume($session, $challenge, $now);
    return NativeFacebookSignIn::verify($candidate, $challenge, $config, $now, $http);
};
rejects(fn() => $completeFailure('invalid'), 'failed token attempt');
rejects(fn() => $completeFailure($token), 'failed attempt burns challenge', 'invalid_challenge');

foreach ([['GET', 'http://www.facebook.com/.well-known/oauth/openid/jwks/', null, ['Accept: application/json']],
    ['GET', 'https://evil.test/keys', null, ['Accept: application/json']],
    ['GET', NativeFacebookSignIn::JWKS_URL . '?kid=evil', null, ['Accept: application/json']],
    ['POST', NativeFacebookSignIn::JWKS_URL, null, ['Accept: application/json']],
    ['GET', NativeFacebookSignIn::JWKS_URL, ['token' => 'fixture'], ['Accept: application/json']],
    ['GET', NativeFacebookSignIn::JWKS_URL, null, ['Authorization: Bearer fixture']]] as $arguments) {
    rejects(fn() => NativeFacebookSignIn::http(...$arguments), 'transport cannot be redirected or carry credentials', 'facebook_keys_unavailable');
}
$source = file_get_contents(dirname(__DIR__) . '/lib/NativeFacebookSignIn.php');
foreach (["'follow_location' => 0", "'max_redirects' => 0", "'timeout' => 10", "'verify_peer' => true",
    "'verify_peer_name' => true", "'allow_self_signed' => false", '65537', 'strlen($body) > 65536',
    '$http_response_header[0]'] as $requirement) {
    check(str_contains($source, $requirement), 'bounded TLS transport setting: ' . $requirement);
}
$endpoint = file_get_contents(dirname(__DIR__) . '/public/api/auth/facebook/native.php');
foreach (["ttAuthProviderConfig('facebook')", "'appId' => \$appId", "\$input['token']", '24577', 'strlen($body) > 24576',
    'Cache-Control: no-store', "'httponly' => true", "'secure' => true", "'samesite' => 'Lax'",
    'AccountAccess::guardSession($pdo, $_SESSION)', "ttAuthPersistProviderAccount(\$pdo, 'facebook', \$profile, \$config)",
    'ttAuthJson(ttAuthBindProviderSession($pdo, $account))', 'catch (AccountAccessDenied $error)', "'native_facebook_failed'", "'facebook_not_configured'", '503'] as $requirement) {
    check(str_contains($endpoint, $requirement), 'endpoint contract: ' . $requirement);
}
check(strpos($endpoint, 'NativeFacebookSignIn::consume(') < strpos($endpoint, 'NativeFacebookSignIn::verify('), 'nonce consumed before network or verification');
check(strpos($endpoint, 'NativeFacebookSignIn::verify(') < strpos($endpoint, 'ttAuthPersistProviderAccount('), 'verify before persistence');
check(strpos($endpoint, 'AccountAccess::guardSession(') < strpos($endpoint, 'ttAuthPersistProviderAccount('), 'guard before persistence');
check(!str_contains($endpoint, 'ttAuthHttp') && !str_contains($endpoint, 'ttAuthDecodeJwtPayload'), 'no unsafe shared transport or unverified decoding');
check(strlen(json_encode(['action' => 'complete', 'challenge' => $challenge, 'token' => str_repeat('a', 16384)])) < 24576, 'full frontend token fits request body');

echo "Native Facebook sign-in: $checks checks passed; generated RSA fixtures only, no live accounts, tokens or network.\n";
