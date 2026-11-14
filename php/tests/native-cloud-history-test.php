<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/NativeCloudHistory.php';

function nativeHistoryCheck(bool $condition, string $label): void
{
    if (!$condition) throw new RuntimeException($label);
}

function nativeHistoryFails(callable $action, string $code, int $status): void
{
    try {
        $action();
    } catch (NativeCloudHistoryFailure $error) {
        nativeHistoryCheck($error->getMessage() === $code && $error->status === $status, 'Unexpected failure: ' . $error->getMessage());
        return;
    }
    throw new RuntimeException('Expected ' . $code);
}

function nativeHistoryFixture(PDO $pdo, bool $preference = true): void
{
    $pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT, password_secret TEXT'
        . ($preference ? ', save_chat_history INTEGER DEFAULT 1' : '') . ')');
    $pdo->exec("INSERT INTO account_profiles (account_id, jid, password_secret) VALUES
        ('one', 'one@example.test', 'never-return-this'), ('two', 'two@example.test', 'never-return-that'),
        ('alias', 'one@example.test', 'never-return-alias')");
    $pdo->exec('CREATE TABLE account_access_controls (account_id TEXT PRIMARY KEY, web_blocked INTEGER DEFAULT 0,
        trashed_at TEXT, version INTEGER DEFAULT 1, updated_at TEXT)');
    $pdo->exec("INSERT INTO account_access_controls (account_id) VALUES ('one'), ('two'), ('alias')");
    $pdo->exec('CREATE TABLE message_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT NOT NULL, conversation_peer TEXT NOT NULL,
        conversation_name TEXT NOT NULL DEFAULT "", conversation_kind TEXT NOT NULL DEFAULT "contact",
        message_id TEXT NOT NULL, direction TEXT NOT NULL, sender_jid TEXT NOT NULL DEFAULT "", text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT "", attachment_json TEXT, location_json TEXT, call_info_json TEXT,
        jingle_history_json TEXT, styling_disabled INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0,
        retracted INTEGER NOT NULL DEFAULT 0, retraction_json TEXT, reactions_json TEXT,
        delivery_status TEXT NOT NULL DEFAULT "", message_timestamp TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        future_metadata TEXT DEFAULT "opaque future data", UNIQUE(account_id, message_id))');
}

function nativeHistoryMessage(string $id = 'message-1'): array
{
    return ['conversationPeer' => 'peer@example.test', 'conversationName' => 'Peer', 'conversationKind' => 'contact',
        'messageId' => $id, 'direction' => 'self', 'from' => 'one@example.test/phone', 'text' => '  original body  ',
        'status' => 'sent', 'attachment' => ['url' => '/opaque', 'future' => ['nested' => 1]],
        'location' => ['latitude' => 1, 'future' => true], 'callInfo' => ['future' => ['mode' => 'opaque']],
        'jingleHistory' => ['sid' => 'opaque-jingle', 'extra' => 'keep'], 'stylingDisabled' => true,
        'edited' => false, 'retracted' => false, 'retraction' => null,
        'reactions' => ['peer@example.test' => ['👍']], 'deliveryStatus' => 'sent', 'timestamp' => '2026-11-14T10:00:00.123Z'];
}

function nativeHistoryQuery(array $extra = []): array
{
    return $extra + ['accountId' => 'one', 'peer' => 'peer@example.test', 'kind' => 'contact', 'limit' => '50'];
}

function nativeHistorySave(PDO $pdo, array &$session, array $message, ?string $version = null): array
{
    return NativeCloudHistory::save($pdo, $session, ['accountId' => 'one', 'message' => $message, 'expectedVersion' => $version])['message'];
}

if (defined('TELETYPTEL_NATIVE_HISTORY_FIXTURE_ONLY')) return;

nativeHistoryCheck(session_status() === PHP_SESSION_NONE && headers_list() === [], 'Library include has no session/HTTP side effects');
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
nativeHistoryFixture($pdo);
$session = ['teletyptel_account_id' => 'one', 'teletyptel_access_version' => 1];
$message = nativeHistorySave($pdo, $session, nativeHistoryMessage());
nativeHistoryCheck($message['text'] === '  original body  ' && preg_match('/^[a-f0-9]{64}$/D', $message['version']) === 1, 'Insert preserves body and returns version');
$raw = $pdo->query('SELECT * FROM message_history')->fetch(PDO::FETCH_ASSOC);
nativeHistoryCheck($message === historyRowToClient($raw) + ['version' => NativeCloudHistory::version($raw)], 'Exact web mapping');
nativeHistoryCheck(NativeCloudHistory::version(array_reverse($raw, true)) === $message['version'], 'Canonical column order');
$typed = $raw;
$typed['id'] = (string)$typed['id'];
nativeHistoryCheck(NativeCloudHistory::version($typed) === $message['version'], 'Canonical PDO scalar types');
$page = NativeCloudHistory::read($pdo, $session, nativeHistoryQuery());
nativeHistoryCheck($page === ['ok' => true, 'accountId' => 'one', 'owner' => 'one@example.test', 'saveChat' => true,
    'messages' => [$message], 'nextCursor' => null], 'Read contract');
