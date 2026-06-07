<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;

final class XmppAvatar
{
    public static function idFromBytes(string $bytes): string
    {
        return sha1($bytes);
    }

    public static function dataElement(string $imageBytes): string
    {
        return '<data xmlns="' . XmppXml::AVATAR_DATA_NS . '">' . base64_encode($imageBytes) . '</data>';
    }

    public static function metadataElement(string $id, string $mediaType, int $bytes, ?int $width = null, ?int $height = null, ?string $url = null): string
    {
        return '<metadata xmlns="' . XmppXml::AVATAR_METADATA_NS . '"><info'
            . XmppXml::attributes([
                'id' => $id,
                'type' => $mediaType,
                'bytes' => $bytes,
                'width' => $width,
                'height' => $height,
                'url' => $url,
            ])
            . '/></metadata>';
    }

    public static function publishDataRequest(string $id, string $imageBytes): string
    {
        $avatarId = self::idFromBytes($imageBytes);
        return XmppPubSub::publishRequest($id, XmppXml::AVATAR_DATA_NS, $avatarId, self::dataElement($imageBytes));
    }

    public static function publishMetadataRequest(string $id, string $avatarId, string $mediaType, int $bytes, ?int $width = null, ?int $height = null, ?string $url = null): string
    {
        return XmppPubSub::publishRequest($id, XmppXml::AVATAR_METADATA_NS, $avatarId, self::metadataElement($avatarId, $mediaType, $bytes, $width, $height, $url));
    }

    public static function disableMetadataRequest(string $id): string
    {
        return XmppPubSub::publishRequest($id, XmppXml::AVATAR_METADATA_NS, 'current', '<metadata xmlns="' . XmppXml::AVATAR_METADATA_NS . '"/>');
    }

    public static function vcardUpdateElement(?string $avatarId): string
    {
        $photo = $avatarId === null ? '<photo/>' : XmppXml::textElement('photo', XmppXml::VCARD_TEMP_UPDATE_NS, $avatarId);
        return '<x xmlns="' . XmppXml::VCARD_TEMP_UPDATE_NS . '">' . $photo . '</x>';
    }

    /**
     * @return list<array{id:string,type:?string,bytes:?int,width:?int,height:?int,url:?string}>
     */
    public static function parseMetadata(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $items = [];
        foreach ($xpath->query('//avatarMetadata:metadata/avatarMetadata:info') ?: [] as $node) {
            if (!$node instanceof DOMElement || $node->getAttribute('id') === '') {
                continue;
            }

            $items[] = [
                'id' => $node->getAttribute('id'),
                'type' => $node->getAttribute('type') ?: null,
                'bytes' => $node->getAttribute('bytes') === '' ? null : (int)$node->getAttribute('bytes'),
                'width' => $node->getAttribute('width') === '' ? null : (int)$node->getAttribute('width'),
                'height' => $node->getAttribute('height') === '' ? null : (int)$node->getAttribute('height'),
                'url' => $node->getAttribute('url') ?: null,
            ];
        }

        return $items;
    }

    public static function parseData(string $xml): string
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $node = $xpath->query('//avatarData:data')->item(0);
        if ($node === null) {
            throw new \RuntimeException('Avatar data payload not found.');
        }

        $decoded = base64_decode(trim($node->textContent), true);
        if ($decoded === false) {
            throw new \RuntimeException('Avatar data payload is not valid base64.');
        }

        return $decoded;
    }
}
