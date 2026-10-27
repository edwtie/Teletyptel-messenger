<?php
declare(strict_types=1);

require_once __DIR__ . '/AdminUserDirectory.php';
require_once __DIR__ . '/AccountAccess.php';

final class SubscriptionConflict extends RuntimeException
{
}

final class SubscriptionManager
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function ensureSchema(): void
    {
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS subscription_plans (
            plan_id VARCHAR(32) NOT NULL PRIMARY KEY,
            name VARCHAR(120) NOT NULL,
            description TEXT NOT NULL,
            price_cents INT UNSIGNED NULL,
            billing_period VARCHAR(16) NOT NULL DEFAULT 'month',
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            version INT UNSIGNED NOT NULL DEFAULT 1,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS subscription_history (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(96) NOT NULL,
            from_plan VARCHAR(32) NOT NULL,
            to_plan VARCHAR(32) NOT NULL,
            from_plan_name VARCHAR(120) NOT NULL,
            to_plan_name VARCHAR(120) NOT NULL,
            from_expires_at DATE NULL,
            to_expires_at DATE NULL,
            actor_id VARCHAR(96) NOT NULL,
            note TEXT NOT NULL,
            created_at DATETIME NOT NULL,
            KEY idx_subscription_history_account (account_id, id)
        ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS subscription_schedules (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            account_id VARCHAR(96) NOT NULL, expected_plan VARCHAR(32) NOT NULL,
            expected_expires_at DATE NULL, to_plan VARCHAR(32) NOT NULL, to_expires_at DATE NULL,
            effective_on DATE NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
            actor_id VARCHAR(96) NOT NULL, note TEXT NOT NULL, error_code VARCHAR(64) NOT NULL DEFAULT '',
            created_at DATETIME NOT NULL, completed_at DATETIME NULL,
            KEY idx_schedule_due (status, effective_on), KEY idx_schedule_account (account_id, status)
        ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $this->seedPlans();
    }

    public function seedPlans(): void
    {
        $defaults = ['free' => 'Gratis', 'pro' => 'Pro', 'business' => 'Zakelijk',
            'subsidy' => 'Gesubsidieerd', 'disabled' => 'Uitgeschakeld'];
        foreach ($this->pdo->query('SELECT DISTINCT subscription_plan FROM account_profiles')->fetchAll(PDO::FETCH_COLUMN) as $code) {
            if ($code !== '' && !isset($defaults[$code])) {
                $defaults[$code] = $code;
            }
        }
        $exists = $this->pdo->prepare('SELECT 1 FROM subscription_plans WHERE plan_id = ?');
        $insert = $this->pdo->prepare('INSERT INTO subscription_plans
            (plan_id, name, description, price_cents, billing_period, enabled, version, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, 1, 1, ?, ?)');
        foreach ($defaults as $code => $name) {
            $exists->execute([$code]);
            if ($exists->fetchColumn() !== false) {
                continue;
            }
            try {
                $insert->execute([$code, $name, '', $code === 'free' ? 0 : null,
                    in_array($code, ['free', 'disabled'], true) ? 'none' : 'month', gmdate('Y-m-d H:i:s'), gmdate('Y-m-d H:i:s')]);
            } catch (PDOException $error) {
                if ((string)$error->getCode() !== '23000') {
                    throw $error;
                }
            }
        }
    }

    public function plans(): array
    {
        return $this->pdo->query('SELECT plans.*,
            (SELECT COUNT(*) FROM account_profiles accounts WHERE accounts.subscription_plan = plans.plan_id) AS account_count
            FROM subscription_plans plans ORDER BY plans.enabled DESC, plans.name, plans.plan_id')->fetchAll(PDO::FETCH_ASSOC);
    }

    public function savePlan(array $input, string $actorId, bool $create, ?callable $saveRelated = null): array
    {
        $code = $this->text($input['planId'] ?? '', 32);
        if (!preg_match('/^[a-z0-9][a-z0-9_-]{0,31}$/D', $code)) {
            throw new InvalidArgumentException('Gebruik een plancode van maximaal 32 kleine letters, cijfers, streepjes of underscores.');
        }
        $name = $this->text($input['name'] ?? '', 120);
        $description = $this->text($input['description'] ?? '', 1000);
        if ($name === '') {
            throw new InvalidArgumentException('Vul een plannaam in.');
        }
        $price = $this->price($input['price'] ?? '');
        $period = $this->text($input['billingPeriod'] ?? 'month', 16);
        if (!in_array($period, ['month', 'year', 'once', 'none'], true)) {
            throw new InvalidArgumentException('Ongeldige prijsperiode.');
        }
        if ($period === 'none' && $price !== null && $price !== 0) {
            throw new InvalidArgumentException('Kies een prijsperiode voor een betaald plan.');
        }
        if (!is_bool($input['enabled'] ?? null)) {
            throw new InvalidArgumentException('Ongeldige planstatus.');
        }
        $enabled = $input['enabled'] ? 1 : 0;
        if ($code === 'free' && !$enabled) {
            throw new InvalidArgumentException('Het standaardplan free moet beschikbaar blijven voor nieuwe accounts.');
        }
        return $this->transaction(function () use ($input, $code, $name, $description, $price, $period, $enabled, $actorId, $create, $saveRelated): array {
            $existing = $this->plan($code, true);
            $now = gmdate('Y-m-d H:i:s');
            if ($create) {
                if ($existing !== null) {
                    throw new SubscriptionConflict('Deze plancode bestaat al.');
                }
                $this->pdo->prepare('INSERT INTO subscription_plans
                    (plan_id, name, description, price_cents, billing_period, enabled, version, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')->execute([$code, $name, $description, $price, $period, $enabled, $now, $now]);
            } else {
                if ($existing === null) {
                    throw new InvalidArgumentException('Dit plan bestaat niet.');
                }
                if (!is_int($input['version'] ?? null) || (int)$existing['version'] !== $input['version']) {
                    throw new SubscriptionConflict('Dit plan is inmiddels gewijzigd. Ververs en open het plan opnieuw.');
                }
                if (!$enabled && $this->pendingForPlan($code)) {
                    throw new SubscriptionConflict('Annuleer eerst de geplande overgangen naar dit plan.');
                }
                $this->pdo->prepare('UPDATE subscription_plans SET name = ?, description = ?, price_cents = ?,
                    billing_period = ?, enabled = ?, version = version + 1, updated_at = ? WHERE plan_id = ?')
                    ->execute([$name, $description, $price, $period, $enabled, $now, $code]);
            }
            if ($saveRelated !== null) $saveRelated($code);
            (new AdminUserDirectory($this->pdo))->recordAccess($actorId, $create ? 'create_plan' : 'update_plan', $code);
            return $this->plan($code);
        });
    }

    public function account(string $accountId, bool $lock = false): array
    {
        if ($accountId === '' || strlen($accountId) > 96) {
            throw new InvalidArgumentException('Ongeldig account-ID.');
        }
        $statement = $this->pdo->prepare('SELECT account_id, display_name, jid, subscription_plan, subscription_expires_at
            FROM account_profiles WHERE account_id = ?' . $this->lock($lock));
        $statement->execute([$accountId]);
        $account = $statement->fetch(PDO::FETCH_ASSOC);
        $statement->closeCursor();
        if (!is_array($account)) {
            throw new InvalidArgumentException('Deze gebruiker bestaat niet.');
        }
        return $account;
    }

    public function change(array $input, string $actorId): array
    {
        $accountId = $this->text($input['accountId'] ?? '', 96);
        $target = $this->text($input['planId'] ?? '', 32);
        $expected = $this->text($input['expectedPlan'] ?? '', 32);
        if (!array_key_exists('expiresAt', $input) || !array_key_exists('expectedExpiresAt', $input)) {
            throw new InvalidArgumentException('De huidige en nieuwe einddatum ontbreken. Open de overgang opnieuw.');
        }
        $expiry = $this->date($input['expiresAt']);
        $expectedExpiry = $this->date($input['expectedExpiresAt']);
        $note = $this->text($input['note'] ?? '', 1000);
        return $this->transaction(function () use ($accountId, $target, $expected, $expectedExpiry, $expiry, $note, $actorId): array {
            $account = $this->account($accountId, true);
            $pending = $this->pdo->prepare("SELECT COUNT(*) FROM subscription_schedules WHERE account_id = ? AND status = 'pending'");
            $pending->execute([$accountId]);
            $pendingCount = (int)$pending->fetchColumn();
            $pending->closeCursor();
            if ($pendingCount !== 0) {
                throw new SubscriptionConflict('Er is al een overgang gepland. Annuleer die eerst.');
            }
            if ($account['subscription_plan'] !== $expected || $account['subscription_expires_at'] !== $expectedExpiry) {
                throw new SubscriptionConflict('Het abonnement is inmiddels gewijzigd. Open de overgang opnieuw.');
            }
            $plan = $this->plan($target, true);
            if ($plan === null) {
                throw new InvalidArgumentException('Kies een bestaand plan.');
            }
            if ((int)$plan['enabled'] !== 1 && $target !== $expected) {
                throw new InvalidArgumentException('Dit plan is niet beschikbaar voor nieuwe toewijzingen.');
            }
            if ($target === $expected && $expiry === $expectedExpiry) {
                return ['changed' => false, 'account' => $account];
            }
            if ($expiry !== null && $expiry < gmdate('Y-m-d')) {
                throw new InvalidArgumentException('De nieuwe einddatum mag niet in het verleden liggen.');
            }
            $previous = $this->plan($expected);
            $this->pdo->prepare('UPDATE account_profiles SET subscription_plan = ?, subscription_expires_at = ? WHERE account_id = ?')
                ->execute([$target, $expiry, $accountId]);
            $this->pdo->prepare('INSERT INTO subscription_history
                (account_id, from_plan, to_plan, from_plan_name, to_plan_name, from_expires_at, to_expires_at, actor_id, note, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
                    $accountId, $expected, $target, $previous['name'] ?? $expected, $plan['name'], $expectedExpiry, $expiry,
                    $actorId, $note, gmdate('Y-m-d H:i:s'),
                ]);
            (new AdminUserDirectory($this->pdo))->recordAccess($actorId, 'change_subscription', $accountId);
            return ['changed' => true, 'account' => $this->account($accountId)];
        });
    }

    public function schedule(array $input, string $actorId): array
    {
        $accountId = $this->text($input['accountId'] ?? '', 96);
        $expected = $this->text($input['expectedPlan'] ?? '', 32);
        $target = $this->text($input['planId'] ?? '', 32);
        $effective = $this->date($input['effectiveOn'] ?? null);
        if ($effective === null || $effective <= gmdate('Y-m-d')) {
            throw new InvalidArgumentException('Kies een toekomstige ingangsdatum (00:00 UTC).');
        }
        if (!array_key_exists('expiresAt', $input) || !array_key_exists('expectedExpiresAt', $input)) {
            throw new InvalidArgumentException('Einddatuminformatie ontbreekt.');
        }
        $expiry = $this->date($input['expiresAt']);
        $expectedExpiry = $this->date($input['expectedExpiresAt']);
        $note = $this->text($input['note'] ?? '', 1000);
        if ($expiry !== null && $expiry < $effective) {
            throw new InvalidArgumentException('De einddatum ligt voor de ingangsdatum.');
        }
        return $this->transaction(function () use ($accountId, $expected, $target, $effective, $expiry, $expectedExpiry, $note, $actorId): array {
            $account = $this->account($accountId, true);
            if ($account['subscription_plan'] !== $expected || $account['subscription_expires_at'] !== $expectedExpiry) {
                throw new SubscriptionConflict('Het huidige abonnement is gewijzigd. Open de overgang opnieuw.');
            }
            $plan = $this->plan($target, true);
            if ($plan === null || (int)$plan['enabled'] !== 1) {
                throw new InvalidArgumentException('Kies een beschikbaar plan.');
            }
            $statement = $this->pdo->prepare("SELECT COUNT(*) FROM subscription_schedules WHERE account_id = ? AND status = 'pending'");
            $statement->execute([$accountId]);
            $pendingCount = (int)$statement->fetchColumn();
            $statement->closeCursor();
            if ($pendingCount !== 0) {
                throw new SubscriptionConflict('Voor deze gebruiker is al een overgang gepland.');
            }
            if ($expected === $target && $expectedExpiry === $expiry) {
                throw new InvalidArgumentException('Het gekozen abonnement is al zo ingesteld.');
            }
            $this->pdo->prepare('INSERT INTO subscription_schedules
                (account_id, expected_plan, expected_expires_at, to_plan, to_expires_at, effective_on, actor_id, note, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([$accountId, $expected, $expectedExpiry, $target, $expiry,
                    $effective, $actorId, $note, gmdate('Y-m-d H:i:s')]);
            $identifier = (int)$this->pdo->lastInsertId();
            (new AdminUserDirectory($this->pdo))->recordAccess($actorId, 'schedule_subscription', $accountId);
            return ['id' => $identifier, 'effectiveOn' => $effective];
        });
    }

    public function cancelSchedule(int $identifier, string $actorId): array
    {
        return $this->transaction(function () use ($identifier, $actorId): array {
            $statement = $this->pdo->prepare('SELECT account_id FROM subscription_schedules WHERE id = ?');
            $statement->execute([$identifier]);
            $accountId = $statement->fetchColumn();
            if ($accountId === false) {
                throw new InvalidArgumentException('Planning niet gevonden.');
            }
            $this->account($accountId, true);
            $statement = $this->pdo->prepare("UPDATE subscription_schedules SET status = 'cancelled', completed_at = ? WHERE id = ? AND status = 'pending'");
            $statement->execute([gmdate('Y-m-d H:i:s'), $identifier]);
            if ($statement->rowCount() !== 1) {
                throw new SubscriptionConflict('Deze planning is al verwerkt of geannuleerd.');
            }
            (new AdminUserDirectory($this->pdo))->recordAccess($actorId, 'cancel_subscription_schedule', $accountId);
            return ['cancelled' => true];
        });
    }

    public function schedules(string $accountId = '', int $page = 1): array
    {
        $where = $accountId === '' ? '' : ' WHERE schedules.account_id = ?';
        $parameters = $accountId === '' ? [] : [$accountId];
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM subscription_schedules schedules' . $where);
        $statement->execute($parameters);
        $total = (int)$statement->fetchColumn();
        $page = max(1, min($page, max(1, (int)ceil($total / 25))));
        $offset = ($page - 1) * 25;
        $statement = $this->pdo->prepare('SELECT schedules.*, accounts.display_name FROM subscription_schedules schedules
            LEFT JOIN account_profiles accounts ON accounts.account_id = schedules.account_id' . $where
            . " ORDER BY CASE WHEN schedules.status = 'pending' THEN 0 ELSE 1 END, schedules.effective_on, schedules.id DESC LIMIT 25 OFFSET $offset");
        $statement->execute($parameters);
        return ['items' => $statement->fetchAll(PDO::FETCH_ASSOC), 'total' => $total, 'page' => $page, 'pageSize' => 25];
    }

    public function processDue(?string $today = null): array
    {
        $today = $this->date($today ?? gmdate('Y-m-d'));
        $statement = $this->pdo->prepare("SELECT id, account_id FROM subscription_schedules WHERE status = 'pending' AND effective_on <= ? ORDER BY effective_on, id LIMIT 100");
        $statement->execute([$today]);
        $counts = ['applied' => 0, 'failed' => 0, 'skipped' => 0];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $candidate) {
            $result = $this->transaction(function () use ($candidate, $today): array {
                $lockAccount = $this->pdo->prepare('SELECT account_id FROM account_profiles WHERE account_id = ?' . $this->lock(true));
                $lockAccount->execute([$candidate['account_id']]);
                $query = $this->pdo->prepare('SELECT * FROM subscription_schedules WHERE id = ?' . $this->lock(true));
                $query->execute([$candidate['id']]);
                $schedule = $query->fetch(PDO::FETCH_ASSOC);
                if (!$schedule || $schedule['status'] !== 'pending' || $schedule['effective_on'] > $today) {
                    return ['status' => 'skipped'];
                }
                $this->pdo->prepare("UPDATE subscription_schedules SET status = 'processing' WHERE id = ?")->execute([$schedule['id']]);
                $status = 'applied';
                $errorCode = '';
                try {
                    if (!AccountAccess::allowed($this->pdo, $schedule['account_id'])) {
                        throw new InvalidArgumentException('Account blocked or trashed');
                    }
                    if ($schedule['to_expires_at'] !== null && $schedule['to_expires_at'] < $today) {
                        throw new InvalidArgumentException('Expired transition');
                    }
                    $this->change(['accountId' => $schedule['account_id'], 'expectedPlan' => $schedule['expected_plan'],
                        'expectedExpiresAt' => $schedule['expected_expires_at'], 'planId' => $schedule['to_plan'],
                        'expiresAt' => $schedule['to_expires_at'], 'note' => $schedule['note']], 'subscription-worker');
                } catch (SubscriptionConflict | InvalidArgumentException $error) {
                    $status = 'failed';
                    $errorCode = $error instanceof SubscriptionConflict ? 'subscription_changed' : 'invalid_transition';
                    (new AdminUserDirectory($this->pdo))->recordAccess('subscription-worker', 'subscription_schedule_failed', $schedule['account_id']);
                }
                $this->pdo->prepare('UPDATE subscription_schedules SET status = ?, error_code = ?, completed_at = ? WHERE id = ?')
                    ->execute([$status, $errorCode, gmdate('Y-m-d H:i:s'), $schedule['id']]);
                return ['status' => $status];
            });
            $counts[$result['status']]++;
        }
        return $counts;
    }

    private function pendingForPlan(string $code): bool
    {
        $statement = $this->pdo->prepare("SELECT COUNT(*) FROM subscription_schedules WHERE to_plan = ? AND status = 'pending'");
        $statement->execute([$code]);
        $count = (int)$statement->fetchColumn();
        $statement->closeCursor();
        return $count > 0;
    }

    public function history(string $accountId = '', int $page = 1): array
    {
        $where = $accountId === '' ? '' : ' WHERE history.account_id = ?';
        $parameters = $accountId === '' ? [] : [$accountId];
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM subscription_history history' . $where);
        $statement->execute($parameters);
        $total = (int)$statement->fetchColumn();
        $page = max(1, min($page, max(1, (int)ceil($total / 25))));
        $offset = ($page - 1) * 25;
        $statement = $this->pdo->prepare('SELECT history.*, accounts.display_name, accounts.jid
            FROM subscription_history history LEFT JOIN account_profiles accounts ON accounts.account_id = history.account_id'
            . $where . " ORDER BY history.id DESC LIMIT 25 OFFSET $offset");
        $statement->execute($parameters);
        return ['items' => $statement->fetchAll(PDO::FETCH_ASSOC), 'total' => $total, 'page' => $page, 'pageSize' => 25];
    }

    private function plan(string $code, bool $lock = false): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM subscription_plans WHERE plan_id = ?' . $this->lock($lock));
        $statement->execute([$code]);
        $plan = $statement->fetch(PDO::FETCH_ASSOC);
        $statement->closeCursor();
        return is_array($plan) ? $plan : null;
    }

    private function lock(bool $lock): string
    {
        return $lock && $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
    }

    private function text(mixed $value, int $limit): string
    {
        if (!is_string($value)) {
            throw new InvalidArgumentException('Ongeldige tekstwaarde.');
        }
        $value = trim($value);
        if (preg_match_all('/./us', $value) > $limit || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) {
            throw new InvalidArgumentException('De tekst is te lang of bevat ongeldige tekens.');
        }
        return $value;
    }

    private function date(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            throw new InvalidArgumentException('Ongeldige datum.');
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
        if ($date === false || $date->format('Y-m-d') !== $value || $date->format('Y') < '1000') {
            throw new InvalidArgumentException('Gebruik een geldige datum (jjjj-mm-dd).');
        }
        return $value;
    }

    private function price(mixed $value): ?int
    {
        $value = $this->text($value, 12);
        if ($value === '') {
            return null;
        }
        if (!preg_match('/^([0-9]{1,6})(?:[.,]([0-9]{1,2}))?$/D', $value, $matches)) {
            throw new InvalidArgumentException('Gebruik een bedrag van 0 tot 999999,99 met maximaal twee decimalen.');
        }
        return (int)$matches[1] * 100 + (int)str_pad($matches[2] ?? '', 2, '0');
    }

    private function transaction(callable $operation): array
    {
        $nested = $this->pdo->inTransaction();
        $savepoint = 'subscription_' . bin2hex(random_bytes(6));
        if ($nested) {
            $this->pdo->exec('SAVEPOINT ' . $savepoint);
        } else {
            $this->pdo->beginTransaction();
        }
        try {
            $result = $operation();
            if ($nested) {
                $this->pdo->exec('RELEASE SAVEPOINT ' . $savepoint);
            } else {
                $this->pdo->commit();
            }
            return $result;
        } catch (Throwable $error) {
            if ($nested) {
                $this->pdo->exec('ROLLBACK TO SAVEPOINT ' . $savepoint);
                $this->pdo->exec('RELEASE SAVEPOINT ' . $savepoint);
            } elseif ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $error;
        }
    }
}
