<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppPubSubAnnouncements
{
    public const DEFAULT_NODE = 'urn:tiedragon:teletyptel:announcements';
    public const ATOM_NS = 'http://www.w3.org/2005/Atom';
    public const PRIORITY_SCHEME = 'urn:tiedragon:teletyptel:announcement-priority';

    /**
     * @param array{
     *   id:string,
     *   title:string,
     *   summary:string,
     *   link?:string|null,
     *   language?:string|null,
     *   category?:string|null,
     *   priority?:string|null,
     *   published?:string|\DateTimeInterface|null,
     *   updated?:string|\DateTimeInterface|null
     * } $announcement
     */
    public static function publishRequest(
        string $id,
        array $announcement,
        string $node = self::DEFAULT_NODE,
        XmppJid|string|null $service = null
    ): string {
        return XmppPersonalEventing::publishRequest($id, $node, $announcement['id'], self::atomEntry($announcement), $service);
    }

    public static function itemsRequest(
        string $id,
        XmppJid|string|null $service = null,
        string $node = self::DEFAULT_NODE,
        ?int $maxItems = null
    ): string {
        return XmppPersonalEventing::itemsRequest($id, $node, $service, maxItems: $maxItems);
    }

    public static function subscribeRequest(
        string $id,
        XmppJid|string $jid,
        XmppJid|string $service,
        string $node = self::DEFAULT_NODE
    ): string {
        return XmppPubSub::subscribeRequest($id, $node, $jid, $service);
    }

    /**
     * @param array<string,mixed> $announcement
     */
    public static function atomEntry(array $announcement): string
    {
        foreach (['id', 'title', 'summary'] as $required) {
            if (trim((string)($announcement[$required] ?? '')) === '') {
                throw new \InvalidArgumentException("Announcement {$required} is required.");
            }
        }

        $published = self::dateValue($announcement['published'] ?? null);
        $updated = self::dateValue($announcement['updated'] ?? null) ?? $published ?? gmdate('c');
        $xml = '<entry xmlns="' . self::ATOM_NS . '"'
            . XmppXml::attributes(['xml:lang' => $announcement['language'] ?? null])
            . '>'
            . XmppXml::textElement('id', self::ATOM_NS, (string)$announcement['id'])
            . XmppXml::textElement('title', self::ATOM_NS, (string)$announcement['title'])
            . XmppXml::textElement('summary', self::ATOM_NS, (string)$announcement['summary']);

        if ($published !== null) {
            $xml .= XmppXml::textElement('published', self::ATOM_NS, $published);
        }
        $xml .= XmppXml::textElement('updated', self::ATOM_NS, $updated);

        if (!empty($announcement['link'])) {
            $xml .= '<link' . XmppXml::attributes(['xmlns' => self::ATOM_NS, 'href' => (string)$announcement['link']]) . '/>';
        }
        if (!empty($announcement['category'])) {
            $xml .= '<category' . XmppXml::attributes(['xmlns' => self::ATOM_NS, 'term' => (string)$announcement['category']]) . '/>';
        }
        if (!empty($announcement['priority'])) {
            $xml .= '<category' . XmppXml::attributes([
                'xmlns' => self::ATOM_NS,
                'scheme' => self::PRIORITY_SCHEME,
                'term' => (string)$announcement['priority'],
            ]) . '/>';
        }

        return $xml . '</entry>';
    }

    /**
     * @return list<array{id:string,title:string,summary:string,link:?string,language:?string,category:?string,priority:?string,published:?string,updated:?string}>
     */
    public static function parseItems(string $xml, string $node = self::DEFAULT_NODE): array
    {
        $items = XmppPersonalEventing::parseItemsResult($xml);
        if ($items === null || $items['node'] !== $node) {
            return [];
        }

        return self::parsePayloads($items['items']);
    }

    /**
     * @return list<array{id:string,title:string,summary:string,link:?string,language:?string,category:?string,priority:?string,published:?string,updated:?string}>
     */
    public static function parseNotification(string $xml, string $node = self::DEFAULT_NODE): array
    {
        $event = XmppPersonalEventing::parseNotification($xml);
        if ($event === null || $event['node'] !== $node) {
            return [];
        }

        return self::parsePayloads($event['items']);
    }

    /**
     * @return array{id:string,title:string,summary:string,link:?string,language:?string,category:?string,priority:?string,published:?string,updated:?string}|null
     */
    public static function parseAtomEntry(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $root = $document->documentElement;
        if (!$root instanceof DOMElement || $root->namespaceURI !== self::ATOM_NS || $root->localName !== 'entry') {
            return null;
        }

        $id = XmppXml::firstElementText($root, self::ATOM_NS, 'id');
        $title = XmppXml::firstElementText($root, self::ATOM_NS, 'title');
        $summary = XmppXml::firstElementText($root, self::ATOM_NS, 'summary');
        if ($id === null || $title === null || $summary === null) {
            return null;
        }

        $link = null;
        $category = null;
        $priority = null;
        foreach ($root->childNodes as $child) {
            if (!$child instanceof DOMElement || $child->namespaceURI !== self::ATOM_NS) {
                continue;
            }
            if ($child->localName === 'link' && $link === null) {
                $link = $child->getAttribute('href') ?: null;
            } elseif ($child->localName === 'category') {
                if ($child->getAttribute('scheme') === self::PRIORITY_SCHEME) {
                    $priority = $child->getAttribute('term') ?: null;
                } elseif ($category === null) {
                    $category = $child->getAttribute('term') ?: null;
                }
            }
        }

        return [
            'id' => $id,
            'title' => $title,
            'summary' => $summary,
            'link' => $link,
            'language' => $root->getAttribute('xml:lang') ?: null,
            'category' => $category,
            'priority' => $priority,
            'published' => XmppXml::firstElementText($root, self::ATOM_NS, 'published'),
            'updated' => XmppXml::firstElementText($root, self::ATOM_NS, 'updated'),
        ];
    }

    /**
     * @param list<array{id:?string,publisher:?string,payload:string}> $items
     * @return list<array{id:string,title:string,summary:string,link:?string,language:?string,category:?string,priority:?string,published:?string,updated:?string}>
     */
    private static function parsePayloads(array $items): array
    {
        $announcements = [];
        foreach ($items as $item) {
            $announcement = self::parseAtomEntry($item['payload']);
            if ($announcement !== null) {
                $announcements[] = $announcement;
            }
        }

        return $announcements;
    }

    private static function dateValue(mixed $value): ?string
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format(\DateTimeInterface::ATOM);
        }

        return $value === null || $value === '' ? null : (string)$value;
    }
}
