<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppVCardTemp
{
    public static function getRequest(string $id, XmppJid|string|null $to = null): string
    {
        return XmppStanza::iq('get', $id, '<vCard xmlns="' . XmppXml::VCARD_TEMP_NS . '"/>', $to);
    }

    /**
     * @param array<string,mixed> $vcard
     */
    public static function setRequest(string $id, array $vcard, XmppJid|string|null $to = null): string
    {
        return XmppStanza::iq('set', $id, self::vCardElement($vcard), $to);
    }

    /**
     * @param array<string,mixed> $vcard
     */
    public static function vCardElement(array $vcard): string
    {
        $content = '';
        foreach (['FN', 'NICKNAME', 'URL', 'BDAY', 'TITLE', 'ROLE', 'DESC'] as $name) {
            if (isset($vcard[$name]) && $vcard[$name] !== '') {
                $content .= XmppXml::textElement($name, XmppXml::VCARD_TEMP_NS, (string)$vcard[$name]);
            }
        }

        if (isset($vcard['EMAIL']) && $vcard['EMAIL'] !== '') {
            $content .= '<EMAIL xmlns="' . XmppXml::VCARD_TEMP_NS . '"><INTERNET/><USERID>'
                . XmppXml::escape((string)$vcard['EMAIL']) . '</USERID></EMAIL>';
        }

        if (isset($vcard['PHOTO']) && is_array($vcard['PHOTO'])) {
            $content .= self::photoElement($vcard['PHOTO']);
        }

        return '<vCard xmlns="' . XmppXml::VCARD_TEMP_NS . '">' . $content . '</vCard>';
    }

    /**
     * @param array{type?:string,bytes?:string,binval?:string,extval?:string} $photo
     */
    public static function photoElement(array $photo): string
    {
        $content = '';
        if (isset($photo['type']) && $photo['type'] !== '') {
            $content .= XmppXml::textElement('TYPE', XmppXml::VCARD_TEMP_NS, (string)$photo['type']);
        }

        if (isset($photo['bytes'])) {
            $content .= XmppXml::textElement('BINVAL', XmppXml::VCARD_TEMP_NS, base64_encode((string)$photo['bytes']));
        } elseif (isset($photo['binval'])) {
            $content .= XmppXml::textElement('BINVAL', XmppXml::VCARD_TEMP_NS, (string)$photo['binval']);
        } elseif (isset($photo['extval'])) {
            $content .= XmppXml::textElement('EXTVAL', XmppXml::VCARD_TEMP_NS, (string)$photo['extval']);
        }

        return '<PHOTO xmlns="' . XmppXml::VCARD_TEMP_NS . '">' . $content . '</PHOTO>';
    }

    /**
     * @return array{FN:?string,NICKNAME:?string,URL:?string,BDAY:?string,TITLE:?string,ROLE:?string,DESC:?string,EMAIL:?string,PHOTO:?array{type:?string,binval:?string,bytes:?string,extval:?string}}
     */
    public static function parse(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $vcard = $xpath->query('//vcard:vCard')->item(0);

        $result = [
            'FN' => null,
            'NICKNAME' => null,
            'URL' => null,
            'BDAY' => null,
            'TITLE' => null,
            'ROLE' => null,
            'DESC' => null,
            'EMAIL' => null,
            'PHOTO' => null,
        ];

        if (!$vcard instanceof DOMElement) {
            return $result;
        }

        foreach (['FN', 'NICKNAME', 'URL', 'BDAY', 'TITLE', 'ROLE', 'DESC'] as $name) {
            $value = XmppXml::firstElementText($vcard, XmppXml::VCARD_TEMP_NS, $name);
            if ($value !== null) {
                $result[$name] = $value;
            }
        }

        $email = $xpath->query('.//vcard:EMAIL/vcard:USERID', $vcard)->item(0);
        if ($email instanceof DOMElement) {
            $result['EMAIL'] = $email->textContent;
        }

        $photo = $xpath->query('.//vcard:PHOTO', $vcard)->item(0);
        if ($photo instanceof DOMElement) {
            $binval = XmppXml::firstElementText($photo, XmppXml::VCARD_TEMP_NS, 'BINVAL');
            $result['PHOTO'] = [
                'type' => XmppXml::firstElementText($photo, XmppXml::VCARD_TEMP_NS, 'TYPE'),
                'binval' => $binval,
                'bytes' => $binval === null ? null : (base64_decode($binval, true) ?: null),
                'extval' => XmppXml::firstElementText($photo, XmppXml::VCARD_TEMP_NS, 'EXTVAL'),
            ];
        }

        return $result;
    }
}
