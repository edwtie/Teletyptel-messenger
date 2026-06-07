<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppBookmarks
{
    /**
     * @param list<array{jid:string,name?:string,nick?:string,autojoin?:bool}> $conferences
     */
    public static function storageElement(array $conferences): string
    {
        $xml = '<storage xmlns="' . XmppXml::BOOKMARKS_NS . '">';
        foreach ($conferences as $conference) {
            $xml .= '<conference' . XmppXml::attributes([
                'jid' => $conference['jid'],
                'name' => $conference['name'] ?? null,
                'autojoin' => ($conference['autojoin'] ?? false) ? 'true' : null,
            ]) . '>';
            if (($conference['nick'] ?? '') !== '') {
                $xml .= XmppXml::textElement('nick', XmppXml::BOOKMARKS_NS, (string)$conference['nick']);
            }
            $xml .= '</conference>';
        }

        return $xml . '</storage>';
    }

    public static function privateGetRequest(string $id): string
    {
        return XmppPrivateStorage::getRequest($id, 'storage', XmppXml::BOOKMARKS_NS);
    }

    /**
     * @param list<array{jid:string,name?:string,nick?:string,autojoin?:bool}> $conferences
     */
    public static function privateSetRequest(string $id, array $conferences): string
    {
        return XmppPrivateStorage::setRequest($id, self::storageElement($conferences));
    }

    /**
     * @return list<array{jid:string,name:?string,nick:?string,autojoin:bool}>
     */
    public static function parsePrivateStorageResult(string $iqXml): array
    {
        $payload = XmppPrivateStorage::firstPayloadXml($iqXml);
        if ($payload === null) {
            return [];
        }

        return self::parseStorage($payload);
    }

    /**
     * @return list<array{jid:string,name:?string,nick:?string,autojoin:bool}>
     */
    public static function parseStorage(string $storageXml): array
    {
        $document = XmppXml::document($storageXml);
        $xpath = XmppXml::xpath($document);
        $items = [];
        foreach ($xpath->query('/bookmarks:storage/bookmarks:conference') ?: [] as $node) {
            if (!$node instanceof DOMElement) {
                continue;
            }

            $jid = $node->getAttribute('jid');
            if ($jid === '') {
                continue;
            }

            $items[] = [
                'jid' => $jid,
                'name' => $node->getAttribute('name') ?: null,
                'nick' => XmppXml::firstElementText($node, XmppXml::BOOKMARKS_NS, 'nick'),
                'autojoin' => in_array(strtolower($node->getAttribute('autojoin')), ['1', 'true'], true),
            ];
        }

        return $items;
    }

    public static function pepConferenceElement(string $roomJid, ?string $name = null, ?string $nick = null, bool $autojoin = false): string
    {
        $xml = '<conference' . XmppXml::attributes([
            'xmlns' => XmppXml::BOOKMARKS2_NS,
            'name' => $name,
            'autojoin' => $autojoin ? 'true' : null,
        ]) . '>';
        if ($nick !== null && $nick !== '') {
            $xml .= XmppXml::textElement('nick', XmppXml::BOOKMARKS2_NS, $nick);
        }

        return $xml . '</conference>';
    }

    public static function pepPublishConferenceRequest(string $id, string $roomJid, ?string $name = null, ?string $nick = null, bool $autojoin = false): string
    {
        return XmppPubSub::publishRequest($id, XmppXml::BOOKMARKS2_NS, $roomJid, self::pepConferenceElement($roomJid, $name, $nick, $autojoin));
    }
}
