<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Xmpp/XmppAutoload.php';

use Tiedragon\Xmpp\XmppWebSocket;
use Tiedragon\Xmpp\XmppWebSocketTransport;

$options = getopt('', ['url:', 'domain::', 'lang::']);
if (!isset($options['url'])) {
    fwrite(STDERR, "Usage: php php/tools/xmpp-websocket-smoke.php --url ws://localhost:5280/xmpp-websocket [--domain localhost]\n");
    exit(2);
}

$domain = (string)($options['domain'] ?? parse_url((string)$options['url'], PHP_URL_HOST) ?? 'localhost');
$transport = new XmppWebSocketTransport((string)$options['url']);

try {
    $transport->connect();
    $transport->sendXml(XmppWebSocket::openFrame($domain, (string)($options['lang'] ?? 'en')));
    echo "WebSocket connected with xmpp subprotocol\n";
    echo "First XML frame:\n";
    echo $transport->readXml() . "\n";
    $transport->sendXml(XmppWebSocket::closeFrame());
    $transport->close();
} catch (Throwable $exception) {
    $transport->close();
    fwrite(STDERR, "XMPP WebSocket smoke failed: " . $exception->getMessage() . "\n");
    exit(1);
}
