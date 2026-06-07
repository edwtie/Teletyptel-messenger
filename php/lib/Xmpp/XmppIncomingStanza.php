<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppIncomingStanza
{
    /**
     * @param array<string,mixed> $extensions
     */
    public function __construct(
        public readonly string $xml,
        public readonly string $kind,
        public readonly ?string $id = null,
        public readonly ?string $type = null,
        public readonly ?string $from = null,
        public readonly ?string $to = null,
        public readonly ?string $body = null,
        public readonly array $extensions = []
    ) {
    }

    public static function parse(string $xml): self
    {
        $basic = XmppStanza::parse($xml);
        $extensions = [];

        if ($basic['kind'] === 'message') {
            $extensions = XmppMessageLifecycle::parseMessageExtensions($xml);
            $extensions += XmppMessageMetadata::parseMessageMetadata($xml);
            $document = XmppXml::document($xml);
            $xpath = XmppXml::xpath($document);
            $extensions['hasRtt'] = ($xpath->query('/c:message/rtt:rtt')->length ?? 0) > 0;
            $extensions['isMamResult'] = ($xpath->query('/c:message/mam:result')->length ?? 0) > 0;
            $extensions['isPubSubEvent'] = ($xpath->query('/c:message/pse:event')->length ?? 0) > 0;
            $extensions['pubsubEvent'] = XmppPubSub::parseEventMessage($xml);
            $extensions['error'] = XmppError::parseStanzaError($xml);
        }

        if ($basic['kind'] === 'presence') {
            $extensions['presence'] = XmppPresence::parse($xml);
        }

        if ($basic['kind'] === 'iq') {
            $extensions['error'] = XmppError::parseStanzaError($xml);
        }

        return new self(
            xml: $xml,
            kind: $basic['kind'],
            id: $basic['id'],
            type: $basic['type'],
            from: $basic['from'],
            to: $basic['to'],
            body: $basic['body'],
            extensions: $extensions
        );
    }

    public function isMessage(): bool
    {
        return $this->kind === 'message';
    }

    public function isPresence(): bool
    {
        return $this->kind === 'presence';
    }

    public function isIq(): bool
    {
        return $this->kind === 'iq';
    }
}
