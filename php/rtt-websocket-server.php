<?php
declare(strict_types=1);

const HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const MAX_PAYLOAD_BYTES = 1048576;

$port = relayPort();

$server = stream_socket_server(
    'tcp://' . HOST . ':' . $port,
    $errno,
    $errstr,
    STREAM_SERVER_BIND | STREAM_SERVER_LISTEN
);

if ($server === false) {
    fwrite(STDERR, "Cannot start WebSocket server: $errstr ($errno)\n");
    exit(1);
}

stream_set_blocking($server, false);

$clients = [];
$handshakes = [];
$buffers = [];
$clientProtocols = [];

echo "Tiedragon RTT/RFC7395 WebSocket relay listening on ws://" . HOST . ':' . $port . "\n";
echo "Open php/public/index.html in a browser and connect to this server.\n";

while (true) {
    $read = array_merge([$server], $clients);
    $write = null;
    $except = null;

    if (@stream_select($read, $write, $except, null) === false) {
        continue;
    }

    foreach ($read as $socket) {
        if ($socket === $server) {
            $client = @stream_socket_accept($server, 0);
            if ($client !== false) {
                stream_set_blocking($client, false);
                $id = (int)$client;
                $clients[$id] = $client;
                $handshakes[$id] = false;
                $buffers[$id] = '';
                $clientProtocols[$id] = 'rtt-json';
                echo "Client $id connected\n";
            }

            continue;
        }

        $id = (int)$socket;
        $data = @fread($socket, 8192);
        if ($data === false) {
            closeClient($id, $clients, $handshakes, $buffers, $clientProtocols);
            continue;
        }

        if ($data === '') {
            continue;
        }

        $buffers[$id] .= $data;

        if (($handshakes[$id] ?? false) === false) {
            if (!str_contains($buffers[$id], "\r\n\r\n")) {
                continue;
            }

            $protocol = 'rtt-json';
            if (!performHandshake($socket, $buffers[$id], $protocol)) {
                closeClient($id, $clients, $handshakes, $buffers, $clientProtocols);
                continue;
            }

            $handshakes[$id] = true;
            $clientProtocols[$id] = $protocol;
            $buffers[$id] = '';
            echo "Client $id handshake complete ($protocol)\n";
            continue;
        }

        while (true) {
            $frame = tryDecodeWebSocketFrame($buffers[$id]);
            if ($frame === null) {
                break;
            }

            $buffers[$id] = substr($buffers[$id], $frame['consumed']);

            if ($frame['type'] === 'close') {
                closeClient($id, $clients, $handshakes, $buffers, $clientProtocols);
                break;
            }

            if ($frame['type'] === 'ping') {
                @fwrite($socket, encodeWebSocketFrame($frame['payload'], 0xA));
                continue;
            }

            if ($frame['type'] !== 'text') {
                continue;
            }

            $message = $frame['payload'];
            $protocol = $clientProtocols[$id] ?? 'rtt-json';
            if ($protocol === 'xmpp') {
                handleXmppWebSocketMessage($socket, $id, $message, $clients, $handshakes, $buffers, $clientProtocols);
                continue;
            }

            if (!isAllowedRttMessage($message)) {
                @fwrite($socket, encodeWebSocketFrame(json_encode([
                    'type' => 'error',
                    'message' => 'Only JSON RTT, message, presence, client state, location or Jingle call snapshots are accepted.'
                ], JSON_UNESCAPED_SLASHES)));
                continue;
            }

            echo "RTT from $id: $message\n";
            broadcast($clients, $clientProtocols, $id, $message, 'rtt-json');
        }
    }
}

function relayPort(): int
{
    $configured = getenv('RTT_RELAY_PORT');
    if ($configured === false || $configured === '') {
        return DEFAULT_PORT;
    }

    $port = filter_var($configured, FILTER_VALIDATE_INT, [
        'options' => [
            'min_range' => 1,
            'max_range' => 65535,
        ],
    ]);

    return is_int($port) ? $port : DEFAULT_PORT;
}

function performHandshake($socket, string $request, string &$protocol): bool
{
    if (!preg_match('/Sec-WebSocket-Key:\s*(.+)\r\n/i', $request, $matches)) {
        return false;
    }

    $key = trim($matches[1]);
    $accept = base64_encode(sha1($key . '258EAFA5-E914-47DA-95CA-C5AB0DC85B11', true));
    $protocol = requestedXmppSubprotocol($request) ? 'xmpp' : 'rtt-json';

    $response = "HTTP/1.1 101 Switching Protocols\r\n"
        . "Upgrade: websocket\r\n"
        . "Connection: Upgrade\r\n"
        . "Sec-WebSocket-Accept: $accept\r\n";

    if ($protocol === 'xmpp') {
        $response .= "Sec-WebSocket-Protocol: xmpp\r\n";
    }

    $response .= "\r\n";

    return @fwrite($socket, $response) !== false;
}

