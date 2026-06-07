<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;
use InvalidArgumentException;

final class XmppJingleFileTransfer
{
    /**
     * @param array{
     *   name:string,
     *   size?:int|null,
     *   mediaType?:string|null,
     *   date?:string|\DateTimeInterface|null,
     *   description?:string|null,
     *   range?:array{offset?:int|null,length?:int|null}|null,
     *   hashes?:list<array{algo:string,value:string}>
     * } $file
     */
    public static function fileElement(array $file): string
    {
        if (trim($file['name'] ?? '') === '') {
            throw new InvalidArgumentException('Jingle file-transfer file name is required.');
        }

        $date = $file['date'] ?? null;
        if ($date instanceof \DateTimeInterface) {
            $date = $date->format(\DateTimeInterface::ATOM);
        }

        $xml = '<file xmlns="' . XmppXml::FILE_TRANSFER_NS . '">';
        if (($file['mediaType'] ?? null) !== null && $file['mediaType'] !== '') {
            $xml .= XmppXml::textElement('media-type', XmppXml::FILE_TRANSFER_NS, (string)$file['mediaType']);
        }
        $xml .= XmppXml::textElement('name', XmppXml::FILE_TRANSFER_NS, (string)$file['name']);
        if ($date !== null && $date !== '') {
            $xml .= XmppXml::textElement('date', XmppXml::FILE_TRANSFER_NS, (string)$date);
        }
        if (($file['description'] ?? null) !== null && $file['description'] !== '') {
            $xml .= XmppXml::textElement('desc', XmppXml::FILE_TRANSFER_NS, (string)$file['description']);
        }
        if (($file['size'] ?? null) !== null) {
            $xml .= XmppXml::textElement('size', XmppXml::FILE_TRANSFER_NS, (string)$file['size']);
        }
        if (($file['range'] ?? null) !== null) {
            $range = $file['range'];
            $xml .= '<range' . XmppXml::attributes([
                'xmlns' => XmppXml::FILE_TRANSFER_NS,
                'offset' => $range['offset'] ?? null,
                'length' => $range['length'] ?? null,
            ]) . '/>';
        }
        foreach ($file['hashes'] ?? [] as $hash) {
            $xml .= self::hashElement($hash['algo'], $hash['value']);
        }

        return $xml . '</file>';
    }

    /**
     * @param array<string,mixed> $file
     */
    public static function descriptionElement(array $file): string
    {
        return '<description xmlns="' . XmppXml::FILE_TRANSFER_NS . '">' . self::fileElement($file) . '</description>';
    }

    public static function hashElement(string $algorithm, string $value): string
    {
        if (trim($algorithm) === '' || trim($value) === '') {
            throw new InvalidArgumentException('Jingle file hash algorithm and value are required.');
        }

        return '<hash' . XmppXml::attributes(['xmlns' => XmppXml::HASHES_NS, 'algo' => $algorithm]) . '>'
            . XmppXml::escape($value)
            . '</hash>';
    }

    /**
     * @param list<array{cid:string,host:string,jid:string|XmppJid,port:int,priority:int,type?:string}> $candidates
     */
    public static function s5bTransportElement(
        string $sid,
        array $candidates = [],
        ?string $destinationAddress = null,
        string $mode = 'tcp',
        ?string $candidateUsed = null,
        bool $candidateError = false,
        ?string $activated = null,
        bool $proxyError = false
    ): string {
        if (trim($sid) === '') {
            throw new InvalidArgumentException('Jingle S5B sid is required.');
        }

        $xml = '<transport' . XmppXml::attributes([
            'xmlns' => XmppXml::JINGLE_S5B_NS,
            'sid' => $sid,
            'dstaddr' => $destinationAddress,
            'mode' => $mode === 'tcp' ? null : $mode,
        ]) . '>';
        foreach ($candidates as $candidate) {
            $xml .= self::s5bCandidateElement($candidate);
        }
        if ($candidateUsed !== null && $candidateUsed !== '') {
            $xml .= '<candidate-used' . XmppXml::attributes(['xmlns' => XmppXml::JINGLE_S5B_NS, 'cid' => $candidateUsed]) . '/>';
        }
        if ($candidateError) {
            $xml .= '<candidate-error xmlns="' . XmppXml::JINGLE_S5B_NS . '"/>';
        }
        if ($activated !== null && $activated !== '') {
            $xml .= '<activated' . XmppXml::attributes(['xmlns' => XmppXml::JINGLE_S5B_NS, 'cid' => $activated]) . '/>';
        }
        if ($proxyError) {
            $xml .= '<proxy-error xmlns="' . XmppXml::JINGLE_S5B_NS . '"/>';
        }

        return $xml . '</transport>';
    }

