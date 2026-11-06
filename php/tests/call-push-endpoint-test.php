<?php
declare(strict_types=1);

$mode = $argv[1] ?? '';
if ($mode === '--disabled' || $mode === '--insecure') {
    putenv('TELETYPTEL_CALL_PUSH_REGISTRY=' . ($mode === '--disabled' ? '0' : '1'));
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_SERVER['HTTPS'] = $mode === '--disabled' ? 'on' : 'off';
    ob_start();
    require dirname(__DIR__) . '/public/api/call-push.php';
    $body = json_decode(ob_get_clean(), true, 512, JSON_THROW_ON_ERROR);
    $expected = $mode === '--disabled' ? 404 : 403;
    if (http_response_code() !== $expected || $body['ok'] !== false || isset($body['csrfToken'])) {
        throw new RuntimeException('Endpoint did not fail closed');
    }
    echo "Registry endpoint {$mode}: {$expected}, no database access.\n";
    exit;
}

foreach (['--disabled', '--insecure'] as $mode) {
    $process = proc_open([PHP_BINARY, __FILE__, $mode], [0 => STDIN, 1 => STDOUT, 2 => STDERR], $pipes);
    if (!is_resource($process) || proc_close($process) !== 0) throw new RuntimeException('Endpoint test failed');
}
