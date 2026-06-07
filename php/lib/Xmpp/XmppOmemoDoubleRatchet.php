<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use InvalidArgumentException;
use RuntimeException;

final class XmppOmemoDoubleRatchet
{
    public const ROOT_KEY_SIZE = 32;
    public const CHAIN_KEY_SIZE = 32;
    public const MESSAGE_KEY_SIZE = 32;
    public const X25519_KEY_SIZE = 32;
    public const HEADER_VERSION = 1;
    public const DEFAULT_MAX_SKIP = 1000;

    private const ROOT_INFO = 'Tiedragon TeleTypTel OMEMO Double Ratchet root v1';
    private const MESSAGE_INFO = 'Tiedragon TeleTypTel OMEMO Double Ratchet message v1';
    private const TAG_SIZE = 16;
    private const NONCE_SIZE = 12;

    public static function isAvailable(): bool
    {
        return extension_loaded('sodium') && extension_loaded('openssl') && in_array('aes-256-gcm', openssl_get_cipher_methods(), true);
    }

    /**
     * @return array{publicKey:string,privateKey:string}
     */
    public static function generateKeyPair(): array
    {
        self::requireCrypto();
        $keyPair = sodium_crypto_box_keypair();

        return [
            'publicKey' => base64_encode(sodium_crypto_box_publickey($keyPair)),
            'privateKey' => base64_encode(sodium_crypto_box_secretkey($keyPair)),
        ];
    }

    /**
     * @return array{
     *   rootKey:string,
     *   localRatchetKeyPair:array{publicKey:string,privateKey:string},
     *   remoteRatchetPublicKey:string,
     *   sendingChainKey:string,
     *   receivingChainKey:null,
     *   sendingMessageNumber:int,
     *   receivingMessageNumber:int,
     *   previousSendingChainLength:int,
     *   skippedMessageKeys:array<string,string>,
     *   updatedAt:string
     * }
     */
    public static function createInitiatorState(string $sharedSecret, string $remoteRatchetPublicKey): array
    {
        self::requireCrypto();
        self::requireBytes($sharedSecret, self::ROOT_KEY_SIZE, 'sharedSecret');
        self::decodeKey($remoteRatchetPublicKey, self::X25519_KEY_SIZE, 'remoteRatchetPublicKey');

        $localRatchetKeyPair = self::generateKeyPair();
        $rootStep = self::deriveRootStep(
            $sharedSecret,
            self::calculateAgreement($localRatchetKeyPair['privateKey'], $remoteRatchetPublicKey)
        );

        return [
            'rootKey' => base64_encode($rootStep['rootKey']),
            'localRatchetKeyPair' => $localRatchetKeyPair,
            'remoteRatchetPublicKey' => $remoteRatchetPublicKey,
            'sendingChainKey' => base64_encode($rootStep['chainKey']),
            'receivingChainKey' => null,
            'sendingMessageNumber' => 0,
            'receivingMessageNumber' => 0,
            'previousSendingChainLength' => 0,
            'skippedMessageKeys' => [],
            'updatedAt' => self::now(),
        ];
    }

    /**
     * @param array{publicKey:string,privateKey:string} $localRatchetKeyPair
     * @return array{
     *   rootKey:string,
     *   localRatchetKeyPair:array{publicKey:string,privateKey:string},
     *   remoteRatchetPublicKey:null,
     *   sendingChainKey:null,
     *   receivingChainKey:null,
     *   sendingMessageNumber:int,
     *   receivingMessageNumber:int,
     *   previousSendingChainLength:int,
     *   skippedMessageKeys:array<string,string>,
     *   updatedAt:string
     * }
     */
    public static function createResponderState(string $sharedSecret, array $localRatchetKeyPair): array
    {
        self::requireCrypto();
        self::requireBytes($sharedSecret, self::ROOT_KEY_SIZE, 'sharedSecret');
        self::validateKeyPair($localRatchetKeyPair);

        return [
            'rootKey' => base64_encode($sharedSecret),
            'localRatchetKeyPair' => $localRatchetKeyPair,
            'remoteRatchetPublicKey' => null,
            'sendingChainKey' => null,
            'receivingChainKey' => null,
            'sendingMessageNumber' => 0,
            'receivingMessageNumber' => 0,
            'previousSendingChainLength' => 0,
            'skippedMessageKeys' => [],
            'updatedAt' => self::now(),
        ];
    }

