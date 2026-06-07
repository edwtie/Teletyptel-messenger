<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppMessageStyling
{
    public static function unstyledElement(): string
    {
        return '<unstyled xmlns="' . XmppXml::STYLING_NS . '"/>';
    }

    public static function isStylingDisabled(string $messageXml): bool
    {
        $document = XmppXml::document($messageXml);
        $xpath = XmppXml::xpath($document);
        return $xpath->query('/c:message/styling:unstyled')->length > 0;
    }

    /**
     * @return list<array{kind:string,text:string}>
     */
    public static function parseLine(string $text): array
    {
        $spans = [];
        $position = 0;
        $length = strlen($text);
        while ($position < $length) {
            $marker = $text[$position];
            if (!self::isMarker($marker) || !self::isValidOpening($text, $position) || !self::findClosing($text, $position, $marker, $closing)) {
                $next = self::findNextCandidate($text, $position + 1);
                $spans[] = ['kind' => 'plain', 'text' => substr($text, $position, $next - $position)];
                $position = $next;
                continue;
            }

            $spans[] = ['kind' => self::kindFor($marker), 'text' => substr($text, $position + 1, $closing - $position - 1)];
            $position = $closing + 1;
        }

        return self::mergePlain($spans);
    }

    private static function isMarker(string $value): bool
    {
        return in_array($value, ['*', '_', '~', '`'], true);
    }

    private static function kindFor(string $marker): string
    {
        return match ($marker) {
            '*' => 'strong',
            '_' => 'emphasis',
            '~' => 'strikethrough',
            '`' => 'preformatted',
            default => 'plain',
        };
    }

    private static function isValidOpening(string $text, int $position): bool
    {
        if ($position + 1 >= strlen($text) || ctype_space($text[$position + 1])) {
            return false;
        }

        return $position === 0 || ctype_space($text[$position - 1]) || self::isMarker($text[$position - 1]);
    }

    private static function findClosing(string $text, int $opening, string $marker, ?int &$closing): bool
    {
        $closing = null;
        for ($index = $opening + 1; $index < strlen($text); $index++) {
            if ($text[$index] === "\r" || $text[$index] === "\n") {
                return false;
            }
            if ($text[$index] === $marker && $index > $opening + 1 && !ctype_space($text[$index - 1])) {
                $closing = $index;
                return true;
            }
        }

        return false;
    }

    private static function findNextCandidate(string $text, int $start): int
    {
        for ($index = $start; $index < strlen($text); $index++) {
            if (self::isMarker($text[$index])) {
                return $index;
            }
        }

        return strlen($text);
    }

    /**
     * @param list<array{kind:string,text:string}> $spans
     * @return list<array{kind:string,text:string}>
     */
    private static function mergePlain(array $spans): array
    {
        $merged = [];
        foreach ($spans as $span) {
            $last = count($merged) - 1;
            if ($span['kind'] === 'plain' && $last >= 0 && $merged[$last]['kind'] === 'plain') {
                $merged[$last]['text'] .= $span['text'];
                continue;
            }
            $merged[] = $span;
        }

        return $merged;
    }
}
