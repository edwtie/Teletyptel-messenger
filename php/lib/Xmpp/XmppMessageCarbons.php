<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppMessageCarbons
{
    public static function enableRequest(string $id): string
    {
        return XmppStanza::iq('set', $id, '<enable xmlns="' . XmppXml::CARBONS_NS . '"/>');
    }

    public static function disableRequest(string $id): string
    {
        return XmppStanza::iq('set', $id, '<disable xmlns="' . XmppXml::CARBONS_NS . '"/>');
    }

    public static function privateElement(): string
    {
        return '<private xmlns="' . XmppXml::CARBONS_NS . '"/>';
    }

    /**
     * @return array{direction:string,stanza:string,delayStamp:?string,delayFrom:?string}|null
     */
    public static function parseMessage(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $carbon = $xpath->query('//carbons:sent | //carbons:received')->item(0);
        if (!$carbon instanceof DOMElement) {
            return null;
        }

        $forwarded = $xpath->query('.//forward:forwarded', $carbon)->item(0);
        if (!$forwarded instanceof DOMElement) {
            return null;
        }

        $delay = $xpath->query('.//delay:delay', $forwarded)->item(0);
        $message = $xpath->query('.//c:message', $forwarded)->item(0);
        if (!$message instanceof DOMElement) {
            return null;
        }

        return [
            'direction' => $carbon->localName,
            'stanza' => XmppXml::nodeXml($message),
            'delayStamp' => $delay instanceof DOMElement ? ($delay->getAttribute('stamp') ?: null) : null,
            'delayFrom' => $delay instanceof DOMElement ? ($delay->getAttribute('from') ?: null) : null,
        ];
    }
}
