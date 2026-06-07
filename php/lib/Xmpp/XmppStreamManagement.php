<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppStreamManagement
{
    public static function enable(bool $resume = true, ?int $max = null): string
    {
        return '<enable' . XmppXml::attributes([
            'xmlns' => XmppXml::SM_NS,
            'resume' => $resume ? 'true' : 'false',
            'max' => $max,
        ]) . '/>';
    }

    public static function ack(int $handled): string
    {
        return '<a' . XmppXml::attributes(['xmlns' => XmppXml::SM_NS, 'h' => $handled]) . '/>';
    }

    public static function requestAck(): string
    {
        return '<r xmlns="' . XmppXml::SM_NS . '"/>';
    }

    public static function resume(string $previousId, int $handled): string
    {
        return '<resume' . XmppXml::attributes(['xmlns' => XmppXml::SM_NS, 'previd' => $previousId, 'h' => $handled]) . '/>';
    }

    /**
     * @return array{type:string,id:?string,resume:bool,max:?int,location:?string,h:?int,previd:?string}
     */
    public static function parse(string $xml): array
    {
        $root = XmppXml::document($xml)->documentElement;
        $type = $root?->localName ?? '';

        $max = null;
        if ($root?->hasAttribute('max')) {
            $max = (int)$root->getAttribute('max');
        }

        $handled = null;
        if ($root?->hasAttribute('h')) {
            $handled = (int)$root->getAttribute('h');
        }

        return [
            'type' => $type,
            'id' => $root?->getAttribute('id') ?: null,
            'resume' => in_array(strtolower($root?->getAttribute('resume') ?? ''), ['true', '1'], true),
            'max' => $max,
            'location' => $root?->getAttribute('location') ?: null,
            'h' => $handled,
            'previd' => $root?->getAttribute('previd') ?: null,
        ];
    }
}
