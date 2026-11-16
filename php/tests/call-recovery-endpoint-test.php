<?php
declare(strict_types=1);
$mode = $argv[1] ?? '';
if (in_array($mode, ['disabled', 'insecure', 'method', 'content', 'bearer'], true)) {
    putenv('TELETYPTEL_CALL_RECOVERY_LAB=' . ($mode === 'disabled' ? '0' : '1'));
    putenv('TELETYPTEL_CALL_PUSH_REGISTRY=1');
    $_SERVER['HTTPS'] = $mode === 'insecure' ? 'off' : 'on';
    $_SERVER['REQUEST_METHOD'] = $mode === 'method' ? 'GET' : 'POST';
    $_SERVER['CONTENT_TYPE'] = $mode === 'content' ? 'text/plain' : 'application/json';
    ob_start(); require dirname(__DIR__) . '/public/api/call-recovery.php';
    $body = json_decode(ob_get_clean(), true, 8, JSON_THROW_ON_ERROR);
    if (http_response_code() !== ['disabled' => 404, 'insecure' => 403, 'method' => 405, 'content' => 415, 'bearer' => 401][$mode]
        || !isset($body['error']) || isset($body['credential'])) throw new RuntimeException('Unsafe endpoint response');
    exit;
}
foreach (['disabled', 'insecure', 'method', 'content', 'bearer'] as $mode) {
    $process = proc_open([PHP_BINARY, __FILE__, $mode], [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes);
    if (!is_resource($process) || proc_close($process) !== 0) throw new RuntimeException('Endpoint guard failed');
}
echo "Call recovery endpoint: 5 fail-closed checks passed before database access.\n";
