<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/SupportChatService.php';
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE admin_users (admin_id TEXT PRIMARY KEY, display_name TEXT, role TEXT, enabled INTEGER, session_version INTEGER)');
foreach (['staff1' => 'staff', 'staff2' => 'staff', 'owner' => 'owner', 'outsider' => 'viewer'] as $identifier => $role) {
    $pdo->prepare('INSERT INTO admin_users VALUES (?, ?, ?, 1, 1)')->execute([$identifier, ucfirst($identifier), $role]);
}
$service = new SupportChatService($pdo);
$service->ensureSchema();
$checks = 0;
function verify(bool $condition, string $label): void { global $checks; if (!$condition) throw new RuntimeException($label); $checks++; }
function denied(callable $action, int $status, string $label): void {
    try { $action(); } catch (SupportChatFailure $error) { verify($error->status === $status, $label); return; }
    throw new RuntimeException('Expected denial: ' . $label);
}
function sessionFor(string $identifier): array { return ['teletyptel_admin_id' => $identifier, 'teletyptel_admin_last_activity' => time(), 'teletyptel_admin_session_version' => 1]; }
$session = sessionFor('staff1'); $staff1 = SupportChatService::staff($pdo, $session);
$session = sessionFor('staff2'); $staff2 = SupportChatService::staff($pdo, $session);
$session = sessionFor('owner'); $owner = SupportChatService::staff($pdo, $session);
$empty = [];
denied(fn() => SupportChatService::staff($pdo, $empty), 401, 'Anonymous cannot enter staff inbox');
$session = sessionFor('outsider');
denied(fn() => SupportChatService::staff($pdo, $session), 401, 'Other roles denied');
verify(!$service->visitorView('visitor-one')['available'], 'No fake online status');
$service->staffAction($staff1, ['action' => 'presence', 'available' => true]);
verify($service->visitorView('visitor-one')['available'], 'Explicit staff availability shown');
$pdo->exec('UPDATE support_chat_presence SET seen = seen - 46');
verify(!$service->visitorView('visitor-one')['available'], 'Stale presence expires');
$service->staffView($staff1);
verify($service->visitorView('visitor-one')['available'], 'Heartbeat renews chosen availability');
denied(fn() => $service->visitorAction('visitor-one', '127.0.0.1', ['action' => 'start', 'name' => 'Sam']), 400, 'Privacy notice acknowledgement required');
denied(fn() => $service->visitorAction('visitor-one', '127.0.0.1', ['action' => 'start', 'name' => str_repeat('a', 81), 'acknowledged' => true]), 400, 'Name length bounded');
$request = ['action' => 'start', 'name' => 'Sam <script>', 'acknowledged' => true];
$identifier = $service->visitorAction('visitor-one', '127.0.0.1', $request)['threadId'];
verify($service->visitorAction('visitor-one', '127.0.0.1', $request)['threadId'] === $identifier, 'Double start is idempotent');
verify($service->visitorView('visitor-one')['thread']['status'] === 'waiting', 'Visitor starts in queue');
denied(fn() => $service->visitorView('visitor-two', $identifier), 404, 'Another visitor cannot read transcript');
denied(fn() => $service->visitorAction('visitor-two', '127.0.0.1', ['action' => 'close', 'threadId' => $identifier]), 404, 'Another visitor cannot close');
$message = ['action' => 'send', 'threadId' => $identifier, 'clientId' => 'fixture-message-one', 'text' => 'Hoi 👋 <img src=x onerror=alert(1)>'];
$service->visitorAction('visitor-one', '127.0.0.1', $message);
$service->visitorAction('visitor-one', '127.0.0.1', $message);
verify(count($service->visitorView('visitor-one')['messages']) === 1, 'Retry produces exactly one message');
verify($service->visitorView('visitor-one')['messages'][0]['text'] === $message['text'], 'Text stored literally for safe textContent rendering');
denied(fn() => $service->staffView($staff1, $identifier), 403, 'Unassigned staff cannot read');
$queue = $service->staffView($staff1);
verify(count($queue['threads']) === 1 && !$queue['threads'][0]['canRead'], 'Queue metadata available without transcript');
verify(!isset($queue['threads'][0]['visitor_id']) && !isset($queue['threads'][0]['staff_id']), 'Queue does not expose auth identifiers');
$service->staffAction($staff1, ['action' => 'claim', 'threadId' => $identifier]);
denied(fn() => $service->staffAction($staff2, ['action' => 'claim', 'threadId' => $identifier]), 409, 'Second claimant rejected');
verify(count($service->staffView($staff1, $identifier)['messages']) === 1, 'Assigned staff can read');
denied(fn() => $service->staffView($staff2, $identifier), 403, 'Other staff denied');
denied(fn() => $service->staffAction($staff2, ['action' => 'send', 'threadId' => $identifier, 'text' => 'No', 'clientId' => 'fixture-forbidden']), 403, 'Other staff cannot answer');
$service->staffAction($staff1, ['action' => 'send', 'threadId' => $identifier, 'text' => 'Hallo Sam!', 'clientId' => 'fixture-staff-one']);
$view = $service->visitorView('visitor-one');
verify(count($view['messages']) === 2 && $view['messages'][1]['kind'] === 'staff', 'Visitor receives real staff reply');
verify($view['thread']['staffName'] === 'Staff1' && $view['thread']['staffOnline'], 'Assigned staff name and presence returned');
verify(count($service->staffView($owner, $identifier)['messages']) === 2, 'Owner may inspect for support');
denied(fn() => $service->staffAction($owner, ['action' => 'send', 'threadId' => $identifier, 'text' => 'No', 'clientId' => 'fixture-owner-no']), 403, 'Owner cannot impersonate assigned staff');
$pdo->exec("UPDATE admin_users SET enabled = 0, session_version = 2 WHERE admin_id = 'staff1'");
denied(fn() => $service->staffView($staff1, $identifier), 401, 'Blocked staff loses access immediately');
denied(fn() => $service->staffAction($staff1, ['action' => 'send', 'threadId' => $identifier, 'text' => 'No', 'clientId' => 'fixture-blocked-no']), 401, 'Blocked staff cannot send');
$service->cleanup();
verify($service->visitorView('visitor-one')['thread']['status'] === 'waiting', 'Blocked assignment returns to queue');
verify(!$service->visitorView('visitor-one')['available'], 'Blocked staff not shown online');
$service->staffAction($staff2, ['action' => 'claim', 'threadId' => $identifier]);
$service->staffAction($staff2, ['action' => 'release', 'threadId' => $identifier]);
verify($service->visitorView('visitor-one')['thread']['status'] === 'waiting', 'Staff can release to queue');
$service->staffAction($staff2, ['action' => 'claim', 'threadId' => $identifier]);
denied(fn() => $service->visitorAction('visitor-one', '127.0.0.1', array_replace($message, ['text' => str_repeat('a', 2001), 'clientId' => 'fixture-too-long'])), 400, 'Message length bounded');
for ($number = 0; $number < 29; $number++) $service->visitorAction('visitor-one', '127.0.0.1', array_replace($message, ['text' => 'Rate test', 'clientId' => 'fixture-rate-' . str_pad((string)$number, 5, '0', STR_PAD_LEFT)]));
denied(fn() => $service->visitorAction('visitor-one', '127.0.0.1', array_replace($message, ['clientId' => 'fixture-rate-excess'])), 429, 'Visitor message rate limited');
$service->visitorAction('visitor-one', '127.0.0.1', ['action' => 'close', 'threadId' => $identifier]);
verify($service->visitorView('visitor-one')['thread']['status'] === 'closed', 'Visitor can close own chat');
denied(fn() => $service->staffAction($staff2, ['action' => 'send', 'threadId' => $identifier, 'text' => 'No', 'clientId' => 'fixture-closed-no']), 409, 'Closed chat rejects messages');
verify(count($service->staffView($staff2, '', 1, 'closed')['threads']) === 1, 'Staff sees own closed chat');
$pdo->exec('UPDATE support_chat_threads SET closed_at = ' . (time() - 31 * 86400));
verify($service->cleanup()['removed'] === 1, 'Expired transcript purged');
verify((int)$pdo->query('SELECT COUNT(*) FROM support_chat_messages')->fetchColumn() === 0, 'Message bodies purged');
verify((int)$pdo->query('SELECT COUNT(*) FROM support_chat_audit')->fetchColumn() === 0, 'Associated audit purged');
verify($service->visitorView('visitor-one')['thread'] === null, 'Expired chat no longer visible');
$identifier = $service->visitorAction('visitor-one', '127.0.0.2', $request)['threadId'];
$pdo->exec('UPDATE support_chat_threads SET updated = ' . (time() - 86401));
$service->cleanup();
verify($service->visitorView('visitor-one')['thread']['status'] === 'closed', 'Abandoned chat closes after 24 hours');
for ($number = 0; $number < 5; $number++) $service->visitorAction('rate-visitor-' . $number, '127.0.0.99', $request);
denied(fn() => $service->visitorAction('rate-extra', '127.0.0.99', $request), 429, 'New visitor sessions cannot bypass per-address limit');
verify(!str_contains(json_encode($pdo->query('SELECT * FROM support_chat_limits')->fetchAll(PDO::FETCH_ASSOC)), '127.0.0.'), 'No raw network addresses in rate-limit storage');
echo 'Support chat passed: ' . $checks . " checks; isolated SQLite, no live visitors or staff.\n";
