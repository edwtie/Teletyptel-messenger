<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppSession
{
    public static function request(string $id): string
    {
        return XmppStanza::iq('set', $id, '<session xmlns="' . XmppXml::SESSION_NS . '"/>');
    }
}
