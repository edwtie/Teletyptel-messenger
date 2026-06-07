<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppSasl
{
    public const PLAIN = 'PLAIN';
    public const OAUTHBEARER = 'OAUTHBEARER';
    public const SCRAM_SHA_1 = 'SCRAM-SHA-1';
    public const SCRAM_SHA_256 = 'SCRAM-SHA-256';

    /**
     * @param array<int,string> $mechanisms
     */
    public static function selectBest(array $mechanisms): ?string
    {
        $normalized = array_map('strtoupper', $mechanisms);
        foreach ([self::SCRAM_SHA_256, self::SCRAM_SHA_1, self::PLAIN] as $mechanism) {
            if (in_array($mechanism, $normalized, true)) {
                return $mechanism;
            }
        }

        return null;
    }

    public static function plainAuth(string $authenticationIdentity, string $password, string $authorizationIdentity = ''): string
    {
        $payload = base64_encode($authorizationIdentity . "\0" . $authenticationIdentity . "\0" . $password);
        return '<auth' . XmppXml::attributes([
            'xmlns' => XmppXml::SASL_NS,
            'mechanism' => self::PLAIN,
        ]) . '>' . XmppXml::escape($payload) . '</auth>';
    }

    public static function oauthBearerAuth(string $jid, string $accessToken): string
    {
        $payload = base64_encode("n,a={$jid},\x01auth=Bearer {$accessToken}\x01\x01");
        return '<auth' . XmppXml::attributes([
            'xmlns' => XmppXml::SASL_NS,
            'mechanism' => self::OAUTHBEARER,
        ]) . '>' . XmppXml::escape($payload) . '</auth>';
    }

    public static function response(string $payload): string
    {
        return '<response xmlns="' . XmppXml::SASL_NS . '">' . XmppXml::escape(base64_encode($payload)) . '</response>';
    }

    public static function emptyResponse(): string
    {
        return '<response xmlns="' . XmppXml::SASL_NS . '"/>';
    }

    public static function text(string $xml): string
    {
        return XmppXml::document($xml)->documentElement?->textContent ?? '';
    }

    public static function isSuccess(string $xml): bool
    {
        $document = XmppXml::document($xml);
        return $document->documentElement?->namespaceURI === XmppXml::SASL_NS
            && $document->documentElement?->localName === 'success';
    }

    public static function isFailure(string $xml): bool
    {
        $document = XmppXml::document($xml);
        return $document->documentElement?->namespaceURI === XmppXml::SASL_NS
            && $document->documentElement?->localName === 'failure';
    }
}
