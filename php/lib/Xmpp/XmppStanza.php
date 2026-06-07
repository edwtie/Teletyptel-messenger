<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppStanza
{
    public static function message(
        XmppJid|string $to,
        string $body,
        ?string $id = null,
        string $type = 'chat',
        XmppJid|string|null $from = null,
        string $extraXml = ''
    ): string {
        $attributes = [
            'xmlns' => XmppXml::CLIENT_NS,
            'to' => self::jid($to)->full(),
            'type' => $type,
            'id' => $id,
            'from' => $from === null ? null : self::jid($from)->full(),
        ];
        $content = $body === '' ? '' : XmppXml::textElement('body', XmppXml::CLIENT_NS, $body);
        return '<message' . XmppXml::attributes($attributes) . '>' . $content . $extraXml . '</message>';
    }

    public static function presence(
        string $show = 'online',
        ?string $status = null,
        ?int $priority = null,
        XmppJid|string|null $to = null,
        ?string $type = null,
        string $extraXml = ''
    ): string {
        $content = '';
        if ($show !== 'online') {
            $content .= XmppXml::textElement('show', XmppXml::CLIENT_NS, $show);
        }
        if ($status !== null && $status !== '') {
            $content .= XmppXml::textElement('status', XmppXml::CLIENT_NS, $status);
        }
        if ($priority !== null) {
            $content .= XmppXml::textElement('priority', XmppXml::CLIENT_NS, (string)$priority);
        }

        return '<presence' . XmppXml::attributes([
            'xmlns' => XmppXml::CLIENT_NS,
            'to' => $to === null ? null : self::jid($to)->full(),
            'type' => $type,
        ]) . '>' . $content . $extraXml . '</presence>';
    }

    public static function iq(
        string $type,
        string $id,
        string $payloadXml = '',
        XmppJid|string|null $to = null,
        XmppJid|string|null $from = null
    ): string {
        return '<iq' . XmppXml::attributes([
            'xmlns' => XmppXml::CLIENT_NS,
            'type' => $type,
            'id' => $id,
            'to' => $to === null ? null : self::jid($to)->full(),
            'from' => $from === null ? null : self::jid($from)->full(),
        ]) . '>' . $payloadXml . '</iq>';
    }

    /**
     * @return array{kind:string,id:?string,type:?string,from:?string,to:?string,body:?string,payload:?string}
     */
    public static function parse(string $xml): array
    {
        $document = XmppXml::document($xml);
        $root = $document->documentElement;
        \assert($root instanceof DOMElement);

        return [
            'kind' => $root->localName,
            'id' => $root->getAttribute('id') ?: null,
            'type' => $root->getAttribute('type') ?: null,
            'from' => $root->getAttribute('from') ?: null,
            'to' => $root->getAttribute('to') ?: null,
            'body' => XmppXml::firstElementText($root, XmppXml::CLIENT_NS, 'body'),
            'payload' => XmppXml::childElementXml($root),
        ];
    }

    private static function jid(XmppJid|string $jid): XmppJid
    {
        return $jid instanceof XmppJid ? $jid : XmppJid::parse($jid);
    }
}
