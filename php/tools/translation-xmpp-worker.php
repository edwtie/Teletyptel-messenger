<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
require_once dirname(__DIR__) . '/lib/Database.php';
require_once dirname(__DIR__) . '/lib/TranslationXmppService.php';
require_once dirname(__DIR__) . '/lib/Xmpp/XmppAutoload.php';

use Tiedragon\Xmpp\XmppConnectionSettings;
use Tiedragon\Xmpp\XmppJid;
use Tiedragon\Xmpp\XmppStreamClient;

$config = TranslationXmppService::configuration();
if (empty($config['jid']) || empty($config['password'])) {
    fwrite(STDERR, "Configure the private translation-xmpp.json service credentials first.\n");
    exit(1);
}
$lock = fopen(dirname(__DIR__) . '/storage/translation-xmpp.lock', 'c');
if (!$lock || !flock($lock, LOCK_EX | LOCK_NB)) exit(1);
while (true) {
    $client = new XmppStreamClient(new XmppConnectionSettings(XmppJid::parse($config['jid']), $config['host'] ?? 'localhost', (int)($config['port'] ?? 5222), caFile: $config['caFile'] ?? null), 30);
    try {
        $login = $client->login($config['password'], 'teletyptel-translation');
        if ($login['boundJid'] !== $config['jid']) throw new RuntimeException('Unexpected service resource.');
        fwrite(STDOUT, "XEP-0171 translation service connected with TLS.\n");
        while (true) {
            try { $stanza = $client->nextStanza(30); }
            catch (RuntimeException $error) {
                if (str_starts_with($error->getMessage(), 'Timed out')) { $client->sendRaw(' '); continue; }
                throw $error;
            }
            $pdo = Database::connect();
            $translator = new TranslationService($pdo, (new AdminSettings())->configuration()['translation'] ?? []);
            $service = new TranslationXmppService($pdo, $translator, $config['jid']);
            $response = $service->handle($stanza->xml);
            if ($response !== null) $client->sendRaw($response);
        }
    } catch (Throwable $error) {
        fwrite(STDERR, "Translation service disconnected; retrying in 5 seconds.\n");
    } finally {
        try { $client->close(); } catch (Throwable $error) {}
    }
    sleep(5);
}
