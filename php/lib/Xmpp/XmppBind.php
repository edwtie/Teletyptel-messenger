<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppBind
{
    public static function request(string $id, ?string $resource = null): string
    {
        $resourceXml = $resource === null || $resource === ''
            ? ''
            : XmppXml::textElement('resource', XmppXml::BIND_NS, $resource);
        return XmppStanza::iq('set', $id, '<bind xmlns="' . XmppXml::BIND_NS . '">' . $resourceXml . '</bind>');
    }

    public static function parseBoundJid(string $xml): ?XmppJid
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $jid = $xpath->query('/c:iq/bind:bind/bind:jid')->item(0)?->textContent;
        return XmppJid::tryParse($jid);
    }
}
