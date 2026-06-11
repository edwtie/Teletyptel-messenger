<?php
declare(strict_types=1);

const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_PORT = 8787;
const MAX_PAYLOAD_BYTES = 1048576;

$host = relayHost();
$port = relayPort();

$server = stream_socket_server(
    'tcp://' . $host . ':' . $port,
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
$clientPeers = [];

echo "Tiedragon RTT/RFC7395 WebSocket relay listening on ws://" . $host . ':' . $port . "\n";
if ($host === '0.0.0.0') {
    echo "LAN clients can connect with ws://<this-computer-ip>:" . $port . "\n";
}
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
                $clientPeers[$id] = [];
                echo "Client $id connected\n";
            }

            continue;
        }

        $id = (int)$socket;
        $data = @fread($socket, 8192);
        if ($data === false) {
            closeClient($id, $clients, $handshakes, $buffers, $clientProtocols, $clientPeers);
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
                closeClient($id, $clients, $handshakes, $buffers, $clientProtocols, $clientPeers);
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
                closeClient($id, $clients, $handshakes, $buffers, $clientProtocols, $clientPeers);
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

            $message = prepareRttMessage($message, $id, $clientPeers);
            if ($message === null) {
                @fwrite($socket, encodeWebSocketFrame(json_encode([
                    'type' => 'error',
                    'message' => 'Only JSON RTT, message, delete, presence, client state, location or Jingle call snapshots are accepted.'
                ], JSON_UNESCAPED_SLASHES)));
                continue;
            }

            echo "RTT from $id: $message\n";
            broadcastJson($clients, $clientProtocols, $clientPeers, $id, $message);
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

function relayHost(): string
{
    $configured = getenv('RTT_RELAY_HOST');
    if ($configured === false || trim($configured) === '') {
        return DEFAULT_HOST;
    }

    return trim($configured);
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

    return isAllowedRttEnvelope($json);
}

function prepareRttMessage(string $message, int $senderId, array &$clientPeers): ?string
{
    $json = json_decode($message, true);
    if (!is_array($json) || !isAllowedRttEnvelope($json)) {
        return null;
    }

    rememberClientPeer($clientPeers, $senderId, $json);
    $json['serverReceivedAt'] = gmdate('c');
    $json['serverSenderId'] = $senderId;

    if (($json['type'] ?? null) === 'message-delete') {
        $json['serverAction'] = 'delete';
    }

    if (($json['type'] ?? null) === 'message' && ($json['forwarded'] ?? false) === true) {
        $json['serverAction'] = 'forward';
        $json['originalFrom'] = normalizeRelayAddress($json['originalFrom'] ?? $json['from'] ?? '');
    }

    return json_encode($json, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function isAllowedRttEnvelope(array $json): bool
{
    $type = $json['type'] ?? null;
    if (!isAllowedConversationKind($json)) {
        return false;
    }

    if ($type === 'message') {
        $text = $json['text'] ?? null;
        if (!is_string($text) || strlen($text) > MAX_PAYLOAD_BYTES) {
            return false;
        }

        foreach (['from', 'to', 'displayName', 'messageId', 'replaceId', 'originalFrom', 'conversationKind'] as $field) {
            if (isset($json[$field]) && (!is_string($json[$field]) || strlen($json[$field]) > 512)) {
                return false;
            }
        }

        foreach (['clientId', 'avatarColor'] as $field) {
            if (isset($json[$field]) && (!is_string($json[$field]) || strlen($json[$field]) > 255)) {
                return false;
            }
        }

        if (isset($json['forwarded']) && !is_bool($json['forwarded'])) {
            return false;
        }

        if (isset($json['attachment']) && !isAllowedAttachment($json['attachment'])) {
            return false;
        }

        if (isset($json['location']) && !isAllowedLocationPayload($json['location'])) {
            return false;
        }

        return true;
    }

    if ($type === 'message-delete') {
        foreach (['from', 'to', 'targetMessageId', 'messageId', 'reason', 'clientId', 'conversationKind'] as $field) {
            if (!isset($json[$field])) {
                continue;
            }

            if (!is_string($json[$field]) || strlen($json[$field]) > 512) {
                return false;
            }
        }

        return isset($json['targetMessageId'])
            && is_string($json['targetMessageId'])
            && $json['targetMessageId'] !== '';
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
        foreach (['from', 'to', 'displayName', 'clientId', 'conversationKind'] as $field) {
            if (isset($json[$field]) && (!is_string($json[$field]) || strlen($json[$field]) > 512)) {
                return false;
            }
        }

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

        foreach (['from', 'to', 'displayName', 'reason', 'sentAt', 'conversationKind'] as $field) {
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

        foreach (['from', 'to', 'displayName', 'text', 'xml', 'conversationKind'] as $field) {
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

        foreach (['from', 'to', 'xml', 'sdp', 'reasonText', 'conversationKind'] as $field) {
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

function isAllowedConversationKind(array $json): bool
{
    if (!isset($json['conversationKind'])) {
        return true;
    }

    return is_string($json['conversationKind'])
        && in_array($json['conversationKind'], ['contact', 'group'], true);
}

function isAllowedAttachment(mixed $attachment): bool
{
    if (!is_array($attachment)) {
        return false;
    }

    foreach (['name', 'url', 'type', 'kind'] as $field) {
        if (isset($attachment[$field]) && (!is_string($attachment[$field]) || strlen($attachment[$field]) > 2048)) {
            return false;
        }
    }

    return isset($attachment['url'])
        && is_string($attachment['url'])
        && $attachment['url'] !== ''
        && (!isset($attachment['size']) || is_numeric($attachment['size']));
}

function isAllowedLocationPayload(mixed $location): bool
{
    if (!is_array($location)) {
        return false;
    }

    foreach (['lat', 'lon'] as $field) {
        if (!isset($location[$field]) || !is_numeric($location[$field])) {
            return false;
        }
    }

    foreach (['accuracy', 'alt', 'altaccuracy', 'bearing', 'speed'] as $field) {
        if (isset($location[$field]) && $location[$field] !== null && !is_numeric($location[$field])) {
            return false;
        }
    }

    foreach (['timestamp', 'text', 'source'] as $field) {
        if (isset($location[$field]) && $location[$field] !== null && (!is_string($location[$field]) || strlen($location[$field]) > 512)) {
            return false;
        }
    }

    return true;
}

function rememberClientPeer(array &$clientPeers, int $senderId, array $json): void
{
    $from = normalizeRelayAddress($json['from'] ?? '');
    if ($from === '') {
        return;
    }

    $bare = bareRelayAddress($from);
    $clientPeers[$senderId] = array_values(array_unique(array_filter([$from, $bare])));
}

function normalizeRelayAddress(mixed $value): string
{
    return is_string($value) ? trim($value) : '';
}

function bareRelayAddress(string $jid): string
{
    return strtolower(explode('/', trim($jid), 2)[0] ?? '');
}

function relayAddressMatches(string $left, string $right): bool
{
    $left = normalizeRelayAddress($left);
    $right = normalizeRelayAddress($right);
    if ($left === '' || $right === '') {
        return false;
    }

    return strtolower($left) === strtolower($right)
        || bareRelayAddress($left) === bareRelayAddress($right);
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

function broadcastJson(array $clients, array $clientProtocols, array $clientPeers, int $senderId, string $message): void
{
    $json = json_decode($message, true);
    if (!is_array($json)) {
        broadcast($clients, $clientProtocols, $senderId, $message, 'rtt-json');
        return;
    }

    $type = $json['type'] ?? '';
    $to = normalizeRelayAddress($json['to'] ?? '');
    $isGroupEnvelope = ($json['conversationKind'] ?? null) === 'group';
    $targeted = !$isGroupEnvelope && $to !== '' && !relayAddressMatches($to, 'relay@localhost') && $type !== 'presence';
    if (!$targeted) {
        broadcast($clients, $clientProtocols, $senderId, $message, 'rtt-json');
        return;
    }

    $frame = encodeWebSocketFrame($message);
    $sent = 0;
    foreach ($clients as $id => $client) {
        if ($id === $senderId) {
            continue;
        }

        if (($clientProtocols[$id] ?? null) !== 'rtt-json') {
            continue;
        }

        $knownPeers = $clientPeers[$id] ?? [];
        $matches = false;
        foreach ($knownPeers as $peer) {
            if (relayAddressMatches((string)$peer, $to)) {
                $matches = true;
                break;
            }
        }

        if (!$matches) {
            continue;
        }

        @fwrite($client, $frame);
        $sent++;
    }

    if ($sent === 0) {
        broadcast($clients, $clientProtocols, $senderId, $message, 'rtt-json');
    }
}

function closeClient(int $id, array &$clients, array &$handshakes, array &$buffers, array &$clientProtocols, ?array &$clientPeers = null): void
{
    if (isset($clients[$id])) {
        @fclose($clients[$id]);
        unset($clients[$id]);
    }

    unset($handshakes[$id], $buffers[$id], $clientProtocols[$id]);
    if ($clientPeers !== null) {
        unset($clientPeers[$id]);
    }
    echo "Client $id disconnected\n";
}