    /**
     * @param array{cid:string,host:string,jid:string|XmppJid,port:int,priority:int,type?:string} $candidate
     */
    public static function s5bCandidateElement(array $candidate): string
    {
        foreach (['cid', 'host', 'jid', 'port', 'priority'] as $required) {
            if (!array_key_exists($required, $candidate) || $candidate[$required] === '') {
                throw new InvalidArgumentException("Jingle S5B candidate {$required} is required.");
            }
        }

        return '<candidate' . XmppXml::attributes([
            'xmlns' => XmppXml::JINGLE_S5B_NS,
            'cid' => (string)$candidate['cid'],
            'host' => (string)$candidate['host'],
            'jid' => self::jid($candidate['jid'])->full(),
            'port' => (int)$candidate['port'],
            'priority' => (int)$candidate['priority'],
            'type' => $candidate['type'] ?? 'direct',
        ]) . '/>';
    }

    public static function ibbTransportElement(string $sid, int $blockSize, string $stanza = 'iq'): string
    {
        if (trim($sid) === '') {
            throw new InvalidArgumentException('Jingle IBB sid is required.');
        }
        XmppInBandBytestreams::validateBlockSize($blockSize);
        XmppInBandBytestreams::validateStanza($stanza);

        return '<transport' . XmppXml::attributes([
            'xmlns' => XmppXml::JINGLE_IBB_NS,
            'block-size' => $blockSize,
            'sid' => $sid,
            'stanza' => $stanza === 'iq' ? null : $stanza,
        ]) . '/>';
    }

    public static function contentElement(
        string $name,
        string $descriptionXml,
        string $transportXml,
        string $creator = 'initiator',
        string $senders = 'initiator'
    ): string {
        return XmppJingle::content($name, $creator, $senders, $descriptionXml, $transportXml);
    }

    public static function receivedInfo(string $creator, string $contentName): string
    {
        return '<received' . XmppXml::attributes([
            'xmlns' => XmppXml::FILE_TRANSFER_NS,
            'creator' => $creator,
            'name' => $contentName,
        ]) . '/>';
    }

    /**
     * @param list<array{algo:string,value:string}> $hashes
     */
    public static function checksumInfo(string $creator, string $contentName, array $hashes): string
    {
        $hashXml = '';
        foreach ($hashes as $hash) {
            $hashXml .= self::hashElement($hash['algo'], $hash['value']);
        }

        return '<checksum' . XmppXml::attributes([
            'xmlns' => XmppXml::FILE_TRANSFER_NS,
            'creator' => $creator,
            'name' => $contentName,
        ]) . '><file xmlns="' . XmppXml::FILE_TRANSFER_NS . '">' . $hashXml . '</file></checksum>';
    }

    /**
     * @return array{name:string,size:?int,mediaType:?string,date:?string,description:?string,range:?array{offset:?int,length:?int},hashes:list<array{algo:string,value:string}>}|null
     */
    public static function parseFile(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $file = self::firstElement($document->documentElement, XmppXml::FILE_TRANSFER_NS, 'file')
            ?? $xpath->query('//fileTransfer:file')->item(0);
        if (!$file instanceof DOMElement) {
            return null;
        }

        $name = XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'name');
        if ($name === null || trim($name) === '') {
            return null;
        }

