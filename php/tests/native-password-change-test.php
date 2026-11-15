<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/NativeAccountPasswordChange.php';

$existing = ['accountId' => 'fictional', 'jid' => 'owner@localhost', 'displayName' => 'Keep this name',
    'phoneNumber' => '+31000000000', 'birthDate' => '2000-01-01', 'providerId' => 'google',
    'accessibilityProfileId' => 'custom', 'preferredLanguage' => 'en', 'liveRttEnabled' => false,
    'showSmileys' => false, 'sessionTimeoutEnabled' => false, 'rememberPassword' => true,
    'relayWebSocket' => 'wss://relay.invalid/', 'xmppWebSocket' => 'wss://example.invalid/xmpp-websocket',
    'xmppHost' => 'custom.invalid', 'xmppPort' => 5223, 'xmppDomain' => 'localhost', 'xmppTlsMode' => 'websocket',
    'peer' => 'peer@localhost', 'avatarDataUrl' => 'data:image/jpeg;base64,' . str_repeat('A', 50000), 'avatarColor' => '#abcdef',
    'twoFactorEnabled' => true, 'password' => 'NeverForwardThisOldSecret'];
$requested = ['accountId' => 'fictional', 'jid' => 'owner@localhost', 'currentPassword' => 'OldFictional123!',
    'password' => 'NewFictional123!', 'displayName' => 'Must not overwrite', 'providerId' => 'example-provider',
    'rememberPassword' => false, 'twoFactorEnabled' => false];
$result = NativeAccountPasswordChange::input($existing, $requested);
foreach ($existing as $key => $value) {
    if (in_array($key, ['twoFactorEnabled', 'password'], true)) {
        continue;
    }
    if (($result[$key] ?? null) !== $value) {
        throw new RuntimeException('Password change modified profile field: ' . $key);
    }
}
if (isset($result['twoFactorEnabled']) || $result['password'] !== $requested['password'] || $result['action'] !== 'save') {
    throw new RuntimeException('Unsafe password change mapping');
}
foreach ([['password' => 'short'], ['currentPassword' => ''], ['password' => 'NewFictional123! '],
    ['password' => 'OldFictional123!'], ['accountId' => 'someone-else'], ['jid' => 'other@localhost']] as $changed) {
    try {
        NativeAccountPasswordChange::input($existing, array_merge($requested, $changed));
        throw new RuntimeException('Invalid password change accepted');
    } catch (InvalidArgumentException) {
    }
}
echo "Native password change preserves profile, avatar, provider, XMPP and storage settings; invalid input rejected.\n";
