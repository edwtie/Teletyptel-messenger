<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppJingleInBandBytestreams
{
    public static function transportElement(string $sid, int $blockSize, string $stanza = 'iq'): string
    {
        return XmppJingleFileTransfer::ibbTransportElement($sid, $blockSize, $stanza);
    }

    public static function contentElement(
        string $name,
        string $transportXml,
        string $creator = 'initiator',
        string $senders = 'initiator',
        ?string $descriptionXml = null
    ): string {
        return XmppJingle::content($name, $creator, $senders, $descriptionXml, $transportXml);
    }

    /**
     * @return array{kind:string,sid:string,blockSize:int,stanza:string}|null
     */
    public static function parseTransport(string $xml): ?array
    {
        $transport = XmppJingleFileTransfer::parseTransport($xml);
        return $transport !== null && $transport['kind'] === 'ibb' ? $transport : null;
    }

    public static function openRequestFromTransport(string $id, XmppJid|string $to, string $transportXml): string
    {
        return XmppJingleFileTransfer::openRequestFromIbbTransport($id, $to, $transportXml);
    }
}
