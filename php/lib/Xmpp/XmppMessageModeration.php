<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppMessageModeration
{
    public static function moderatedRetractionRequest(string $id, XmppJid|string $room, string $stanzaId, ?string $reason = null): string
    {
        if (trim($stanzaId) === '') {
            throw new \InvalidArgumentException('Moderated stanza id is required.');
        }

        $payload = '<moderate' . XmppXml::attributes(['xmlns' => XmppXml::MODERATION_NS, 'id' => $stanzaId]) . '>'
            . '<retract xmlns="' . XmppXml::MESSAGE_RETRACT_NS . '"/>';
        if ($reason !== null && $reason !== '') {
            $payload .= XmppXml::textElement('reason', XmppXml::MODERATION_NS, $reason);
        }

        return XmppStanza::iq('set', $id, $payload . '</moderate>', $room);
    }

    public static function moderatedElement(XmppJid|string|null $by = null): string
    {
        return '<moderated' . XmppXml::attributes([
            'xmlns' => XmppXml::MODERATION_NS,
            'by' => $by === null ? null : XmppJid::parse((string)$by)->full(),
        ]) . '/>';
    }

    /**
     * @return array{by:?string,reason:?string}|null
     */
    public static function parseMessage(string $messageXml): ?array
    {
        $document = XmppXml::document($messageXml);
        $xpath = XmppXml::xpath($document);
        $moderated = $xpath->query('/c:message/moderation:moderated')->item(0);
        if (!$moderated instanceof DOMElement) {
            return null;
        }

        $reason = $xpath->query('/c:message/moderation:reason')->item(0)
            ?? $xpath->query('/c:message/retract:reason')->item(0);

        return [
            'by' => $moderated->getAttribute('by') ?: null,
            'reason' => $reason?->textContent,
        ];
    }
}
