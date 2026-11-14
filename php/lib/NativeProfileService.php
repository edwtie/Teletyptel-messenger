<?php
declare(strict_types=1);

final class NativeProfileService
{
    public const LANGUAGES = ['nl', 'en', 'de', 'fr', 'es', 'it', 'pt', 'pl', 'tr', 'ar', 'uk', 'zh-CN'];

    public static function read(PDO $pdo, string $accountId): array
    {
        $statement = $pdo->prepare('SELECT account_id, jid, display_name, phone_number, preferred_language, avatar_color FROM account_profiles WHERE account_id = :id');
        $statement->execute(['id' => $accountId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            throw new RuntimeException('Profile unavailable');
        }
        return ['accountId' => $row['account_id'], 'jid' => $row['jid'], 'displayName' => $row['display_name'],
            'phoneNumber' => $row['phone_number'], 'preferredLanguage' => $row['preferred_language'], 'avatarColor' => $row['avatar_color']];
    }

    public static function update(PDO $pdo, string $accountId, array $input): array
    {
        $keys = ['displayName', 'phoneNumber', 'preferredLanguage', 'avatarColor'];
        if (array_diff(array_keys($input), $keys) || count($input) !== count($keys)) {
            throw new InvalidArgumentException('Invalid profile fields');
        }
        foreach ($keys as $key) {
            if (!is_string($input[$key]) || preg_match('/[\x00-\x1f\x7f]/', $input[$key])) {
                throw new InvalidArgumentException('Invalid profile text');
            }
        }
        $name = trim($input['displayName']);
        if ($name === '' || strlen($name) > 120 || strlen($input['phoneNumber']) > 64
            || !in_array($input['preferredLanguage'], self::LANGUAGES, true)
            || !preg_match('/^#[0-9a-f]{6}$/iD', $input['avatarColor'])) {
            throw new InvalidArgumentException('Invalid profile values');
        }
        $statement = $pdo->prepare('UPDATE account_profiles SET display_name = :name, phone_number = :phone, preferred_language = :language, avatar_color = :color WHERE account_id = :id');
        $statement->execute(['name' => $name, 'phone' => $input['phoneNumber'], 'language' => $input['preferredLanguage'],
            'color' => strtolower($input['avatarColor']), 'id' => $accountId]);
        return self::read($pdo, $accountId);
    }

    public static function csrf(array &$session): string
    {
        if (!isset($session['teletyptel_native_csrf'])) {
            $session['teletyptel_native_csrf'] = bin2hex(random_bytes(32));
        }
        return (string)$session['teletyptel_native_csrf'];
    }

    public static function checkCsrf(array $session, string $token): bool
    {
        return preg_match('/^[a-f0-9]{64}$/D', $token) === 1 && isset($session['teletyptel_native_csrf'])
            && hash_equals((string)$session['teletyptel_native_csrf'], $token);
    }
}
