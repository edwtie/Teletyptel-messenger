<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppResultSetManagement
{
    public static function setElement(?int $max = null, ?string $after = null, ?string $before = null, ?int $index = null): string
    {
        $content = '';
        if ($max !== null) {
            $content .= XmppXml::textElement('max', XmppXml::RSM_NS, (string)$max);
        }
        if ($after !== null) {
            $content .= XmppXml::textElement('after', XmppXml::RSM_NS, $after);
        }
        if ($before !== null) {
            $content .= XmppXml::textElement('before', XmppXml::RSM_NS, $before);
        }
        if ($index !== null) {
            $content .= XmppXml::textElement('index', XmppXml::RSM_NS, (string)$index);
        }

        return '<set xmlns="' . XmppXml::RSM_NS . '">' . $content . '</set>';
    }

    /**
     * @return array{first:?string,firstIndex:?int,last:?string,count:?int,index:?int}|null
     */
    public static function parseSet(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $set = $xpath->query('//rsm:set')->item(0);
        if (!$set instanceof DOMElement) {
            return null;
        }

        $first = self::firstChild($set, 'first');
        $firstText = $first?->textContent;
        $firstIndex = $first instanceof DOMElement && $first->hasAttribute('index') ? (int)$first->getAttribute('index') : null;

        return [
            'first' => $firstText === '' ? null : $firstText,
            'firstIndex' => $firstIndex,
            'last' => self::childText($set, 'last'),
            'count' => self::childInt($set, 'count'),
            'index' => self::childInt($set, 'index'),
        ];
    }

    private static function childText(DOMElement $parent, string $name): ?string
    {
        $child = self::firstChild($parent, $name);
        if (!$child instanceof DOMElement) {
            return null;
        }

        $text = trim($child->textContent);
        return $text === '' ? null : $text;
    }

    private static function childInt(DOMElement $parent, string $name): ?int
    {
        $text = self::childText($parent, $name);
        return $text === null ? null : (int)$text;
    }

    private static function firstChild(DOMElement $parent, string $name): ?DOMElement
    {
        foreach ($parent->childNodes as $child) {
            if ($child instanceof DOMElement && $child->namespaceURI === XmppXml::RSM_NS && $child->localName === $name) {
                return $child;
            }
        }

        return null;
    }
}