nativeHistoryCheck(!str_contains(json_encode($page), 'never-return'), 'No profile secrets');
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, nativeHistoryMessage()), 'cloud_history_conflict', 409);
$missing = nativeHistoryMessage('not-present');
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $missing, $message['version']), 'cloud_history_conflict', 409);
foreach (['conversationPeer' => 'other@example.test', 'conversationKind' => 'group', 'direction' => 'peer', 'from' => 'other@example.test'] as $key => $value) {
    $bad = $message;
    $bad[$key] = $value;
    nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $bad, $message['version']), 'cloud_history_conflict', 409);
}
$edit = array_intersect_key($message, array_flip(['conversationPeer', 'conversationKind', 'messageId', 'direction', 'from']));
$edit['text'] = 'edited body';
$edit['reactions'] = ['one@example.test' => ['🙂']];
$edit['deliveryStatus'] = 'delivered';
$updated = nativeHistorySave($pdo, $session, $edit, $message['version']);
nativeHistoryCheck($updated['edited'] && $updated['version'] !== $message['version'], 'Body marks edit and changes version');
$after = $pdo->query('SELECT * FROM message_history')->fetch(PDO::FETCH_ASSOC);
foreach (['attachment_json', 'location_json', 'call_info_json', 'jingle_history_json', 'future_metadata', 'message_timestamp', 'styling_disabled'] as $column) {
    nativeHistoryCheck($raw[$column] === $after[$column], 'Preserves raw ' . $column);
}
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $edit, $message['version']), 'cloud_history_conflict', 409);
$downgrade = $updated;
$downgrade['deliveryStatus'] = 'sent';
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $downgrade, $updated['version']), 'cloud_history_conflict', 409);
$unedit = $updated;
$unedit['edited'] = false;
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $unedit, $updated['version']), 'cloud_history_conflict', 409);
$opaque = $updated;
$opaque['attachment'] = null;
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $opaque, $updated['version']), 'cloud_history_invalid_request', 400);
$pdo->exec("UPDATE message_history SET future_metadata = 'web changed unknown metadata'");
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $updated, $updated['version']), 'cloud_history_conflict', 409);
$updated = NativeCloudHistory::read($pdo, $session, nativeHistoryQuery())['messages'][0];
$retract = array_intersect_key($updated, array_flip(['conversationPeer', 'conversationKind', 'messageId', 'direction', 'from']));
$retract['retracted'] = true;
$retract['retraction'] = ['reason' => 'removed', 'future' => 'keep'];
$terminal = nativeHistorySave($pdo, $session, $retract, $updated['version']);
nativeHistoryCheck($terminal['retracted'] && !$terminal['edited'] && $terminal['status'] === 'retracted'
    && $terminal['text'] === 'Message retracted' && $terminal['attachment'] === $message['attachment'], 'Terminal retraction retains opaque fields');
$bad = $terminal;
$bad['retracted'] = false;
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $bad, $terminal['version']), 'cloud_history_conflict', 409);
$bad = $terminal;
$bad['text'] = 'resurrected';
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $bad, $terminal['version']), 'cloud_history_conflict', 409);
$terminal['deliveryStatus'] = 'displayed';
$displayed = nativeHistorySave($pdo, $session, $terminal, $terminal['version']);
nativeHistoryCheck($displayed['retracted'] && $displayed['deliveryStatus'] === 'displayed', 'Delivery may advance after retraction');
nativeHistoryCheck(nativeHistorySave($pdo, $session, $displayed, $displayed['version']) === $displayed, 'No-op keeps version');
$bad = $displayed;
$bad['retraction'] = null;
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $bad, $displayed['version']), 'cloud_history_invalid_request', 400);
$pdo->exec("UPDATE message_history SET reactions_json = '{\"future-format\":{\"unknown\":true}}'");
$future = NativeCloudHistory::read($pdo, $session, nativeHistoryQuery())['messages'][0];
$bad = $future;
$bad['reactions'] = [];
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $bad, $future['version']), 'cloud_history_invalid_request', 400);
$future['deliveryStatus'] = 'displayed';
nativeHistoryCheck(nativeHistorySave($pdo, $session, $future, $future['version'])['reactions'] === ['future-format' => ['unknown' => true]], 'Unknown reaction metadata is retained, not normalized away');

