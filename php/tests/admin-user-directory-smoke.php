<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/AdminUserDirectory.php';

$checks = 0;

function check(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

function rejects(callable $operation, string $message): void
{
    try {
        $operation();
    } catch (InvalidArgumentException $error) {
        check(true, $message);
        return;
    }
    check(false, $message);
}

function fixtureDatabase(bool $withHistory = true): PDO
{
    $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec("CREATE TABLE account_profiles (
        account_id TEXT PRIMARY KEY, jid TEXT, display_name TEXT, provider_id TEXT DEFAULT 'local',
        preferred_language TEXT DEFAULT 'nl', phone_number TEXT DEFAULT '', created_at TEXT,
        updated_at TEXT, subscription_plan TEXT DEFAULT 'free', account_status TEXT DEFAULT 'active',
        subscription_expires_at TEXT, admin_note TEXT, password_secret TEXT DEFAULT 'PRIVATE_SECRET',
        password_hash TEXT DEFAULT 'PRIVATE_HASH'
    )");
    $pdo->exec("CREATE TABLE admin_audit_log (
        id INTEGER PRIMARY KEY, actor_id TEXT, action TEXT, target_account_id TEXT, created_at TEXT
    )");
    if ($withHistory) {
        $pdo->exec("CREATE TABLE account_identities (
            account_id TEXT, provider TEXT, provider_subject TEXT DEFAULT 'PRIVATE_SUBJECT',
            email TEXT, email_verified INTEGER, linked_at TEXT, last_used_at TEXT
        )");
        $pdo->exec("CREATE TABLE message_history (
            id INTEGER PRIMARY KEY, account_id TEXT, conversation_peer TEXT, conversation_name TEXT,
            conversation_kind TEXT, direction TEXT, status TEXT, message_timestamp TEXT,
            text TEXT DEFAULT 'PRIVATE_MESSAGE', attachment_json TEXT DEFAULT 'PRIVATE_ATTACHMENT',
            location_json TEXT DEFAULT 'PRIVATE_LOCATION'
        )");
        $pdo->exec("CREATE TABLE conversation_history (
            id INTEGER PRIMARY KEY, account_id TEXT, conversation_peer TEXT, conversation_name TEXT,
            conversation_kind TEXT, direction TEXT, status TEXT, started_at TEXT, ended_at TEXT,
            call_type TEXT, duration_seconds INTEGER, transcript_json TEXT DEFAULT 'PRIVATE_TRANSCRIPT'
        )");
        $pdo->exec('CREATE TABLE uploaded_files (uploader_account_id TEXT)');
    }
    $statement = $pdo->prepare('INSERT INTO account_profiles
        (account_id, jid, display_name, account_status) VALUES (?, ?, ?, ?)');
    $statement->execute(['alice', 'alice@example.test', 'Alice 100%_!', 'active']);
    $statement->execute(['bob', 'bob@example.test', 'Bob', 'suspended']);
    if ($withHistory) {
        $statement = $pdo->prepare('INSERT INTO account_identities
            (account_id, provider, email, email_verified, last_used_at) VALUES (?, ?, ?, ?, ?)');
        $statement->execute(['alice', 'google', 'alice.mail@example.test', 1, '2026-01-02 12:00:00']);
        $statement->execute(['alice', 'local', 'second@example.test', 0, '2026-01-03 12:00:00']);
        $statement->execute(['bob', 'google', 'bob.mail@example.test', 1, '2026-01-01 12:00:00']);
        $pdo->exec("INSERT INTO uploaded_files VALUES ('alice')");
    }
    return $pdo;
}

function addMessage(PDO $pdo, string $accountId, string $peer, string $kind, string $direction, string $time): void
{
    $pdo->prepare('INSERT INTO message_history
        (account_id, conversation_peer, conversation_name, conversation_kind, direction, status, message_timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?)')->execute([$accountId, $peer, 'Test conversation', $kind, $direction, 'sent', $time]);
}

$pdo = fixtureDatabase();
addMessage($pdo, 'alice', 'bob@example.test', 'contact', 'self', '2026-01-01 00:00:00.000');
addMessage($pdo, 'alice', 'bob@example.test', 'contact', 'peer', '2026-01-01 23:59:59.999');
addMessage($pdo, 'alice', 'room@conference.example.test', 'group', 'self', '2026-01-02 00:00:00.000');
addMessage($pdo, 'bob', 'outsider@example.test', 'contact', 'self', '2026-01-01 12:00:00.000');
$pdo->exec("INSERT INTO conversation_history
    (account_id, conversation_peer, conversation_name, conversation_kind, direction, status, started_at, ended_at, call_type, duration_seconds)
    VALUES ('alice', 'bob@example.test', 'Bob', 'contact', 'peer', 'ended', '2026-01-01 12:00:00', '2026-01-01 12:01:00', 'audio', 60)");

$directory = new AdminUserDirectory($pdo);
$users = $directory->users();
check($users['total'] === 2 && count($users['items']) === 2, 'User count and list');
check($directory->users('alice.mail')['total'] === 1, 'Email search');
check($directory->users('ALICE')['total'] === 1, 'Case-insensitive search');
check($directory->users('100%_!')['total'] === 1, 'Literal wildcard search');
check($directory->users('%')['total'] === 1, 'Percent is not a wildcard');
check($directory->users("' OR 1=1 --")['total'] === 0, 'SQL injection search is literal');
check($directory->users('', 'suspended')['items'][0]['account_id'] === 'bob', 'Status filter');
check($directory->users('alice', 'suspended')['total'] === 0, 'Search and status intersect');
check($directory->users('', '', 999, 1)['page'] === 2, 'User pagination clamped');
check($directory->users('', '', -1, 999)['pageSize'] === 100, 'User page size capped');
rejects(fn() => $directory->users('', 'invalid'), 'Invalid user status');
$account = $directory->user('alice');
check($account !== null && count($account['identities']) === 2, 'Scoped identity list without duplicates');
check($account['last_login_at'] === '2026-01-03 12:00:00', 'Most recent identity activity');
check((int)$account['message_count'] === 3 && (int)$account['upload_count'] === 1, 'Usage counts');
check(!array_key_exists('password_hash', $account) && !array_key_exists('password_secret', $account), 'No credential fields');
check(!array_key_exists('provider_subject', $account['identities'][0]), 'No provider subject');
check($directory->user('missing') === null, 'Unknown account');
check($directory->user("alice' OR 1=1 --") === null, 'Account SQL injection rejected by binding');
$activity = $directory->activity('alice');
check($activity['total'] === 4 && count($activity['conversations']) === 2, 'Combined message and call metadata');
check(count($activity['sources']) === 2, 'History sources reported');
check($activity['items'][0]['conversation_kind'] === 'group', 'Newest event first');
$conversation = array_values(array_filter($activity['conversations'], fn(array $entry): bool => $entry['conversation_peer'] === 'bob@example.test'))[0];
check((int)$conversation['message_count'] === 2 && (int)$conversation['call_count'] === 1, 'Conversation totals');
check((int)$conversation['sent_count'] === 1 && (int)$conversation['received_count'] === 1, 'Message directions');
$encoded = json_encode([$users, $account, $activity], JSON_THROW_ON_ERROR);
check(!str_contains($encoded, 'PRIVATE_'), 'No sensitive fixture content returned');
check(!str_contains(json_encode($activity, JSON_THROW_ON_ERROR), 'outsider@'), 'Other account activity excluded');
check($directory->activity('missing')['total'] === 0, 'Missing account has no activity');
check($directory->activity('alice', ['from' => '2026-01-01', 'to' => '2026-01-01'])['total'] === 3, 'Inclusive end day with milliseconds');
check($directory->activity('alice', ['from' => '2026-01-02'])['total'] === 1, 'From-only filter');
check($directory->activity('alice', ['to' => '2025-12-31'])['total'] === 0, 'To-only filter');
check($directory->activity('alice', ['kind' => 'group'])['total'] === 1, 'Group filter');
check($directory->activity('alice', ['kind' => 'contact'])['total'] === 3, 'Private filter');
check($directory->activity('alice', ['peer' => 'bob@example.test'])['total'] === 3, 'Exact peer filter');
check($directory->activity('alice', ['peer' => 'bob'])['total'] === 0, 'Peer filter is not partial');
check($directory->activity('alice', ['peer' => "' OR 1=1 --"])['total'] === 0, 'Peer injection is literal');
check($directory->activity('alice', ['kind' => 'group', 'to' => '2026-01-01'])['total'] === 0, 'Activity filters intersect');
check($directory->activity('alice', ['from' => '2024-02-29', 'to' => '2024-02-29'])['total'] === 0, 'Valid leap day accepted');
foreach (['2026-02-29', '2026-13-01', '01-01-2026', '2026-1-1', 'nonsense'] as $invalidDate) {
    rejects(fn() => $directory->activity('alice', ['from' => $invalidDate]), 'Invalid date rejected');
}
rejects(fn() => $directory->activity('alice', ['from' => '2026-02-01', 'to' => '2026-01-01']), 'Reversed dates');
rejects(fn() => $directory->activity('alice', ['kind' => 'invalid']), 'Invalid conversation kind');
rejects(fn() => $directory->activity('alice', ['peer' => str_repeat('a', 256)]), 'Oversize peer');

for ($index = 0; $index < 105; $index++) {
    addMessage($pdo, 'alice', "peer-$index@example.test", 'contact', 'self', '2026-02-01 00:00:00');
}
$firstPage = $directory->activity('alice');
$secondPage = $directory->activity('alice', ['page' => 2]);
check(count($firstPage['items']) === 50 && count($secondPage['items']) === 50, 'Activity page sizes');
check(count(array_intersect(array_column($firstPage['items'], 'event_id'), array_column($secondPage['items'], 'event_id'))) === 0, 'Stable tied timestamp pagination');
check($directory->activity('alice', ['page' => 999])['page'] === 3, 'Activity page clamped');
check(count($firstPage['conversations']) === 100 && $firstPage['conversationsTruncated'], 'Conversation summary capped and flagged');
$directory->recordAccess('test-admin', 'view_user_activity', 'alice');
$audit = $pdo->query('SELECT * FROM admin_audit_log')->fetch(PDO::FETCH_ASSOC);
check($audit['actor_id'] === 'test-admin' && $audit['target_account_id'] === 'alice', 'Audit actor and target recorded');
check($audit['action'] === 'view_user_activity' && $audit['created_at'] !== '', 'Audit action and time');

$minimal = new AdminUserDirectory(fixtureDatabase(false));
check($minimal->users()['total'] === 2, 'Directory without optional tables');
check($minimal->users('Alice')['total'] === 1, 'Search without identities');
check($minimal->user('alice')['identities'] === [], 'Empty identity list');
check($minimal->activity('alice')['sources'] === [] && $minimal->activity('alice')['total'] === 0, 'No history available');
check((int)$minimal->user('alice')['message_count'] === 0, 'Absent history count is zero');
$pdo->exec('DROP TABLE message_history');
$callsOnly = new AdminUserDirectory($pdo);
check($callsOnly->activity('alice')['total'] === 1, 'Calls-only history works');
check($callsOnly->activity('alice')['sources'] === ['conversation_history'], 'Missing message table reported');
$pdo->exec('DROP TABLE conversation_history');
$pdo->exec('CREATE TABLE message_history (id INTEGER)');
try {
    (new AdminUserDirectory($pdo))->activity('alice');
    check(false, 'Broken schemas must not look like empty logs');
} catch (PDOException $error) {
    check(true, 'Broken schemas raise database errors');
}

echo "Admin user directory smoke: $checks checks passed.\n";
