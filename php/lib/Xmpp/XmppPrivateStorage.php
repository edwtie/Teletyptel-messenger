<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppPrivateStorage
{
    public static function getRequest(string $id, string $elementName, string $namespace): string
    {
        self::assertElementName($elementName);

        return XmppStanza::iq('get', $id, '<query xmlns="' . XmppXml::PRIVATE_NS . '">'
            . '<' . $elementName . XmppXml::attributes(['xmlns' => $namespace]) . '/>'
            . '</query>');
    }

    public static function setRequest(string $id, string $payloadXml): string
    {
        return XmppStanza::iq('set', $id, '<query xmlns="' . XmppXml::PRIVATE_NS . '">' . $payloadXml . '</query>');
    }

    public static function firstPayloadXml(string $iqXml): ?string
    {
        $document = XmppXml::document($iqXml);
        $xpath = XmppXml::xpath($document);
        $query = $xpath->query('/c:iq/priv:query')->item(0);
        if (!$query instanceof DOMElement) {
            return null;
        }

        return XmppXml::childElementXml($query);
    }

    private static function assertElementName(string $name): void
    {
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_.:-]*$/', $name)) {
            throw new \InvalidArgumentException("Invalid private storage element name '{$name}'.");
        }
    }
}