foreach (['two', 'alias'] as $other) {
    nativeHistoryFails(fn() => NativeCloudHistory::read($pdo, $session, nativeHistoryQuery(['accountId' => $other])), 'account_access_denied', 403);
    nativeHistoryFails(fn() => NativeCloudHistory::save($pdo, $session,
        ['accountId' => $other, 'message' => nativeHistoryMessage(), 'expectedVersion' => null]), 'account_access_denied', 403);
}
$pdo->exec('UPDATE account_profiles SET save_chat_history = 0 WHERE account_id = "one"');
$beforeRead = $pdo->query('SELECT * FROM message_history')->fetchAll(PDO::FETCH_ASSOC);
nativeHistoryCheck(NativeCloudHistory::read($pdo, $session, nativeHistoryQuery())['saveChat'] === false, 'Preference reported without deleting history');
nativeHistoryCheck($beforeRead === $pdo->query('SELECT * FROM message_history')->fetchAll(PDO::FETCH_ASSOC), 'Read has no row side effects');
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, nativeHistoryMessage('disabled')), 'cloud_history_disabled', 403);
$pdo->exec('UPDATE account_profiles SET save_chat_history = 1');
$pdo->exec('UPDATE account_access_controls SET version = 2 WHERE account_id = "one"');
try {
    NativeCloudHistory::read($pdo, $session, nativeHistoryQuery());
    throw new RuntimeException('Revoked session accepted');
} catch (AccountAccessDenied $expected) {}
nativeHistoryCheck(!isset($session['teletyptel_account_id']), 'Guard revokes stale identity');
$session = ['teletyptel_account_id' => 'one', 'teletyptel_access_version' => 2];
foreach (['web_blocked = 1', 'trashed_at = "2026-11-14"'] as $state) {
    $pdo->exec('UPDATE account_access_controls SET ' . $state . ' WHERE account_id = "one"');
    $blocked = $session;
    try {
        NativeCloudHistory::read($pdo, $blocked, nativeHistoryQuery());
        throw new RuntimeException('Blocked account accepted');
    } catch (AccountAccessDenied $expected) {}
    $pdo->exec('UPDATE account_access_controls SET web_blocked = 0, trashed_at = NULL');
}
$anonymous = [];
nativeHistoryFails(fn() => NativeCloudHistory::read($pdo, $anonymous, nativeHistoryQuery()), 'not_authenticated', 401);

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
nativeHistoryFixture($pdo, false);
$session = ['teletyptel_account_id' => 'one'];
nativeHistoryCheck(NativeCloudHistory::read($pdo, $session, nativeHistoryQuery())['saveChat'], 'Absent server preference defaults true');
for ($index = 1; $index <= 107; $index++) nativeHistorySave($pdo, $session, nativeHistoryMessage('page-' . $index));
$group = nativeHistoryMessage('group');
$group['conversationKind'] = 'group';
nativeHistorySave($pdo, $session, $group);
$other = nativeHistoryMessage('other-peer');
$other['conversationPeer'] = 'other@example.test';
nativeHistorySave($pdo, $session, $other);
$secondSession = ['teletyptel_account_id' => 'two'];
NativeCloudHistory::save($pdo, $secondSession, ['accountId' => 'two', 'message' => nativeHistoryMessage('second-account'), 'expectedVersion' => null]);
$ids = [];
$cursor = null;
$counts = [];
do {
    $page = NativeCloudHistory::read($pdo, $session, nativeHistoryQuery($cursor === null ? [] : ['before' => $cursor]));
    $counts[] = count($page['messages']);
    $ids = [...$ids, ...array_column($page['messages'], 'messageId')];
    $cursor = $page['nextCursor'];
    if ($cursor !== null) {
        nativeHistoryFails(fn() => NativeCloudHistory::read($pdo, $session,
            nativeHistoryQuery(['before' => $cursor, 'peer' => 'other@example.test'])), 'cloud_history_invalid_request', 400);
    }
} while ($cursor !== null);
nativeHistoryCheck($counts === [50, 50, 7] && count(array_unique($ids)) === 107, 'Tied timestamp keyset pagination has no gaps or duplicates');
nativeHistoryCheck($ids[0] === 'page-58' && $ids[49] === 'page-107', 'Each page is web-compatible chronological order');
nativeHistoryCheck(count(NativeCloudHistory::read($pdo, $session, nativeHistoryQuery(['limit' => '500']))['messages']) === 50, 'Limit bounded at 50');
nativeHistoryCheck(NativeCloudHistory::read($pdo, $session, nativeHistoryQuery(['kind' => 'group']))['messages'][0]['messageId'] === 'group', 'Group filter');
foreach ([['peer' => 'peer@example.test/resource'], ['peer' => ['bad']], ['kind' => 'calls'], ['before' => 'broken'],
    ['limit' => '0'], ['limit' => ['50']], ['loginToken' => 'not-allowed'], ['peer' => 'PEER@example.test']] as $bad) {
    nativeHistoryFails(fn() => NativeCloudHistory::read($pdo, $session, nativeHistoryQuery($bad)), 'cloud_history_invalid_request', 400);
}
$invalid = nativeHistoryMessage('invalid-date');
$invalid['timestamp'] = '2026-02-31T12:00:00Z';
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $invalid), 'cloud_history_invalid_request', 400);
$invalid['timestamp'] = '2026-11-14T12:00:00.123+02:00';
nativeHistoryCheck(nativeHistorySave($pdo, $session, $invalid)['timestamp'] === '2026-11-14 10:00:00.123', 'Timestamps normalized to UTC');
$oversize = nativeHistoryMessage('oversize-text');
$oversize['text'] = str_repeat('a', 8193);
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $oversize), 'cloud_history_too_large', 413);
$oversize['text'] = str_repeat('a', 8192);
nativeHistoryCheck(strlen(nativeHistorySave($pdo, $session, $oversize)['text']) === 8192, '8 KiB write boundary');
$oversize['messageId'] = 'oversize-record';
$oversize['attachment'] = ['opaque' => str_repeat('a', 32768)];
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $oversize), 'cloud_history_too_large', 413);
$emptyFrom = nativeHistoryMessage('empty-from');
$emptyFrom['from'] = '';
nativeHistoryCheck(nativeHistorySave($pdo, $session, $emptyFrom)['from'] === '', 'Empty web sender remains representable and bound');
$invalidReactions = nativeHistoryMessage('invalid-reactions');
$invalidReactions['reactions'] = ['peer@example.test' => ['future' => 'unknown']];
nativeHistoryFails(fn() => nativeHistorySave($pdo, $session, $invalidReactions), 'cloud_history_invalid_request', 400);
$pdo->exec('DELETE FROM message_history');
$insert = $pdo->prepare('INSERT INTO message_history (account_id, conversation_peer, message_id, direction, sender_jid, text, message_timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)');
for ($index = 1; $index <= 50; $index++) {
    $insert->execute(['one', 'peer@example.test', 'large-' . $index, 'self', 'one@example.test', str_repeat('a', 30000), '2026-11-14 10:00:00.123']);
}
$page = NativeCloudHistory::read($pdo, $session, nativeHistoryQuery());
nativeHistoryCheck(count($page['messages']) < 50 && $page['nextCursor'] !== null
    && strlen(json_encode($page, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)) < 1048576, 'Byte-budgeted page below 1 MiB');
