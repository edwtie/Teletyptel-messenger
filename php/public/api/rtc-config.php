<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    $config = loadRtcConfig();
    echo json_encode([
        'ok' => true,
        'iceServers' => rtcIceServers($config),
        'iceTransportPolicy' => rtcIceTransportPolicy($config),
        'bundlePolicy' => 'balanced',
        'rtcpMuxPolicy' => 'require',
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()]);
}

function loadRtcConfig(): array
{
    $path = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';
    $config = is_file($path) ? require $path : [];
    return is_array($config['webrtc'] ?? null) ? $config['webrtc'] : [];
}

function rtcIceServers(array $config): array
{
    $configured = $config['ice_servers'] ?? null;
    if (is_array($configured) && $configured !== []) {
        return array_values(array_filter(array_map('normalizeIceServer', $configured)));
    }

    $servers = [];
    $stunUrls = rtcUrlList(getenv('TELETYPTEL_STUN_URLS') ?: ($config['stun_urls'] ?? 'stun:stun.l.google.com:19302'));
    if ($stunUrls !== []) {
        $servers[] = ['urls' => count($stunUrls) === 1 ? $stunUrls[0] : $stunUrls];
    }

    $turnUrls = rtcUrlList(getenv('TELETYPTEL_TURN_URLS') ?: ($config['turn_urls'] ?? ''));
    if ($turnUrls !== []) {
        $turn = ['urls' => count($turnUrls) === 1 ? $turnUrls[0] : $turnUrls];
        $username = trim((string)(getenv('TELETYPTEL_TURN_USERNAME') ?: ($config['turn_username'] ?? '')));
        $credential = trim((string)(getenv('TELETYPTEL_TURN_CREDENTIAL') ?: ($config['turn_credential'] ?? '')));
        if ($username !== '') {
            $turn['username'] = $username;
        }
        if ($credential !== '') {
            $turn['credential'] = $credential;
        }
        $servers[] = $turn;
    }

    return $servers;
}

function normalizeIceServer(mixed $server): ?array
{
    if (!is_array($server)) {
        return null;
    }

    $urls = rtcUrlList($server['urls'] ?? '');
    if ($urls === []) {
        return null;
    }

    $normalized = ['urls' => count($urls) === 1 ? $urls[0] : $urls];
    foreach (['username', 'credential', 'credentialType'] as $key) {
        if (isset($server[$key]) && trim((string)$server[$key]) !== '') {
            $normalized[$key] = trim((string)$server[$key]);
        }
    }
    return $normalized;
}

function rtcUrlList(mixed $value): array
{
    $items = is_array($value) ? $value : preg_split('/[\r\n,]+/', (string)$value);
    $urls = [];
    foreach ($items ?: [] as $item) {
        $url = trim((string)$item);
        if ($url !== '' && preg_match('/^(stuns?|turns?):/i', $url)) {
            $urls[] = $url;
        }
    }
    return array_values(array_unique($urls));
}

function rtcIceTransportPolicy(array $config): string
{
    $policy = strtolower(trim((string)(getenv('TELETYPTEL_ICE_TRANSPORT_POLICY') ?: ($config['ice_transport_policy'] ?? 'all'))));
    return in_array($policy, ['all', 'relay'], true) ? $policy : 'all';
}
