<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/NativeProfileService.php';
function check(bool $condition): void { if (!$condition) { throw new RuntimeException('Native profile assertion failed'); } }
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT, display_name TEXT, phone_number TEXT, preferred_language TEXT, avatar_color TEXT, password_hash TEXT, xmpp_host TEXT)');
$pdo->exec("INSERT INTO account_profiles VALUES ('one','one@localhost','One','','nl','#2563eb','unchanged-password','unchanged-host'), ('two','two@localhost','Two','','en','#2563eb','second-password','second-host')");
$input = ['displayName' => 'Nieuwe naam', 'phoneNumber' => '+31612345678', 'preferredLanguage' => 'en', 'avatarColor' => '#AABBCC'];
$profile = NativeProfileService::update($pdo, 'one', $input);
check($profile['displayName'] === 'Nieuwe naam' && $profile['avatarColor'] === '#aabbcc' && !isset($profile['password_hash']));
check(NativeProfileService::read($pdo, 'two')['displayName'] === 'Two');
check($pdo->query("SELECT password_hash FROM account_profiles WHERE account_id='one'")->fetchColumn() === 'unchanged-password');
check($pdo->query("SELECT xmpp_host FROM account_profiles WHERE account_id='one'")->fetchColumn() === 'unchanged-host');
foreach ([array_merge($input, ['jid' => 'two@localhost']), array_merge($input, ['preferredLanguage' => 'invalid']), array_merge($input, ['displayName' => "bad\nname"])] as $bad) {
    try { NativeProfileService::update($pdo, 'one', $bad); throw new RuntimeException('Invalid profile accepted'); } catch (InvalidArgumentException $expected) {}
}
$session = [];
$csrf = NativeProfileService::csrf($session);
check(strlen($csrf) === 64 && NativeProfileService::checkCsrf($session, $csrf));
check(!NativeProfileService::checkCsrf([], $csrf) && !NativeProfileService::checkCsrf($session, str_repeat('b', 64)));
echo "Native profile isolation, field whitelist and CSRF tests passed\n";
