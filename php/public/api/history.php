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

    $limit = max(1, min(2000, (int)($_GET['limit'] ?? 500)));
    $pdo = Database::connect();
    ensureMessageHistorySchema($pdo);
    ensureConversationHistorySchema($pdo);
    $accountIds = historyAccountIds($pdo, $accountId);
    if (cleanHistoryText($_GET['type'] ?? '', 32) === 'calls') {
        readConversationHistory($pdo, $accountIds, $limit);
        return;
    }
    [$accountWhere, $accountParams] = historyAccountWhere($accountIds);
    $statement = $pdo->prepare(
        'SELECT * FROM message_history
         WHERE ' . $accountWhere . '
         ORDER BY message_timestamp DESC, id DESC
         LIMIT ' . $limit
    );
    $statement->execute($accountParams);
    $rows = array_reverse($statement->fetchAll() ?: []);
    echo json_encode([
        'ok' => true,
        'accountIds' => $accountIds,
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
    ensureConversationHistorySchema($pdo);
    if ($action === 'delete') {
        deleteHistoryMessage($pdo, $accountId, $input);
        return;
    }
    if ($action === 'save_call') {
        saveConversationHistory($pdo, $accountId, $input);
        return;
    }

    saveHistoryMessage($pdo, $accountId, $input);
}

function readConversationHistory(PDO $pdo, array $accountIds, int $limit): void
{
    [$accountWhere, $accountParams] = historyAccountWhere($accountIds);
    $statement = $pdo->prepare(
        'SELECT * FROM conversation_history
         WHERE ' . $accountWhere . '
         ORDER BY started_at DESC, id DESC
         LIMIT ' . $limit
    );
    $statement->execute($accountParams);
    echo json_encode([
        'ok' => true,
        'accountIds' => $accountIds,
        'calls' => array_map('conversationHistoryRowToClient', $statement->fetchAll() ?: [])
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
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

function saveConversationHistory(PDO $pdo, string $accountId, array $input): void
{
    $callId = cleanHistoryText($input['callId'] ?? '', 160);
    $peer = cleanHistoryText($input['conversationPeer'] ?? '', 255);
    if ($callId === '' || $peer === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_call']);
        return;
    }

    $startedAt = normalizeHistoryTimestamp($input['startedAt'] ?? null);
    $endedAtValue = $input['endedAt'] ?? null;
    $endedAt = $endedAtValue ? normalizeHistoryTimestamp($endedAtValue) : null;
    $durationSeconds = max(0, (int)($input['durationSeconds'] ?? 0));
    $statement = $pdo->prepare(
        'INSERT INTO conversation_history (
            account_id, call_id, conversation_peer, conversation_name, conversation_kind,
            direction, call_type, status, started_at, ended_at, duration_seconds,
            transcript_json, media_json, note
        ) VALUES (
            :account_id, :call_id, :conversation_peer, :conversation_name, :conversation_kind,
            :direction, :call_type, :status, :started_at, :ended_at, :duration_seconds,
            :transcript_json, :media_json, :note
        )
        ON DUPLICATE KEY UPDATE
            conversation_peer = VALUES(conversation_peer),
            conversation_name = VALUES(conversation_name),
            conversation_kind = VALUES(conversation_kind),
            direction = VALUES(direction),
            call_type = VALUES(call_type),
            status = VALUES(status),
            started_at = VALUES(started_at),
            ended_at = VALUES(ended_at),
            duration_seconds = VALUES(duration_seconds),
            transcript_json = VALUES(transcript_json),
            media_json = VALUES(media_json),
            note = VALUES(note)'
    );
    $statement->execute([
        'account_id' => $accountId,
        'call_id' => $callId,
        'conversation_peer' => $peer,
        'conversation_name' => cleanHistoryText($input['conversationName'] ?? '', 255),
        'conversation_kind' => normalizeHistoryKind($input['conversationKind'] ?? 'contact'),
        'direction' => normalizeDirection($input['direction'] ?? 'peer'),
        'call_type' => normalizeCallType($input['callType'] ?? 'total'),
        'status' => normalizeCallStatus($input['status'] ?? 'ended'),
        'started_at' => $startedAt,
        'ended_at' => $endedAt,
        'duration_seconds' => $durationSeconds,
        'transcript_json' => encodeHistoryJson($input['transcript'] ?? []),
        'media_json' => encodeHistoryJson($input['media'] ?? []),
        'note' => cleanHistoryText($input['note'] ?? '', 1024),
    ]);

    echo json_encode(['ok' => true]);
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

function ensureConversationHistorySchema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS conversation_history (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(96) NOT NULL,
            call_id VARCHAR(160) NOT NULL,
            conversation_peer VARCHAR(255) NOT NULL,
            conversation_name VARCHAR(255) NOT NULL DEFAULT "",
            conversation_kind VARCHAR(32) NOT NULL DEFAULT "contact",
            direction VARCHAR(16) NOT NULL,
            call_type VARCHAR(32) NOT NULL DEFAULT "total",
            status VARCHAR(32) NOT NULL DEFAULT "ended",
            started_at DATETIME(3) NOT NULL,
            ended_at DATETIME(3) NULL,
            duration_seconds INT UNSIGNED NOT NULL DEFAULT 0,
            transcript_json MEDIUMTEXT NULL,
            media_json MEDIUMTEXT NULL,
            note TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_conversation_history_account_call (account_id, call_id),
            KEY idx_conversation_history_account_peer_time (account_id, conversation_peer, started_at)
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

function conversationHistoryRowToClient(array $row): array
{
    return [
        'callId' => $row['call_id'],
        'conversationPeer' => $row['conversation_peer'],
        'conversationName' => $row['conversation_name'],
        'conversationKind' => $row['conversation_kind'],
        'direction' => $row['direction'],
        'callType' => $row['call_type'],
        'status' => $row['status'],
        'startedAt' => $row['started_at'],
        'endedAt' => $row['ended_at'],
        'durationSeconds' => (int)$row['duration_seconds'],
        'transcript' => decodeHistoryJson($row['transcript_json'] ?? null) ?: [],
        'media' => decodeHistoryJson($row['media_json'] ?? null) ?: [],
        'note' => $row['note'] ?? '',
    ];
}

function isCurrentHistorySession(string $accountId): bool
{
    return $accountId !== ''
        && isset($_SESSION['teletyptel_account_id'])
        && hash_equals((string)$_SESSION['teletyptel_account_id'], $accountId);
}

function historyAccountIds(PDO $pdo, string $accountId): array
{
    $ids = [$accountId];
    $profile = historyAccountProfile($pdo, $accountId);
    $currentJid = historyBareJid((string)($profile['jid'] ?? ''));
    $currentLocal = historyJidLocalpart($currentJid);
    $verifiedEmails = historyVerifiedIdentityEmails($pdo, $accountId);
    if ($currentJid !== '') {
        $verifiedEmails[] = $currentJid;
        historyCollectAccountIds(
            $pdo,
            $ids,
            'SELECT account_id FROM account_profiles WHERE LOWER(jid) = :jid',
            ['jid' => $currentJid]
        );
    }

    foreach (array_unique(array_filter($verifiedEmails)) as $email) {
        historyCollectAccountIds(
            $pdo,
            $ids,
            'SELECT DISTINCT account_id FROM account_identities WHERE email_verified = 1 AND LOWER(email) = :email',
            ['email' => $email]
        );
    }

    foreach (array_unique(array_filter([$currentLocal, ...array_map('historyJidLocalpart', $verifiedEmails)])) as $localpart) {
        historyCollectAccountIds(
            $pdo,
            $ids,
            'SELECT account_id FROM account_profiles
             WHERE LOWER(jid) = :oauth_jid
               AND provider_id IN ("google", "facebook", "apple", "auth0")',
            ['oauth_jid' => $localpart . '@localhost']
        );
    }

    return array_slice(array_values(array_unique($ids)), 0, 8);
}

function historyAccountProfile(PDO $pdo, string $accountId): array
{
    $statement = $pdo->prepare('SELECT account_id, jid, provider_id FROM account_profiles WHERE account_id = :account_id LIMIT 1');
    $statement->execute(['account_id' => $accountId]);
    return $statement->fetch() ?: [];
}

function historyVerifiedIdentityEmails(PDO $pdo, string $accountId): array
{
    $statement = $pdo->prepare(
        'SELECT LOWER(email) AS email
         FROM account_identities
         WHERE account_id = :account_id
           AND email_verified = 1
           AND email <> ""'
    );
    $statement->execute(['account_id' => $accountId]);
    return array_column($statement->fetchAll() ?: [], 'email');
}

function historyCollectAccountIds(PDO $pdo, array &$ids, string $sql, array $params): void
{
    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    foreach ($statement->fetchAll() ?: [] as $row) {
        $candidate = cleanHistoryText($row['account_id'] ?? '', 96);
        if ($candidate !== '') {
            $ids[] = $candidate;
        }
    }
}

function historyAccountWhere(array $accountIds): array
{
    $params = [];
    $placeholders = [];
    foreach (array_values(array_unique($accountIds)) as $index => $accountId) {
        $key = 'account_id_' . $index;
        $placeholders[] = ':' . $key;
        $params[$key] = $accountId;
    }

    return ['account_id IN (' . implode(', ', $placeholders) . ')', $params];
}

function historyBareJid(string $jid): string
{
    $bare = strtolower(trim(explode('/', $jid, 2)[0] ?? ''));
    return cleanHistoryText($bare, 255);
}

function historyJidLocalpart(string $jid): string
{
    $bare = historyBareJid($jid);
    if ($bare === '' || !str_contains($bare, '@')) {
        return '';
    }

    return cleanHistoryText(explode('@', $bare, 2)[0], 96);
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

function normalizeCallType(mixed $value): string
{
    $type = (string)$value;
    return in_array($type, ['audio', 'video', 'total'], true) ? $type : 'total';
}

function normalizeCallStatus(mixed $value): string
{
    $status = (string)$value;
    return in_array($status, ['started', 'ended', 'missed', 'rejected', 'failed'], true) ? $status : 'ended';
}

function cleanHistoryText(mixed $value, int $maxLength): string
{
    $text = trim((string)$value);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }

    return substr($text, 0, $maxLength);
}
