<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || !in_array('--run-local', $argv, true)) {
    fwrite(STDERR, "Explicit opt-in required: --run-local. Creates and removes two temporary local XMPP accounts and a private room; calls Google with synthetic text.\n");
    exit(2);
}
require_once dirname(__DIR__) . '/lib/Database.php';
require_once dirname(__DIR__) . '/lib/TranslationXmppService.php';
require_once dirname(__DIR__) . '/lib/Xmpp/XmppAutoload.php';

use Tiedragon\Xmpp\XmppConnectionSettings;
use Tiedragon\Xmpp\XmppJid;
use Tiedragon\Xmpp\XmppStreamClient;
use Tiedragon\Xmpp\XmppXml;

$tag = 'tttranslation-test-' . bin2hex(random_bytes(5));
$room = $tag . '@conference.localhost';
$pdo = Database::connect();
$config = TranslationXmppService::configuration();
$translator = new TranslationService($pdo, (new AdminSettings())->configuration()['translation'] ?? []);
$translator->ensureSchema();
$clients = [];
$accounts = [];
$seen = [];
$passed = false;
$checks = 0;
$check = function (bool $condition, string $label) use (&$checks) {
    if (!$condition) throw new RuntimeException($label);
    $checks++;
};
$command = function (array $arguments, string $input = ''): int {
    $process = proc_open(array_merge(['docker', 'exec', '-i', 'teletyptel-ejabberd'], $arguments), [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
    if (!is_resource($process)) return 1;
    fwrite($pipes[0], $input);
    fclose($pipes[0]);
    stream_get_contents($pipes[1]);
    stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    return proc_close($process);
};
$wait = function (int $index, callable $matches) use (&$clients, &$seen) {
    for ($attempt = 0; $attempt < 40; $attempt++) {
        $stanza = $clients[$index]->nextStanza(20);
        $seen[$index][] = $stanza;
        if ($matches($stanza)) return $stanza;
    }
    throw new RuntimeException('Expected stanza not received.');
};
$iq = function (int $index, string $to, string $type, string $payload) use (&$clients, $wait, $check) {
    $id = 'probe-' . bin2hex(random_bytes(6));
    $clients[$index]->sendRaw('<iq xmlns="jabber:client" type="' . $type . '" to="' . XmppXml::escape($to) . '" id="' . $id . '">' . $payload . '</iq>');
    $reply = $wait($index, fn($stanza) => $stanza->kind === 'iq' && $stanza->id === $id);
    $failure = XmppXml::document($reply->xml)->getElementsByTagNameNS('urn:teletyptel:translation:0', 'failure')[0]?->getAttribute('code') ?? '';
    $check($reply->type === 'result', 'IQ request failed: ' . ($reply->extensions['error']['condition'] ?? 'unknown') . ' ' . $failure);
    return $reply;
};
try {
    foreach (['en', 'tr'] as $index => $language) {
        $user = $tag . '-' . $index;
        $password = bin2hex(random_bytes(24));
        $status = $command(['sh', '-c', 'read -r PASSWORD; exec /home/ejabberd/bin/ejabberdctl register "$1" localhost "$PASSWORD"', 'register', $user], $password . "\n");
        $check($status === 0, 'Temporary account registration failed');
        $accounts[] = $user;
        $pdo->prepare('INSERT INTO account_profiles (account_id, jid, display_name) VALUES (?, ?, ?)')->execute([$user, $user . '@localhost', 'Temporary translation test']);
        $translator->savePreferences($user, ['targetLanguage' => $language, 'mode' => 'automatic', 'automaticConsent' => true, 'liveRttConsent' => true, 'ownLiveRttConsent' => true]);
        $client = new XmppStreamClient(new XmppConnectionSettings(XmppJid::parse($user . '@localhost'), 'localhost', caFile: $config['caFile'] ?? null), 10);
        $clients[$index] = $client;
        $login = $client->login($password, 'translation-test');
        $check($login['tlsActive'], 'TLS required');
        $disco = $iq($index, $config['jid'], 'get', '<query xmlns="http://jabber.org/protocol/disco#info"/>');
        $check(str_contains($disco->xml, 'urn:xmpp:langtrans'), 'XEP-0171 discovery');
    }
    $clients[0]->sendRaw('<presence xmlns="jabber:client" to="' . $room . '/Alice"><x xmlns="http://jabber.org/protocol/muc"/></presence>');
    $join = $wait(0, fn($stanza) => $stanza->kind === 'presence' && $stanza->from === $room . '/Alice');
    $check($join->type !== 'error', 'Create test MUC');
    $configuration = $iq(0, $room, 'get', '<query xmlns="http://jabber.org/protocol/muc#owner"/>');
    $supported = [];
    foreach (XmppXml::document($configuration->xml)->getElementsByTagNameNS('jabber:x:data', 'field') as $field) $supported[] = $field->getAttribute('var');
    $check(in_array('muc#roomconfig_publicroom', $supported) && in_array('muc#roomconfig_membersonly', $supported), 'Private room configuration supported');
    $fields = ['FORM_TYPE' => 'http://jabber.org/protocol/muc#roomconfig', 'muc#roomconfig_publicroom' => '0',
        'muc#roomconfig_persistentroom' => '0', 'muc#roomconfig_membersonly' => '1', 'muc#roomconfig_enablelogging' => '0', 'muc#roomconfig_mam' => '0', 'muc#roomconfig_enablemam' => '0'];
    $form = '<x xmlns="jabber:x:data" type="submit">';
    foreach ($fields as $name => $value) {
        if (in_array($name, $supported)) $form .= '<field var="' . $name . '"><value>' . $value . '</value></field>';
    }
    $form .= '</x>';
    $iq(0, $room, 'set', '<query xmlns="http://jabber.org/protocol/muc#owner">' . $form . '</query>');
    $iq(0, $room, 'set', '<query xmlns="http://jabber.org/protocol/muc#admin"><item jid="' . $accounts[1] . '@localhost" affiliation="member"/></query>');
    $clients[1]->sendRaw('<presence xmlns="jabber:client" to="' . $room . '/Bob"><x xmlns="http://jabber.org/protocol/muc"/></presence>');
    $join = $wait(1, fn($stanza) => $stanza->kind === 'presence' && $stanza->from === $room . '/Bob');
    $check($join->type !== 'error', 'Second member joins');
    $original = 'Hallo, dit is een test voor de groep.';
    $clients[0]->sendRaw('<message xmlns="jabber:client" type="groupchat" to="' . $room . '" id="original"><body>' . $original . '</body></message>');
    foreach ([0, 1] as $index) {
        $message = $wait($index, fn($stanza) => $stanza->kind === 'message' && $stanza->body === $original);
        $check($message->from === $room . '/Alice', 'Original room sender preserved');
    }
    $translated = [];
    foreach (['en', 'tr'] as $index => $language) {
        $payload = '<x xmlns="urn:xmpp:langtrans"><source xml:lang="nl">' . $original . '</source><translation destination_lang="' . $language . '"/></x><context xmlns="urn:teletyptel:translation:0" automatic="true"/>';
        $reply = $iq($index, $config['jid'], 'get', $payload);
        $document = XmppXml::document($reply->xml);
        $translation = $document->getElementsByTagNameNS('urn:xmpp:langtrans', 'translation')[0];
        $check($reply->from === $config['jid'] && $reply->to === $accounts[$index] . '@localhost/translation-test', 'Reply is private, not addressed to room');
        $check($translation && $translation->getAttribute('destination_lang') === $language, 'Recipient target honored');
        $translated[] = $translation->textContent;
        $live = str_replace('automatic="true"', 'live="true" direction="peer"', $payload);
        $iq($index, $config['jid'], 'get', $live);
        $iq($index, $config['jid'], 'get', str_replace('direction="peer"', 'direction="self"', $live));
    }
    $check($translated[0] !== $translated[1] && $translated[0] !== $original, 'Two distinct real translations');
    foreach ([0 => 'Alice', 1 => 'Bob'] as $index => $nick) {
        $clients[$index]->sendRaw('<message xmlns="jabber:client" type="groupchat" to="' . $room . '"><rtt xmlns="urn:xmpp:rtt:0" event="new" seq="1"><t>Draft ' . $nick . '</t></rtt><no-store xmlns="urn:xmpp:hints"/></message>');
    }
    foreach ([0, 1] as $index) {
        $senders = [];
        while (count($senders) < 2) {
            $stanza = $wait($index, fn($item) => $item->kind === 'message' && str_contains($item->xml, 'urn:xmpp:rtt:0'));
            $senders[$stanza->from] = true;
        }
        $check(isset($senders[$room . '/Alice'], $senders[$room . '/Bob']), 'MUC RTT preserves separate participant identities');
    }
    foreach ($seen as $stanzas) foreach ($stanzas as $stanza) {
        if ($stanza->type === 'groupchat') $check(!str_contains($stanza->xml, 'urn:xmpp:langtrans'), 'No translated messages broadcast to room');
    }
    $passed = true;
    echo "Real ejabberd MUC + XEP-0171 + Google passed: {$checks} checks, English/Turkish, received/own RTT, synthetic text only.\n";
} catch (Throwable $error) {
    fwrite(STDERR, 'Live test failed after ' . $checks . ' checks: ' . get_class($error) . ($error->getLine() === 28 ? ': ' . $error->getMessage() : ' at line ' . $error->getLine()) . ".\n");
} finally {
    if (isset($clients[0])) {
        try { $iq(0, $room, 'set', '<query xmlns="http://jabber.org/protocol/muc#owner"><destroy/></query>'); } catch (Throwable $error) {}
    }
    foreach ($clients as $client) { try { $client->close(); } catch (Throwable $error) {} }
    $clean = true;
    foreach ($accounts as $user) {
        $clean = $command(['/home/ejabberd/bin/ejabberdctl', 'unregister', $user, 'localhost']) === 0 && $clean;
        $pdo->prepare('DELETE FROM translation_preferences WHERE account_id = ?')->execute([$user]);
        $pdo->prepare('DELETE FROM translation_usage WHERE scope_key IN (?, ?)')->execute(['day:' . $user, 'minute:' . $user]);
        $pdo->prepare('DELETE FROM account_profiles WHERE account_id = ?')->execute([$user]);
    }
    echo $clean ? "Temporary accounts and app preferences removed.\n" : "WARNING: verify temporary XMPP account cleanup.\n";
}
exit($passed && $clean ? 0 : 1);
