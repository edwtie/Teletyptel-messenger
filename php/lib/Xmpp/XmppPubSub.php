<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppPubSub
{
    public static function createNodeRequest(string $id, string $node, ?string $configureFormXml = null, XmppJid|string|null $service = null): string
    {
        $configure = $configureFormXml === null ? '' : '<configure>' . $configureFormXml . '</configure>';
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><create'
            . XmppXml::attributes(['node' => $node])
            . '/>' . $configure . '</pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function publishRequest(string $id, string $node, string $itemId, string $payloadXml, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><publish node="' . XmppXml::escape($node)
            . '"><item id="' . XmppXml::escape($itemId) . '">' . $payloadXml . '</item></publish></pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function itemsRequest(string $id, string $node, XmppJid|string|null $owner = null, ?string $itemId = null, int $maxItems = 1): string
    {
        $itemXml = $itemId === null ? '' : '<item id="' . XmppXml::escape($itemId) . '"/>';
        $items = '<items' . XmppXml::attributes(['node' => $node, 'max_items' => $maxItems]) . '>' . $itemXml . '</items>';
        return XmppStanza::iq('get', $id, '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '">' . $items . '</pubsub>', $owner);
    }

    public static function retractRequest(string $id, string $node, string $itemId, bool $notify = true, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><retract'
            . XmppXml::attributes(['node' => $node, 'notify' => $notify ? 'true' : 'false'])
            . '><item id="' . XmppXml::escape($itemId) . '"/></retract></pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function subscribeRequest(string $id, string $node, XmppJid|string $subscriber, XmppJid|string|null $service = null, ?string $optionsFormXml = null): string
    {
        $options = $optionsFormXml === null ? '' : '<options>' . $optionsFormXml . '</options>';
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><subscribe'
            . XmppXml::attributes(['node' => $node, 'jid' => self::jid($subscriber)])
            . '/>' . $options . '</pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function unsubscribeRequest(string $id, string $node, XmppJid|string $subscriber, ?string $subscriptionId = null, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><unsubscribe'
            . XmppXml::attributes(['node' => $node, 'jid' => self::jid($subscriber), 'subid' => $subscriptionId])
            . '/></pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function subscriptionsRequest(string $id, ?string $node = null, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><subscriptions'
            . XmppXml::attributes(['node' => $node])
            . '/></pubsub>';
        return XmppStanza::iq('get', $id, $payload, $service);
    }

    public static function affiliationsRequest(string $id, ?string $node = null, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_NS . '"><affiliations'
            . XmppXml::attributes(['node' => $node])
            . '/></pubsub>';
        return XmppStanza::iq('get', $id, $payload, $service);
    }

    public static function nodeConfigurationRequest(string $id, string $node, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_OWNER_NS . '"><configure'
            . XmppXml::attributes(['node' => $node])
            . '/></pubsub>';
        return XmppStanza::iq('get', $id, $payload, $service);
    }

    public static function configureNodeRequest(string $id, string $node, string $formXml, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_OWNER_NS . '"><configure'
            . XmppXml::attributes(['node' => $node])
            . '>' . $formXml . '</configure></pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function deleteNodeRequest(string $id, string $node, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_OWNER_NS . '"><delete'
            . XmppXml::attributes(['node' => $node])
            . '/></pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function purgeNodeRequest(string $id, string $node, XmppJid|string|null $service = null): string
    {
        $payload = '<pubsub xmlns="' . XmppXml::PUBSUB_OWNER_NS . '"><purge'
            . XmppXml::attributes(['node' => $node])
            . '/></pubsub>';
        return XmppStanza::iq('set', $id, $payload, $service);
    }

    public static function nodeConfigForm(array $fields): string
    {
        return XmppDataForm::submitElement(XmppXml::PUBSUB_NODE_CONFIG_NS, $fields);
    }

    public static function subscribeOptionsForm(array $fields): string
    {
        return XmppDataForm::submitElement(XmppXml::PUBSUB_SUBSCRIBE_OPTIONS_NS, $fields);
    }

    /**
     * @return array{node:?string,itemId:?string}|null
     */
    public static function parsePublishResult(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $publish = $xpath->query('/c:iq/ps:pubsub/ps:publish')->item(0);
        if (!$publish instanceof DOMElement) {
            return null;
        }

        $item = $xpath->query('ps:item', $publish)->item(0);
        return [
            'node' => $publish->getAttribute('node') ?: null,
            'itemId' => $item instanceof DOMElement ? ($item->getAttribute('id') ?: null) : null,
        ];
    }

    /**
     * @return array{node:?string,items:list<array{id:?string,publisher:?string,payload:string>>}|null
     */
    public static function parseItemsResult(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $itemsNode = $xpath->query('/c:iq/ps:pubsub/ps:items')->item(0);
        if (!$itemsNode instanceof DOMElement) {
            return null;
        }

        return [
            'node' => $itemsNode->getAttribute('node') ?: null,
            'items' => self::parseItemElements($xpath->query('ps:item', $itemsNode) ?: []),
        ];
    }

    /**
     * @return list<array{node:?string,jid:string,subscription:string,subscriptionId:?string,expiry:?string}>
     */
    public static function parseSubscriptionsResult(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $subscriptions = [];

        foreach ($xpath->query('/c:iq/ps:pubsub/ps:subscriptions/ps:subscription') ?: [] as $subscription) {
            if (!$subscription instanceof DOMElement) {
                continue;
            }

            $jid = $subscription->getAttribute('jid');
            if ($jid === '') {
                continue;
            }

            $subscriptions[] = [
                'node' => $subscription->getAttribute('node') ?: null,
                'jid' => self::jid($jid),
                'subscription' => $subscription->getAttribute('subscription') ?: 'none',
                'subscriptionId' => $subscription->getAttribute('subid') ?: null,
                'expiry' => $subscription->getAttribute('expiry') ?: null,
            ];
        }

        return $subscriptions;
    }

    /**
     * @return list<array{node:?string,jid:?string,affiliation:string}>
     */
    public static function parseAffiliationsResult(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $affiliations = [];

        foreach ($xpath->query('/c:iq/ps:pubsub/ps:affiliations/ps:affiliation') ?: [] as $affiliation) {
            if (!$affiliation instanceof DOMElement) {
                continue;
            }

            $jid = $affiliation->getAttribute('jid') ?: null;
            $affiliations[] = [
                'node' => $affiliation->getAttribute('node') ?: null,
                'jid' => $jid === null ? null : self::jid($jid),
                'affiliation' => $affiliation->getAttribute('affiliation') ?: 'none',
            ];
        }

        return $affiliations;
    }

    /**
     * @return list<array{type:?string,title:?string,instructions:list<string>,fields:array<string,array<string,mixed>>}>
     */
    public static function parseConfigurationForms(string $xml): array
    {
        return XmppDataForm::parseForms($xml);
    }

    /**
     * @return array{node:?string,items:list<array{id:?string,publisher:?string,payload:string>>,retractions:list<string>,deleted:bool,purged:bool}|null
     */
    public static function parseEventMessage(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $itemsNode = $xpath->query('/c:message/pse:event/pse:items')->item(0);
        $deleteNode = $xpath->query('/c:message/pse:event/pse:delete')->item(0);
        $purgeNode = $xpath->query('/c:message/pse:event/pse:purge')->item(0);

        if (!$itemsNode instanceof DOMElement && !$deleteNode instanceof DOMElement && !$purgeNode instanceof DOMElement) {
            return null;
        }

        $node = null;
        if ($itemsNode instanceof DOMElement) {
            $node = $itemsNode->getAttribute('node') ?: null;
        } elseif ($deleteNode instanceof DOMElement) {
            $node = $deleteNode->getAttribute('node') ?: null;
        } elseif ($purgeNode instanceof DOMElement) {
            $node = $purgeNode->getAttribute('node') ?: null;
        }

        $retractions = [];
        if ($itemsNode instanceof DOMElement) {
            foreach ($xpath->query('pse:retract', $itemsNode) ?: [] as $retract) {
                if ($retract instanceof DOMElement && $retract->getAttribute('id') !== '') {
                    $retractions[] = $retract->getAttribute('id');
                }
            }
        }

        return [
            'node' => $node,
            'items' => $itemsNode instanceof DOMElement ? self::parseItemElements($xpath->query('pse:item', $itemsNode) ?: []) : [],
            'retractions' => $retractions,
            'deleted' => $deleteNode instanceof DOMElement,
            'purged' => $purgeNode instanceof DOMElement,
        ];
    }

    /**
     * @param iterable<DOMElement> $nodes
     * @return list<array{id:?string,publisher:?string,payload:string}>
     */
    private static function parseItemElements(iterable $nodes): array
    {
        $items = [];
        foreach ($nodes as $item) {
            if (!$item instanceof DOMElement) {
                continue;
            }

            $items[] = [
                'id' => $item->getAttribute('id') ?: null,
                'publisher' => $item->getAttribute('publisher') ?: null,
                'payload' => self::childrenXml($item),
            ];
        }

        return $items;
    }

    private static function childrenXml(DOMElement $element): string
    {
        $xml = '';
        foreach ($element->childNodes as $child) {
            $xml .= $element->ownerDocument?->saveXML($child) ?: '';
        }

        return $xml;
    }

    private static function jid(XmppJid|string $jid): string
    {
        return XmppJid::parse((string)$jid)->full();
    }
}
