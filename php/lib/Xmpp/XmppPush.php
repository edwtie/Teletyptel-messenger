<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppPush
{
    /**
     * @param array<string,string|int|bool> $publishOptions
     */
    public static function enableRequest(string $id, XmppJid|string $serviceJid, string $node, array $publishOptions = []): string
    {
        $content = '<enable' . XmppXml::attributes([
            'xmlns' => XmppXml::PUSH_NS,
            'jid' => XmppJid::parse((string)$serviceJid)->bare(),
            'node' => $node,
        ]) . '>';

        if ($publishOptions !== []) {
            $content .= self::publishOptionsForm($publishOptions);
        }

        return XmppStanza::iq('set', $id, $content . '</enable>');
    }

    public static function disableRequest(string $id, XmppJid|string $serviceJid, ?string $node = null): string
    {
        return XmppStanza::iq('set', $id, '<disable' . XmppXml::attributes([
            'xmlns' => XmppXml::PUSH_NS,
            'jid' => XmppJid::parse((string)$serviceJid)->bare(),
            'node' => $node,
        ]) . '/>');
    }

    /**
     * @param array<string,string|int|bool> $options
     */
    private static function publishOptionsForm(array $options): string
    {
        $xml = '<x xmlns="' . XmppXml::DATA_FORM_NS . '" type="submit">'
            . '<field var="FORM_TYPE" type="hidden"><value>http://jabber.org/protocol/pubsub#publish-options</value></field>';
        foreach ($options as $name => $value) {
            $xml .= '<field' . XmppXml::attributes(['var' => $name]) . '><value>' . XmppXml::escape((string)$value) . '</value></field>';
        }

        return $xml . '</x>';
    }
}
