<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppWebSocketFrame
{
    public const OPCODE_CONTINUATION = 0x0;
    public const OPCODE_TEXT = 0x1;
    public const OPCODE_BINARY = 0x2;
    public const OPCODE_CLOSE = 0x8;
    public const OPCODE_PING = 0x9;
    public const OPCODE_PONG = 0xA;

    public static function encodeText(string $payload, bool $masked = true): string
    {
        return self::encode(self::OPCODE_TEXT, $payload, $masked);
    }

    public static function encodeClose(bool $masked = true): string
    {
        return self::encode(self::OPCODE_CLOSE, '', $masked);
    }

    public static function encodePong(string $payload = '', bool $masked = true): string
    {
        return self::encode(self::OPCODE_PONG, $payload, $masked);
    }

    public static function encode(int $opcode, string $payload, bool $masked = true): string
    {
        $length = strlen($payload);
        $header = chr(0x80 | ($opcode & 0x0F));
        $maskBit = $masked ? 0x80 : 0;

        if ($length < 126) {
            $header .= chr($maskBit | $length);
        } elseif ($length <= 0xFFFF) {
            $header .= chr($maskBit | 126) . pack('n', $length);
        } else {
            $high = intdiv($length, 0x100000000);
            $low = $length % 0x100000000;
            $header .= chr($maskBit | 127) . pack('NN', $high, $low);
        }

        if (!$masked) {
            return $header . $payload;
        }

        $mask = random_bytes(4);
        return $header . $mask . self::applyMask($payload, $mask);
    }

    /**
     * @return array<int,array{fin:bool,opcode:int,payload:string,consumed:int}>
     */
    public static function decodeAvailable(string &$buffer): array
    {
        $frames = [];
        while (true) {
            $frame = self::tryDecodeOne($buffer);
            if ($frame === null) {
                break;
            }

            $frames[] = $frame;
            $buffer = substr($buffer, $frame['consumed']);
        }

        return $frames;
    }

    /**
     * @return array{fin:bool,opcode:int,payload:string,consumed:int}|null
     */
    private static function tryDecodeOne(string $buffer): ?array
    {
        $length = strlen($buffer);
        if ($length < 2) {
            return null;
        }

        $first = ord($buffer[0]);
        $second = ord($buffer[1]);
        $fin = ($first & 0x80) !== 0;
        $opcode = $first & 0x0F;
        $masked = ($second & 0x80) !== 0;
        $payloadLength = $second & 0x7F;
        $offset = 2;

        if ($payloadLength === 126) {
            if ($length < $offset + 2) {
                return null;
            }
            $payloadLength = unpack('n', substr($buffer, $offset, 2))[1];
            $offset += 2;
        } elseif ($payloadLength === 127) {
            if ($length < $offset + 8) {
                return null;
            }
            $parts = unpack('Nhigh/Nlow', substr($buffer, $offset, 8));
            $payloadLength = ((int)$parts['high'] * 0x100000000) + (int)$parts['low'];
            $offset += 8;
        }

        $mask = '';
        if ($masked) {
            if ($length < $offset + 4) {
                return null;
            }
            $mask = substr($buffer, $offset, 4);
            $offset += 4;
        }

        if ($length < $offset + $payloadLength) {
            return null;
        }

        $payload = substr($buffer, $offset, $payloadLength);
        if ($masked) {
            $payload = self::applyMask($payload, $mask);
        }

        return [
            'fin' => $fin,
            'opcode' => $opcode,
            'payload' => $payload,
            'consumed' => $offset + $payloadLength,
        ];
    }

    private static function applyMask(string $payload, string $mask): string
    {
        $result = '';
        $length = strlen($payload);
        for ($i = 0; $i < $length; $i++) {
            $result .= $payload[$i] ^ $mask[$i % 4];
        }

        return $result;
    }
}
