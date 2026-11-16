<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require_once __DIR__ . '/call-bootstrap-fixture.php';
try {
    $input = json_decode(stream_get_contents(STDIN, 4097), true, 8, JSON_THROW_ON_ERROR);
    $key = base64_decode($input['key'] ?? '', true);
    if ($key === false || strlen($key) !== 32) throw new RuntimeException('Invalid fixture key');
    $fixture = new BootstrapFixture(time(), $key, $input['profile'] ?? 'total');
    echo json_encode($fixture->issue(), JSON_THROW_ON_ERROR);
} catch (Throwable $error) { fwrite(STDERR, "Isolated bootstrap fixture failed\n"); exit(1); }
