<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/AdminAccountActions.php';

$checks = 0;
function checkAccountAction(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function rejectedAccountAction(callable $operation, string $message): void
{
    try { $operation(); } catch (AccountAccessDenied | InvalidArgumentException $error) { checkAccountAction(true, $message); return; }
    checkAccountAction(false, $message);
}

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE account_profiles (
    account_id TEXT PRIMARY KEY, jid TEXT, display_name TEXT, provider_id TEXT DEFAULT "local",
    preferred_language TEXT DEFAULT "nl", phone_number TEXT DEFAULT "", created_at TEXT,
    updated_at TEXT, subscription_plan TEXT DEFAULT "free", account_status TEXT DEFAULT "active",
    subscription_expires_at TEXT, admin_note TEXT
)');
$pdo->exec('CREATE TABLE admin_audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT, action TEXT, target_account_id TEXT, created_at TEXT)');
$pdo->exec("INSERT INTO account_profiles (account_id, jid, display_name) VALUES ('alice', 'alice@example.test', 'Alice'), ('bob', 'bob@example.test', 'Bob')");
AccountAccess::ensureSchema($pdo);
$manager = new AdminAccountActions($pdo);
$admin = ['admin_id' => 'fixture-admin', 'role' => 'admin', 'enabled' => 1, 'password_hash' => password_hash('fixture-password', PASSWORD_DEFAULT)];
$request = fn(string $operation, array $targets, string $password = 'fixture-password'): array => [
    'operation' => $operation, 'targets' => $targets, 'confirmed' => true, 'adminPassword' => $password,
];

$result = $manager->apply($request('block', [['accountId' => 'alice', 'version' => 1], ['accountId' => 'bob', 'version' => 1]]), $admin);
checkAccountAction($result === ['changed' => 2, 'selected' => 2], 'Block both selected accounts');
checkAccountAction(!AccountAccess::allowed($pdo, 'alice'), 'Blocked account denied');
checkAccountAction((int)AccountAccess::state($pdo, 'alice')['version'] === 2, 'Block revokes existing sessions');
rejectedAccountAction(fn() => $manager->apply($request('unblock', [['accountId' => 'alice', 'version' => 1]]), $admin), 'Reject stale version');
rejectedAccountAction(fn() => $manager->apply($request('unblock', [['accountId' => 'alice', 'version' => 2]], 'wrong-password'), $admin), 'Require admin password');
$manager->apply($request('unblock', [['accountId' => 'alice', 'version' => 2]]), $admin);
checkAccountAction(AccountAccess::allowed($pdo, 'alice'), 'Unblock account');
checkAccountAction(!AccountAccess::versionAllowed($pdo, 'alice', 1), 'Old sessions remain invalid after unblock');
$manager->apply($request('trash', [['accountId' => 'alice', 'version' => 3]]), $admin);
checkAccountAction(AccountAccess::state($pdo, 'alice')['trashed_at'] !== null, 'Move to recoverable trash');
rejectedAccountAction(fn() => $manager->apply($request('block', [['accountId' => 'alice', 'version' => 4]]), $admin), 'Cannot change block while trashed');
$manager->apply($request('restore', [['accountId' => 'alice', 'version' => 4]]), $admin);
checkAccountAction(AccountAccess::allowed($pdo, 'alice'), 'Restore from trash');
$session = [];
AccountAccess::bind($pdo, 'alice', $session);
checkAccountAction($session['teletyptel_access_version'] === 5, 'Bind current access version to a session');
$manager->apply($request('trash', [['accountId' => 'bob', 'version' => 2]]), $admin);
$manager->apply($request('restore', [['accountId' => 'bob', 'version' => 3]]), $admin);
checkAccountAction(!AccountAccess::allowed($pdo, 'bob'), 'Restore preserves prior block');
$actions = $pdo->query('SELECT action FROM admin_audit_log ORDER BY id')->fetchAll(PDO::FETCH_COLUMN);
checkAccountAction(in_array('account_block', $actions, true) && in_array('account_trash', $actions, true) && in_array('account_restore', $actions, true), 'Audit all account actions');
rejectedAccountAction(fn() => $manager->apply($request('trash', [['accountId' => 'missing', 'version' => 1]]), $admin), 'Reject missing target atomically');
$manager->apply($request('trash', [['accountId' => 'alice', 'version' => 5]]), $admin);
$session['teletyptel_account_id'] = 'alice';
rejectedAccountAction(function () use ($pdo, &$session): void { AccountAccess::guardSession($pdo, $session); }, 'Trash revokes an existing web session');
checkAccountAction(!isset($session['teletyptel_account_id'], $session['teletyptel_access_version']), 'Revoked session data is cleared');
$directory = new AdminUserDirectory($pdo);
checkAccountAction(array_column($directory->users('', '')['items'], 'account_id') === ['bob'], 'Default list excludes trash');
checkAccountAction(array_column($directory->users('', 'trash')['items'], 'account_id') === ['alice'], 'Trash filter lists recoverable accounts');
checkAccountAction(array_column($directory->users('', 'blocked')['items'], 'account_id') === ['bob'], 'Blocked filter lists blocked non-trash accounts');

echo "Admin account actions: $checks checks passed; in-memory only.\n";
