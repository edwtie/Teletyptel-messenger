<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppInBandRegistration
{
    /** @var list<string> */
    private const KNOWN_FIELDS = [
        'username', 'nick', 'password', 'name', 'first', 'last', 'email', 'address',
        'city', 'state', 'zip', 'phone', 'url', 'date', 'misc', 'text', 'key',
    ];

    public static function infoRequest(string $id, XmppJid|string|null $to = null): string
    {
        return XmppStanza::iq('get', $id, '<query xmlns="' . XmppXml::REGISTER_NS . '"/>', $to);
    }

    /**
     * @param array<string,string|int|float|bool|null> $fields
     */
    public static function submitRequest(string $id, array $fields, XmppJid|string|null $to = null, ?string $dataFormXml = null): string
    {
        return XmppStanza::iq('set', $id, self::queryElement($fields, $dataFormXml), $to);
    }

    public static function changePasswordRequest(string $id, string $username, string $password, XmppJid|string|null $to = null): string
    {
        return self::submitRequest($id, ['username' => $username, 'password' => $password], $to);
    }

    public static function removeRequest(string $id, XmppJid|string|null $to = null): string
    {
        return XmppStanza::iq('set', $id, '<query xmlns="' . XmppXml::REGISTER_NS . '"><remove/></query>', $to);
    }

    /**
     * @param array<string,string|int|float|bool|null> $fields
     */
    public static function queryElement(array $fields = [], ?string $dataFormXml = null): string
    {
        $content = '';
        foreach ($fields as $name => $value) {
            if ($value === null) {
                continue;
            }

            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_.:-]*$/', $name)) {
                continue;
            }

            $content .= XmppXml::textElement($name, XmppXml::REGISTER_NS, (string)$value);
        }

        if ($dataFormXml !== null && $dataFormXml !== '') {
            $content .= $dataFormXml;
        }

        return '<query xmlns="' . XmppXml::REGISTER_NS . '">' . $content . '</query>';
    }

    /**
     * @return array{registered:bool,instructions:?string,key:?string,fields:array<string,?string>,dataForms:list<array<string,mixed>>}
     */
    public static function parseInfoResult(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $query = $xpath->query('//register:query')->item(0);
        $fields = [];
        $registered = false;
        $instructions = null;
        $key = null;

        if ($query instanceof DOMElement) {
            foreach ($query->childNodes as $child) {
                if (!$child instanceof DOMElement) {
                    continue;
                }

                if ($child->namespaceURI === XmppXml::REGISTER_NS) {
                    if ($child->localName === 'registered') {
                        $registered = true;
                        continue;
                    }

                    if ($child->localName === 'instructions') {
                        $instructions = $child->textContent;
                        continue;
                    }

                    if ($child->localName === 'key') {
                        $key = $child->textContent;
                    }

                    if (in_array($child->localName, self::KNOWN_FIELDS, true)) {
                        $text = trim($child->textContent);
                        $fields[$child->localName] = $text === '' ? null : $text;
                    }
                }
            }
        }

        return [
            'registered' => $registered,
            'instructions' => $instructions,
            'key' => $key,
            'fields' => $fields,
            'dataForms' => XmppDataForm::parseForms($xml),
        ];
    }
}
