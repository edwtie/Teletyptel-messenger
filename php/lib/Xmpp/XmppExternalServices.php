<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppExternalServices
{
    public static function servicesRequest(string $id, ?string $type = null, XmppJid|string|null $to = null): string
    {
        return XmppStanza::iq('get', $id, '<services'
            . XmppXml::attributes(['xmlns' => XmppXml::EXTERNAL_SERVICE_NS, 'type' => $type])
            . '/>', $to);
    }

    /**
     * @return list<array{type:?string,host:?string,port:?int,transport:?string,username:?string,password:?string,expires:?string,restricted:bool}>
     */
    public static function parseServices(string $iqXml): array
    {
        $document = XmppXml::document($iqXml);
        $xpath = XmppXml::xpath($document);
        $services = [];
        foreach ($xpath->query('/c:iq/extdisco:services/extdisco:service') ?: [] as $node) {
            if (!$node instanceof DOMElement) {
                continue;
            }

            $services[] = [
                'type' => $node->getAttribute('type') ?: null,
                'host' => $node->getAttribute('host') ?: null,
                'port' => $node->getAttribute('port') === '' ? null : (int)$node->getAttribute('port'),
                'transport' => $node->getAttribute('transport') ?: null,
                'username' => $node->getAttribute('username') ?: null,
                'password' => $node->getAttribute('password') ?: null,
                'expires' => $node->getAttribute('expires') ?: null,
                'restricted' => in_array(strtolower($node->getAttribute('restricted')), ['1', 'true'], true),
            ];
        }

        return $services;
    }
}
