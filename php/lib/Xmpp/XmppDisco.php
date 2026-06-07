<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppDisco
{
    public static function infoRequest(string $id, XmppJid|string|null $to = null, ?string $node = null): string
    {
        $query = '<query' . XmppXml::attributes(['xmlns' => XmppXml::DISCO_INFO_NS, 'node' => $node]) . '/>';
        return XmppStanza::iq('get', $id, $query, $to);
    }

    public static function itemsRequest(string $id, XmppJid|string|null $to = null, ?string $node = null): string
    {
        $query = '<query' . XmppXml::attributes(['xmlns' => XmppXml::DISCO_ITEMS_NS, 'node' => $node]) . '/>';
        return XmppStanza::iq('get', $id, $query, $to);
    }

    /**
     * @return array{identities:array<int,array<string,string|null>>,features:array<int,string>,forms:array<int,array<string,array<int,string>>>}
     */
    public static function parseInfoResult(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $identities = [];
        foreach ($xpath->query('/c:iq/di:query/di:identity') ?: [] as $node) {
            $identities[] = [
                'category' => $node->attributes?->getNamedItem('category')?->nodeValue ?? '',
                'type' => $node->attributes?->getNamedItem('type')?->nodeValue ?? '',
                'name' => $node->attributes?->getNamedItem('name')?->nodeValue,
            ];
        }

        $features = [];
        foreach ($xpath->query('/c:iq/di:query/di:feature') ?: [] as $node) {
            $feature = $node->attributes?->getNamedItem('var')?->nodeValue;
            if ($feature !== null && $feature !== '') {
                $features[] = $feature;
            }
        }

        $forms = [];
        foreach ($xpath->query('/c:iq/di:query/x:x') ?: [] as $formNode) {
            $form = [];
            foreach ($xpath->query('x:field', $formNode) ?: [] as $fieldNode) {
                $name = $fieldNode->attributes?->getNamedItem('var')?->nodeValue;
                if ($name === null || $name === '') {
                    continue;
                }

                $values = [];
                foreach ($xpath->query('x:value', $fieldNode) ?: [] as $valueNode) {
                    $values[] = $valueNode->textContent;
                }
                $form[$name] = $values;
            }
            $forms[] = $form;
        }

        return ['identities' => $identities, 'features' => array_values(array_unique($features)), 'forms' => $forms];
    }

    /**
     * @return list<array{jid:string,name:?string,node:?string}>
     */
    public static function parseItemsResult(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $items = [];

        foreach ($xpath->query('/c:iq/ds:query/ds:item') ?: [] as $item) {
            if (!$item instanceof DOMElement) {
                continue;
            }

            $jid = $item->getAttribute('jid');
            if ($jid === '') {
                continue;
            }

            $items[] = [
                'jid' => $jid,
                'name' => $item->getAttribute('name') ?: null,
                'node' => $item->getAttribute('node') ?: null,
            ];
        }

        return $items;
    }
}
