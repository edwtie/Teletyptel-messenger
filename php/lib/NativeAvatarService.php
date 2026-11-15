<?php
declare(strict_types=1);

final class NativeAvatarService
{
    public static function read(PDO $pdo, string $accountId): array
    {
        $query = $pdo->prepare('SELECT jid, display_name, avatar_color, avatar_data_url FROM account_profiles WHERE account_id = ?');
        $query->execute([$accountId]);
        $row = $query->fetch(PDO::FETCH_ASSOC);
        if (!$row) throw new RuntimeException('Profile unavailable');
        return ['jid' => $row['jid'], 'displayName' => $row['display_name'], 'avatarColor' => $row['avatar_color'], 'avatarDataUrl' => $row['avatar_data_url'] ?? ''];
    }

    public static function update(PDO $pdo, string $accountId, array $input): array
    {
        if (array_keys($input) !== ['avatarDataUrl'] || !is_string($input['avatarDataUrl'])) throw new InvalidArgumentException('Invalid avatar fields');
        $dataUrl = $input['avatarDataUrl'];
        if ($dataUrl !== '') {
            if (strlen($dataUrl) > 524288 || !preg_match('~^data:image/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$~D', $dataUrl, $match)) throw new InvalidArgumentException('Invalid avatar format');
            $bytes = base64_decode($match[2], true);
            if ($bytes === false || strlen($bytes) > 393216) throw new InvalidArgumentException('Invalid avatar size');
            $size = @getimagesizefromstring($bytes);
            if (!$size || $size[0] < 1 || $size[1] < 1 || $size[0] > 1024 || $size[1] > 1024 || $size['mime'] !== 'image/' . $match[1]) throw new InvalidArgumentException('Invalid avatar image');
        }
        self::read($pdo, $accountId);
        $query = $pdo->prepare('UPDATE account_profiles SET avatar_data_url = ? WHERE account_id = ?');
        $query->execute([$dataUrl, $accountId]);
        return self::read($pdo, $accountId);
    }
}
