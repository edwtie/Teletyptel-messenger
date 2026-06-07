<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppEmojiMarkup
{
    /**
     * @param list<array{start:int,end:int,name?:string,hashes:list<array{algo:string,value:string}>}> $spans
     */
    public static function markupElement(array $spans): string
    {
        if ($spans === []) {
            throw new \InvalidArgumentException('At least one emoji span is required.');
        }

        $xml = '<markup xmlns="' . XmppXml::MARKUP_NS . '">';
        foreach ($spans as $span) {
            $xml .= '<span' . XmppXml::attributes(['start' => $span['start'], 'end' => $span['end']]) . '>';
            $xml .= '<emoji' . XmppXml::attributes(['xmlns' => XmppXml::EMOJI_MARKUP_NS, 'name' => $span['name'] ?? null]) . '>';
            foreach ($span['hashes'] as $hash) {
                $xml .= XmppMediaSharing::hashElement($hash['algo'], $hash['value']);
            }
            $xml .= '</emoji></span>';
        }

        return $xml . '</markup>';
    }

    /**
     * @return list<array{start:int,end:int,name:?string,hashes:list<array{algo:string,value:string}>}>
     */
    public static function parseMessage(string $messageXml): array
    {
        $document = XmppXml::document($messageXml);
        $xpath = XmppXml::xpath($document);
        $spans = [];
        foreach ($xpath->query('/c:message/markup:markup/markup:span') ?: [] as $span) {
            if (!$span instanceof DOMElement || $span->getAttribute('start') === '' || $span->getAttribute('end') === '') {
                continue;
            }

            $emoji = $xpath->query('emojiMarkup:emoji', $span)->item(0);
            if (!$emoji instanceof DOMElement) {
                continue;
            }

            $hashes = [];
            foreach ($xpath->query('hashes:hash', $emoji) ?: [] as $hash) {
                if ($hash instanceof DOMElement && $hash->getAttribute('algo') !== '') {
                    $hashes[] = ['algo' => $hash->getAttribute('algo'), 'value' => trim($hash->textContent)];
                }
            }

            if ($hashes !== []) {
                $spans[] = [
                    'start' => (int)$span->getAttribute('start'),
                    'end' => (int)$span->getAttribute('end'),
                    'name' => $emoji->getAttribute('name') ?: null,
                    'hashes' => $hashes,
                ];
            }
        }

        return $spans;
    }
}
