<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DateTimeInterface;
use DOMElement;

final class XmppMessageMetadata
{
    /**
     * @param DateTimeInterface|string $stamp UTC timestamp or an already formatted XMPP datetime.
     */
    public static function delayElement(DateTimeInterface|string $stamp, XmppJid|string|null $from = null, ?string $reason = null): string
    {
        $stampValue = $stamp instanceof DateTimeInterface ? $stamp->format('Y-m-d\TH:i:s\Z') : $stamp;
        $attributes = [
            'xmlns' => XmppXml::DELAY_NS,
            'stamp' => $stampValue,
            'from' => $from === null ? null : self::jid($from),
        ];

        if ($reason === null || $reason === '') {
            return '<delay' . XmppXml::attributes($attributes) . '/>';
        }

        return '<delay' . XmppXml::attributes($attributes) . '>' . XmppXml::escape($reason) . '</delay>';
    }

    public static function originIdElement(?string $id = null): string
    {
        $id ??= bin2hex(random_bytes(16));
        return '<origin-id' . XmppXml::attributes([
            'xmlns' => XmppXml::STANZA_IDS_NS,
            'id' => $id,
        ]) . '/>';
    }

    public static function stanzaIdElement(string $id, XmppJid|string $by): string
    {
        return '<stanza-id' . XmppXml::attributes([
            'xmlns' => XmppXml::STANZA_IDS_NS,
            'id' => $id,
            'by' => self::jid($by),
        ]) . '/>';
    }

    public static function hintElement(string $hint): string
    {
        self::validateHint($hint);
        return '<' . $hint . ' xmlns="' . XmppXml::HINTS_NS . '"/>';
    }

    /**
     * @param list<string> $hints
     */
    public static function hintElements(array $hints): string
    {
        $xml = '';
        foreach ($hints as $hint) {
            $xml .= self::hintElement($hint);
        }

        return $xml;
    }

    /**
     * @return array{
     *   delayStamp:?string,
     *   delayFrom:?string,
     *   delayReason:?string,
     *   originId:?string,
     *   stanzaIds:list<array{id:string,by:string}>,
     *   hints:list<string>
     * }
     */
    public static function parseMessageMetadata(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);

        $delay = $xpath->query('/c:message/delay:delay')->item(0);
        $originId = $xpath->query('/c:message/sid:origin-id')->item(0);
        $stanzaIds = [];
        $hints = [];

        foreach ($xpath->query('/c:message/sid:stanza-id') ?: [] as $stanzaId) {
            if (!$stanzaId instanceof DOMElement) {
                continue;
            }

            $id = $stanzaId->getAttribute('id');
            $by = $stanzaId->getAttribute('by');
            if ($id === '' || $by === '') {
                continue;
            }

            $stanzaIds[] = ['id' => $id, 'by' => self::jid($by)];
        }

        foreach (['no-permanent-store', 'no-store', 'no-copy', 'store'] as $hint) {
            if (($xpath->query('/c:message/hints:' . $hint)->length ?? 0) > 0) {
                $hints[] = $hint;
            }
        }

        return [
            'delayStamp' => $delay instanceof DOMElement ? ($delay->getAttribute('stamp') ?: null) : null,
            'delayFrom' => $delay instanceof DOMElement ? ($delay->getAttribute('from') ?: null) : null,
            'delayReason' => $delay instanceof DOMElement ? (trim($delay->textContent) ?: null) : null,
            'originId' => $originId instanceof DOMElement ? ($originId->getAttribute('id') ?: null) : null,
            'stanzaIds' => $stanzaIds,
            'hints' => $hints,
        ];
    }

    private static function validateHint(string $hint): void
    {
        if (!in_array($hint, ['no-permanent-store', 'no-store', 'no-copy', 'store'], true)) {
            throw new \InvalidArgumentException("Unsupported message processing hint '{$hint}'.");
        }
    }

    private static function jid(XmppJid|string $jid): string
    {
        return XmppJid::parse((string)$jid)->full();
    }
}
