<?php
declare(strict_types=1);
$directory = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'native-avatar-guard-' . bin2hex(random_bytes(8));
if (!mkdir($directory, 0700)) throw new RuntimeException('Test session directory unavailable');
$endpoint = dirname(__DIR__) . '/public/api/native-avatar.php';
$cases = [
    ['GET', [], [], 401, 'not_authenticated'],
    ['POST', ['teletyptel_account_id' => 'fictional'], [], 403, 'csrf_failed'],
    ['DELETE', ['teletyptel_account_id' => 'fictional'], [], 405, 'method_not_allowed'],
    ['GET', ['teletyptel_account_id' => 'fictional'], ['accountId' => 'other'], 400, 'invalid_avatar'],
];
try {
    foreach ($cases as $index => [$method, $session, $query, $status, $error]) {
        $code = 'session_save_path(' . var_export($directory, true) . ');session_id("guard' . $index . '");session_start();'
            . '$_SESSION=' . var_export($session, true) . ';$_GET=' . var_export($query, true) . ';$_SERVER["REQUEST_METHOD"]=' . var_export($method, true) . ';'
            . 'ob_start();require ' . var_export($endpoint, true) . ';$data=json_decode(ob_get_clean(),true);'
            . 'if(http_response_code()!==' . $status . '||($data["error"]??"")!==' . var_export($error, true) . ')exit(1);session_destroy();echo "ok";';
        $process = proc_open([PHP_BINARY, '-r', $code], [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Guard test could not start');
        $output = stream_get_contents($pipes[1]); $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]); fclose($pipes[2]);
        if (proc_close($process) !== 0 || $output !== 'ok' || $stderr !== '') throw new RuntimeException('Avatar endpoint guard failed: ' . $index);
    }
    echo "Native avatar endpoint passed: 4 denial guards, no database connection or real session.\n";
} finally {
    foreach (glob($directory . DIRECTORY_SEPARATOR . 'sess_guard*') ?: [] as $file) unlink($file);
    rmdir($directory);
}
