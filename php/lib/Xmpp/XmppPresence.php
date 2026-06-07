<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppPresence
{
    public const TYPE_AVAILABLE = 'available';
    public const TYPE_UNAVAILABLE = 'unavailable';
    public const TYPE_SUBSCRIBE = 'subscribe';
    public const TYPE_SUBSCRIBED = 'subscribed';
    public const TYPE_UNSUBSCRIBE = 'unsubscribe';
    public const TYPE_UNSUBSCRIBED = 'unsubscribed';
    public const TYPE_PROBE = 'probe';
    public const TYPE_ERROR = 'error';

    public static function subscribe(XmppJid|string $to): string
    {
        return XmppStanza::presence(to: $to, type: self::TYPE_SUBSCRIBE);
    }

    public static function subscribed(XmppJid|string $to): string
    {
        return XmppStanza::presence(to: $to, type: self::TYPE_SUBSCRIBED);
    }

    public static function unsubscribe(XmppJid|string $to): string
    {
        return XmppStanza::presence(to: $to, type: self::TYPE_UNSUBSCRIBE);
    }

    public static function unsubscribed(XmppJid|string $to): string
    {
        return XmppStanza::presence(to: $to, type: self::TYPE_UNSUBSCRIBED);
    }

    /**
     * @return array{id:?string,type:string,from:?string,to:?string,show:string,status:?string,priority:?int,capabilities:?array<string,mixed>,avatarHash:?string,error:?array<string,mixed>}|null
     */
    public static function parse(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $root = $document->documentElement;
        if (!$root instanceof DOMElement || $root->localName !== 'presence' || $root->namespaceURI !== XmppXml::CLIENT_NS) {
            return null;
        }

        $xpath = XmppXml::xpath($document);
        $priorityText = XmppXml::firstElementText($root, XmppXml::CLIENT_NS, 'priority');
        $caps = XmppEntityCapabilities::parsePresence($xml);
        $avatarHash = $xpath->query('/c:presence/vcardUpdate:x/vcardUpdate:photo')->item(0)?->textContent;

        return [
            'id' => $root->getAttribute('id') ?: null,
            'type' => $root->getAttribute('type') ?: self::TYPE_AVAILABLE,
            'from' => $root->getAttribute('from') ?: null,
            'to' => $root->getAttribute('to') ?: null,
            'show' => XmppXml::firstElementText($root, XmppXml::CLIENT_NS, 'show') ?? 'online',
            'status' => XmppXml::firstElementText($root, XmppXml::CLIENT_NS, 'status'),
            'priority' => $priorityText === null || trim($priorityText) === '' ? null : (int)$priorityText,
            'capabilities' => $caps,
            'avatarHash' => $avatarHash === '' ? null : $avatarHash,
            'error' => XmppError::parseStanzaError($xml),
        ];
    }
}
