<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        readHistory();
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        writeHistory();
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()]);
}

function readHistory(): void
{
    $accountId = cleanHistoryText($_GET['accountId'] ?? '', 96);
    if (!isCurrentHistorySession($accountId)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $limit = max(1, min(500, (int)($_GET['limit'] ?? 200)));
    $pdo = Database::connect();
    ensureMessageHistorySchema($pdo);
    $statement = $pdo->prepare(
        'SELECT * FROM message_history
         WHERE account_id = :account_id
         ORDER BY message_timestamp DESC, id DESC
         LIMIT ' . $limit
    );
    $statement->execute(['account_id' => $accountId]);
    $rows = array_reverse($statement->fetchAll() ?: []);
    echo json_encode([
        'ok' => true,
        'messages' => array_map('historyRowToClient', $rows)
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function writeHistory(): void
{
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_json']);
        return;
    }

    $accountId = cleanHistoryText($input['accountId'] ?? '', 96);
    if (!isCurrentHistorySession($accountId)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $action = cleanHistoryText($input['action'] ?? 'save', 32);
    $pdo = Database::connect();
    ensureMessageHistorySchema($pdo);
    if ($action === 'delete') {
        deleteHistoryMessage($pdo, $accountId, $input);
        return;
    }

    saveHistoryMessage($pdo, $accountId, $input);
}

function saveHistoryMessage(PDO $pdo, string $accountId, array $input): void
{
    $messageId = cleanHistoryText($input['messageId'] ?? '', 160);
    $peer = cleanHistoryText($input['conversationPeer'] ?? '', 255);
    if ($messageId === '' || $peer === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_message']);
        return;
    }

    $statement = $pdo->prepare(
        'INSERT INTO message_history (
            account_id, conversation_peer, conversation_name, conversation_kind, message_id,
            direction, sender_jid, text, status, attachment_json, location_json,
            styling_disabled, edited, retracted, retraction_json, message_timestamp
        ) VALUES (
            :account_id, :conversation_peer, :conversation_name, :conversation_kind, :message_id,
            :direction, :sender_jid, :text, :status, :attachment_json, :location_json,
            :styling_disabled, :edited, :retracted, :retraction_json, :message_timestamp
        )
        ON DUPLICATE KEY UPDATE
            conversation_peer = VALUES(conversation_peer),
            conversation_name = VALUES(conversation_name),
            conversation_kind = VALUES(conversation_kind),
            direction = VALUES(direction),
            sender_jid = VALUES(sender_jid),
            text = VALUES(text),
            status = VALUES(status),
            attachment_json = VALUES(attachment_json),
            location_json = VALUES(location_json),
            styling_disabled = VALUES(styling_disabled),
            edited = VALUES(edited),
            retracted = VALUES(retracted),
            retraction_json = VALUES(retraction_json),
            message_timestamp = VALUES(message_timestamp)'
    );
    $statement->execute([
        'account_id' => $accountId,
        'conversation_peer' => $peer,
        'conversation_name' => cleanHistoryText($input['conversationName'] ?? '', 255),
        'conversation_kind' => normalizeHistoryKind($input['conversationKind'] ?? 'contact'),
        'message_id' => $messageId,
        'direction' => normalizeDirection($input['direction'] ?? 'peer'),
        'sender_jid' => cleanHistoryText($input['from'] ?? '', 255),
        'text' => cleanHistoryText($input['text'] ?? '', 1048576),
        'status' => cleanHistoryText($input['status'] ?? '', 64),
        'attachment_json' => encodeHistoryJson($input['attachment'] ?? null),
        'location_json' => encodeHistoryJson($input['location'] ?? null),
        'styling_disabled' => ($input['stylingDisabled'] ?? false) === true ? 1 : 0,
        'edited' => ($input['edited'] ?? false) === true ? 1 : 0,
        'retracted' => ($input['retracted'] ?? false) === true ? 1 : 0,
        'retraction_json' => encodeHistoryJson($input['retraction'] ?? null),
        'message_timestamp' => normalizeHistoryTimestamp($input['timestamp'] ?? null),
    ]);

    echo json_encode(['ok' => true]);
}

function deleteHistoryMessage(PDO $pdo, string $accountId, array $input): void
{
    $messageId = cleanHistoryText($input['messageId'] ?? $input['targetMessageId'] ?? '', 160);
    if ($messageId === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_message_id']);
        return;
    }

    $statement = $pdo->prepare(
        'UPDATE message_history
         SET retracted = 1,
             edited = 0,
             text = :text,
             status = :status,
             attachment_json = NULL,
             location_json = NULL,
             retraction_json = :retraction_json
         WHERE account_id = :account_id
           AND message_id = :message_id'
    );
    $statement->execute([
        'account_id' => $accountId,
        'message_id' => $messageId,
        'text' => cleanHistoryText($input['text'] ?? 'Message retracted', 1048576),
        'status' => 'retracted',
        'retraction_json' => encodeHistoryJson($input['retraction'] ?? null),
    ]);

    echo json_encode(['ok' => true, 'updated' => $statement->rowCount()]);
}

function ensureMessageHistorySchema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS message_history (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(96) NOT NULL,
            conversation_peer VARCHAR(255) NOT NULL,
            conversation_name VARCHAR(255) NOT NULL DEFAULT "",
            conversation_kind VARCHAR(32) NOT NULL DEFAULT "contact",
            message_id VARCHAR(160) NOT NULL,
            direction VARCHAR(16) NOT NULL,
            sender_jid VARCHAR(255) NOT NULL DEFAULT "",
            text MEDIUMTEXT NOT NULL,
            status VARCHAR(64) NOT NULL DEFAULT "",
            attachment_json MEDIUMTEXT NULL,
            location_json MEDIUMTEXT NULL,
            styling_disabled TINYINT(1) NOT NULL DEFAULT 0,
            edited TINYINT(1) NOT NULL DEFAULT 0,
            retracted TINYINT(1) NOT NULL DEFAULT 0,
            retraction_json MEDIUMTEXT NULL,
            message_timestamp DATETIME(3) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_message_history_account_message (account_id, message_id),
            KEY idx_message_history_account_peer_time (account_id, conversation_peer, message_timestamp)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
}

function historyRowToClient(array $row): array
{
    return [
        'conversationPeer' => $row['conversation_peer'],
        'conversationName' => $row['conversation_name'],
        'conversationKind' => $row['conversation_kind'],
        'messageId' => $row['message_id'],
        'direction' => $row['direction'],
        'from' => $row['sender_jid'],
        'text' => $row['text'],
        'status' => $row['status'],
        'attachment' => decodeHistoryJson($row['attachment_json'] ?? null),
        'location' => decodeHistoryJson($row['location_json'] ?? null),
        'stylingDisabled' => (bool)$row['styling_disabled'],
        'edited' => (bool)$row['edited'],
        'retracted' => (bool)$row['retracted'],
        'retraction' => decodeHistoryJson($row['retraction_json'] ?? null),
        'timestamp' => $row['message_timestamp'],
    ];
}

function isCurrentHistorySession(string $accountId): bool
{
    return $accountId !== ''
        && isset($_SESSION['teletyptel_account_id'])
        && hash_equals((string)$_SESSION['teletyptel_account_id'], $accountId);
}

function encodeHistoryJson(mixed $value): ?string
{
    if ($value === null) {
        return null;
    }

    return json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function decodeHistoryJson(?string $value): mixed
{
    if ($value === null || $value === '') {
        return null;
    }

    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : null;
}

function normalizeHistoryTimestamp(mixed $value): string
{
    try {
        $date = $value ? new DateTimeImmutable((string)$value) : new DateTimeImmutable();
    } catch (Throwable) {
        $date = new DateTimeImmutable();
    }

    return $date->format('Y-m-d H:i:s.v');
}

function normalizeDirection(mixed $value): string
{
    return (string)$value === 'self' ? 'self' : 'peer';
}

function normalizeHistoryKind(mixed $value): string
{
    return (string)$value === 'group' ? 'group' : 'contact';
}

function cleanHistoryText(mixed $value, int $maxLength): string
{
    $text = trim((string)$value);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }

    return substr($text, 0, $maxLength);
}
