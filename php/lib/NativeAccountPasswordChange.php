<?php
declare(strict_types=1);

final class NativeAccountPasswordChange
{
    public static function input(array $existing, array $requested): array
    {
        $current = $requested['currentPassword'] ?? null;
        $password = $requested['password'] ?? null;
        if (!is_string($current) || $current === '' || strlen($current) > 1024
            || !is_string($password) || strlen($password) > 1024 || mb_strlen($password, 'UTF-8') < 10
            || preg_match('//u', $password) !== 1 || trim($password) !== $password || preg_match('/[\x00-\x1F\x7F]/', $password)
            || !preg_match('/[a-z]/', $password) || !preg_match('/[A-Z]/', $password)
            || !preg_match('/[0-9]/', $password) || !preg_match('/[^A-Za-z0-9]/', $password)
            || hash_equals($current, $password)
            || !is_string($existing['accountId'] ?? null) || !is_string($existing['jid'] ?? null)
            || !is_string($requested['accountId'] ?? null) || !is_string($requested['jid'] ?? null)
            || !hash_equals($existing['accountId'], $requested['accountId'])
            || !hash_equals($existing['jid'], $requested['jid'])) {
            throw new InvalidArgumentException('Invalid password change');
        }
        $fields = ['accountId', 'jid', 'displayName', 'rememberPassword', 'phoneNumber', 'birthDate', 'providerId',
            'accessibilityProfileId', 'preferredLanguage', 'liveRttEnabled', 'showSmileys', 'sessionTimeoutEnabled',
            'relayWebSocket', 'xmppWebSocket', 'xmppHost', 'xmppPort', 'xmppDomain', 'xmppTlsMode', 'peer',
            'avatarDataUrl', 'avatarColor'];
        return array_merge(array_intersect_key($existing, array_fill_keys($fields, true)), [
            'action' => 'save', 'currentPassword' => $current, 'password' => $password,
        ]);
    }
}
