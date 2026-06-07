<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppMeCommand
{
    public static function element(): string
    {
        return '<me xmlns="' . XmppXml::ME_COMMAND_NS . '"/>';
    }

    public static function message(XmppJid|string $to, string $actionText, ?string $id = null, XmppJid|string|null $from = null): string
    {
        return XmppStanza::message($to, $actionText, $id, 'chat', $from, self::element());
    }

    public static function isMeMessage(string $xml): bool
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        return ($xpath->query('/c:message/me:me')->length ?? 0) > 0;
    }
}
