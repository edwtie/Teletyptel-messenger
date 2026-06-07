<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMElement;
use InvalidArgumentException;

final class XmppOmemo
{
    public const NAMESPACE = XmppXml::OMEMO_NS;
    public const DEVICE_LIST_NODE = self::NAMESPACE . ':devices';
    public const BUNDLES_NODE = self::NAMESPACE . ':bundles';

    public static function deviceListRequest(string $id, XmppJid|string $contact): string
    {
        return XmppPersonalEventing::itemsRequest($id, self::DEVICE_LIST_NODE, $contact);
    }

    public static function bundleRequest(string $id, XmppJid|string $contact, int $deviceId): string
    {
        return XmppPersonalEventing::itemsRequest($id, self::BUNDLES_NODE, $contact, (string)$deviceId);
    }

    /**
     * @param list<int> $deviceIds
     */
    public static function deviceListPublish(string $id, array $deviceIds): string
    {
        $ids = array_values(array_unique(array_map('intval', $deviceIds)));
        sort($ids, SORT_NUMERIC);

        $devices = '<devices xmlns="' . self::NAMESPACE . '">';
        foreach ($ids as $deviceId) {
            if ($deviceId < 0) {
                throw new InvalidArgumentException('OMEMO device ids cannot be negative.');
            }
            $devices .= '<device' . XmppXml::attributes(['xmlns' => self::NAMESPACE, 'id' => $deviceId]) . '/>';
        }

        return XmppPersonalEventing::publishRequest($id, self::DEVICE_LIST_NODE, 'current', $devices . '</devices>');
    }

    /**
     * @param array{
     *   signedPreKeyPublic:string,
     *   signedPreKeyId:int,
     *   signedPreKeySignature:string,
     *   identityKey:string,
     *   preKeys:list<array{id:int,publicKey:string}>
     * } $bundle
     */
    public static function bundlePublish(string $id, int $deviceId, array $bundle): string
    {
        return XmppPersonalEventing::publishRequest($id, self::BUNDLES_NODE, (string)$deviceId, self::bundleElement($bundle));
    }

    /**
     * @param array{
     *   signedPreKeyPublic:string,
     *   signedPreKeyId:int,
     *   signedPreKeySignature:string,
     *   identityKey:string,
     *   preKeys:list<array{id:int,publicKey:string}>
     * } $bundle
     */
    public static function bundleElement(array $bundle): string
    {
        foreach (['signedPreKeyPublic', 'signedPreKeySignature', 'identityKey'] as $required) {
            if (trim((string)($bundle[$required] ?? '')) === '') {
                throw new InvalidArgumentException("OMEMO bundle {$required} is required.");
            }
        }

        $preKeys = $bundle['preKeys'] ?? [];
        usort($preKeys, static fn (array $left, array $right): int => ((int)$left['id']) <=> ((int)$right['id']));

        $xml = '<bundle xmlns="' . self::NAMESPACE . '">'
            . '<signedPreKeyPublic' . XmppXml::attributes(['xmlns' => self::NAMESPACE, 'signedPreKeyId' => (int)$bundle['signedPreKeyId']]) . '>'
            . XmppXml::escape((string)$bundle['signedPreKeyPublic'])
            . '</signedPreKeyPublic>'
            . XmppXml::textElement('signedPreKeySignature', self::NAMESPACE, (string)$bundle['signedPreKeySignature'])
            . XmppXml::textElement('identityKey', self::NAMESPACE, (string)$bundle['identityKey'])
            . '<prekeys xmlns="' . self::NAMESPACE . '">';

        foreach ($preKeys as $preKey) {
            if (!isset($preKey['id'], $preKey['publicKey']) || trim((string)$preKey['publicKey']) === '') {
                throw new InvalidArgumentException('OMEMO pre-keys require id and publicKey.');
            }
            $xml .= '<preKeyPublic' . XmppXml::attributes(['xmlns' => self::NAMESPACE, 'preKeyId' => (int)$preKey['id']]) . '>'
                . XmppXml::escape((string)$preKey['publicKey'])
                . '</preKeyPublic>';
        }

        return $xml . '</prekeys></bundle>';
    }

    /**
     * @param list<array{recipientDeviceId:int,cipherText:string,isPreKey?:bool,recipientJid?:string|XmppJid|null}> $keys
     */
    public static function encryptedMessage(
        XmppJid|string $to,
        int $senderDeviceId,
        array $keys,
        string $payload,
        ?string $id = null,
        XmppJid|string|null $from = null
    ): string {
        if ($senderDeviceId < 0 || trim($payload) === '') {
            throw new InvalidArgumentException('OMEMO sender device id and payload are required.');
        }

        $toJid = self::jid($to);
        $groups = [];
        foreach ($keys as $key) {
            $bare = isset($key['recipientJid']) && $key['recipientJid'] !== null
                ? self::jid($key['recipientJid'])->bare()
                : $toJid->bare();
            $groups[$bare][] = $key;
        }
        ksort($groups, SORT_STRING);

        $header = '<header' . XmppXml::attributes(['xmlns' => self::NAMESPACE, 'sid' => $senderDeviceId]) . '>';
        foreach ($groups as $bare => $group) {
            usort($group, static fn (array $left, array $right): int => ((int)$left['recipientDeviceId']) <=> ((int)$right['recipientDeviceId']));
            $header .= '<keys' . XmppXml::attributes(['xmlns' => self::NAMESPACE, 'jid' => $bare]) . '>';
            foreach ($group as $key) {
                if (!isset($key['recipientDeviceId'], $key['cipherText']) || trim((string)$key['cipherText']) === '') {
                    throw new InvalidArgumentException('OMEMO key transports require recipientDeviceId and cipherText.');
                }
                $header .= '<key' . XmppXml::attributes([
                    'xmlns' => self::NAMESPACE,
                    'rid' => (int)$key['recipientDeviceId'],
                    'prekey' => !empty($key['isPreKey']) ? 'true' : null,
                ]) . '>' . XmppXml::escape((string)$key['cipherText']) . '</key>';
            }
            $header .= '</keys>';
        }
        $header .= '</header>';

        return XmppStanza::message(
            $toJid,
            '',
            $id,
            'chat',
            $from,
            '<encrypted xmlns="' . self::NAMESPACE . '">' . $header . XmppXml::textElement('payload', self::NAMESPACE, $payload) . '</encrypted>'
        );
    }