        $size = XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'size');
        $rangeNode = self::firstElement($file, XmppXml::FILE_TRANSFER_NS, 'range');
        $hashes = [];
        foreach ($xpath->query('hashes:hash', $file) ?: [] as $hashNode) {
            if ($hashNode instanceof DOMElement && $hashNode->getAttribute('algo') !== '') {
                $hashes[] = ['algo' => $hashNode->getAttribute('algo'), 'value' => trim($hashNode->textContent)];
            }
        }

        return [
            'name' => $name,
            'size' => $size === null ? null : (int)$size,
            'mediaType' => XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'media-type'),
            'date' => XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'date'),
            'description' => XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'desc'),
            'range' => $rangeNode instanceof DOMElement ? [
                'offset' => $rangeNode->getAttribute('offset') === '' ? null : (int)$rangeNode->getAttribute('offset'),
                'length' => $rangeNode->getAttribute('length') === '' ? null : (int)$rangeNode->getAttribute('length'),
            ] : null,
            'hashes' => $hashes,
        ];
    }

    /**
     * @return array{kind:string,sid:string,destinationAddress:?string,mode:string,candidates:list<array{cid:string,host:string,jid:string,port:int,priority:int,type:string}>,candidateUsed:?string,candidateError:bool,activated:?string,proxyError:bool}|array{kind:string,sid:string,blockSize:int,stanza:string}|null
     */
    public static function parseTransport(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $root = $document->documentElement;
        $transport = null;
        if ($root instanceof DOMElement && in_array($root->namespaceURI, [XmppXml::JINGLE_S5B_NS, XmppXml::JINGLE_IBB_NS], true) && $root->localName === 'transport') {
            $transport = $root;
        } else {
            $node = $xpath->query('//jingleS5b:transport | //jingleIbb:transport')->item(0);
            $transport = $node instanceof DOMElement ? $node : null;
        }
        if ($transport === null || $transport->getAttribute('sid') === '') {
            return null;
        }

        if ($transport->namespaceURI === XmppXml::JINGLE_IBB_NS) {
            $blockSize = $transport->getAttribute('block-size') === '' ? 0 : (int)$transport->getAttribute('block-size');
            $stanza = $transport->getAttribute('stanza') ?: 'iq';
            if ($blockSize < 1 || !in_array($stanza, ['iq', 'message'], true)) {
                return null;
            }

            return [
                'kind' => 'ibb',
                'sid' => $transport->getAttribute('sid'),
                'blockSize' => $blockSize,
                'stanza' => $stanza,
            ];
        }

        $candidates = [];
        foreach ($xpath->query('jingleS5b:candidate', $transport) ?: [] as $candidateNode) {
            if (!$candidateNode instanceof DOMElement || $candidateNode->getAttribute('cid') === '') {
                continue;
            }
            $candidates[] = [
                'cid' => $candidateNode->getAttribute('cid'),
                'host' => $candidateNode->getAttribute('host'),
                'jid' => XmppJid::parse($candidateNode->getAttribute('jid'))->full(),
                'port' => (int)$candidateNode->getAttribute('port'),
                'priority' => (int)$candidateNode->getAttribute('priority'),
                'type' => $candidateNode->getAttribute('type') ?: 'direct',
            ];
        }
        $used = self::firstElement($transport, XmppXml::JINGLE_S5B_NS, 'candidate-used');
        $activated = self::firstElement($transport, XmppXml::JINGLE_S5B_NS, 'activated');

        return [
            'kind' => 's5b',
            'sid' => $transport->getAttribute('sid'),
            'destinationAddress' => $transport->getAttribute('dstaddr') ?: null,
            'mode' => $transport->getAttribute('mode') ?: 'tcp',
            'candidates' => $candidates,
            'candidateUsed' => $used instanceof DOMElement ? ($used->getAttribute('cid') ?: null) : null,
            'candidateError' => self::firstElement($transport, XmppXml::JINGLE_S5B_NS, 'candidate-error') instanceof DOMElement,
            'activated' => $activated instanceof DOMElement ? ($activated->getAttribute('cid') ?: null) : null,
            'proxyError' => self::firstElement($transport, XmppXml::JINGLE_S5B_NS, 'proxy-error') instanceof DOMElement,
        ];
    }

    public static function openRequestFromIbbTransport(string $id, XmppJid|string $to, string $transportXml): string
    {
        $transport = self::parseTransport($transportXml);
        if ($transport === null || $transport['kind'] !== 'ibb') {
            throw new InvalidArgumentException('Expected a Jingle IBB transport element.');
        }

        return XmppInBandBytestreams::openRequest($id, $to, $transport['sid'], $transport['blockSize'], $transport['stanza']);
    }

    public static function destinationAddress(string $sid, XmppJid|string $requester, XmppJid|string $target): string
    {
        return XmppSocks5Bytestreams::destinationAddress($sid, $requester, $target);
    }

    private static function firstElement(?DOMElement $parent, string $namespace, string $localName): ?DOMElement
    {
        if ($parent === null) {
            return null;
        }
        if ($parent->namespaceURI === $namespace && $parent->localName === $localName) {
            return $parent;
        }

        foreach ($parent->childNodes as $child) {
            if ($child instanceof DOMElement && $child->namespaceURI === $namespace && $child->localName === $localName) {
                return $child;
            }
        }

        return null;
    }

    private static function jid(XmppJid|string $jid): XmppJid
    {
        return $jid instanceof XmppJid ? $jid : XmppJid::parse($jid);
    }
}
