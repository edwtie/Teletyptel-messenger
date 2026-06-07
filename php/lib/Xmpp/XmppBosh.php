<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppBosh
{
    public static function initialBody(
        string $toDomain,
        int $rid,
        string $preferredLanguage = 'en',
        int $wait = 60,
        int $hold = 1,
        ?string $route = null
    ): string {
        self::assertDomain($toDomain);

        return '<body' . XmppXml::attributes([
            'rid' => $rid,
            'to' => strtolower($toDomain),
            'xml:lang' => $preferredLanguage,
            'wait' => $wait,
            'hold' => $hold,
            'ver' => '1.6',
            'xmpp:version' => '1.0',
            'route' => $route,
            'xmlns' => XmppXml::BOSH_NS,
            'xmlns:xmpp' => XmppXml::XBOSH_NS,
        ]) . '/>';
    }

    public static function restartBody(string $sid, int $rid, string $toDomain, string $preferredLanguage = 'en'): string
    {
        self::assertSid($sid);
        self::assertDomain($toDomain);

        return '<body' . XmppXml::attributes([
            'rid' => $rid,
            'sid' => $sid,
            'to' => strtolower($toDomain),
            'xml:lang' => $preferredLanguage,
            'xmpp:restart' => 'true',
            'xmlns' => XmppXml::BOSH_NS,
            'xmlns:xmpp' => XmppXml::XBOSH_NS,
        ]) . '/>';
    }

    public static function payloadBody(string $sid, int $rid, string $payloadXml): string
    {
        self::assertSid($sid);

        return '<body' . XmppXml::attributes([
            'rid' => $rid,
            'sid' => $sid,
            'xmlns' => XmppXml::BOSH_NS,
        ]) . '>' . $payloadXml . '</body>';
    }

    public static function emptyBody(string $sid, int $rid): string
    {
        return self::payloadBody($sid, $rid, '');
    }

    public static function terminateBody(string $sid, int $rid): string
    {
        self::assertSid($sid);

        return '<body' . XmppXml::attributes([
            'rid' => $rid,
            'sid' => $sid,
            'type' => 'terminate',
            'xmlns' => XmppXml::BOSH_NS,
        ]) . '/>';
    }

    /**
     * @return array{
     *     sid:?string,
     *     type:?string,
     *     condition:?string,
     *     wait:?int,
     *     hold:?int,
     *     requests:?int,
     *     inactivity:?int,
     *     polling:?int,
     *     from:?string,
     *     payloads:list<string>
     * }
     */
    public static function parseBody(string $xml): array
    {
        $document = XmppXml::document($xml);
        $body = $document->documentElement;
        if (!$body instanceof DOMElement || $body->localName !== 'body' || $body->namespaceURI !== XmppXml::BOSH_NS) {
            throw new \RuntimeException('BOSH response root must be a httpbind body.');
        }

        $payloads = [];
        foreach ($body->childNodes as $child) {
            if ($child instanceof DOMElement) {
                $payloads[] = XmppXml::nodeXml($child);
            }
        }

        return [
            'sid' => self::optionalAttribute($body, 'sid'),
            'type' => self::optionalAttribute($body, 'type'),
            'condition' => self::optionalAttribute($body, 'condition'),
            'wait' => self::optionalIntAttribute($body, 'wait'),
            'hold' => self::optionalIntAttribute($body, 'hold'),
            'requests' => self::optionalIntAttribute($body, 'requests'),
            'inactivity' => self::optionalIntAttribute($body, 'inactivity'),
            'polling' => self::optionalIntAttribute($body, 'polling'),
            'from' => self::optionalAttribute($body, 'from'),
            'payloads' => $payloads,
        ];
    }

    private static function assertDomain(string $domain): void
    {
        if (trim($domain) === '') {
            throw new \InvalidArgumentException('BOSH target domain is required.');
        }
    }

    private static function assertSid(string $sid): void
    {
        if (trim($sid) === '') {
            throw new \InvalidArgumentException('BOSH sid is required.');
        }
    }

    private static function optionalAttribute(DOMElement $element, string $name): ?string
    {
        $value = $element->getAttribute($name);
        return $value === '' ? null : $value;
    }

    private static function optionalIntAttribute(DOMElement $element, string $name): ?int
    {
        $value = self::optionalAttribute($element, $name);
        return $value === null ? null : (int)$value;
    }
}
