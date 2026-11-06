<?php
declare(strict_types=1);

$cases = ['disabled' => 404, 'registry-disabled' => 404, 'insecure' => 403, 'method' => 405, 'type' => 415,
    'missing-token' => 401, 'invalid-token' => 401, 'query-token' => 401];
$mode = $argv[1] ?? '';
if (isset($cases[$mode])) {
    putenv('TELETYPTEL_CALL_PUSH_REGISTRY=' . ($mode === 'registry-disabled' ? '0' : '1'));
    putenv('TELETYPTEL_CALL_PUSH_NATIVE_CONTROL=' . ($mode === 'disabled' ? '0' : '1'));
    $_SERVER['REQUEST_METHOD'] = $mode === 'method' ? 'GET' : 'POST';
    $_SERVER['HTTPS'] = $mode === 'insecure' ? 'off' : 'on';
    $_SERVER['CONTENT_TYPE'] = $mode === 'type' ? 'text/plain' : 'application/json';
    if ($mode === 'invalid-token') $_SERVER['HTTP_AUTHORIZATION'] = 'Bearer anything';
    if ($mode === 'query-token') $_GET['token'] = str_repeat('ab', 100) . '.' . str_repeat('c', 64);
    ob_start();
    require dirname(__DIR__) . '/public/api/call-control.php';
    $body = json_decode(ob_get_clean(), true, 512, JSON_THROW_ON_ERROR);
    if (http_response_code() !== $cases[$mode] || $body['ok'] !== false || session_status() !== PHP_SESSION_NONE) {
        throw new RuntimeException('Native endpoint did not fail closed');
    }
    echo "Native endpoint {$mode}: {$cases[$mode]}, no database/session access.\n";
    exit;
}
foreach ($cases as $mode => $status) {
    $process = proc_open([PHP_BINARY, __FILE__, $mode], [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes);
    if (!is_resource($process) || proc_close($process) !== 0) throw new RuntimeException('Native endpoint test failed');
}
