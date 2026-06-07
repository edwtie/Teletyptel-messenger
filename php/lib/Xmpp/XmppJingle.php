<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppJingle
{
    public static function sessionInitiate(
        string $id,
        XmppJid|string $to,
        string $sid,
        string $initiator,
        string $contentXml
    ): string {
        $jingle = '<jingle' . XmppXml::attributes([
            'xmlns' => XmppXml::JINGLE_NS,
            'action' => 'session-initiate',
            'sid' => $sid,
            'initiator' => $initiator,
        ]) . '>' . $contentXml . '</jingle>';
        return XmppStanza::iq('set', $id, $jingle, $to);
    }

    public static function content(
        string $name,
        string $creator = 'initiator',
        string $senders = 'both',
        ?string $descriptionXml = null,
        ?string $transportXml = null
    ): string {
        $payload = ($descriptionXml ?? '') . ($transportXml ?? '');
        return '<content' . XmppXml::attributes([
            'xmlns' => XmppXml::JINGLE_NS,
            'creator' => $creator,
            'name' => $name,
            'senders' => $senders,
        ]) . '>' . $payload . '</content>';
    }

    public static function sessionInfo(string $id, XmppJid|string $to, string $sid, string $payloadXml): string
    {
        $jingle = '<jingle' . XmppXml::attributes([
            'xmlns' => XmppXml::JINGLE_NS,
            'action' => 'session-info',
            'sid' => $sid,
        ]) . '>' . $payloadXml . '</jingle>';
        return XmppStanza::iq('set', $id, $jingle, $to);
    }

    /**
     * @return array{
     *   action:string,
     *   sid:string,
     *   initiator:?string,
     *   responder:?string,
     *   contents:list<array{name:string,creator:string,senders:string,description:?string,transport:?string}>,
     *   sessionInfo:?string,
     *   reason:?array{condition:?string,text:?string}
     * }|null
     */
    public static function parse(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $jingle = $document->documentElement;
        if (!$jingle instanceof \DOMElement || $jingle->namespaceURI !== XmppXml::JINGLE_NS || $jingle->localName !== 'jingle') {
            $node = $xpath->query('//j:jingle')->item(0);
            $jingle = $node instanceof \DOMElement ? $node : null;
        }
        if (!$jingle instanceof \DOMElement || $jingle->getAttribute('action') === '' || $jingle->getAttribute('sid') === '') {
            return null;
        }

        $contents = [];
        foreach ($xpath->query('j:content', $jingle) ?: [] as $content) {
            if (!$content instanceof \DOMElement) {
                continue;
            }

            $description = null;
            $transport = null;
            foreach ($content->childNodes as $child) {
                if (!$child instanceof \DOMElement) {
                    continue;
                }
                if ($child->localName === 'description' && $description === null) {
                    $description = XmppXml::nodeXml($child);
                } elseif ($child->localName === 'transport' && $transport === null) {
                    $transport = XmppXml::nodeXml($child);
                }
            }

            $contents[] = [
                'name' => $content->getAttribute('name'),
                'creator' => $content->getAttribute('creator'),
                'senders' => $content->getAttribute('senders'),
                'description' => $description,
                'transport' => $transport,
            ];
        }

        $reasonNode = $xpath->query('j:reason', $jingle)->item(0);
        $reason = null;
        if ($reasonNode instanceof \DOMElement) {
            $condition = null;
            $text = null;
            foreach ($reasonNode->childNodes as $child) {
                if (!$child instanceof \DOMElement || $child->namespaceURI !== XmppXml::JINGLE_NS) {
                    continue;
                }
                if ($child->localName === 'text') {
                    $text = $child->textContent;
                } elseif ($condition === null) {
                    $condition = $child->localName;
                }
            }
            $reason = ['condition' => $condition, 'text' => $text];
        }

        $sessionInfo = null;
        foreach ($jingle->childNodes as $child) {
            if (!$child instanceof \DOMElement || $child->namespaceURI === XmppXml::JINGLE_NS) {
                continue;
            }
            $sessionInfo = XmppXml::nodeXml($child);
            break;
        }

        return [
            'action' => $jingle->getAttribute('action'),
            'sid' => $jingle->getAttribute('sid'),
            'initiator' => $jingle->getAttribute('initiator') ?: null,
            'responder' => $jingle->getAttribute('responder') ?: null,
            'contents' => $contents,
            'sessionInfo' => $sessionInfo,
            'reason' => $reason,
        ];
    }

    public static function rttSyncInfo(string $mode = 'sync', ?string $language = null): string
    {
        return '<rtt-sync' . XmppXml::attributes([
            'xmlns' => XmppXml::JINGLE_RTT_SYNC_NS,
            'mode' => $mode,
            'lang' => $language,
        ]) . '/>';
    }

    /**
     * @param array<string, string|int|float|\DateTimeInterface|null> $location
     */
    public static function geolocInfo(array $location): string
    {
        return '<geoloc-info xmlns="' . XmppXml::JINGLE_GEOLOC_NS . '">' . XmppGeoloc::element($location) . '</geoloc-info>';
    }
}
