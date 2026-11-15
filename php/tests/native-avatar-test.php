<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/NativeAvatarService.php';
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT, display_name TEXT, avatar_color TEXT, avatar_data_url TEXT, password_hash TEXT)');
$pdo->exec("INSERT INTO account_profiles VALUES ('one','one@localhost','One','#2563eb','','unchanged'), ('two','two@localhost','Two','#2563eb','','other')");
$checks = 0;
$check = function (bool $condition) use (&$checks): void { if (!$condition) throw new RuntimeException('Avatar check failed'); $checks++; };
$png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6lvkAAAAASUVORK5CYII=';
$saved = NativeAvatarService::update($pdo, 'one', ['avatarDataUrl' => $png]);
$check($saved['jid'] === 'one@localhost' && $saved['avatarDataUrl'] === $png);
$check(NativeAvatarService::read($pdo, 'two')['avatarDataUrl'] === '');
$check($pdo->query("SELECT password_hash FROM account_profiles WHERE account_id='one'")->fetchColumn() === 'unchanged');
foreach ([['avatarDataUrl' => $png, 'accountId' => 'two'], ['avatarDataUrl' => $png, 'displayName' => 'Changed'],
    ['avatarDataUrl' => 1], ['avatarDataUrl' => 'https://foreign.invalid/photo.png'], ['avatarDataUrl' => 'data:image/svg+xml;base64,PHN2Zz4='],
    ['avatarDataUrl' => 'data:image/jpeg;base64,' . substr($png, strpos($png, ',') + 1)], ['avatarDataUrl' => 'data:image/png;base64,AAAA'],
    ['avatarDataUrl' => str_repeat('x', 524289)], []] as $bad) {
    try { NativeAvatarService::update($pdo, 'one', $bad); throw new RuntimeException('Bad image accepted'); }
    catch (InvalidArgumentException $expected) { $check(true); }
    $check(NativeAvatarService::read($pdo, 'one')['avatarDataUrl'] === $png);
}
$check(NativeAvatarService::update($pdo, 'one', ['avatarDataUrl' => ''])['avatarDataUrl'] === '');
$check(NativeAvatarService::read($pdo, 'one')['displayName'] === 'One');
echo "Native avatar service passed: {$checks} checks; isolated SQLite, no real profiles.\n";