function requestedXmppSubprotocol(string $request): bool
{
    if (!preg_match('/Sec-WebSocket-Protocol:\s*(.+)\r\n/i', $request, $matches)) {
        return false;
    }

    $protocols = array_map('trim', explode(',', strtolower($matches[1])));
    return in_array('xmpp', $protocols, true);
}

function tryDecodeWebSocketFrame(string $data): ?array
{
    $length = strlen($data);
    if ($length < 2) {
        return null;
    }

    $first = ord($data[0]);
    $second = ord($data[1]);
    $opcode = $first & 0x0f;
    $isMasked = ($second & 0x80) === 0x80;
    $payloadLength = $second & 0x7f;
    $offset = 2;

    if ($payloadLength === 126) {
        if ($length < 4) {
            return null;
        }

        $payloadLength = unpack('n', substr($data, 2, 2))[1];
        $offset = 4;
    } elseif ($payloadLength === 127) {
        if ($length < 10) {
            return null;
        }

        $parts = unpack('Nhigh/Nlow', substr($data, 2, 8));
        if ($parts['high'] !== 0) {
            return ['type' => 'close', 'payload' => '', 'consumed' => $length];
        }

        $payloadLength = $parts['low'];
        $offset = 10;
    }

    if ($payloadLength > MAX_PAYLOAD_BYTES) {
        return ['type' => 'close', 'payload' => '', 'consumed' => $length];
    }

    $maskLength = $isMasked ? 4 : 0;
    $frameLength = $offset + $maskLength + $payloadLength;
    if ($length < $frameLength) {
        return null;
    }

    $payload = substr($data, $offset + $maskLength, $payloadLength);
    if ($isMasked) {
        $mask = substr($data, $offset, 4);
        $decoded = '';
        for ($i = 0; $i < $payloadLength; $i++) {
            $decoded .= $payload[$i] ^ $mask[$i % 4];
        }

        $payload = $decoded;
    }

    return [
        'type' => match ($opcode) {
            0x1 => 'text',
            0x8 => 'close',
            0x9 => 'ping',
            0xA => 'pong',
            default => 'other',
        },
        'payload' => $payload,
        'consumed' => $frameLength,
    ];
}

function encodeWebSocketFrame(string $message, int $opcode = 0x1): string
{
    $length = strlen($message);
    $firstByte = chr(0x80 | ($opcode & 0x0f));
    if ($length <= 125) {
        return $firstByte . chr($length) . $message;
    }

    if ($length <= 65535) {
        return $firstByte . chr(126) . pack('n', $length) . $message;
    }

    if ($length <= MAX_PAYLOAD_BYTES) {
        return $firstByte . chr(127) . pack('N2', 0, $length) . $message;
    }

    throw new RuntimeException('Message is too large for this relay.');
}

function isAllowedRttMessage(string $message): bool
{
    $json = json_decode($message, true);
    if (!is_array($json)) {
        return false;
    }

    $type = $json['type'] ?? null;
    if ($type === 'message') {
        $text = $json['text'] ?? null;
        return is_string($text) && strlen($text) <= MAX_PAYLOAD_BYTES;
    }

    if ($type === 'presence') {
        $presence = $json['presence'] ?? null;
        if (!is_string($presence) || !in_array($presence, ['online', 'offline'], true)) {
            return false;
        }

        foreach (['from', 'to', 'displayName', 'responseTo'] as $field) {
            if (isset($json[$field]) && (!is_string($json[$field]) || strlen($json[$field]) > 255)) {
                return false;
            }
        }

        if (isset($json['probe']) && !is_bool($json['probe'])) {
            return false;
        }

        return true;
    }

    if ($type === 'rtt') {
        $xml = $json['xml'] ?? null;
        return is_string($xml)
            && strlen($xml) <= MAX_PAYLOAD_BYTES
            && str_contains($xml, '<rtt')
            && str_contains($xml, 'urn:xmpp:rtt:0');
    }

    if ($type === 'client-state') {
        $clientState = $json['clientState'] ?? null;
        $xml = $json['xml'] ?? null;
        if (!is_string($clientState) || !in_array($clientState, ['active', 'inactive'], true)) {
            return false;
        }

        if (!is_string($xml) || strlen($xml) > 512 || !str_contains($xml, 'urn:xmpp:csi:0')) {
            return false;
        }

        if ($clientState === 'active' && !str_contains($xml, '<active')) {
            return false;
        }

        if ($clientState === 'inactive' && !str_contains($xml, '<inactive')) {
            return false;
        }

        foreach (['from', 'to', 'displayName', 'reason', 'sentAt'] as $field) {
            if (isset($json[$field]) && (!is_string($json[$field]) || strlen($json[$field]) > 255)) {
                return false;
            }
        }

        return true;
    }

    if ($type === 'location') {
        $action = $json['locationAction'] ?? null;
        if (!is_string($action) || !in_array($action, ['share', 'live', 'stop'], true)) {
            return false;
        }

        foreach (['from', 'to', 'displayName', 'text', 'xml'] as $field) {
            if (isset($json[$field]) && (!is_string($json[$field]) || strlen($json[$field]) > MAX_PAYLOAD_BYTES)) {
                return false;
            }
        }

        if ($action === 'stop') {
            return !isset($json['location']) || $json['location'] === null;
        }

        if (!isset($json['location']) || !is_array($json['location'])) {
            return false;
        }

        foreach (['lat', 'lon'] as $field) {
            if (!isset($json['location'][$field]) || !is_numeric($json['location'][$field])) {
                return false;
            }
        }

        foreach (['accuracy', 'alt', 'altaccuracy', 'bearing', 'speed'] as $field) {
            if (isset($json['location'][$field]) && $json['location'][$field] !== null && !is_numeric($json['location'][$field])) {
                return false;
            }
        }

        foreach (['timestamp', 'text'] as $field) {
            if (isset($json['location'][$field]) && $json['location'][$field] !== null && (!is_string($json['location'][$field]) || strlen($json['location'][$field]) > 512)) {
                return false;
            }
        }

        return is_string($json['xml'] ?? null)
            && str_contains($json['xml'], '<geoloc')
            && str_contains($json['xml'], 'http://jabber.org/protocol/geoloc');
    }

    if ($type === 'jingle') {
        $action = $json['action'] ?? null;
        $sid = $json['sid'] ?? null;
        $allowedActions = [
            'session-initiate',
            'session-accept',
            'session-info',
            'transport-info',
            'session-terminate',
        ];

        if (!is_string($action) || !in_array($action, $allowedActions, true)) {
            return false;
        }

        if (!is_string($sid) || $sid === '' || strlen($sid) > 128) {
            return false;
        }

        foreach (['from', 'to', 'xml', 'sdp', 'reasonText'] as $field) {
            if (isset($json[$field]) && (!is_string($json[$field]) || strlen($json[$field]) > MAX_PAYLOAD_BYTES)) {
                return false;
            }
        }

        if (isset($json['candidate']) && !is_array($json['candidate'])) {
            return false;
        }

        return true;
    }

    return false;
}

