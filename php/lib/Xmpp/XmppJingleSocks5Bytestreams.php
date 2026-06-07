<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppJingleSocks5Bytestreams
{
    /**
     * @param list<array{cid:string,host:string,jid:string|XmppJid,port:int,priority:int,type?:string}> $candidates
     */
    public static function transportElement(
        string $sid,
        array $candidates = [],
        ?string $destinationAddress = null,
        string $mode = 'tcp',
        ?string $candidateUsed = null,
        bool $candidateError = false,
        ?string $activated = null,
        bool $proxyError = false
    ): string {
        return XmppJingleFileTransfer::s5bTransportElement(
            $sid,
            $candidates,
            $destinationAddress,
            $mode,
            $candidateUsed,
            $candidateError,
            $activated,
            $proxyError
        );
    }

    /**
     * @param array{cid:string,host:string,jid:string|XmppJid,port:int,priority:int,type?:string} $candidate
     */
    public static function candidateElement(array $candidate): string
    {
        return XmppJingleFileTransfer::s5bCandidateElement($candidate);
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
     * @return array{kind:string,sid:string,destinationAddress:?string,mode:string,candidates:list<array{cid:string,host:string,jid:string,port:int,priority:int,type:string}>,candidateUsed:?string,candidateError:bool,activated:?string,proxyError:bool}|null
     */
    public static function parseTransport(string $xml): ?array
    {
        $transport = XmppJingleFileTransfer::parseTransport($xml);
        return $transport !== null && $transport['kind'] === 's5b' ? $transport : null;
    }

    public static function destinationAddress(string $sid, XmppJid|string $requester, XmppJid|string $target): string
    {
        return XmppSocks5Bytestreams::destinationAddress($sid, $requester, $target);
    }
}
