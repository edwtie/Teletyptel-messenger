<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppMediaSharing
{
    public static function sha256Hash(string $bytes): array
    {
        return ['algo' => 'sha-256', 'value' => base64_encode(hash('sha256', $bytes, true))];
    }

    /**
     * @param list<array{algo:string,value:string}> $hashes
     */
    public static function fileElement(string $name, ?int $size = null, ?string $mediaType = null, array $hashes = [], ?string $description = null): string
    {
        if (trim($name) === '') {
            throw new \InvalidArgumentException('SIMS file name is required.');
        }

        $xml = '<file xmlns="' . XmppXml::FILE_TRANSFER_NS . '">';
        if ($mediaType !== null && $mediaType !== '') {
            $xml .= XmppXml::textElement('media-type', XmppXml::FILE_TRANSFER_NS, $mediaType);
        }
        $xml .= XmppXml::textElement('name', XmppXml::FILE_TRANSFER_NS, $name);
        if ($description !== null && $description !== '') {
            $xml .= XmppXml::textElement('desc', XmppXml::FILE_TRANSFER_NS, $description);
        }
        if ($size !== null) {
            $xml .= XmppXml::textElement('size', XmppXml::FILE_TRANSFER_NS, (string)$size);
        }
        foreach ($hashes as $hash) {
            $xml .= self::hashElement($hash['algo'], $hash['value']);
        }

        return $xml . '</file>';
    }

    public static function hashElement(string $algorithm, string $value): string
    {
        if (trim($algorithm) === '' || trim($value) === '') {
            throw new \InvalidArgumentException('Hash algorithm and value are required.');
        }

        return '<hash' . XmppXml::attributes(['xmlns' => XmppXml::HASHES_NS, 'algo' => $algorithm]) . '>'
            . XmppXml::escape($value)
            . '</hash>';
    }

    /**
     * @param list<string> $sourceUrls
     */
    public static function mediaSharingReference(string $fileXml, array $sourceUrls, int $begin = 0, ?int $end = null): string
    {
        if ($sourceUrls === []) {
            throw new \InvalidArgumentException('SIMS requires at least one source URL.');
        }

        $sources = '';
        foreach ($sourceUrls as $sourceUrl) {
            $sources .= '<reference' . XmppXml::attributes([
                'xmlns' => XmppXml::REFERENCE_NS,
                'type' => 'data',
                'uri' => $sourceUrl,
            ]) . '/>';
        }

        return '<reference' . XmppXml::attributes([
            'xmlns' => XmppXml::REFERENCE_NS,
            'type' => 'data',
            'begin' => $begin,
            'end' => $end,
        ]) . '><media-sharing xmlns="' . XmppXml::SIMS_NS . '">'
            . $fileXml
            . '<sources xmlns="' . XmppXml::SIMS_NS . '">' . $sources . '</sources>'
            . '</media-sharing></reference>';
    }

    /**
     * @param list<array{algo:string,value:string}> $hashes
     */
    public static function httpUploadMessage(
        XmppJid|string $to,
        string $body,
        string $url,
        string $fileName,
        int $size,
        string $mediaType,
        array $hashes,
        ?string $id = null
    ): string {
        $file = self::fileElement($fileName, $size, $mediaType, $hashes);
        return XmppStanza::message($to, $body, $id, extraXml: self::mediaSharingReference($file, [$url], 0, strlen($body)));
    }

    /**
     * @return array{name:?string,size:?int,mediaType:?string,sources:list<string>,hashes:list<array{algo:string,value:string}>}|null
     */
    public static function parseMessage(string $messageXml): ?array
    {
        $document = XmppXml::document($messageXml);
        $xpath = XmppXml::xpath($document);
        $reference = $xpath->query('/c:message/ref:reference[sims:media-sharing]')->item(0);
        if (!$reference instanceof DOMElement) {
            return null;
        }

        $file = $xpath->query('sims:media-sharing/fileTransfer:file', $reference)->item(0);
        if (!$file instanceof DOMElement) {
            return null;
        }

        $sources = [];
        foreach ($xpath->query('sims:media-sharing/sims:sources/ref:reference', $reference) ?: [] as $source) {
            if ($source instanceof DOMElement && $source->getAttribute('uri') !== '') {
                $sources[] = $source->getAttribute('uri');
            }
        }

        $hashes = [];
        foreach ($xpath->query('hashes:hash', $file) ?: [] as $hash) {
            if ($hash instanceof DOMElement && $hash->getAttribute('algo') !== '') {
                $hashes[] = ['algo' => $hash->getAttribute('algo'), 'value' => trim($hash->textContent)];
            }
        }

        $size = XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'size');
        return [
            'name' => XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'name'),
            'size' => $size === null ? null : (int)$size,
            'mediaType' => XmppXml::firstElementText($file, XmppXml::FILE_TRANSFER_NS, 'media-type'),
            'sources' => $sources,
            'hashes' => $hashes,
        ];
    }
}
