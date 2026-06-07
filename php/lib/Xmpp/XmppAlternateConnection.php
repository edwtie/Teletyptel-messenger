<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppAlternateConnection
{
    /**
     * Parses either XEP-0156 host-meta XML or a compact JSON host-meta document.
     *
     * @return list<array{rel:string,href:string}>
     */
    public static function parseHostMeta(string $content): array
    {
        $trimmed = trim($content);
        if ($trimmed === '') {
            return [];
        }

        if ($trimmed[0] === '{') {
            return self::parseJsonHostMeta($trimmed);
        }

        return self::parseXmlHostMeta($trimmed);
    }

    /**
     * @return list<array{rel:string,href:string}>
     */
    private static function parseXmlHostMeta(string $xml): array
    {
        $document = XmppXml::document($xml);
        $links = [];
        foreach ($document->getElementsByTagName('Link') as $link) {
            $rel = $link->attributes?->getNamedItem('rel')?->nodeValue ?? '';
            $href = $link->attributes?->getNamedItem('href')?->nodeValue ?? '';
            if ($rel !== '' && $href !== '') {
                $links[] = ['rel' => $rel, 'href' => $href];
            }
        }

        return $links;
    }

    /**
     * @return list<array{rel:string,href:string}>
     */
    private static function parseJsonHostMeta(string $json): array
    {
        $data = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        $links = [];
        foreach (($data['links'] ?? []) as $link) {
            $rel = (string)($link['rel'] ?? '');
            $href = (string)($link['href'] ?? '');
            if ($rel !== '' && $href !== '') {
                $links[] = ['rel' => $rel, 'href' => $href];
            }
        }

        return $links;
    }

    /**
     * @param list<array{rel:string,href:string}> $links
     */
    public static function firstHref(array $links, string $rel): ?string
    {
        foreach ($links as $link) {
            if ($link['rel'] === $rel) {
                return $link['href'];
            }
        }

        return null;
    }
}
