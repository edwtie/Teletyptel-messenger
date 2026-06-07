<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppStreamBuffer
{
    private string $buffer = '';
    private bool $streamOpened = false;

    public function append(string $text): void
    {
        $this->buffer .= $text;
    }

    public function reset(): void
    {
        $this->buffer = '';
        $this->streamOpened = false;
    }

    /**
     * @return array<int,array{type:string,xml:string}>
     */
    public function readAvailable(): array
    {
        $nodes = [];
        while (true) {
            $this->trimPreamble();
            if ($this->buffer === '') {
                break;
            }

            if (!$this->streamOpened) {
                if (!str_starts_with($this->buffer, '<stream:stream')) {
                    throw new \RuntimeException('Expected opening XMPP stream.');
                }

                $end = $this->findTagEnd(0);
                if ($end < 0) {
                    break;
                }

                $xml = substr($this->buffer, 0, $end + 1);
                $this->buffer = substr($this->buffer, $end + 1);
                $this->streamOpened = true;
                $nodes[] = ['type' => 'open', 'xml' => $xml];
                continue;
            }

            if (str_starts_with($this->buffer, '</stream:stream>')) {
                $this->buffer = substr($this->buffer, strlen('</stream:stream>'));
                $this->streamOpened = false;
                $nodes[] = ['type' => 'close', 'xml' => '</stream:stream>'];
                continue;
            }

            $xml = $this->tryReadElement();
            if ($xml === null) {
                break;
            }

            $nodes[] = ['type' => 'element', 'xml' => $xml];
        }

        return $nodes;
    }

    private function tryReadElement(): ?string
    {
        if ($this->buffer === '' || $this->buffer[0] !== '<') {
            throw new \RuntimeException('Expected XML element.');
        }

        $depth = 0;
        $index = 0;
        $length = strlen($this->buffer);
        while ($index < $length) {
            if ($this->buffer[$index] !== '<') {
                $index++;
                continue;
            }

            foreach ([['<!--', '-->'], ['<![CDATA[', ']]>'], ['<?', '?>']] as [$start, $endToken]) {
                if (str_starts_with(substr($this->buffer, $index), $start)) {
                    $end = strpos($this->buffer, $endToken, $index + strlen($start));
                    if ($end === false) {
                        return null;
                    }
                    $index = $end + strlen($endToken);
                    continue 2;
                }
            }

            $tagEnd = $this->findTagEnd($index);
            if ($tagEnd < 0) {
                return null;
            }

            $closing = $index + 1 < $length && $this->buffer[$index + 1] === '/';
            $selfClosing = !$closing && $this->isSelfClosingTag($index, $tagEnd);
            if ($closing) {
                $depth--;
                if ($depth === 0) {
                    return $this->consume($tagEnd + 1);
                }
            } elseif ($selfClosing) {
                if ($depth === 0) {
                    return $this->consume($tagEnd + 1);
                }
            } else {
                $depth++;
            }

            $index = $tagEnd + 1;
        }

        return null;
    }

    private function consume(int $length): string
    {
        $xml = substr($this->buffer, 0, $length);
        $this->buffer = substr($this->buffer, $length);
        return $xml;
    }

    private function findTagEnd(int $start): int
    {
        $quote = null;
        $length = strlen($this->buffer);
        for ($i = $start; $i < $length; $i++) {
            $ch = $this->buffer[$i];
            if ($quote !== null) {
                if ($ch === $quote) {
                    $quote = null;
                }
                continue;
            }

            if ($ch === '"' || $ch === "'") {
                $quote = $ch;
                continue;
            }

            if ($ch === '>') {
                return $i;
            }
        }

        return -1;
    }

    private function isSelfClosingTag(int $start, int $end): bool
    {
        for ($i = $end - 1; $i > $start; $i--) {
            if (ctype_space($this->buffer[$i])) {
                continue;
            }
            return $this->buffer[$i] === '/';
        }

        return false;
    }

    private function trimPreamble(): void
    {
        while (true) {
            $this->buffer = ltrim($this->buffer);
            if (!str_starts_with($this->buffer, '<?')) {
                return;
            }

            $end = strpos($this->buffer, '?>');
            if ($end === false) {
                return;
            }
            $this->buffer = substr($this->buffer, $end + 2);
        }
    }
}
