<?php
declare(strict_types=1);

require_once __DIR__ . '/AccountAccess.php';
require_once __DIR__ . '/AdminUserDirectory.php';

final class AdminAccountActions
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function apply(array $input, ?array $admin): array
    {
        if (!$admin || (int)($admin['enabled'] ?? 0) !== 1 || !in_array($admin['role'], ['owner', 'admin'], true)) {
            throw new AccountAccessDenied('Alleen een actieve beheerder kan gebruikers beheren.');
        }
        $password = $input['adminPassword'] ?? null;
        if (!is_string($password) || !password_verify($password, $admin['password_hash'])) {
            throw new AccountAccessDenied('Bevestig met je huidige beheerwachtwoord.');
        }
        $operation = $input['operation'] ?? '';
        if (!in_array($operation, ['block', 'unblock', 'trash', 'restore'], true) || ($input['confirmed'] ?? false) !== true) {
            throw new InvalidArgumentException('Kies een geldige actie en bevestig de geselecteerde gebruikers.');
        }
        $targets = $input['targets'] ?? null;
        if (!is_array($targets) || count($targets) < 1 || count($targets) > 25) {
            throw new InvalidArgumentException('Selecteer 1 tot en met 25 gebruikers van de huidige pagina.');
        }
        $versions = [];
        foreach ($targets as $target) {
            $accountId = is_array($target) ? ($target['accountId'] ?? null) : null;
            $version = is_array($target) ? ($target['version'] ?? null) : null;
            if (!is_string($accountId) || $accountId === '' || strlen($accountId) > 96 || isset($versions[$accountId])
                || !is_int($version) || $version < 1) throw new InvalidArgumentException('Ongeldige of dubbele selectie.');
            $versions[$accountId] = $version;
        }
        ksort($versions);
        $lock = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
        $this->pdo->beginTransaction();
        try {
            $changed = 0;
            foreach ($versions as $accountId => $version) {
                $statement = $this->pdo->prepare('SELECT account_id FROM account_profiles WHERE account_id = ?' . $lock);
                $statement->execute([$accountId]);
                if (!$statement->fetchColumn()) throw new InvalidArgumentException('Een geselecteerd account bestaat niet meer. Ververs de lijst.');
                $state = AccountAccess::state($this->pdo, $accountId);
                if ((int)$state['version'] !== $version) throw new InvalidArgumentException('Een geselecteerd account is inmiddels gewijzigd. Ververs de lijst en selecteer opnieuw.');
                $blocked = (int)$state['web_blocked'];
                $trashed = $state['trashed_at'];
                if ($operation === 'block' || $operation === 'unblock') {
                    if ($trashed !== null) throw new InvalidArgumentException('Herstel accounts eerst uit de prullenbak voordat je hun blokkade wijzigt.');
                    $blocked = $operation === 'block' ? 1 : 0;
                } elseif ($operation === 'trash') {
                    $trashed = $trashed ?? gmdate('Y-m-d H:i:s');
                } else {
                    $trashed = null;
                }
                if ($blocked === (int)$state['web_blocked'] && $trashed === $state['trashed_at']) continue;
                $statement = $this->pdo->prepare('SELECT account_id FROM account_access_controls WHERE account_id = ?');
                $statement->execute([$accountId]);
                if ($statement->fetchColumn()) {
                    $this->pdo->prepare('UPDATE account_access_controls SET web_blocked = ?, trashed_at = ?, version = ?, updated_at = ? WHERE account_id = ?')
                        ->execute([$blocked, $trashed, $version + 1, gmdate('Y-m-d H:i:s'), $accountId]);
                } else {
                    $this->pdo->prepare('INSERT INTO account_access_controls (web_blocked, trashed_at, version, updated_at, account_id) VALUES (?, ?, ?, ?, ?)')
                        ->execute([$blocked, $trashed, $version + 1, gmdate('Y-m-d H:i:s'), $accountId]);
                }
                (new AdminUserDirectory($this->pdo))->recordAccess($admin['admin_id'], 'account_' . $operation, $accountId);
                $changed++;
            }
            $this->pdo->commit();
            return ['changed' => $changed, 'selected' => count($versions)];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }
}