    /**
     * @param array<string,mixed> $state
     * @return array{state:array<string,mixed>,message:array{header:array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int},cipherText:string}}
     */
    public static function encrypt(array $state, string $plaintext, string $associatedData = ''): array
    {
        self::requireCrypto();
        self::validateState($state);
        if (!isset($state['sendingChainKey']) || !is_string($state['sendingChainKey']) || trim($state['sendingChainKey']) === '') {
            throw new RuntimeException('The Double Ratchet sending chain is not initialized.');
        }

        $chainStep = self::deriveChainStep(self::decodeKey($state['sendingChainKey'], self::CHAIN_KEY_SIZE, 'sendingChainKey'));
        $header = [
            'ratchetPublicKey' => $state['localRatchetKeyPair']['publicKey'],
            'previousSendingChainLength' => (int)$state['previousSendingChainLength'],
            'messageNumber' => (int)$state['sendingMessageNumber'],
        ];

        $cipherText = self::encryptWithMessageKey($chainStep['messageKey'], $header, $plaintext, $associatedData);

        $nextState = $state;
        $nextState['sendingChainKey'] = base64_encode($chainStep['chainKey']);
        $nextState['sendingMessageNumber'] = (int)$state['sendingMessageNumber'] + 1;
        $nextState['updatedAt'] = self::now();

        return [
            'state' => $nextState,
            'message' => [
                'header' => $header,
                'cipherText' => base64_encode($cipherText),
            ],
        ];
    }

    /**
     * @param array<string,mixed> $state
     * @param array{header:array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int},cipherText:string} $message
     * @return array{state:array<string,mixed>,plaintext:string}
     */
    public static function decrypt(array $state, array $message, string $associatedData = '', int $maxSkip = self::DEFAULT_MAX_SKIP): array
    {
        self::requireCrypto();
        self::validateState($state);
        self::validateMessage($message);
        if ($maxSkip < 0) {
            throw new InvalidArgumentException('The Double Ratchet max-skip value cannot be negative.');
        }

        $working = self::cloneState($state);
        $skipped = $working['skippedMessageKeys'];
        $skippedMessageKey = '';
        if (self::tryUseSkippedMessageKey($message['header'], $skipped, $skippedMessageKey)) {
            $plainText = self::decryptWithMessageKey($skippedMessageKey, $message, $associatedData);
            $working['skippedMessageKeys'] = $skipped;
            $working['updatedAt'] = self::now();
            return ['state' => $working, 'plaintext' => $plainText];
        }

        if (($working['remoteRatchetPublicKey'] ?? null) !== $message['header']['ratchetPublicKey']) {
            $working = self::skipMessageKeys($working, (int)$message['header']['previousSendingChainLength'], $skipped, $maxSkip);
            $working = self::ratchetStep($working, $message['header']['ratchetPublicKey']);
        }

        $working = self::skipMessageKeys($working, (int)$message['header']['messageNumber'], $skipped, $maxSkip);
        if (!isset($working['receivingChainKey']) || !is_string($working['receivingChainKey']) || trim($working['receivingChainKey']) === '') {
            throw new RuntimeException('The Double Ratchet receiving chain is not initialized.');
        }

        $chainStep = self::deriveChainStep(self::decodeKey($working['receivingChainKey'], self::CHAIN_KEY_SIZE, 'receivingChainKey'));
        $plainText = self::decryptWithMessageKey($chainStep['messageKey'], $message, $associatedData);

        $working['receivingChainKey'] = base64_encode($chainStep['chainKey']);
        $working['receivingMessageNumber'] = (int)$working['receivingMessageNumber'] + 1;
        $working['skippedMessageKeys'] = $skipped;
        $working['updatedAt'] = self::now();

        return ['state' => $working, 'plaintext' => $plainText];
    }

