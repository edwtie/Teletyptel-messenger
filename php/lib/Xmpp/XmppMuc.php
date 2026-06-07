<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppMuc
{
    public const NS = 'http://jabber.org/protocol/muc';
    public const USER_NS = 'http://jabber.org/protocol/muc#user';
    public const OWNER_NS = 'http://jabber.org/protocol/muc#owner';
    public const DIRECT_INVITE_NS = 'jabber:x:conference';

    public static function roomDiscoveryRequest(string $id, XmppJid|string $service): string
    {
        return XmppDisco::itemsRequest($id, $service);
    }

    public static function joinPresence(
        XmppJid|string $room,
        string $nickname,
        ?string $password = null,
        ?int $historyMaxChars = null
    ): string {
        $roomJid = XmppJid::parse((string)$room);
        $occupant = $roomJid->bare() . '/' . $nickname;
        $history = $historyMaxChars === null ? '' : '<history maxchars="' . $historyMaxChars . '"/>';
        $passwordXml = $password === null || $password === '' ? '' : XmppXml::textElement('password', self::NS, $password);
        $extra = '<x xmlns="' . self::NS . '">' . $passwordXml . $history . '</x>';
        return XmppStanza::presence(to: $occupant, extraXml: $extra);
    }

    public static function leavePresence(XmppJid|string $room, string $nickname): string
    {
        $roomJid = XmppJid::parse((string)$room);
        return XmppStanza::presence(to: $roomJid->bare() . '/' . $nickname, type: 'unavailable');
    }

    public static function groupMessage(XmppJid|string $room, string $body, ?string $id = null, ?string $replaceId = null): string
    {
        $extra = $replaceId === null ? '' : XmppMessageLifecycle::correctionElement($replaceId);
        return XmppStanza::message(XmppJid::parse((string)$room)->bare(), $body, $id, 'groupchat', extraXml: $extra);
    }

    public static function directInvitation(XmppJid|string $invitee, XmppJid|string $room, ?string $reason = null): string
    {
        $extra = '<x' . XmppXml::attributes([
            'xmlns' => self::DIRECT_INVITE_NS,
            'jid' => XmppJid::parse((string)$room)->bare(),
            'reason' => $reason,
        ]) . '/>';
        return XmppStanza::message($invitee, '', extraXml: $extra);
    }
}
