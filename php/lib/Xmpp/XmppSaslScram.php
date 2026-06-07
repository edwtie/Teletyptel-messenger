<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppSaslScram
{
    private string $clientNonce;
    private ?string $clientFirstBare = null;
    private ?string $serverFirstMessage = null;
    private ?string $serverSignature = null;

    public function __construct(
        public readonly string $mechanism,
        private readonly string $username,
        private readonly string $password,
        ?string $clientNonce = null
    ) {
        if (!in_array($mechanism, [XmppSasl::SCRAM_SHA_1, XmppSasl::SCRAM_SHA_256], true)) {
            throw new \InvalidArgumentException('Unsupported SCRAM mechanism.');
        }

        if (trim($username) === '') {
            throw new \InvalidArgumentException('SCRAM username is required.');
        }

        $this->clientNonce = $clientNonce ?: rtrim(base64_encode(random_bytes(18)), '=');
    }

    public function initialAuthElement(): string
    {
        return '<auth' . XmppXml::attributes([
            'xmlns' => XmppXml::SASL_NS,
            'mechanism' => $this->mechanism,
        ]) . '>' . XmppXml::escape(base64_encode($this->clientFirstMessage())) . '</auth>';
    }

    public function responseElementFromChallengeXml(string $challengeXml): string
    {
        return XmppSasl::response($this->clientFinalMessage($this->decodeSaslText($challengeXml)));
    }

    public function verifyServerFinalXml(string $serverFinalXml): bool
    {
        return $this->verifyServerFinal($this->decodeSaslText($serverFinalXml));
    }

    public function clientFirstMessage(): string
    {
        $this->clientFirstBare = 'n=' . self::escapeUsername($this->username) . ',r=' . $this->clientNonce;
        return 'n,,' . $this->clientFirstBare;
    }

    public function clientFinalMessage(string $serverFirstMessage): string
    {
        if ($this->clientFirstBare === null) {
            $this->clientFirstMessage();
        }

        $attributes = self::parseAttributes($serverFirstMessage);
        $nonce = self::required($attributes, 'r');
        if (!str_starts_with($nonce, $this->clientNonce)) {
            throw new \RuntimeException('SCRAM server nonce does not extend the client nonce.');
        }

        $salt = base64_decode(self::required($attributes, 's'), true);
        if ($salt === false) {
            throw new \RuntimeException('SCRAM salt is not valid base64.');
        }

        $iterations = (int)self::required($attributes, 'i');
        if ($iterations <= 0) {
            throw new \RuntimeException('SCRAM iteration count must be positive.');
        }

        $this->serverFirstMessage = $serverFirstMessage;
        $clientFinalWithoutProof = 'c=biws,r=' . $nonce;
        $authMessage = $this->clientFirstBare . ',' . $this->serverFirstMessage . ',' . $clientFinalWithoutProof;

        $saltedPassword = hash_pbkdf2($this->hashName(), $this->password, $salt, $iterations, $this->hashLength(), true);
        $clientKey = hash_hmac($this->hashName(), 'Client Key', $saltedPassword, true);
        $storedKey = hash($this->hashName(), $clientKey, true);
        $clientSignature = hash_hmac($this->hashName(), $authMessage, $storedKey, true);
        $clientProof = self::xorBytes($clientKey, $clientSignature);
        $serverKey = hash_hmac($this->hashName(), 'Server Key', $saltedPassword, true);
        $this->serverSignature = hash_hmac($this->hashName(), $authMessage, $serverKey, true);

        return $clientFinalWithoutProof . ',p=' . base64_encode($clientProof);
    }

    public function verifyServerFinal(string $serverFinalMessage): bool
    {
        if ($this->serverSignature === null) {
            throw new \RuntimeException('SCRAM server signature is not available before client-final is created.');
        }

        $attributes = self::parseAttributes($serverFinalMessage);
        $verifier = self::required($attributes, 'v');
        $decoded = base64_decode($verifier, true);
        return $decoded !== false && hash_equals($this->serverSignature, $decoded);
    }

    private function decodeSaslText(string $xml): string
    {
        $text = XmppSasl::text($xml);
        if ($text === '') {
            return '';
        }

        $decoded = base64_decode($text, true);
        if ($decoded === false) {
            throw new \RuntimeException('SASL SCRAM challenge is not valid base64.');
        }

        return $decoded;
    }

    private function hashName(): string
    {
        return $this->mechanism === XmppSasl::SCRAM_SHA_256 ? 'sha256' : 'sha1';
    }

    private function hashLength(): int
    {
        return $this->mechanism === XmppSasl::SCRAM_SHA_256 ? 32 : 20;
    }

    /**
     * @return array<string,string>
     */
    private static function parseAttributes(string $message): array
    {
        $result = [];
        foreach (explode(',', $message) as $part) {
            $index = strpos($part, '=');
            if ($index === false || $index <= 0) {
                throw new \RuntimeException('SCRAM attribute is malformed.');
            }
            $result[substr($part, 0, $index)] = substr($part, $index + 1);
        }

        return $result;
    }

    /**
     * @param array<string,string> $attributes
     */
    private static function required(array $attributes, string $name): string
    {
        if (!isset($attributes[$name]) || $attributes[$name] === '') {
            throw new \RuntimeException("SCRAM attribute '{$name}' is required.");
        }

        return $attributes[$name];
    }

    private static function escapeUsername(string $username): string
    {
        return str_replace(['=', ','], ['=3D', '=2C'], $username);
    }

    private static function xorBytes(string $left, string $right): string
    {
        if (strlen($left) !== strlen($right)) {
            throw new \RuntimeException('SCRAM buffers must have equal length.');
        }

        $result = '';
        $length = strlen($left);
        for ($i = 0; $i < $length; $i++) {
            $result .= $left[$i] ^ $right[$i];
        }

        return $result;
    }
}
