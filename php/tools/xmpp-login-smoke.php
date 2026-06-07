<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Xmpp/XmppAutoload.php';

use Tiedragon\Xmpp\XmppConnectionSettings;
use Tiedragon\Xmpp\XmppJid;
use Tiedragon\Xmpp\XmppStreamClient;

function usage(): void
{
    fwrite(STDERR, "Usage: php php/tools/xmpp-login-smoke.php --jid user@domain --password secret [--host localhost] [--port 5222] [--resource php] [--no-tls] [--direct-tls]\n");
}

$options = getopt('', [
    'jid:',
    'password:',
    'host::',
    'port::',
    'resource::',
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
    port: (int)($options['port'] ?? ((isset($options['direct-tls'])) ? 5223 : 5222)),
    requireTls: !isset($options['no-tls']),
    directTls: isset($options['direct-tls']),
    preferredLanguage: (string)($options['lang'] ?? 'en')
);

$client = new XmppStreamClient($settings);
try {
    $result = $client->login((string)$options['password'], (string)($options['resource'] ?? 'php'), isset($options['mechanism']) ? strtoupper((string)$options['mechanism']) : null);
    echo "PHP XMPP login OK\n";
    echo "Bound JID: {$result['boundJid']}\n";
    echo "SASL: {$result['saslMechanism']}\n";
    echo "TLS active: " . ($result['tlsActive'] ? 'yes' : 'no') . "\n";
    $client->close();
} catch (Throwable $exception) {
    fwrite(STDERR, "PHP XMPP login failed: " . $exception->getMessage() . "\n");
    $client->close();
    exit(1);
}
