<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Xmpp/XmppAutoload.php';

use Tiedragon\Xmpp\XmppBoshTransport;

$options = getopt('', ['url:', 'domain::', 'lang::']);
if (!isset($options['url'])) {
    fwrite(STDERR, "Usage: php php/tools/xmpp-bosh-smoke.php --url http://localhost:5280/http-bind --domain localhost\n");
    exit(2);
}

$domain = (string)($options['domain'] ?? parse_url((string)$options['url'], PHP_URL_HOST) ?? 'localhost');
$transport = new XmppBoshTransport((string)$options['url'], $domain, (string)($options['lang'] ?? 'en'));

try {
    $body = $transport->connect();
    echo "BOSH connected\n";
    echo "sid: " . ($body['sid'] ?? '') . "\n";
    echo "wait: " . ($body['wait'] ?? '') . "\n";
    echo "payloads: " . count($body['payloads'] ?? []) . "\n";
    $restart = $transport->restartStream();
    echo "restart payloads: " . count($restart['payloads'] ?? []) . "\n";
    $transport->terminate();
} catch (Throwable $exception) {
    $transport->terminate();
    fwrite(STDERR, "XMPP BOSH smoke failed: " . $exception->getMessage() . "\n");
    exit(1);
}