    /**
     * @param array<string,mixed> $state
     */
    public static function exportState(array $state): string
    {
        self::validateState($state);
        $json = json_encode($state, JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            throw new RuntimeException('Double Ratchet state could not be encoded.');
        }

        return $json;
    }

    /**
     * @return array<string,mixed>
     */
    public static function importState(string $state): array
    {
        if (trim($state) === '') {
            throw new InvalidArgumentException('The Double Ratchet state cannot be empty.');
        }

        $decoded = json_decode($state, true);
        if (!is_array($decoded)) {
            throw new RuntimeException('The Double Ratchet state could not be decoded.');
        }

        self::validateState($decoded);
        return self::cloneState($decoded);
    }

    /**
     * @param array{header:array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int},cipherText:string} $message
     * @return array{recipientDeviceId:int,cipherText:string,isPreKey:bool,recipientJid:?string}
     */
    public static function createKeyTransport(int $recipientDeviceId, array $message, bool $isPreKey = false, ?string $recipientJid = null): array
    {
        if ($recipientDeviceId < 0) {
            throw new InvalidArgumentException('OMEMO recipient device id cannot be negative.');
        }

        self::validateMessage($message);
        $envelope = [
            'version' => self::HEADER_VERSION,
            'ratchetPublicKey' => $message['header']['ratchetPublicKey'],
            'previousSendingChainLength' => (int)$message['header']['previousSendingChainLength'],
            'messageNumber' => (int)$message['header']['messageNumber'],
            'cipherText' => $message['cipherText'],
        ];
        $json = json_encode($envelope, JSON_UNESCAPED_SLASHES);
        if (!is_string($json)) {
            throw new RuntimeException('Double Ratchet key transport envelope could not be encoded.');
        }

        return [
            'recipientDeviceId' => $recipientDeviceId,
            'cipherText' => base64_encode($json),
            'isPreKey' => $isPreKey,
            'recipientJid' => $recipientJid,
        ];
    }

