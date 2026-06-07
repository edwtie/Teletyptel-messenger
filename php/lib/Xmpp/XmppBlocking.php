<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppBlocking
{
    public const NS = 'urn:xmpp:blocking';

    public static function listRequest(string $id): string
    {
        return XmppStanza::iq('get', $id, '<blocklist xmlns="' . self::NS . '"/>');
    }

    /**
     * @param array<int,XmppJid|string> $jids
     */
    public static function blockRequest(string $id, array $jids): string
    {
        return XmppStanza::iq('set', $id, '<block xmlns="' . self::NS . '">' . self::items($jids) . '</block>');
    }

    /**
     * @param array<int,XmppJid|string> $jids Empty means unblock all.
     */
    public static function unblockRequest(string $id, array $jids = []): string
    {
        return XmppStanza::iq('set', $id, '<unblock xmlns="' . self::NS . '">' . self::items($jids) . '</unblock>');
    }

    /**
     * @return array<int,string>
     */
    public static function parseBlockList(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $xpath->registerNamespace('b', self::NS);
        $items = [];
        foreach ($xpath->query('/c:iq/b:blocklist/b:item') ?: [] as $node) {
            $jid = $node->attributes?->getNamedItem('jid')?->nodeValue;
            if ($jid !== null && XmppJid::tryParse($jid) !== null) {
                $items[] = XmppJid::parse($jid)->full();
            }
        }

        return $items;
    }

    /**
     * @param array<int,XmppJid|string> $jids
     */
    private static function items(array $jids): string
    {
        $xml = '';
        foreach ($jids as $jid) {
            $xml .= '<item jid="' . XmppXml::escape(XmppJid::parse((string)$jid)->full()) . '"/>';
        }
        return $xml;
    }
}
