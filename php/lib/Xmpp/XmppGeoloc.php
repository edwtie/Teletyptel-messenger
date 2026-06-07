<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DateTimeInterface;

final class XmppGeoloc
{
    /**
     * @param array<string, string|int|float|DateTimeInterface|null> $location
     */
    public static function element(array $location): string
    {
        $allowed = [
            'accuracy', 'alt', 'altaccuracy', 'area', 'bearing', 'building', 'country', 'countrycode',
            'datum', 'description', 'error', 'floor', 'lat', 'locality', 'lon', 'postalcode',
            'region', 'regioncode', 'room', 'speed', 'street', 'text', 'timestamp', 'tzo', 'uri',
        ];

        $children = '';
        foreach ($allowed as $name) {
            if (!array_key_exists($name, $location) || $location[$name] === null || $location[$name] === '') {
                continue;
            }

            $value = $location[$name];
            if ($value instanceof DateTimeInterface) {
                $value = $value->format('Y-m-d\TH:i:s\Z');
            }
            $children .= XmppXml::textElement($name, XmppXml::GEOLOC_NS, (string)$value);
        }

        return '<geoloc xmlns="' . XmppXml::GEOLOC_NS . '">' . $children . '</geoloc>';
    }

    /**
     * @param array<string, string|int|float|DateTimeInterface|null> $location
     */
    public static function publishRequest(string $id, array $location, string $itemId = 'current'): string
    {
        return XmppPubSub::publishRequest($id, XmppXml::GEOLOC_NS, $itemId, self::element($location));
    }
}
