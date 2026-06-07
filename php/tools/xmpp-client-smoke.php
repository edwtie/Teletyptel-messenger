<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Xmpp/XmppAutoload.php';

use Tiedragon\Xmpp\XmppConnectionSettings;
use Tiedragon\Xmpp\XmppJid;
use Tiedragon\Xmpp\XmppStreamClient;

function usage(): void
{
    fwrite(STDERR, "Usage: php php/tools/xmpp-client-smoke.php --jid user@domain --password secret [--host localhost] [--port 5222] [--resource php] [--to peer@domain] [--message text] [--roster] [--disco domain] [--no-tls] [--direct-tls]\n");
}

$options = getopt('', [
    'jid:',
    'password:',
    'host::',
    'port::',
    'resource::',
    'to::',
    'message::',
    'roster',
    'disco::',
    'no-tls',
    'direct-tls',
    'lang::',
    'mechanism::',
]);

if (!isset($options['jid'], $options['password'])) {
    usage();
    exit(2);
}

$jid = XmppJid::parse((string)$options['jid']);
$settings = new XmppConnectionSettings(
    account: $jid,
    host: (string)($options['host'] ?? $jid->domain),
    port: (int)($options['port'] ?? (isset($options['direct-tls']) ? 5223 : 5222)),
    requireTls: !isset($options['no-tls']),
    directTls: isset($options['direct-tls']),
    preferredLanguage: (string)($options['lang'] ?? 'en')
);

$client = new XmppStreamClient($settings);
try {
    $result = $client->login((string)$options['password'], (string)($options['resource'] ?? 'php'), isset($options['mechanism']) ? strtoupper((string)$options['mechanism']) : null);
    echo "Connected: {$result['boundJid']} via {$result['saslMechanism']} TLS=" . ($result['tlsActive'] ? 'yes' : 'no') . "\n";

    if (isset($options['roster'])) {
        echo "--- roster result ---\n";
        echo $client->getRoster() . "\n";
    }

    if (isset($options['disco'])) {
        $target = is_string($options['disco']) && $options['disco'] !== '' ? $options['disco'] : $jid->domain;
        echo "--- disco#info {$target} ---\n";
        echo $client->discoInfo($target) . "\n";
    }

    if (isset($options['to'], $options['message'])) {
        $messageId = $client->sendChatMessage((string)$options['to'], (string)$options['message']);
        echo "Message sent: {$messageId}\n";
    }

    $client->close();
} catch (Throwable $exception) {
    fwrite(STDERR, "PHP XMPP client smoke failed: " . $exception->getMessage() . "\n");
    $client->close();
    exit(1);
}
