<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppPublicChannelSearch
{
    public const ORDER_ADDRESS = '{urn:xmpp:channel-search:0:order}address';
    public const ORDER_USERS = '{urn:xmpp:channel-search:0:order}nusers';
    public const SERVICE_MUC = 'xep-0045';
    public const SERVICE_MIX = 'xep-0369';

    public static function formRequest(string $id, XmppJid|string $searchService): string
    {
        return XmppStanza::iq('get', $id, '<search xmlns="' . XmppXml::CHANNEL_SEARCH_NS . '"/>', $searchService);
    }

    /**
     * @param array{text?:string,all?:bool,address?:bool,name?:bool,description?:bool,types?:list<string>,sortKey?:string} $query
     */
    public static function searchRequest(
        string $id,
        XmppJid|string $searchService,
        array $query,
        ?int $max = null,
        ?string $after = null,
        ?string $before = null
    ): string {
        $fields = [];
        if (($query['text'] ?? '') !== '') {
            $fields['q'] = ['type' => 'text-single', 'value' => (string)$query['text']];
        }

        foreach (['all' => 'all', 'address' => 'sinaddress', 'name' => 'sinname', 'description' => 'sindescription'] as $source => $field) {
            if (array_key_exists($source, $query)) {
                $fields[$field] = ['type' => 'boolean', 'value' => $query[$source] ? 'true' : 'false'];
            }
        }

        if (($query['types'] ?? []) !== []) {
            $fields['types'] = ['type' => 'list-multi', 'values' => $query['types']];
        }

        if (($query['sortKey'] ?? '') !== '') {
            $fields['key'] = ['type' => 'list-single', 'value' => (string)$query['sortKey']];
        }

        $rsm = ($max !== null || $after !== null || $before !== null)
            ? XmppResultSetManagement::setElement($max, $after, $before)
            : '';
        $payload = '<search xmlns="' . XmppXml::CHANNEL_SEARCH_NS . '">'
            . $rsm
            . XmppDataForm::submitElement(XmppXml::CHANNEL_SEARCH_PARAMS_NS, $fields)
            . '</search>';

        return XmppStanza::iq('get', $id, $payload, $searchService);
    }

    /**
     * @return array{channels:list<array{address:string,name:?string,description:?string,language:?string,userCount:?int,serviceType:?string,isOpen:?bool,anonymityMode:?string}>,resultSet:?array<string,mixed>}|null
     */
    public static function parseResult(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $result = $xpath->query('//channelSearch:result')->item(0);
        if (!$result instanceof DOMElement) {
            return null;
        }

        $channels = [];
        foreach ($xpath->query('channelSearch:item', $result) ?: [] as $item) {
            if (!$item instanceof DOMElement) {
                continue;
            }

            $address = $item->getAttribute('address');
            if ($address === '') {
                continue;
            }

            $channels[] = [
                'address' => $address,
                'name' => self::childText($xpath, $item, 'name'),
                'description' => self::childText($xpath, $item, 'description'),
                'language' => self::childText($xpath, $item, 'language'),
                'userCount' => self::childInt($xpath, $item, 'nusers'),
                'serviceType' => self::childText($xpath, $item, 'service-type'),
                'isOpen' => self::childBool($xpath, $item, 'is-open'),
                'anonymityMode' => self::childText($xpath, $item, 'anonymity-mode'),
            ];
        }

        return [
            'channels' => $channels,
            'resultSet' => XmppResultSetManagement::parseSet(XmppXml::nodeXml($result)),
        ];
    }

    private static function childText(\DOMXPath $xpath, DOMElement $parent, string $name): ?string
    {
        $node = $xpath->query('channelSearch:' . $name, $parent)->item(0);
        return $node instanceof DOMElement ? trim($node->textContent) : null;
    }

    private static function childInt(\DOMXPath $xpath, DOMElement $parent, string $name): ?int
    {
        $text = self::childText($xpath, $parent, $name);
        return $text === null || $text === '' ? null : (int)$text;
    }

    private static function childBool(\DOMXPath $xpath, DOMElement $parent, string $name): ?bool
    {
        $text = self::childText($xpath, $parent, $name);
        if ($text === null || $text === '') {
            return $xpath->query('channelSearch:' . $name, $parent)->length > 0 ? true : null;
        }

        return in_array(strtolower($text), ['true', '1'], true) ? true : (in_array(strtolower($text), ['false', '0'], true) ? false : null);
    }
}
