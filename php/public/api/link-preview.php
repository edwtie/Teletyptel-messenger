<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
        jsonPreview(['ok' => false, 'error' => 'method_not_allowed'], 405);
        return;
    }

    $url = trim((string)($_GET['url'] ?? ''));
    if (!isAllowedPreviewUrl($url)) {
        jsonPreview(['ok' => false, 'error' => 'invalid_url'], 400);
        return;
    }

    $html = fetchPreviewHtml($url);
    if ($html === '' && isYouTubeUrl($url)) {
        $preview = fetchYouTubePreview($url);
        jsonPreview(['ok' => true, 'preview' => $preview]);
        return;
    }
    if ($html === '') {
        jsonPreview(['ok' => false, 'error' => 'fetch_failed'], 502);
        return;
    }

    $preview = parsePreviewHtml($html, $url);
    if (previewNeedsFallback($preview) && isYouTubeUrl($url)) {
        $preview = array_merge($preview, fetchYouTubePreview($url));
    }
    jsonPreview(['ok' => true, 'preview' => $preview]);
} catch (Throwable $error) {
    jsonPreview(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()], 500);
}

function isAllowedPreviewUrl(string $url): bool
{
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return false;
    }

    $parts = parse_url($url);
    $scheme = strtolower((string)($parts['scheme'] ?? ''));
    $host = strtolower((string)($parts['host'] ?? ''));
    if (!in_array($scheme, ['http', 'https'], true) || $host === '') {
        return false;
    }

    if (in_array($host, ['localhost', '127.0.0.1', '::1'], true)) {
        return false;
    }
    if (filter_var($host, FILTER_VALIDATE_IP)
        && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
        return false;
    }

    $records = @dns_get_record($host, DNS_A + DNS_AAAA);
    foreach (is_array($records) ? $records : [] as $record) {
        $ip = (string)($record['ip'] ?? $record['ipv6'] ?? '');
        if ($ip !== '' && !filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
    }

    return true;
}

function fetchPreviewHtml(string $url): string
{
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 4,
            'follow_location' => 1,
            'max_redirects' => 3,
            'ignore_errors' => true,
            'header' => "User-Agent: Mozilla/5.0 (compatible; TeleTypTel-LinkPreview/1.0)\r\nAccept: text/html,application/xhtml+xml;q=0.9,*/*;q=0.8\r\nAccept-Language: nl,en;q=0.8\r\n",
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $html = @file_get_contents($url, false, $context, 0, 524288);
    return is_string($html) ? $html : '';
}

function parsePreviewHtml(string $html, string $baseUrl): array
{
    libxml_use_internal_errors(true);
    $document = new DOMDocument();
    $loaded = $document->loadHTML('<?xml encoding="utf-8" ?>' . $html);
    libxml_clear_errors();
    if (!$loaded) {
        return ['url' => $baseUrl, 'title' => '', 'description' => '', 'image' => '', 'siteName' => ''];
    }

    $meta = [];
    foreach ($document->getElementsByTagName('meta') as $node) {
        $key = strtolower((string)($node->getAttribute('property') ?: $node->getAttribute('name')));
        if ($key !== '') {
            $meta[$key] = cleanPreviewText($node->getAttribute('content'), 500);
        }
    }

    $title = $meta['og:title'] ?? '';
    if ($title === '') {
        $titles = $document->getElementsByTagName('title');
        $title = $titles->length > 0 ? cleanPreviewText($titles->item(0)?->textContent ?? '', 180) : '';
    }

    $description = $meta['og:description'] ?? $meta['description'] ?? '';
    $image = absolutizePreviewUrl($meta['og:image'] ?? $meta['twitter:image'] ?? '', $baseUrl);

    $siteName = cleanPreviewText($meta['og:site_name'] ?? '', 120);
    if ($siteName === '') {
        $siteName = cleanPreviewText((string)(parse_url($baseUrl, PHP_URL_HOST) ?: ''), 120);
    }

    return [
        'url' => $baseUrl,
        'title' => $title,
        'description' => cleanPreviewText($description, 280),
        'image' => $image,
        'siteName' => $siteName,
    ];
}

