<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppPersonalEventing
{
    public const PUBLISH_FEATURE = XmppXml::PUBSUB_NS . '#publish';
    public const AUTO_CREATE_FEATURE = XmppXml::PUBSUB_NS . '#auto-create';
    public const AUTO_SUBSCRIBE_FEATURE = XmppXml::PUBSUB_NS . '#auto-subscribe';
    public const RETRIEVE_ITEMS_FEATURE = XmppXml::PUBSUB_NS . '#retrieve-items';
    public const SUBSCRIBE_FEATURE = XmppXml::PUBSUB_NS . '#subscribe';

    public static function notificationFeature(string $node): string
    {
        return $node . '+notify';
    }

    public static function publishRequest(string $id, string $node, ?string $itemId, string $payloadXml, XmppJid|string|null $to = null): string
    {
        $itemAttributes = XmppXml::attributes(['id' => $itemId]);
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><publish node="' . XmppXml::escape($node)
            . '"><item' . $itemAttributes . '>' . $payloadXml . '</item></publish></pubsub>';
        return XmppStanza::iq('set', $id, $payload, $to);
    }

    public static function itemsRequest(
        string $id,
        string $node,
        XmppJid|string|null $to = null,
        ?string $itemId = null,
        ?int $maxItems = null
    ): string {
        if ($maxItems !== null && $maxItems < 1) {
            throw new \InvalidArgumentException('PEP max_items must be greater than zero.');
        }

        $itemXml = $itemId === null ? '' : '<item' . XmppXml::attributes(['id' => $itemId]) . '/>';
        $items = '<items' . XmppXml::attributes(['node' => $node, 'max_items' => $maxItems]) . '>' . $itemXml . '</items>';
        return XmppStanza::iq('get', $id, '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '">' . $items . '</pubsub>', $to);
    }

    public static function retractRequest(string $id, string $node, string $itemId, bool $notify = true, XmppJid|string|null $to = null): string
    {
        return XmppPubSub::retractRequest($id, $node, $itemId, $notify, $to);
    }

    public static function deleteNodeRequest(string $id, string $node, XmppJid|string|null $to = null): string
    {
        return XmppPubSub::deleteNodeRequest($id, $node, $to);
    }

    /**
     * @return array{node:?string,items:list<array{id:?string,publisher:?string,payload:string>>}|null
     */
    public static function parseItemsResult(string $xml): ?array
    {
        return XmppPubSub::parseItemsResult($xml);
    }

    /**
     * @return array{node:?string,items:list<array{id:?string,publisher:?string,payload:string>>,retractions:list<string>,deleted:bool,purged:bool}|null
     */
    public static function parseNotification(string $xml): ?array
    {
        return XmppPubSub::parseEventMessage($xml);
    }
}
