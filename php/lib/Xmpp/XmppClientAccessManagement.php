<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppClientAccessManagement
{
    public static function listRequest(string $id): string
    {
        return XmppStanza::iq('get', $id, '<list xmlns="' . XmppXml::CLIENT_ACCESS_MANAGEMENT_NS . '"/>');
    }

    public static function revokeRequest(string $id, string $clientId): string
    {
        return XmppStanza::iq('set', $id, '<revoke' . XmppXml::attributes([
            'xmlns' => XmppXml::CLIENT_ACCESS_MANAGEMENT_NS,
            'id' => $clientId,
        ]) . '/>');
    }

    /**
     * @return list<array{id:string,type:string,connected:bool,firstSeen:?string,lastSeen:?string,authMethods:list<string>,permissionStatus:?string,software:?string,uri:?string,device:?string}>
     */
    public static function parseClients(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $clients = [];

        foreach ($xpath->query('//cam:clients/cam:client') ?: [] as $client) {
            if (!$client instanceof DOMElement) {
                continue;
            }

            $id = trim($client->getAttribute('id'));
            $type = trim($client->getAttribute('type'));
            if ($id === '' || $type === '') {
                continue;
            }

            $authMethods = [];
            foreach ($xpath->query('cam:auth/*', $client) ?: [] as $method) {
                if ($method instanceof DOMElement && $method->namespaceURI === XmppXml::CLIENT_ACCESS_MANAGEMENT_NS) {
                    $authMethods[] = $method->localName;
                }
            }

            $clients[] = [
                'id' => $id,
                'type' => $type,
                'connected' => in_array(strtolower($client->getAttribute('connected')), ['true', '1'], true),
                'firstSeen' => self::childText($xpath, $client, 'first-seen'),
                'lastSeen' => self::childText($xpath, $client, 'last-seen'),
                'authMethods' => $authMethods,
                'permissionStatus' => $xpath->query('cam:permission', $client)->item(0)?->attributes?->getNamedItem('status')?->nodeValue,
                'software' => self::childText($xpath, $client, 'user-agent/software'),
                'uri' => self::childText($xpath, $client, 'user-agent/uri'),
                'device' => self::childText($xpath, $client, 'user-agent/device'),
            ];
        }

        return $clients;
    }

    private static function childText(\DOMXPath $xpath, DOMElement $parent, string $path): ?string
    {
        $query = implode('/', array_map(static fn (string $part): string => 'cam:' . $part, explode('/', $path)));
        $node = $xpath->query($query, $parent)->item(0);
        return $node instanceof DOMElement ? $node->textContent : null;
    }
}
