<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppMessageLifecycle
{
    public static function receiptRequestElement(): string
    {
        return '<request xmlns="' . XmppXml::RECEIPTS_NS . '"/>';
    }

    public static function receiptMessage(
        XmppJid|string $to,
        string $receivedMessageId,
        ?string $id = null,
        XmppJid|string|null $from = null
    ): string {
        $extra = '<received' . XmppXml::attributes([
            'xmlns' => XmppXml::RECEIPTS_NS,
            'id' => $receivedMessageId,
        ]) . '/>';
        return XmppStanza::message($to, '', $id, 'chat', $from, $extra);
    }

    public static function chatStateMessage(
        XmppJid|string $to,
        string $state,
        ?string $id = null,
        XmppJid|string|null $from = null
    ): string {
        self::validateChatState($state);
        $extra = '<' . $state . ' xmlns="' . XmppXml::CHAT_STATES_NS . '"/>';
        return XmppStanza::message($to, '', $id, 'chat', $from, $extra);
    }

    public static function correctionElement(string $replaceId): string
    {
        return '<replace' . XmppXml::attributes([
            'xmlns' => XmppXml::MESSAGE_CORRECT_NS,
            'id' => $replaceId,
        ]) . '/>';
    }

    public static function correctionMessage(
        XmppJid|string $to,
        string $body,
        string $replaceId,
        ?string $id = null,
        XmppJid|string|null $from = null
    ): string {
        return XmppStanza::message($to, $body, $id, 'chat', $from, self::correctionElement($replaceId));
    }

    public static function retractMessage(
        XmppJid|string $to,
        string $targetMessageId,
        ?string $id = null,
        XmppJid|string|null $from = null
    ): string {
        $extra = '<retract' . XmppXml::attributes([
            'xmlns' => XmppXml::MESSAGE_RETRACT_NS,
            'id' => $targetMessageId,
        ]) . '/>';
        return XmppStanza::message($to, '', $id, 'chat', $from, $extra);
    }

    /**
     * @return array{receiptRequest:?string,receiptReceived:?string,chatState:?string,replaceId:?string,retractId:?string}
     */
    public static function parseMessageExtensions(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $root = $document->documentElement;
        $messageId = $root?->getAttribute('id') ?: null;

        $state = null;
        foreach (['active', 'composing', 'paused', 'inactive', 'gone'] as $candidate) {
            if (($xpath->query('/c:message/cs:' . $candidate)->length ?? 0) > 0) {
                $state = $candidate;
                break;
            }
        }

        return [
            'receiptRequest' => ($xpath->query('/c:message/rec:request')->length ?? 0) > 0 ? $messageId : null,
            'receiptReceived' => $xpath->query('/c:message/rec:received')->item(0)?->attributes?->getNamedItem('id')?->nodeValue,
            'chatState' => $state,
            'replaceId' => $xpath->query('/c:message/corr:replace')->item(0)?->attributes?->getNamedItem('id')?->nodeValue,
            'retractId' => $xpath->query('/c:message/retract:retract')->item(0)?->attributes?->getNamedItem('id')?->nodeValue,
        ];
    }

    private static function validateChatState(string $state): void
    {
        if (!in_array($state, ['active', 'composing', 'paused', 'inactive', 'gone'], true)) {
            throw new \InvalidArgumentException("Unsupported chat state '{$state}'.");
        }
    }
}
