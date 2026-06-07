<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppRtt
{
    /**
     * @param array<int,array{kind:string,pos?:int,text?:string,n?:int}> $events
     */
    public static function rttElement(string $event, int $sequence, array $events = []): string
    {
        $children = '';
        foreach ($events as $entry) {
            $kind = $entry['kind'];
            if ($kind === 't') {
                $children .= '<t' . XmppXml::attributes(['p' => $entry['pos'] ?? null]) . '>' . XmppXml::escape((string)($entry['text'] ?? '')) . '</t>';
            } elseif ($kind === 'e') {
                $children .= '<e' . XmppXml::attributes(['p' => $entry['pos'] ?? null, 'n' => $entry['n'] ?? null]) . '/>';
            } elseif ($kind === 'w') {
                $children .= '<w' . XmppXml::attributes(['n' => $entry['n'] ?? null]) . '/>';
            }
        }

        return '<rtt' . XmppXml::attributes([
            'xmlns' => XmppXml::RTT_NS,
            'event' => $event,
            'seq' => $sequence,
        ]) . '>' . $children . '</rtt>';
    }

    /**
     * @param array<int,array{kind:string,pos?:int,text?:string,n?:int}> $events
     */
    public static function message(
        XmppJid|string $to,
        string $bodyFallback,
        string $event,
        int $sequence,
        array $events = [],
        ?string $id = null,
        XmppJid|string|null $from = null
    ): string {
        return XmppStanza::message($to, $bodyFallback, $id, 'chat', $from, self::rttElement($event, $sequence, $events));
    }
}
