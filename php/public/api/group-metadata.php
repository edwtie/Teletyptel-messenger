<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';

const TELETYPTEL_OAUTH_HANDOFF_TTL_SECONDS = 2592000;

session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

try {
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        readGroupMetadata();
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        writeGroupMetadata();
        return;
    }

    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'method_not_allowed']);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error', 'message' => $error->getMessage()]);
}

function readGroupMetadata(): void
{
    $accountId = cleanGroupText($_GET['accountId'] ?? '', 96);
    if (!canUseGroupMetadataSession($accountId, cleanGroupText($_GET['loginToken'] ?? '', 255))) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $pdo = Database::connect();
    ensureGroupMetadataSchema($pdo);
    $statement = $pdo->prepare(
        'SELECT *
         FROM group_metadata
         WHERE account_id = :account_id
         ORDER BY updated_at DESC, id DESC'
    );
    $statement->execute(['account_id' => $accountId]);
    echo json_encode([
        'ok' => true,
        'groups' => array_map('groupMetadataRowToClient', $statement->fetchAll() ?: []),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function writeGroupMetadata(): void
{
    $input = json_decode(file_get_contents('php://input') ?: '', true);
    if (!is_array($input)) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'invalid_json']);
        return;
    }

    $accountId = cleanGroupText($input['accountId'] ?? '', 96);
    if (!canUseGroupMetadataSession($accountId, cleanGroupText($input['loginToken'] ?? '', 255))) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'not_authenticated']);
        return;
    }

    $roomJid = groupBareJid(cleanGroupText($input['roomJid'] ?? '', 255));
    if ($roomJid === '') {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'missing_room']);
        return;
    }

    $pdo = Database::connect();
    ensureGroupMetadataSchema($pdo);
    $statement = $pdo->prepare(
        'INSERT INTO group_metadata (
            account_id, room_jid, room_name, room_description, avatar_data_url, avatar_color,
            avatar_hash, avatar_media_type, avatar_updated_at,
            owner_jid, admin_jids_json, member_jids_json,
            banned_jids_json,
            approve_members, members_can_invite
        ) VALUES (
            :account_id, :room_jid, :room_name, :room_description, :avatar_data_url, :avatar_color,
            :avatar_hash, :avatar_media_type, :avatar_updated_at,
            :owner_jid, :admin_jids_json, :member_jids_json,
            :banned_jids_json,
            :approve_members, :members_can_invite
        )
        ON DUPLICATE KEY UPDATE
            room_name = VALUES(room_name),
            room_description = VALUES(room_description),
            avatar_data_url = VALUES(avatar_data_url),
            avatar_color = VALUES(avatar_color),
            avatar_hash = VALUES(avatar_hash),
            avatar_media_type = VALUES(avatar_media_type),
            avatar_updated_at = VALUES(avatar_updated_at),
            owner_jid = VALUES(owner_jid),
            admin_jids_json = VALUES(admin_jids_json),
            member_jids_json = VALUES(member_jids_json),
            banned_jids_json = VALUES(banned_jids_json),
            approve_members = VALUES(approve_members),
            members_can_invite = VALUES(members_can_invite),
            updated_at = CURRENT_TIMESTAMP'
    );
    $statement->execute([
        'account_id' => $accountId,
        'room_jid' => $roomJid,
        'room_name' => cleanGroupText($input['roomName'] ?? '', 255),
        'room_description' => cleanGroupText($input['roomDescription'] ?? '', 4000),
        'avatar_data_url' => cleanGroupText($input['avatarDataUrl'] ?? '', 524288),
        'avatar_color' => normalizeGroupColor($input['avatarColor'] ?? '#2563eb'),
        'avatar_hash' => cleanGroupText($input['avatarHash'] ?? '', 80),
        'avatar_media_type' => cleanGroupText($input['avatarMediaType'] ?? '', 80),
        'avatar_updated_at' => normalizeGroupDateTime($input['avatarUpdatedAt'] ?? null),
        'owner_jid' => groupBareJid(cleanGroupText($input['ownerJid'] ?? '', 255)),
        'admin_jids_json' => json_encode(normalizeGroupJidList($input['adminJids'] ?? []), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'member_jids_json' => json_encode(normalizeGroupJidList($input['memberJids'] ?? []), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'banned_jids_json' => json_encode(normalizeGroupJidList($input['bannedJids'] ?? []), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        'approve_members' => !empty($input['approveMembers']) ? 1 : 0,
        'members_can_invite' => array_key_exists('membersCanInvite', $input) && !$input['membersCanInvite'] ? 0 : 1,
    ]);

    echo json_encode(['ok' => true], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}

function ensureGroupMetadataSchema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS group_metadata (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(96) NOT NULL,
            room_jid VARCHAR(255) NOT NULL,
            room_name VARCHAR(255) NOT NULL DEFAULT "",
            room_description TEXT NULL,
            avatar_data_url MEDIUMTEXT NULL,
            avatar_color VARCHAR(32) NOT NULL DEFAULT "#2563eb",
            avatar_hash VARCHAR(80) NOT NULL DEFAULT "",
            avatar_media_type VARCHAR(80) NOT NULL DEFAULT "",
            avatar_updated_at DATETIME NULL,
            owner_jid VARCHAR(255) NOT NULL DEFAULT "",
            admin_jids_json MEDIUMTEXT NULL,
            member_jids_json MEDIUMTEXT NULL,
            banned_jids_json MEDIUMTEXT NULL,
            approve_members TINYINT(1) NOT NULL DEFAULT 0,
            members_can_invite TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_group_metadata_account_room (account_id, room_jid(190)),
            KEY idx_group_metadata_account_updated (account_id, updated_at)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
    ensureGroupMetadataColumn($pdo, 'room_description', 'room_description TEXT NULL');
    ensureGroupMetadataColumn($pdo, 'banned_jids_json', 'banned_jids_json MEDIUMTEXT NULL');
}

function groupMetadataRowToClient(array $row): array
{
    return [
        'roomJid' => $row['room_jid'],
        'roomName' => $row['room_name'],
        'roomDescription' => $row['room_description'] ?? '',
        'avatarDataUrl' => $row['avatar_data_url'] ?? '',
        'avatarColor' => $row['avatar_color'] ?? '#2563eb',
        'avatarHash' => $row['avatar_hash'] ?? '',
        'avatarMediaType' => $row['avatar_media_type'] ?? '',
        'avatarUpdatedAt' => $row['avatar_updated_at'] ?? null,
        'ownerJid' => $row['owner_jid'] ?? '',
        'adminJids' => normalizeGroupJidList(decodeGroupJson($row['admin_jids_json'] ?? null)),
        'memberJids' => normalizeGroupJidList(decodeGroupJson($row['member_jids_json'] ?? null)),
        'bannedJids' => normalizeGroupJidList(decodeGroupJson($row['banned_jids_json'] ?? null)),
        'approveMembers' => (bool)$row['approve_members'],
        'membersCanInvite' => (bool)$row['members_can_invite'],
    ];
}

function ensureGroupMetadataColumn(PDO $pdo, string $column, string $definition): void
{
    $statement = $pdo->query('SHOW COLUMNS FROM group_metadata LIKE ' . $pdo->quote($column));
    if ($statement && $statement->fetch()) {
        return;
    }

    $pdo->exec('ALTER TABLE group_metadata ADD COLUMN ' . $definition);
}

function canUseGroupMetadataSession(string $accountId, string $loginToken = ''): bool
{
    if ($accountId === '') {
        return false;
    }

    if (isset($_SESSION['teletyptel_account_id']) && hash_equals((string)$_SESSION['teletyptel_account_id'], $accountId)) {
        return true;
    }

    return consumeGroupOAuthLoginToken($accountId, $loginToken);
}

function consumeGroupOAuthLoginToken(string $accountId, string $token): bool
{
    if ($accountId === '' || $token === '') {
        return false;
    }

    $directory = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'oauth-handoff';
    if (!is_dir($directory)) {
        return false;
    }

    foreach (glob($directory . DIRECTORY_SEPARATOR . '*.json') ?: [] as $path) {
        if (!is_file($path)) {
            continue;
        }

        if ((time() - filemtime($path)) > TELETYPTEL_OAUTH_HANDOFF_TTL_SECONDS) {
            unlink($path);
            continue;
        }

        $payload = json_decode((string)file_get_contents($path), true);
        if (!is_array($payload)) {
            continue;
        }

        if (($payload['account_id'] ?? '') === $accountId
            && hash_equals((string)($payload['token_hash'] ?? ''), hash('sha256', $token))) {
            $_SESSION['teletyptel_account_id'] = $accountId;
            return true;
        }
    }

    return false;
}

function normalizeGroupJidList(mixed $value): array
{
    if (!is_array($value)) {
        return [];
    }

    $jids = [];
    foreach ($value as $jid) {
        $normalized = groupBareJid(cleanGroupText($jid, 255));
        if ($normalized !== '') {
            $jids[] = $normalized;
        }
    }

    return array_values(array_unique(array_slice($jids, 0, 200)));
}

function decodeGroupJson(?string $value): mixed
{
    if ($value === null || $value === '') {
        return [];
    }

    $decoded = json_decode($value, true);
    return json_last_error() === JSON_ERROR_NONE ? $decoded : [];
}

function normalizeGroupDateTime(mixed $value): ?string
{
    if ($value === null || $value === '') {
        return null;
    }

    try {
        return (new DateTimeImmutable((string)$value))->format('Y-m-d H:i:s');
    } catch (Throwable) {
        return null;
    }
}

function normalizeGroupColor(mixed $value): string
{
    $color = trim((string)$value);
    return preg_match('/^#[0-9a-fA-F]{6}$/', $color) === 1 ? $color : '#2563eb';
}

function groupBareJid(string $jid): string
{
    return strtolower(trim(explode('/', $jid, 2)[0]));
}

function cleanGroupText(mixed $value, int $maxLength): string
{
    $text = trim((string)$value);
    if (function_exists('mb_substr')) {
        return mb_substr($text, 0, $maxLength, 'UTF-8');
    }

    return substr($text, 0, $maxLength);
}