function handleXmppWebSocketMessage(
    $socket,
    int $id,
    string $message,
    array &$clients,
    array &$handshakes,
    array &$buffers,
    array &$clientProtocols
): void {
    if (!isAllowedXmppWebSocketFrame($message)) {
        @fwrite($socket, encodeWebSocketFrame(createXmppCloseFrame()));
        closeClient($id, $clients, $handshakes, $buffers, $clientProtocols);
        return;
    }

    if (isXmppOpenFrame($message)) {
        @fwrite($socket, encodeWebSocketFrame(createXmppOpenFrame($id)));
        echo "RFC7395 open from $id\n";
        return;
    }

    if (isXmppCloseFrame($message)) {
        @fwrite($socket, encodeWebSocketFrame(createXmppCloseFrame()));
        closeClient($id, $clients, $handshakes, $buffers, $clientProtocols);
        return;
    }

    echo "RFC7395 XML from $id: $message\n";
    broadcast($clients, $clientProtocols, $id, $message, 'xmpp');
}

function isAllowedXmppWebSocketFrame(string $message): bool
{
    if (strlen($message) > MAX_PAYLOAD_BYTES) {
        return false;
    }

    $trimmed = trim($message);
    if ($trimmed === '' || str_starts_with($trimmed, '<?xml')) {
        return false;
    }

    return isXmppOpenFrame($trimmed)
        || isXmppCloseFrame($trimmed)
        || preg_match('/^<(message|presence|iq)\b/i', $trimmed) === 1
        || preg_match('/^<(active|inactive)\b/i', $trimmed) === 1
            && str_contains($trimmed, 'urn:xmpp:csi:0');
}

function isXmppOpenFrame(string $message): bool
{
    return str_contains($message, '<open')
        && str_contains($message, 'urn:ietf:params:xml:ns:xmpp-framing');
}

function isXmppCloseFrame(string $message): bool
{
    return str_contains($message, '<close')
        && str_contains($message, 'urn:ietf:params:xml:ns:xmpp-framing');
}

function createXmppOpenFrame(int $id): string
{
    return '<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" from="localhost" id="php-relay-' . $id . '" version="1.0"/>';
}

function createXmppCloseFrame(): string
{
    return '<close xmlns="urn:ietf:params:xml:ns:xmpp-framing"/>';
}

function broadcast(array $clients, array $clientProtocols, int $senderId, string $message, string $protocol): void
{
    $frame = encodeWebSocketFrame($message);
    foreach ($clients as $id => $client) {
        if ($id === $senderId) {
            continue;
        }

        if (($clientProtocols[$id] ?? null) !== $protocol) {
            continue;
        }

        @fwrite($client, $frame);
    }
}

function closeClient(int $id, array &$clients, array &$handshakes, array &$buffers, array &$clientProtocols): void
{
    if (isset($clients[$id])) {
        @fclose($clients[$id]);
        unset($clients[$id]);
    }

    unset($handshakes[$id], $buffers[$id], $clientProtocols[$id]);
    echo "Client $id disconnected\n";
}
