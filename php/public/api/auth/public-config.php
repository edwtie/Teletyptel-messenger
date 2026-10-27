<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$path = dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . 'config.php';
$config = is_file($path) ? require $path : [];
$oauth = is_array($config['oauth'] ?? null) ? $config['oauth'] : [];
$google = is_array($oauth['google'] ?? null) ? $oauth['google'] : (is_array($config['google'] ?? null) ? $config['google'] : []);

$clientId = getenv('TELETYPTEL_OAUTH_GOOGLE_CLIENT_ID')
    ?: getenv('GOOGLE_CLIENT_ID')
    ?: (string)($google['client_id'] ?? '');

echo json_encode([
    'ok' => true,
    'google' => [
        'clientId' => $clientId,
        'configured' => trim($clientId) !== '',
    ],
], JSON_UNESCAPED_SLASHES);
