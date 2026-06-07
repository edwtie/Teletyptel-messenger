<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppError
{
    /**
     * @return array{condition:string,text:?string,applicationCondition:?string}|null
     */
    public static function parseStreamError(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $root = $document->documentElement;
        if (!$root instanceof DOMElement || $root->localName !== 'error' || $root->namespaceURI !== XmppXml::STREAM_NS) {
            return null;
        }

        $condition = self::firstCondition($root, XmppXml::STREAM_ERROR_NS);
        if ($condition === null) {
            return null;
        }

        return [
            'condition' => $condition,
            'text' => XmppXml::firstElementText($root, XmppXml::STREAM_ERROR_NS, 'text'),
            'applicationCondition' => self::firstApplicationCondition($root, XmppXml::STREAM_ERROR_NS),
        ];
    }

    /**
     * @return array{condition:string,type:string,text:?string,by:?string,applicationCondition:?string}|null
     */
    public static function parseStanzaError(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $error = $xpath->query('/c:message/c:error | /c:presence/c:error | /c:iq/c:error')->item(0);
        if (!$error instanceof DOMElement) {
            return null;
        }

        $condition = self::firstCondition($error, XmppXml::STANZA_ERROR_NS);
        if ($condition === null) {
            return null;
        }

        return [
            'condition' => $condition,
            'type' => $error->getAttribute('type') ?: '',
            'text' => XmppXml::firstElementText($error, XmppXml::STANZA_ERROR_NS, 'text'),
            'by' => $error->getAttribute('by') ?: null,
            'applicationCondition' => self::firstApplicationCondition($error, XmppXml::STANZA_ERROR_NS),
        ];
    }

    private static function firstCondition(DOMElement $error, string $namespace): ?string
    {
        foreach ($error->childNodes as $child) {
            if ($child instanceof DOMElement && $child->namespaceURI === $namespace && $child->localName !== 'text') {
                return $child->localName;
            }
        }

        return null;
    }

    private static function firstApplicationCondition(DOMElement $error, string $coreNamespace): ?string
    {
        foreach ($error->childNodes as $child) {
            if ($child instanceof DOMElement && $child->namespaceURI !== $coreNamespace) {
                return '{' . ($child->namespaceURI ?? '') . '}' . $child->localName;
            }
        }

        return null;
    }
}
