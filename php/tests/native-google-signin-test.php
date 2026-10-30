<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/NativeGoogleSignIn.php';

$checks = 0;
function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function rejects(callable $operation): void
{
    try { $operation(); } catch (InvalidArgumentException | RuntimeException $error) { check(true, 'rejected'); return; }
    throw new RuntimeException('Expected rejection');
}

$request = ['HTTPS' => 'on', 'REQUEST_METHOD' => 'POST', 'HTTP_HOST' => 'server.test',
    'HTTP_ORIGIN' => 'https://server.test', 'HTTP_X_TELETYPTEL_NATIVE' => 'google', 'CONTENT_TYPE' => 'application/json'];
NativeGoogleSignIn::assertRequest($request);
foreach (['HTTPS' => 'off', 'REQUEST_METHOD' => 'GET', 'HTTP_ORIGIN' => 'https://evil.test',
    'HTTP_X_TELETYPTEL_NATIVE' => '', 'CONTENT_TYPE' => 'text/plain'] as $key => $value) {
    rejects(fn() => NativeGoogleSignIn::assertRequest(array_replace($request, [$key => $value])));
}
$session = [];
$challenge = NativeGoogleSignIn::begin($session, 1000);
check(strlen($challenge) === 64, 'random challenge');
NativeGoogleSignIn::consume($session, $challenge, 1100);
rejects(function () use (&$session, $challenge) { NativeGoogleSignIn::consume($session, $challenge, 1100); });
$challenge = NativeGoogleSignIn::begin($session, 1000);
rejects(function () use (&$session, $challenge) { NativeGoogleSignIn::consume($session, $challenge, 1601); });
$challenge = NativeGoogleSignIn::begin($session, 1000);
rejects(function () use (&$session) { NativeGoogleSignIn::consume($session, 'wrong', 1100); });
check(!isset($session['teletyptel_native_google']), 'failed challenge consumed');
$config = ['client_id' => 'fixture-server-client', 'client_secret' => 'fixture-secret'];
$calls = [];
$http = function ($method, $url, $fields, $headers) use (&$calls): array {
    $calls[] = [$method, $url, $fields, $headers];
    if ($method === 'POST') return ['access_token' => 'fixture-access', 'id_token' => 'never-decoded', 'refresh_token' => 'never-stored'];
    return ['sub' => 'stable-google-subject', 'email' => 'fixture@gmail.com', 'email_verified' => true, 'name' => 'Fixture'];
};
$profile = NativeGoogleSignIn::exchange('fixture-code', $config, $http);
check($profile['subject'] === 'stable-google-subject', 'only Google userinfo identifies account');
check($profile['email_verified'] === true, 'Gmail authoritative');
check($calls[0][1] === 'https://oauth2.googleapis.com/token', 'fixed token endpoint');
check($calls[0][2]['client_id'] === $config['client_id'] && $calls[0][2]['client_secret'] === $config['client_secret'], 'code bound to server client');
check($calls[0][2]['redirect_uri'] === '', 'native code exchange does not use LAN redirect');
check($calls[1][1] === 'https://openidconnect.googleapis.com/v1/userinfo', 'fixed userinfo endpoint');
check($calls[1][3] === ['Authorization: Bearer fixture-access'], 'Google access token only in authorization header');
check(!array_intersect(['access_token', 'refresh_token', 'id_token'], array_keys($profile)), 'no tokens returned');
foreach (['', "with\nnewline", str_repeat('a', 4097)] as $code) rejects(fn() => NativeGoogleSignIn::exchange($code, $config, $http));
foreach ([[], ['id_token' => 'untrusted-jwt'], ['error' => 'invalid_grant'], ['access_token' => "bad\r\nheader"]] as $tokens) {
    rejects(fn() => NativeGoogleSignIn::exchange('fixture', $config, fn() => $tokens));
}
foreach ([[], ['sub' => 'fixture'], ['sub' => 'fixture', 'email' => 'fixture@gmail.com', 'email_verified' => false]] as $invalid) {
    rejects(fn() => NativeGoogleSignIn::exchange('fixture', $config, fn($method) => $method === 'POST' ? ['access_token' => 'fixture'] : $invalid));
}
$external = NativeGoogleSignIn::exchange('fixture', $config, fn($method) => $method === 'POST' ? ['access_token' => 'fixture']
    : ['sub' => 'external', 'email' => 'fixture@example.test', 'email_verified' => true]);
check($external['email_verified'] === false, 'external email never auto-links an existing account');
echo "Native Google sign-in: $checks checks passed; no real accounts or tokens used.\n";