    /**
     * @return array{senderDeviceId:int,keys:list<array{recipientDeviceId:int,cipherText:string,isPreKey:bool,recipientJid:?string}>,payload:?string,from:?string,to:?string,id:?string}|null
     */
    public static function parseEncryptedMessage(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $message = $document->documentElement;
        if (!$message instanceof DOMElement || $message->namespaceURI !== XmppXml::CLIENT_NS || $message->localName !== 'message') {
            return null;
        }

        $header = $xpath->query('omemo:encrypted/omemo:header', $message)->item(0);
        if (!$header instanceof DOMElement || $header->getAttribute('sid') === '') {
            return null;
        }

        $keys = [];
        foreach ($xpath->query('omemo:keys', $header) ?: [] as $keysNode) {
            if (!$keysNode instanceof DOMElement) {
                continue;
            }
            $recipientJid = $keysNode->getAttribute('jid') ?: ($message->getAttribute('to') ?: null);
            foreach ($xpath->query('omemo:key', $keysNode) ?: [] as $keyNode) {
                if (!$keyNode instanceof DOMElement || $keyNode->getAttribute('rid') === '') {
                    continue;
                }
                $keys[] = [
                    'recipientDeviceId' => (int)$keyNode->getAttribute('rid'),
                    'cipherText' => trim($keyNode->textContent),
                    'isPreKey' => strtolower($keyNode->getAttribute('prekey')) === 'true',
                    'recipientJid' => $recipientJid,
                ];
            }
        }

        $payload = $xpath->query('omemo:encrypted/omemo:payload', $message)->item(0);
        return [
            'senderDeviceId' => (int)$header->getAttribute('sid'),
            'keys' => $keys,
            'payload' => $payload instanceof DOMElement ? trim($payload->textContent) : null,
            'from' => $message->getAttribute('from') ?: null,
            'to' => $message->getAttribute('to') ?: null,
            'id' => $message->getAttribute('id') ?: null,
        ];
    }

    /**
     * @return list<int>
     */
    public static function parseDeviceList(string $xml): array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $ids = [];
        foreach ($xpath->query('//omemo:device') ?: [] as $device) {
            if ($device instanceof DOMElement && $device->getAttribute('id') !== '') {
                $ids[] = (int)$device->getAttribute('id');
            }
        }

        return array_values(array_unique($ids));
    }

    /**
     * @return array{signedPreKeyPublic:string,signedPreKeyId:int,signedPreKeySignature:string,identityKey:string,preKeys:list<array{id:int,publicKey:string}>}|null
     */
    public static function parseBundle(string $xml): ?array
    {
        $document = XmppXml::document($xml);
        $xpath = XmppXml::xpath($document);
        $bundle = $xpath->query('//omemo:bundle')->item(0);
        if (!$bundle instanceof DOMElement) {
            return null;
        }

        $signedPreKey = $xpath->query('omemo:signedPreKeyPublic', $bundle)->item(0);
        $signature = $xpath->query('omemo:signedPreKeySignature', $bundle)->item(0);
        $identityKey = $xpath->query('omemo:identityKey', $bundle)->item(0);
        if (!$signedPreKey instanceof DOMElement
            || !$signature instanceof DOMElement
            || !$identityKey instanceof DOMElement
            || $signedPreKey->getAttribute('signedPreKeyId') === '') {
            return null;
        }

        $preKeys = [];
        foreach ($xpath->query('omemo:prekeys/omemo:preKeyPublic', $bundle) ?: [] as $preKey) {
            if ($preKey instanceof DOMElement && $preKey->getAttribute('preKeyId') !== '') {
                $preKeys[] = [
                    'id' => (int)$preKey->getAttribute('preKeyId'),
                    'publicKey' => trim($preKey->textContent),
                ];
            }
        }

        return [
            'signedPreKeyPublic' => trim($signedPreKey->textContent),
            'signedPreKeyId' => (int)$signedPreKey->getAttribute('signedPreKeyId'),
            'signedPreKeySignature' => trim($signature->textContent),
            'identityKey' => trim($identityKey->textContent),
            'preKeys' => $preKeys,
        ];
    }

    public static function isValidBase64(string $value): bool
    {
        if (trim($value) === '') {
            return false;
        }

        return base64_encode((string)base64_decode($value, true)) === $value;
    }

    private static function jid(XmppJid|string $jid): XmppJid
    {
        return $jid instanceof XmppJid ? $jid : XmppJid::parse($jid);
    }
}
