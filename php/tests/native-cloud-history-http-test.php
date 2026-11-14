<?php
declare(strict_types=1);

define('TELETYPTEL_NATIVE_HISTORY_FIXTURE_ONLY', true);
require_once __DIR__ . '/native-cloud-history-test.php';

if (PHP_SAPI === 'cli-server') {
    $directory = getenv('TELETYPTEL_NATIVE_HISTORY_TEST_DIR');
    if (!$directory || !is_dir($directory) || !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) {
        http_response_code(404);
        return;
    }
    session_save_path($directory);
    $pdo = new PDO('sqlite:' . $directory . '/history.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
    if ($path === '/fixture/login') {
        session_start();
        session_regenerate_id(true);
        $account = $_GET['account'] ?? 'one';
        $_SESSION = $account === 'pending' ? ['teletyptel_2fa_pending_account_id' => 'one']
            : ['teletyptel_account_id' => in_array($account, ['one', 'two'], true) ? $account : 'one', 'teletyptel_access_version' => 1];
        header('Content-Type: application/json');
        header('Cache-Control: no-store');
        echo json_encode(['csrfToken' => NativeProfileService::csrf($_SESSION)]);
        return;
    }
    if ($path === '/api/native-history.php') {
        NativeCloudHistory::serve($pdo);
        return;
    }
    http_response_code(404);
    return;
}

function nativeHistoryHttp(string $url, string $method = 'GET', ?string $body = null, array $headers = []): array
{
    $context = stream_context_create(['http' => ['method' => $method, 'ignore_errors' => true,
        'follow_location' => 0, 'timeout' => 10, 'header' => implode("\r\n", $headers), 'content' => $body ?? '']]);
    $response = file_get_contents($url, false, $context);
    $responseHeaders = $http_response_header ?? [];
    preg_match('/\s(\d{3})\s/', $responseHeaders[0] ?? '', $status);
    nativeHistoryCheck($response !== false && isset($status[1]), 'HTTP fixture did not respond');
    $json = json_decode($response, true, 64, JSON_THROW_ON_ERROR);
    return ['status' => (int)$status[1], 'json' => $json, 'headers' => $responseHeaders, 'body' => $response];
}

function nativeHistoryHttpError(array $response, int $status, string $code): void
{
    nativeHistoryCheck($response['status'] === $status && $response['json'] === ['ok' => false, 'error' => $code],
        'Unexpected HTTP error: ' . $response['body']);
    nativeHistoryCheck(!str_contains($response['body'], 'SQL') && !str_contains($response['body'], 'never-return'), 'Error leaked internals');
}

$directory = sys_get_temp_dir() . '/native-history-' . bin2hex(random_bytes(12));
if (!mkdir($directory, 0700)) throw new RuntimeException('Cannot create isolated HTTP fixture');
$process = null;
$pdo = null;
$priorEnvironment = getenv('TELETYPTEL_NATIVE_HISTORY_TEST_DIR');
try {
    $pdo = new PDO('sqlite:' . $directory . '/history.sqlite', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    nativeHistoryFixture($pdo);
    $socket = stream_socket_server('tcp://127.0.0.1:0', $socketError, $socketMessage);
    if ($socket === false) throw new RuntimeException('Cannot allocate loopback HTTP fixture');
    $address = stream_socket_get_name($socket, false);
    fclose($socket);
    putenv('TELETYPTEL_NATIVE_HISTORY_TEST_DIR=' . $directory);
    $process = proc_open([PHP_BINARY, '-d', 'display_errors=0', '-d', 'log_errors=1', '-S', $address, __FILE__],
        [0 => ['pipe', 'r'], 1 => ['file', $directory . '/server.log', 'a'], 2 => ['file', $directory . '/server.log', 'a']],
        $pipes, __DIR__, null, ['bypass_shell' => true, 'create_new_console' => false]);
    if (!is_resource($process)) throw new RuntimeException('Cannot start isolated PHP HTTP fixture');
    fclose($pipes[0]);
    $ready = false;
    for ($attempt = 0; $attempt < 100; $attempt++) {
        $probe = @stream_socket_client('tcp://' . $address, $socketError, $socketMessage, 0.1);
        if ($probe !== false) {
            fclose($probe);
            $ready = true;
            break;
        }
        usleep(50000);
    }
    nativeHistoryCheck($ready, 'PHP HTTP fixture did not start');
    $base = 'http://' . $address;
    $url = $base . '/api/native-history.php?' . http_build_query(nativeHistoryQuery());
    nativeHistoryHttpError(nativeHistoryHttp($url), 401, 'not_authenticated');
    $login = nativeHistoryHttp($base . '/fixture/login');
    $cookie = '';
    foreach ($login['headers'] as $header) {
        if (stripos($header, 'Set-Cookie: ') === 0) $cookie = explode(';', substr($header, 12))[0];
    }
    nativeHistoryCheck($cookie !== '' && preg_match('/^[a-f0-9]{64}$/D', $login['json']['csrfToken']) === 1, 'Fixture session/CSRF bootstrap');
    $getHeaders = ['Cookie: ' . $cookie];
    $postHeaders = [...$getHeaders, 'Content-Type: application/json', 'X-CSRF-Token: ' . $login['json']['csrfToken'], 'Origin: ' . $base];
    $empty = nativeHistoryHttp($url, 'GET', null, $getHeaders);
    nativeHistoryCheck($empty['status'] === 200 && $empty['json']['messages'] === [] && $empty['json']['saveChat'] === true
        && $empty['json']['owner'] === 'one@example.test' && $empty['json']['accountId'] === 'one', 'Authenticated empty GET contract');
    $discoveryUrl = $base . '/api/native-history.php?accountId=one&kind=conversations&limit=32';
    $discovery = nativeHistoryHttp($discoveryUrl, 'GET', null, $getHeaders);
    nativeHistoryCheck($discovery['status'] === 200 && $discovery['json'] === ['ok' => true, 'accountId' => 'one',
        'owner' => 'one@example.test', 'saveChat' => true, 'conversations' => []], 'Empty HTTP discovery contract');
    $headers = strtolower(implode("\n", $empty['headers']));
    nativeHistoryCheck(str_contains($headers, 'cache-control: no-store') && str_contains($headers, 'cross-origin-resource-policy: same-origin')
        && !str_contains($headers, 'access-control-allow-origin'), 'Same-origin no-store headers');
    $endpoint = $base . '/api/native-history.php';
    $input = ['accountId' => 'one', 'message' => nativeHistoryMessage(), 'expectedVersion' => null];
    $body = json_encode($input);
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', $body, [...$getHeaders, 'Content-Type: application/json']), 403, 'csrf_failed');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', $body, [...$getHeaders, 'Content-Type: application/json', 'X-CSRF-Token: ' . str_repeat('f', 64)]), 403, 'csrf_failed');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', $body, [...array_slice($postHeaders, 0, -1), 'Origin: https://evil.test']), 403, 'cloud_history_origin_denied');
    nativeHistoryHttpError(nativeHistoryHttp($url, 'GET', null, [...$getHeaders, 'Sec-Fetch-Site: same-site']), 403, 'cloud_history_origin_denied');
    nativeHistoryHttpError(nativeHistoryHttp($url . '&loginToken=forbidden', 'GET', null, $getHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryHttpError(nativeHistoryHttp($url . '&key=forbidden', 'GET', null, $getHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint . '?token=forbidden', 'POST', $body, $postHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryHttpError(nativeHistoryHttp($url, 'DELETE', null, $getHeaders), 405, 'method_not_allowed');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', '{', $postHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', 'null', $postHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', $body, [...$getHeaders, 'X-CSRF-Token: ' . $login['json']['csrfToken'], 'Content-Type: text/plain']), 400, 'cloud_history_invalid_request');
    $withoutVersion = $input;
    unset($withoutVersion['expectedVersion']);
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', json_encode($withoutVersion), $postHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', str_repeat(' ', 32769), $postHeaders), 413, 'cloud_history_too_large');
    $tooLong = $input;
    $tooLong['message']['text'] = str_repeat('a', 8193);
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', json_encode($tooLong), $postHeaders), 413, 'cloud_history_too_large');
    $saved = nativeHistoryHttp($endpoint, 'POST', $body, $postHeaders);
    nativeHistoryCheck($saved['status'] === 200 && array_keys($saved['json']) === ['ok', 'accountId', 'owner', 'message']
        && strlen($saved['json']['message']['version']) === 64, 'POST contract');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', $body, $postHeaders), 409, 'cloud_history_conflict');
    $message = $saved['json']['message'];
    $input['message'] = $message;
    $input['message']['text'] = 'HTTP edited';
    $input['expectedVersion'] = $message['version'];
    $edited = nativeHistoryHttp($endpoint, 'POST', json_encode($input), $postHeaders);
    nativeHistoryCheck($edited['status'] === 200 && $edited['json']['message']['edited']
        && $edited['json']['message']['attachment'] === $message['attachment'], 'HTTP edit preserves opaque attachment');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', json_encode($input), $postHeaders), 409, 'cloud_history_conflict');
    $get = nativeHistoryHttp($url, 'GET', null, $getHeaders);
    nativeHistoryCheck($get['json']['messages'] === [$edited['json']['message']], 'HTTP GET shares POST mapping/version');
    $discovery = nativeHistoryHttp($discoveryUrl, 'GET', null, $getHeaders);
    nativeHistoryCheck($discovery['status'] === 200 && $discovery['json']['conversations'] === [
        ['peer' => 'peer@example.test', 'kind' => 'contact', 'name' => 'Peer'],
    ], 'HTTP discovery uses latest saved web conversation');
    nativeHistoryHttpError(nativeHistoryHttp($discoveryUrl . '&peer=peer%40example.test', 'GET', null, $getHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryHttpError(nativeHistoryHttp(str_replace('accountId=one', 'accountId=alias', $discoveryUrl), 'GET', null, $getHeaders), 403, 'account_access_denied');
    foreach (['two', 'alias'] as $account) {
        nativeHistoryHttpError(nativeHistoryHttp($endpoint . '?' . http_build_query(nativeHistoryQuery(['accountId' => $account])), 'GET', null, $getHeaders), 403, 'account_access_denied');
        $crossAccount = ['accountId' => $account, 'message' => nativeHistoryMessage('cross-account'), 'expectedVersion' => null];
        nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', json_encode($crossAccount), $postHeaders), 403, 'account_access_denied');
    }
    $recipient = ['accountId' => 'one', 'message' => nativeHistoryMessage('recipient'), 'expectedVersion' => null, 'action' => 'save_recipient'];
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', json_encode($recipient), $postHeaders), 400, 'cloud_history_invalid_request');
    nativeHistoryCheck((int)$pdo->query("SELECT COUNT(*) FROM message_history WHERE account_id <> 'one'")->fetchColumn() === 0, 'No recipient/alias writes');
    $pdo->exec("UPDATE account_profiles SET save_chat_history = 0 WHERE account_id = 'one'");
    nativeHistoryCheck(nativeHistoryHttp($url, 'GET', null, $getHeaders)['json']['saveChat'] === false, 'Server preference in HTTP GET');
    $discovery = nativeHistoryHttp($discoveryUrl, 'GET', null, $getHeaders);
    nativeHistoryCheck($discovery['json']['saveChat'] === false && count($discovery['json']['conversations']) === 1, 'Discovery preserves history with saving disabled');
    nativeHistoryHttpError(nativeHistoryHttp($endpoint, 'POST', $body, $postHeaders), 403, 'cloud_history_disabled');
    nativeHistoryCheck((int)$pdo->query('SELECT COUNT(*) FROM message_history')->fetchColumn() === 1, 'Preference does not delete history');
    $pdo->exec("UPDATE account_profiles SET save_chat_history = 1 WHERE account_id = 'one'");
    $insert = $pdo->prepare('INSERT INTO message_history (account_id, conversation_peer, message_id, direction, sender_jid, text, message_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)');
    for ($index = 1; $index <= 50; $index++) {
        $insert->execute(['one', 'peer@example.test', 'large-' . $index, 'self', 'one@example.test', str_repeat('a', 30000), '2026-11-14 10:00:00.123']);
    }
    $large = nativeHistoryHttp($url, 'GET', null, $getHeaders);
    nativeHistoryCheck($large['status'] === 200 && strlen($large['body']) < 1048576 && count($large['json']['messages']) < 50
        && is_string($large['json']['nextCursor']), 'Real HTTP response below 1 MiB');
    $next = nativeHistoryHttp($url . '&before=' . rawurlencode($large['json']['nextCursor']), 'GET', null, $getHeaders);
    nativeHistoryCheck($next['status'] === 200 && count($large['json']['messages']) + count($next['json']['messages']) === 51
        && $next['json']['nextCursor'] === null, 'Real HTTP byte-bound cursor coverage');
    $pdo->exec('UPDATE message_history SET text = "' . str_repeat('a', 32768) . '" WHERE message_id = "large-50"');
    nativeHistoryHttpError(nativeHistoryHttp($url, 'GET', null, $getHeaders), 413, 'cloud_history_too_large');
    nativeHistoryCheck(nativeHistoryHttp($discoveryUrl, 'GET', null, $getHeaders)['status'] === 200, 'Discovery does not download oversize message bodies');
    $pdo->exec("UPDATE account_access_controls SET version = 2 WHERE account_id = 'one'");
    nativeHistoryHttpError(nativeHistoryHttp($url, 'GET', null, $getHeaders), 403, 'account_access_denied');
    nativeHistoryHttpError(nativeHistoryHttp($url, 'GET', null, $getHeaders), 401, 'not_authenticated');
    foreach (["web_blocked = 1", "web_blocked = 0, trashed_at = '2026-11-14'"] as $state) {
        $pdo->exec("UPDATE account_access_controls SET version = 1, " . $state . " WHERE account_id = 'one'");
        $blockedLogin = nativeHistoryHttp($base . '/fixture/login');
        foreach ($blockedLogin['headers'] as $header) {
            if (stripos($header, 'Set-Cookie: ') === 0) $getHeaders = ['Cookie: ' . explode(';', substr($header, 12))[0]];
        }
        nativeHistoryHttpError(nativeHistoryHttp($url, 'GET', null, $getHeaders), 403, 'account_access_denied');
    }
    $pdo->exec("UPDATE account_access_controls SET web_blocked = 0, trashed_at = NULL WHERE account_id = 'one'");
    $pending = nativeHistoryHttp($base . '/fixture/login?account=pending');
    $pendingCookie = '';
    foreach ($pending['headers'] as $header) {
        if (stripos($header, 'Set-Cookie: ') === 0) $pendingCookie = explode(';', substr($header, 12))[0];
    }
    nativeHistoryHttpError(nativeHistoryHttp($url, 'GET', null, ['Cookie: ' . $pendingCookie]), 401, 'not_authenticated');
    $fresh = nativeHistoryHttp($base . '/fixture/login');
    $freshCookie = '';
    foreach ($fresh['headers'] as $header) {
        if (stripos($header, 'Set-Cookie: ') === 0) $freshCookie = explode(';', substr($header, 12))[0];
    }
    $pdo->exec('DROP TABLE message_history');
    nativeHistoryHttpError(nativeHistoryHttp($url, 'GET', null, ['Cookie: ' . $freshCookie]), 503, 'cloud_history_unavailable');
    nativeHistoryCheck((int)$pdo->query("SELECT COUNT(*) FROM sqlite_master WHERE name = 'message_history'")->fetchColumn() === 0, 'Missing schema is not migrated');
    echo "Native cloud history HTTP: session, CSRF, origins, contracts, conflicts, preferences, discovery, byte limits and safe errors passed (isolated SQLite fixture)\n";
} finally {
    if (is_resource($process)) {
        proc_terminate($process);
        proc_close($process);
    }
    putenv($priorEnvironment === false ? 'TELETYPTEL_NATIVE_HISTORY_TEST_DIR' : 'TELETYPTEL_NATIVE_HISTORY_TEST_DIR=' . $priorEnvironment);
    $insert = null;
    $pdo = null;
    foreach (glob($directory . '/*') ?: [] as $file) {
        if (is_file($file)) unlink($file);
    }
    rmdir($directory);
}
