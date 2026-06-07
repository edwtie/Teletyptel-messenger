<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppWebSocket
{
    public static function openFrame(string $toDomain, string $preferredLanguage = 'en', ?string $id = null): string
    {
        return '<open' . XmppXml::attributes([
            'xmlns' => 'urn:ietf:params:xml:ns:xmpp-framing',
            'to' => strtolower($toDomain),
            'version' => '1.0',
            'xml:lang' => $preferredLanguage,
            'id' => $id,
        ]) . '/>';
    }

    public static function closeFrame(): string
    {
        return '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>';
    }
}
