<?php
declare(strict_types=1);

final class AccountAccessDenied extends RuntimeException {}

final class AccountAccess
{
    public static function ensureSchema(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS account_access_controls (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            web_blocked INTEGER NOT NULL DEFAULT 0,
            trashed_at DATETIME NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at DATETIME NOT NULL
        )' . ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' : ''));
    }

    public static function state(PDO $pdo, string $accountId): array
    {
        try {
            $statement = $pdo->prepare('SELECT web_blocked, trashed_at, version FROM account_access_controls WHERE account_id = ?');
            $statement->execute([$accountId]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
        } catch (PDOException $error) {
            if (($error->errorInfo[1] ?? null) !== 1146 && !str_contains($error->getMessage(), 'no such table:')) throw $error;
            $row = false;
        }
        return $row ?: ['web_blocked' => 0, 'trashed_at' => null, 'version' => 1];
    }

    public static function allowed(PDO $pdo, string $accountId): bool
    {
        $state = self::state($pdo, $accountId);
        return !(int)$state['web_blocked'] && $state['trashed_at'] === null;
    }

    public static function assertAllowed(PDO $pdo, string $accountId): void
    {
        if (!self::allowed($pdo, $accountId)) throw new AccountAccessDenied('Webtoegang tot dit account is geblokkeerd of het account staat in de prullenbak. Neem contact op met de beheerder.');
    }

    public static function assertJidAllowed(PDO $pdo, string $jid): void
    {
        $statement = $pdo->prepare('SELECT account_id FROM account_profiles WHERE LOWER(jid) = ?');
        $statement->execute([strtolower($jid)]);
        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $accountId) self::assertAllowed($pdo, $accountId);
    }

    public static function bind(PDO $pdo, string $accountId, array &$session): void
    {
        self::assertAllowed($pdo, $accountId);
        $session['teletyptel_access_version'] = (int)self::state($pdo, $accountId)['version'];
    }

    public static function versionAllowed(PDO $pdo, string $accountId, int $version): bool
    {
        $state = self::state($pdo, $accountId);
        return !(int)$state['web_blocked'] && $state['trashed_at'] === null && (int)$state['version'] === $version;
    }

    public static function sessionAllowed(PDO $pdo, string $accountId, array $session): bool
    {
        return self::versionAllowed($pdo, $accountId, (int)($session['teletyptel_access_version'] ?? 1));
    }

    public static function guardSession(PDO $pdo, array &$session): void
    {
        $accountId = $session['teletyptel_account_id'] ?? $session['teletyptel_2fa_pending_account_id'] ?? '';
        if (!is_string($accountId) || $accountId === '' || self::sessionAllowed($pdo, $accountId, $session)) return;
        foreach (['teletyptel_account_id', 'teletyptel_access_version', 'teletyptel_authenticated_at',
            'teletyptel_intake_authenticated_id', 'teletyptel_intake_csrf', 'teletyptel_2fa_pending_account_id',
            'teletyptel_2fa_pending_password'] as $key) unset($session[$key]);
        throw new AccountAccessDenied('Deze websessie is ingetrokken. Meld je opnieuw aan of neem contact op met de beheerder.');
    }
}
