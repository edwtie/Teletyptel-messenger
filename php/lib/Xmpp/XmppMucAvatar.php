<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppMucAvatar
{
    public const ROOMINFO_FORM_TYPE = 'http://jabber.org/protocol/muc#roominfo';
    public const AVATAR_HASH_FIELD = 'muc#roominfo_avatarhash';

    public static function serviceSupportsAvatars(string $discoInfoXml): bool
    {
        $info = XmppDisco::parseInfoResult($discoInfoXml);
        return in_array(XmppMuc::NS, $info['features'], true)
            && in_array(XmppXml::VCARD_TEMP_NS, $info['features'], true);
    }

    /**
     * @return list<string>
     */
    public static function parseRoomAvatarHashes(string $discoInfoXml): array
    {
        $forms = XmppDataForm::parseForms($discoInfoXml);
        foreach ($forms as $form) {
            $formType = $form['fields']['FORM_TYPE']['values'][0] ?? null;
            if ($formType !== self::ROOMINFO_FORM_TYPE) {
                continue;
            }

            $values = $form['fields'][self::AVATAR_HASH_FIELD]['values'] ?? [];
            return array_values(array_filter(
                array_map(static fn (string $value): string => strtolower(trim($value)), $values),
                static fn (string $value): bool => $value !== ''
            ));
        }

        return [];
    }

    public static function getRoomAvatarRequest(string $id, XmppJid|string $room): string
    {
        return XmppVCardTemp::getRequest($id, XmppJid::parse((string)$room)->bare());
    }

    public static function setRoomAvatarRequest(string $id, XmppJid|string $room, string $mediaType, string $imageBytes): string
    {
        return XmppVCardTemp::setRequest($id, [
            'PHOTO' => [
                'type' => $mediaType,
                'bytes' => $imageBytes,
            ],
        ], XmppJid::parse((string)$room)->bare());
    }

    public static function removeRoomAvatarRequest(string $id, XmppJid|string $room): string
    {
        return XmppVCardTemp::setRequest($id, [], XmppJid::parse((string)$room)->bare());
    }

    public static function avatarHash(string $imageBytes): string
    {
        return sha1($imageBytes);
    }

    /**
     * @param list<string> $advertisedHashes
     * @return array{type:string,bytes:string,hash:string,matched:bool}|null
     */
    public static function parseVerifiedAvatar(string $vcardXml, array $advertisedHashes): ?array
    {
        $vcard = XmppVCardTemp::parse($vcardXml);
        $photo = $vcard['PHOTO'];
        if ($photo === null || ($photo['bytes'] ?? null) === null) {
            return null;
        }

        $bytes = $photo['bytes'];
        $hash = self::avatarHash($bytes);
        $normalizedHashes = array_map(static fn (string $value): string => strtolower(trim($value)), $advertisedHashes);

        return [
            'type' => $photo['type'] ?: 'image/png',
            'bytes' => $bytes,
            'hash' => $hash,
            'matched' => $normalizedHashes === [] || in_array($hash, $normalizedHashes, true),
        ];
    }
}
