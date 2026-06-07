<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;
use InvalidArgumentException;

final class XmppPersistentPrivateData
{
    public const PUBLISH_OPTIONS_NS = 'http://jabber.org/protocol/pubsub#publish-options';
    public const PUBLISH_OPTIONS_FEATURE = XmppXml::PUBSUB_NS . '#publish-options';
    public const PERSIST_ITEMS_FIELD = 'pubsub#persist_items';
    public const ACCESS_MODEL_FIELD = 'pubsub#access_model';
    public const PRIVATE_ACCESS_MODEL = 'whitelist';

    public static function notificationFeature(string $node): string
    {
        return XmppPersonalEventing::notificationFeature($node);
    }

    public static function storeRequest(
        string $id,
        string $node,
        string $payloadXml,
        ?string $itemId = null,
        XmppJid|string|null $to = null
    ): string {
        self::validatePayloadNamespace($payloadXml);

        $itemAttributes = XmppXml::attributes(['id' => $itemId]);
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><publish node="' . XmppXml::escape($node)
            . '"><item' . $itemAttributes . '>' . $payloadXml . '</item></publish>'
            . self::privatePublishOptions()
            . '</pubsub>';
        return XmppStanza::iq('set', $id, $payload, $to);
    }

    public static function itemsRequest(
        string $id,
        string $node,
        XmppJid|string|null $owner = null,
        ?string $itemId = null,
        ?int $maxItems = null
    ): string {
        return XmppPersonalEventing::itemsRequest($id, $node, $owner, $itemId, $maxItems);
    }

    public static function privatePublishOptions(): string
    {
        return '<publish-options xmlns="' . XmppXml::PUBSUB_NS . '">'
            . XmppDataForm::submitElement(self::PUBLISH_OPTIONS_NS, [
                self::PERSIST_ITEMS_FIELD => 'true',
                self::ACCESS_MODEL_FIELD => self::PRIVATE_ACCESS_MODEL,
            ])
            . '</publish-options>';
    }

    /**
     * @return list<array{id:?string,publisher:?string,payload:string}>|null
     */
    public static function parseItemsResult(string $xml, string $node): ?array
    {
        $items = XmppPersonalEventing::parseItemsResult($xml);
        if ($items === null || $items['node'] !== $node) {
            return null;
        }

        return $items['items'];
    }

    /**
     * @return array{node:?string,items:list<array{id:?string,publisher:?string,payload:string>>,retractions:list<string>,deleted:bool,purged:bool}|null
     */
    public static function parseTrustedNotification(string $xml, XmppJid|string $account, string $node): ?array
    {
        $stanza = XmppStanza::parse($xml);
        $from = $stanza['from'] ?? null;
        if ($from !== null && XmppJid::parse($from)->bare() !== XmppJid::parse($account)->bare()) {
            return null;
        }

        $event = XmppPersonalEventing::parseNotification($xml);
        if ($event === null || $event['node'] !== $node) {
            return null;
        }

        return $event;
    }

    private static function validatePayloadNamespace(string $payloadXml): void
    {
        $document = XmppXml::document($payloadXml);
        $root = $document->documentElement;
        if (!$root instanceof DOMElement || trim((string)$root->namespaceURI) === '') {
            throw new InvalidArgumentException('Persistent private data payloads must have a namespace.');
        }
    }
}