function previewNeedsFallback(array $preview): bool
{
    return ($preview['title'] ?? '') === '' && ($preview['description'] ?? '') === '' && ($preview['image'] ?? '') === '';
}

function isYouTubeUrl(string $url): bool
{
    $host = strtolower((string)(parse_url($url, PHP_URL_HOST) ?: ''));
    return $host === 'youtu.be' || str_ends_with($host, '.youtube.com') || $host === 'youtube.com';
}

function fetchYouTubeOEmbedPreview(string $url): array
{
    $endpoint = 'https://www.youtube.com/oembed?format=json&url=' . rawurlencode($url);
    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 4,
            'ignore_errors' => true,
            'header' => "User-Agent: TeleTypTel-LinkPreview/1.0\r\nAccept: application/json\r\n",
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);
    $json = @file_get_contents($endpoint, false, $context, 0, 65536);
    $data = is_string($json) ? json_decode($json, true) : null;
    if (!is_array($data)) {
        return [];
    }

    return [
        'title' => cleanPreviewText((string)($data['title'] ?? ''), 180),
        'description' => cleanPreviewText((string)($data['author_name'] ?? ''), 280),
        'image' => absolutizePreviewUrl((string)($data['thumbnail_url'] ?? ''), $url),
        'siteName' => 'YouTube',
    ];
}

function fetchYouTubePreview(string $url): array
{
    $preview = fetchYouTubeOEmbedPreview($url);
    if (!previewNeedsFallback($preview)) {
        return $preview;
    }

    $videoId = extractYouTubeVideoId($url);
    if ($videoId === '') {
        return $preview;
    }

    return array_merge([
        'title' => '',
        'description' => '',
        'image' => 'https://i.ytimg.com/vi/' . rawurlencode($videoId) . '/hqdefault.jpg',
        'siteName' => 'YouTube',
    ], $preview);
}

function extractYouTubeVideoId(string $url): string
{
    $parts = parse_url($url);
    if (!is_array($parts)) {
        return '';
    }

    $host = strtolower((string)($parts['host'] ?? ''));
    $path = trim((string)($parts['path'] ?? ''), '/');
    if ($host === 'youtu.be') {
        return cleanYouTubeVideoId(strtok($path, '/') ?: '');
    }

    parse_str((string)($parts['query'] ?? ''), $query);
    if (isset($query['v'])) {
        return cleanYouTubeVideoId((string)$query['v']);
    }

    $segments = $path === '' ? [] : explode('/', $path);
    if (in_array($segments[0] ?? '', ['shorts', 'live', 'embed'], true)) {
        return cleanYouTubeVideoId($segments[1] ?? '');
    }

    return '';
}

function cleanYouTubeVideoId(string $value): string
{
    return preg_match('/^[a-zA-Z0-9_-]{6,32}$/', $value) === 1 ? $value : '';
}

function absolutizePreviewUrl(string $url, string $baseUrl): string
{
    $url = trim($url);
    if ($url === '') {
        return '';
    }
    if (preg_match('/^https?:\/\//i', $url)) {
        return $url;
    }
    $base = parse_url($baseUrl);
    if (!is_array($base) || empty($base['scheme']) || empty($base['host'])) {
        return '';
    }
    if (str_starts_with($url, '//')) {
        return $base['scheme'] . ':' . $url;
    }
    if (str_starts_with($url, '/')) {
        return $base['scheme'] . '://' . $base['host'] . $url;
    }
    $path = (string)($base['path'] ?? '/');
    $directory = preg_replace('/\/[^\/]*$/', '/', $path) ?: '/';
    return $base['scheme'] . '://' . $base['host'] . $directory . $url;
}

function cleanPreviewText(string $value, int $maxLength): string
{
    $text = trim(html_entity_decode(strip_tags($value), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    $text = preg_replace('/\s+/u', ' ', $text) ?? '';
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }
    return substr($text, 0, $maxLength);
}

function jsonPreview(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
