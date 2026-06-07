<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppStream
{
    public static function open(string $toDomain, string $preferredLanguage = 'en', XmppJid|string|null $from = null): string
    {
        if (trim($toDomain) === '') {
            throw new \InvalidArgumentException('Target domain is required.');
        }

        if (trim($preferredLanguage) === '') {
            throw new \InvalidArgumentException('Preferred language is required.');
        }

        return '<stream:stream' . XmppXml::attributes([
            'from' => $from === null ? null : XmppJid::parse((string)$from)->bare(),
            'to' => strtolower($toDomain),
            'version' => '1.0',
            'xml:lang' => $preferredLanguage,
            'xmlns' => XmppXml::CLIENT_NS,
            'xmlns:stream' => XmppXml::STREAM_NS,
        ]) . '>';
    }

    public static function close(): string
    {
        return '</stream:stream>';
    }

    public static function startTls(): string
    {
        return '<starttls xmlns="urn:ietf:params:xml:ns:xmpp-tls"/>';
    }
}