    /**
     * @param array<string,mixed> $keyTransport
     * @return array{header:array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int},cipherText:string}|null
     */
    public static function tryParseKeyTransport(array $keyTransport): ?array
    {
        try {
            if (!isset($keyTransport['cipherText']) || !is_string($keyTransport['cipherText'])) {
                return null;
            }

            $json = base64_decode($keyTransport['cipherText'], true);
            if ($json === false) {
                return null;
            }

            $envelope = json_decode($json, true);
            if (!is_array($envelope) || ($envelope['version'] ?? null) !== self::HEADER_VERSION) {
                return null;
            }

            $message = [
                'header' => [
                    'ratchetPublicKey' => (string)$envelope['ratchetPublicKey'],
                    'previousSendingChainLength' => (int)$envelope['previousSendingChainLength'],
                    'messageNumber' => (int)$envelope['messageNumber'],
                ],
                'cipherText' => (string)$envelope['cipherText'],
            ];
            self::validateMessage($message);
            return $message;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @param array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int} $header
     */
    public static function encodeHeader(array $header): string
    {
        self::validateHeader($header);
        $publicKey = self::decodeKey($header['ratchetPublicKey'], self::X25519_KEY_SIZE, 'ratchetPublicKey');

        return pack('Cn', self::HEADER_VERSION, strlen($publicKey))
            . $publicKey
            . pack('NN', (int)$header['previousSendingChainLength'], (int)$header['messageNumber']);
    }

    /**
     * @param array<string,mixed> $state
     * @param array<string,string> $skipped
     * @return array<string,mixed>
     */
    private static function skipMessageKeys(array $state, int $untilMessageNumber, array &$skipped, int $maxSkip): array
    {
        if ((int)$state['receivingMessageNumber'] + $maxSkip < $untilMessageNumber) {
            throw new RuntimeException('Too many skipped Double Ratchet message keys.');
        }

        if (!isset($state['receivingChainKey'], $state['remoteRatchetPublicKey'])
            || !is_string($state['receivingChainKey'])
            || !is_string($state['remoteRatchetPublicKey'])
            || trim($state['receivingChainKey']) === ''
            || trim($state['remoteRatchetPublicKey']) === '') {
            return $state;
        }

        $receivingChainKey = self::decodeKey($state['receivingChainKey'], self::CHAIN_KEY_SIZE, 'receivingChainKey');
        $receivingMessageNumber = (int)$state['receivingMessageNumber'];
        while ($receivingMessageNumber < $untilMessageNumber) {
            $chainStep = self::deriveChainStep($receivingChainKey);
            $skipped[self::skippedKey($state['remoteRatchetPublicKey'], $receivingMessageNumber)] = base64_encode($chainStep['messageKey']);
            $receivingChainKey = $chainStep['chainKey'];
            $receivingMessageNumber++;
        }

        $state['receivingChainKey'] = base64_encode($receivingChainKey);
        $state['receivingMessageNumber'] = $receivingMessageNumber;
        $state['skippedMessageKeys'] = $skipped;
        return $state;
    }

    /**
     * @param array<string,mixed> $state
     * @return array<string,mixed>
     */
    private static function ratchetStep(array $state, string $remoteRatchetPublicKey): array
    {
        $firstRootStep = self::deriveRootStep(
            self::decodeKey($state['rootKey'], self::ROOT_KEY_SIZE, 'rootKey'),
            self::calculateAgreement($state['localRatchetKeyPair']['privateKey'], $remoteRatchetPublicKey)
        );
        $localRatchetKeyPair = self::generateKeyPair();
        $secondRootStep = self::deriveRootStep(
            $firstRootStep['rootKey'],
            self::calculateAgreement($localRatchetKeyPair['privateKey'], $remoteRatchetPublicKey)
        );

        $state['rootKey'] = base64_encode($secondRootStep['rootKey']);
        $state['localRatchetKeyPair'] = $localRatchetKeyPair;
        $state['remoteRatchetPublicKey'] = $remoteRatchetPublicKey;
        $state['receivingChainKey'] = base64_encode($firstRootStep['chainKey']);
        $state['sendingChainKey'] = base64_encode($secondRootStep['chainKey']);
        $state['previousSendingChainLength'] = (int)$state['sendingMessageNumber'];
        $state['sendingMessageNumber'] = 0;
        $state['receivingMessageNumber'] = 0;
        $state['updatedAt'] = self::now();
        return $state;
    }

    /**
     * @param array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int} $header
     * @param array<string,string> $skipped
     */
    private static function tryUseSkippedMessageKey(array $header, array &$skipped, string &$messageKey): bool
    {
        $key = self::skippedKey($header['ratchetPublicKey'], (int)$header['messageNumber']);
        if (!isset($skipped[$key])) {
            $messageKey = '';
            return false;
        }

        $messageKey = self::decodeKey($skipped[$key], self::MESSAGE_KEY_SIZE, 'skipped message key');
        unset($skipped[$key]);
        return true;
    }

    /**
     * @param array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int} $header
     */
    private static function encryptWithMessageKey(string $messageKey, array $header, string $plaintext, string $associatedData): string
    {
        $material = self::deriveMessageMaterial($messageKey);
        $aad = self::createAssociatedData($header, $associatedData);
        $tag = '';
        $cipherText = openssl_encrypt($plaintext, 'aes-256-gcm', $material['key'], OPENSSL_RAW_DATA, $material['nonce'], $tag, $aad, self::TAG_SIZE);
        if (!is_string($cipherText) || strlen($tag) !== self::TAG_SIZE) {
            throw new RuntimeException('Double Ratchet AES-GCM encryption failed.');
        }

        return $cipherText . $tag;
    }

    /**
     * @param array{header:array{ratchetPublicKey:string,previousSendingChainLength:int,messageNumber:int},cipherText:string} $message
     */
    private static function decryptWithMessageKey(string $messageKey, array $message, string $associatedData): string
    {
        $payload = base64_decode($message['cipherText'], true);
        if ($payload === false || strlen($payload) < self::TAG_SIZE) {
            throw new InvalidArgumentException('The Double Ratchet ciphertext is shorter than the authentication tag.');
        }

        $material = self::deriveMessageMaterial($messageKey);
        $cipherText = substr($payload, 0, -self::TAG_SIZE);
        $tag = substr($payload, -self::TAG_SIZE);
        $aad = self::createAssociatedData($message['header'], $associatedData);
        $plainText = openssl_decrypt($cipherText, 'aes-256-gcm', $material['key'], OPENSSL_RAW_DATA, $material['nonce'], $tag, $aad);
        if (!is_string($plainText)) {
            throw new RuntimeException('Double Ratchet AES-GCM authentication failed.');
        }

        return $plainText;
    }

    /**
     * @return array{rootKey:string,chainKey:string}
     */
    private static function deriveRootStep(string $rootKey, string $dhOutput): array
    {
        $material = self::hkdf($dhOutput, $rootKey, self::ROOT_INFO, self::ROOT_KEY_SIZE + self::CHAIN_KEY_SIZE);

        return [
            'rootKey' => substr($material, 0, self::ROOT_KEY_SIZE),
            'chainKey' => substr($material, self::ROOT_KEY_SIZE),
        ];
    }

    /**
     * @return array{chainKey:string,messageKey:string}
     */
    private static function deriveChainStep(string $chainKey): array
    {
        return [
            'chainKey' => hash_hmac('sha256', "\x02", $chainKey, true),
            'messageKey' => hash_hmac('sha256', "\x01", $chainKey, true),
        ];
    }

    /**
     * @return array{key:string,nonce:string}
     */
    private static function deriveMessageMaterial(string $messageKey): array
    {
        $material = self::hkdf($messageKey, str_repeat("\x00", self::MESSAGE_KEY_SIZE), self::MESSAGE_INFO, self::MESSAGE_KEY_SIZE + self::NONCE_SIZE);

        return [
            'key' => substr($material, 0, self::MESSAGE_KEY_SIZE),
            'nonce' => substr($material, self::MESSAGE_KEY_SIZE, self::NONCE_SIZE),
        ];
    }

    private static function hkdf(string $inputKeyMaterial, string $salt, string $info, int $outputLength): string
    {
        $pseudoRandomKey = hash_hmac('sha256', $inputKeyMaterial, $salt, true);
        $output = '';
        $previous = '';
        $counter = 1;
        while (strlen($output) < $outputLength) {
            $previous = hash_hmac('sha256', $previous . $info . chr($counter), $pseudoRandomKey, true);
            $output .= $previous;
            $counter++;
        }

        return substr($output, 0, $outputLength);
    }

    private static function calculateAgreement(string $privateKey, string $publicKey): string
    {
        $agreement = sodium_crypto_scalarmult(
            self::decodeKey($privateKey, self::X25519_KEY_SIZE, 'privateKey'),
            self::decodeKey($publicKey, self::X25519_KEY_SIZE, 'publicKey')
        );
        self::requireBytes($agreement, self::X25519_KEY_SIZE, 'X25519 agreement');

        return $agreement;
    }

    private static function decodeKey(string $value, int $size, string $name): string
    {
        if (trim($value) === '') {
            throw new InvalidArgumentException("{$name} is required.");
        }

        $decoded = base64_decode($value, true);
        if ($decoded === false) {
            throw new InvalidArgumentException("{$name} is not valid base64.");
        }

        self::requireBytes($decoded, $size, $name);
        return $decoded;
    }

    /**
     * @param array<string,mixed> $state
     */
    private static function validateState(array $state): void
    {
        foreach (['rootKey', 'localRatchetKeyPair', 'sendingMessageNumber', 'receivingMessageNumber', 'previousSendingChainLength', 'skippedMessageKeys'] as $required) {
            if (!array_key_exists($required, $state)) {
                throw new InvalidArgumentException("Double Ratchet state field {$required} is required.");
            }
        }

        self::decodeKey((string)$state['rootKey'], self::ROOT_KEY_SIZE, 'rootKey');
        self::validateKeyPair($state['localRatchetKeyPair']);
        if (isset($state['remoteRatchetPublicKey']) && is_string($state['remoteRatchetPublicKey']) && trim($state['remoteRatchetPublicKey']) !== '') {
            self::decodeKey($state['remoteRatchetPublicKey'], self::X25519_KEY_SIZE, 'remoteRatchetPublicKey');
        }

        if (isset($state['sendingChainKey']) && is_string($state['sendingChainKey']) && trim($state['sendingChainKey']) !== '') {
            self::decodeKey($state['sendingChainKey'], self::CHAIN_KEY_SIZE, 'sendingChainKey');
        }

        if (isset($state['receivingChainKey']) && is_string($state['receivingChainKey']) && trim($state['receivingChainKey']) !== '') {
            self::decodeKey($state['receivingChainKey'], self::CHAIN_KEY_SIZE, 'receivingChainKey');
        }

        if (!is_array($state['skippedMessageKeys'])) {
            throw new InvalidArgumentException('Double Ratchet skippedMessageKeys must be an array.');
        }
    }

    /**
     * @param mixed $keyPair
     */
    private static function validateKeyPair(mixed $keyPair): void
    {
        if (!is_array($keyPair) || !isset($keyPair['publicKey'], $keyPair['privateKey'])) {
            throw new InvalidArgumentException('Double Ratchet key pair requires publicKey and privateKey.');
        }

        self::decodeKey((string)$keyPair['publicKey'], self::X25519_KEY_SIZE, 'publicKey');
        self::decodeKey((string)$keyPair['privateKey'], self::X25519_KEY_SIZE, 'privateKey');
    }

    /**
     * @param array<string,mixed> $message
     */
    private static function validateMessage(array $message): void
    {
        if (!isset($message['header']) || !is_array($message['header']) || !isset($message['cipherText']) || !is_string($message['cipherText'])) {
            throw new InvalidArgumentException('Double Ratchet message requires header and cipherText.');
        }

        self::validateHeader($message['header']);
        $payload = base64_decode($message['cipherText'], true);
        if ($payload === false || strlen($payload) < self::TAG_SIZE) {
            throw new InvalidArgumentException('Double Ratchet cipherText is not valid authenticated payload.');
        }
    }

    /**
     * @param array<string,mixed> $header
     */
    private static function validateHeader(array $header): void
    {
        foreach (['ratchetPublicKey', 'previousSendingChainLength', 'messageNumber'] as $required) {
            if (!array_key_exists($required, $header)) {
                throw new InvalidArgumentException("Double Ratchet header field {$required} is required.");
            }
        }

        self::decodeKey((string)$header['ratchetPublicKey'], self::X25519_KEY_SIZE, 'ratchetPublicKey');
        foreach (['previousSendingChainLength', 'messageNumber'] as $number) {
            if (!is_int($header[$number]) && !ctype_digit((string)$header[$number])) {
                throw new InvalidArgumentException("Double Ratchet header field {$number} must be an unsigned integer.");
            }
            if ((int)$header[$number] < 0) {
                throw new InvalidArgumentException("Double Ratchet header field {$number} cannot be negative.");
            }
        }
    }

    private static function requireBytes(string $bytes, int $expectedLength, string $name): void
    {
        if (strlen($bytes) !== $expectedLength) {
            throw new InvalidArgumentException("{$name} must be {$expectedLength} bytes.");
        }
    }

    private static function createAssociatedData(array $header, string $associatedData): string
    {
        return $associatedData . self::encodeHeader($header);
    }

    private static function skippedKey(string $ratchetPublicKey, int $messageNumber): string
    {
        return $ratchetPublicKey . '|' . $messageNumber;
    }

    /**
     * @param array<string,mixed> $state
     * @return array<string,mixed>
     */
    private static function cloneState(array $state): array
    {
        self::validateState($state);
        $state['skippedMessageKeys'] = array_map(static fn (mixed $value): string => (string)$value, $state['skippedMessageKeys']);
        return $state;
    }

    private static function now(): string
    {
        return gmdate('c');
    }

    private static function requireCrypto(): void
    {
        if (!self::isAvailable()) {
            throw new RuntimeException('PHP OMEMO Double Ratchet requires sodium and openssl AES-256-GCM.');
        }
    }
}
