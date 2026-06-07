<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;
use InvalidArgumentException;

final class XmppInBandBytestreams
{
    public const MAX_BLOCK_SIZE = 65535;

    public static function openRequest(
        string $id,
        XmppJid|string $to,
        string $sid,
        int $blockSize,
        string $stanza = 'iq'
    ): string {
        return XmppStanza::iq('set', $id, self::openElement($sid, $blockSize, $stanza), $to);
    }

    public static function closeRequest(string $id, XmppJid|string $to, string $sid): string
    {
        return XmppStanza::iq('set', $id, self::closeElement($sid), $to);
    }

    public static function dataIq(
        string $id,
        XmppJid|string $to,
        string $sid,
        int $sequence,
        string $bytes,
        ?int $blockSize = null
    ): string {
        return XmppStanza::iq('set', $id, self::dataElement($sid, $sequence, $bytes, $blockSize), $to);
    }

    public static function dataMessage(
        XmppJid|string $to,
        string $sid,
        int $sequence,
        string $bytes,
        ?string $id = null,
        XmppJid|string|null $from = null,
        ?int $blockSize = null
    ): string {
        return XmppStanza::message($to, '', $id, from: $from, extraXml: self::dataElement($sid, $sequence, $bytes, $blockSize));
    }

    public static function openElement(string $sid, int $blockSize, string $stanza = 'iq'): string
    {
        self::validateSid($sid);
        self::validateBlockSize($blockSize);
        self::validateStanza($stanza);

        return '<open' . XmppXml::attributes([
            'xmlns' => XmppXml::IBB_NS,
            'block-size' => $blockSize,
            'sid' => $sid,
            'stanza' => $stanza === 'iq' ? null : $stanza,
        ]) . '/>';
    }

    public static function dataElement(string $sid, int $sequence, string $bytes, ?int $blockSize = null): string
    {
        self::validateSid($sid);
        self::validateSequence($sequence);
        self::validateDataLength($bytes, $blockSize);

        return '<data' . XmppXml::attributes([
            'xmlns' => XmppXml::IBB_NS,
            'seq' => $sequence,
            'sid' => $sid,
        ]) . '>' . base64_encode($bytes) . '</data>';
    }

    public static function closeElement(string $sid): string
    {
        self::validateSid($sid);
        return '<close' . XmppXml::attributes(['xmlns' => XmppXml::IBB_NS, 'sid' => $sid]) . '/>';
    }

    /**
     * @return array{sid:string,blockSize:int,stanza:string}|null
     */
    public static function parseOpenRequest(string $xml): ?array
    {
        $open = self::firstElement($xml, 'open');
        if ($open === null || $open->getAttribute('sid') === '' || $open->getAttribute('block-size') === '') {
            return null;
        }

        $blockSize = (int)$open->getAttribute('block-size');
        $stanza = $open->getAttribute('stanza') ?: 'iq';
        if ($blockSize < 1 || $blockSize > self::MAX_BLOCK_SIZE || !in_array($stanza, ['iq', 'message'], true)) {
            return null;
        }

        return ['sid' => $open->getAttribute('sid'), 'blockSize' => $blockSize, 'stanza' => $stanza];
    }

    /**
     * @return array{sid:string,sequence:int,bytes:string,stanza:string}|null
     */
    public static function parseData(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $root = $document->documentElement;
        $stanza = $root instanceof DOMElement ? $root->localName : '';

        $data = null;
        if ($root instanceof DOMElement && $root->namespaceURI === XmppXml::IBB_NS && $root->localName === 'data') {
            $data = $root;
            $stanza = 'data';
        } else {
            $xpath = XmppXml::xpath($document);
            $node = $xpath->query('//ibb:data')->item(0);
            $data = $node instanceof DOMElement ? $node : null;
        }

        if ($data === null || $data->getAttribute('sid') === '' || $data->getAttribute('seq') === '') {
            return null;
        }

        $decoded = base64_decode(trim($data->textContent), true);
        if ($decoded === false) {
            return null;
        }

        return [
            'sid' => $data->getAttribute('sid'),
            'sequence' => (int)$data->getAttribute('seq'),
            'bytes' => $decoded,
            'stanza' => $stanza,
        ];
    }

    /**
     * @return array{sid:string}|null
     */
    public static function parseCloseRequest(string $xml): ?array
    {
        $close = self::firstElement($xml, 'close');
        if ($close === null || $close->getAttribute('sid') === '') {
            return null;
        }

        return ['sid' => $close->getAttribute('sid')];
    }

    public static function validateBlockSize(int $blockSize): void
    {
        if ($blockSize < 1 || $blockSize > self::MAX_BLOCK_SIZE) {
            throw new InvalidArgumentException('IBB block-size must be between 1 and 65535 bytes.');
        }
    }

    public static function validateStanza(string $stanza): void
    {
        if (!in_array($stanza, ['iq', 'message'], true)) {
            throw new InvalidArgumentException("IBB stanza must be 'iq' or 'message'.");
        }
    }

    public static function validateDataLength(string $bytes, ?int $blockSize): void
    {
        if ($blockSize === null) {
            return;
        }

        self::validateBlockSize($blockSize);
        if (strlen($bytes) > $blockSize) {
            throw new InvalidArgumentException('IBB data chunk is larger than negotiated block-size.');
        }
    }

    private static function validateSid(string $sid): void
    {
        if (trim($sid) === '') {
            throw new InvalidArgumentException('IBB sid is required.');
        }
    }

    private static function validateSequence(int $sequence): void
    {
        if ($sequence < 0 || $sequence > self::MAX_BLOCK_SIZE) {
            throw new InvalidArgumentException('IBB sequence must be between 0 and 65535.');
        }
    }

    private static function firstElement(string $xml, string $localName): ?DOMElement
    {
        $document = XmppXml::document($xml);
        $root = $document->documentElement;
        if ($root instanceof DOMElement && $root->namespaceURI === XmppXml::IBB_NS && $root->localName === $localName) {
            return $root;
        }

        $xpath = XmppXml::xpath($document);
        $node = $xpath->query('//ibb:' . $localName)->item(0);
        return $node instanceof DOMElement ? $node : null;
    }
}