$rest = NativeCloudHistory::read($pdo, $session, nativeHistoryQuery(['before' => $page['nextCursor']]));
nativeHistoryCheck(count($page['messages']) + count($rest['messages']) === 50 && $rest['nextCursor'] === null, 'Byte-budget pagination does not skip rows');
$legacy = $page['messages'][0];
$legacy['deliveryStatus'] = 'delivered';
nativeHistoryCheck(strlen(nativeHistorySave($pdo, $session, $legacy, $legacy['version'])['text']) === 30000, 'Unchanged legacy body over 8 KiB survives delivery update');
$pdo->exec('UPDATE message_history SET text = "' . str_repeat('a', 32768) . '" WHERE message_id = "large-50"');
nativeHistoryFails(fn() => NativeCloudHistory::read($pdo, $session, nativeHistoryQuery()), 'cloud_history_too_large', 413);
nativeHistoryCheck((int)$pdo->query('SELECT COUNT(*) FROM message_history')->fetchColumn() === 50, 'Oversize read never deletes');
$discoveryPdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
nativeHistoryFixture($discoveryPdo);
for ($index = 1; $index <= 40; $index++) {
    $conversation = nativeHistoryMessage('conversation-' . $index);
    $conversation['conversationPeer'] = 'peer-' . $index . '@example.test';
    $conversation['conversationName'] = 'Name ' . $index;
    $conversation['timestamp'] = '2026-11-14T10:00:' . str_pad((string)$index, 2, '0', STR_PAD_LEFT) . '.123Z';
    nativeHistorySave($discoveryPdo, $session, $conversation);
}
$older = $conversation;
$older['messageId'] = 'older-duplicate';
$older['conversationName'] = 'Old name must not win';
$older['timestamp'] = '2026-11-14T09:00:00.123Z';
nativeHistorySave($discoveryPdo, $session, $older);
$newer = nativeHistoryMessage('latest-duplicate');
$newer['conversationPeer'] = 'peer-39@example.test';
$newer['conversationName'] = 'Updated name';
$newer['timestamp'] = '2026-11-14T11:00:00.123Z';
nativeHistorySave($discoveryPdo, $session, $newer);
$newer['messageId'] = 'group-same-peer';
$newer['conversationKind'] = 'group';
nativeHistorySave($discoveryPdo, $session, $newer);
$newer['messageId'] = 'other-account-only';
$newer['conversationPeer'] = 'private@example.test';
$newer['timestamp'] = '2026-11-14T12:00:00.123Z';
NativeCloudHistory::save($discoveryPdo, $secondSession, ['accountId' => 'two', 'message' => $newer, 'expectedVersion' => null]);
$aliasSession = ['teletyptel_account_id' => 'alias'];
NativeCloudHistory::save($discoveryPdo, $aliasSession, ['accountId' => 'alias', 'message' => $newer, 'expectedVersion' => null]);
$beforeDiscovery = $discoveryPdo->query('SELECT * FROM message_history')->fetchAll(PDO::FETCH_ASSOC);
$discovery = NativeCloudHistory::read($discoveryPdo, $session, ['accountId' => 'one', 'kind' => 'conversations', 'limit' => '32']);
nativeHistoryCheck(array_keys($discovery) === ['ok', 'accountId', 'owner', 'saveChat', 'conversations']
    && count($discovery['conversations']) === 32, 'Discovery contract and bound');
