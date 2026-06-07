<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppWebSocketTransport
{
    /** @var resource|null */
    private $stream = null;
    private string $buffer = '';

    public function __construct(private readonly string $url, private readonly int $timeoutSeconds = 15)
    {
    }

    public function connect(): void
    {
        $parts = parse_url($this->url);
        if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
            throw new \InvalidArgumentException('Invalid WebSocket URL.');
        }

        $scheme = strtolower((string)$parts['scheme']);
        if (!in_array($scheme, ['ws', 'wss'], true)) {
            throw new \InvalidArgumentException('WebSocket URL must use ws:// or wss://.');
        }

        $host = (string)$parts['host'];
        $port = (int)($parts['port'] ?? ($scheme === 'wss' ? 443 : 80));
        $path = (string)($parts['path'] ?? '/');
        if (isset($parts['query'])) {
            $path .= '?' . $parts['query'];
        }

        $transport = $scheme === 'wss' ? 'tls' : 'tcp';
        $context = stream_context_create([
            'ssl' => [
                'peer_name' => $host,
                'verify_peer' => true,
                'verify_peer_name' => true,
                'SNI_enabled' => true,
                'crypto_method' => STREAM_CRYPTO_METHOD_TLS_CLIENT,
            ],
        ]);

        $errno = 0;
        $errstr = '';
        $this->stream = @stream_socket_client(
            "{$transport}://{$host}:{$port}",
            $errno,
            $errstr,
            $this->timeoutSeconds,
            STREAM_CLIENT_CONNECT,
            $context
        );

        if (!is_resource($this->stream)) {
            throw new \RuntimeException("Could not connect to {$this->url}: {$errstr} ({$errno})");
        }

        stream_set_timeout($this->stream, $this->timeoutSeconds);
        $key = base64_encode(random_bytes(16));
        $headers = [
            "GET {$path} HTTP/1.1",
            "Host: {$host}:{$port}",
            'Upgrade: websocket',
            'Connection: Upgrade',
            'Sec-WebSocket-Key: ' . $key,
            'Sec-WebSocket-Version: 13',
            'Sec-WebSocket-Protocol: xmpp',
            "\r\n",
        ];
        $this->writeRaw(implode("\r\n", $headers));

        $response = $this->readHttpHeader();
        if (!preg_match('/^HTTP\/1\.[01] 101 /m', $response)) {
            throw new \RuntimeException('WebSocket upgrade failed: ' . strtok($response, "\r\n"));
        }

        if (!preg_match('/Sec-WebSocket-Accept:\s*(.+)\r?$/im', $response, $match)) {
            throw new \RuntimeException('WebSocket upgrade response misses Sec-WebSocket-Accept.');
        }

        $expected = base64_encode(sha1($key . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', true));
        if (!hash_equals($expected, trim($match[1]))) {
            throw new \RuntimeException('WebSocket accept key is invalid.');
        }

        if (preg_match('/Sec-WebSocket-Protocol:\s*(.+)\r?$/im', $response, $match)
            && trim(strtolower($match[1])) !== 'xmpp') {
            throw new \RuntimeException('WebSocket server did not accept the xmpp subprotocol.');
        }
    }

    public function sendXml(string $xml): void
    {
        $this->writeRaw(XmppWebSocketFrame::encodeText($xml, masked: true));
    }

    public function readXml(): string
    {
        while (true) {
            foreach (XmppWebSocketFrame::decodeAvailable($this->buffer) as $frame) {
                if ($frame['opcode'] === XmppWebSocketFrame::OPCODE_TEXT) {
                    return $frame['payload'];
                }

                if ($frame['opcode'] === XmppWebSocketFrame::OPCODE_PING) {
                    $this->writeRaw(XmppWebSocketFrame::encodePong($frame['payload'], masked: true));
                    continue;
                }

                if ($frame['opcode'] === XmppWebSocketFrame::OPCODE_CLOSE) {
                    throw new \RuntimeException('WebSocket closed by peer.');
                }
            }

            $chunk = $this->readRaw();
            $this->buffer .= $chunk;
        }
    }

    public function close(): void
    {
        if (is_resource($this->stream)) {
            $this->writeRaw(XmppWebSocketFrame::encodeClose(masked: true));
            fclose($this->stream);
        }
        $this->stream = null;
    }

    private function writeRaw(string $data): void
    {
        if (!is_resource($this->stream)) {
            throw new \RuntimeException('WebSocket is not connected.');
        }

        fwrite($this->stream, $data);
        fflush($this->stream);
    }

    private function readRaw(): string
    {
        if (!is_resource($this->stream)) {
            throw new \RuntimeException('WebSocket is not connected.');
        }

        $chunk = fread($this->stream, 8192);
        if ($chunk === false || $chunk === '') {
            $meta = stream_get_meta_data($this->stream);
            if (($meta['timed_out'] ?? false) === true) {
                throw new \RuntimeException('Timed out while reading WebSocket.');
            }
            if (($meta['eof'] ?? false) === true) {
                throw new \RuntimeException('WebSocket closed by peer.');
            }
            return '';
        }

        return $chunk;
    }

    private function readHttpHeader(): string
    {
        $header = '';
        while (!str_contains($header, "\r\n\r\n")) {
            $header .= $this->readRaw();
        }

        $headerEnd = strpos($header, "\r\n\r\n") + 4;
        $this->buffer .= substr($header, $headerEnd);

        return substr($header, 0, $headerEnd);
    }
}
