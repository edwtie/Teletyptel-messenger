<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppClientState
{
    public static function active(): string
    {
        return '<active xmlns="' . XmppXml::CSI_NS . '"/>';
    }

    public static function inactive(): string
    {
        return '<inactive xmlns="' . XmppXml::CSI_NS . '"/>';
    }
}