nativeHistoryCheck(array_slice($discovery['conversations'], 0, 3) === [
    ['peer' => 'peer-39@example.test', 'kind' => 'group', 'name' => 'Updated name'],
    ['peer' => 'peer-39@example.test', 'kind' => 'contact', 'name' => 'Updated name'],
    ['peer' => 'peer-40@example.test', 'kind' => 'contact', 'name' => 'Name 40'],
], 'Discovery is distinct by peer/kind, newest timestamp/id and latest name');
nativeHistoryCheck(!in_array('private@example.test', array_column($discovery['conversations'], 'peer'), true), 'Discovery excludes other account and same-JID alias');
nativeHistoryCheck($beforeDiscovery === $discoveryPdo->query('SELECT * FROM message_history')->fetchAll(PDO::FETCH_ASSOC), 'Discovery has no mutation/retraction/retention side effects');
nativeHistoryCheck(count(NativeCloudHistory::read($discoveryPdo, $session,
    ['accountId' => 'one', 'kind' => 'conversations', 'limit' => '500'])['conversations']) === 32, 'Discovery hard max 32');
nativeHistoryCheck(count(NativeCloudHistory::read($discoveryPdo, $session,
    ['accountId' => 'one', 'kind' => 'conversations', 'limit' => '1'])['conversations']) === 1, 'Discovery smaller requested limit');
foreach (['peer' => 'peer@example.test', 'before' => 'not-supported'] as $key => $value) {
    nativeHistoryFails(fn() => NativeCloudHistory::read($discoveryPdo, $session,
        ['accountId' => 'one', 'kind' => 'conversations', $key => $value]), 'cloud_history_invalid_request', 400);
}
$discoveryPdo->exec("UPDATE account_profiles SET save_chat_history = 0 WHERE account_id = 'one'");
nativeHistoryCheck(NativeCloudHistory::read($discoveryPdo, $session,
    ['accountId' => 'one', 'kind' => 'conversations'])['saveChat'] === false, 'Discovery reports disabled saving without deleting/hiding history');
$origin = ['HTTP_HOST' => 'example.test:8443', 'HTTPS' => 'on'];
NativeCloudHistory::sameOrigin($origin);
NativeCloudHistory::sameOrigin($origin + ['HTTP_ORIGIN' => 'https://example.test:8443', 'HTTP_SEC_FETCH_SITE' => 'same-origin']);
foreach ([['HTTP_ORIGIN' => 'https://evil.test'], ['HTTP_ORIGIN' => 'null'], ['HTTP_SEC_FETCH_SITE' => 'same-site']] as $bad) {
    nativeHistoryFails(fn() => NativeCloudHistory::sameOrigin($origin + $bad), 'cloud_history_origin_denied', 403);
}
echo "Native cloud history: mapping, isolation, CAS, metadata, terminal state, preferences, cursors, discovery and byte bounds passed\n";
