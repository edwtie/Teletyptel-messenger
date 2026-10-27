<?php
declare(strict_types=1);

require_once __DIR__ . '/AdminSettings.php';
require_once __DIR__ . '/SubscriptionManager.php';

final class BillingManager
{
    private PDO $pdo;
    private AdminSettings $settings;

    public function __construct(PDO $pdo, ?AdminSettings $settings = null)
    {
        $this->pdo = $pdo;
        $this->settings = $settings ?? new AdminSettings();
    }

    public function ensureSchema(): void
    {
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS billing_invoices (
            id VARCHAR(32) NOT NULL PRIMARY KEY, request_key VARCHAR(64) NOT NULL UNIQUE,
            account_id VARCHAR(96) NOT NULL, recipient_type VARCHAR(16) NOT NULL DEFAULT 'customer', status VARCHAR(16) NOT NULL DEFAULT 'draft',
            invoice_number VARCHAR(64) NULL UNIQUE, customer_name VARCHAR(120) NOT NULL,
            customer_address TEXT NOT NULL, customer_email VARCHAR(255) NOT NULL,
            description TEXT NOT NULL, service_on DATE NOT NULL, due_on DATE NOT NULL,
            quantity INT NOT NULL, unit_cents BIGINT NOT NULL, vat_basis_points INT NOT NULL,
            subtotal_cents BIGINT NOT NULL, vat_cents BIGINT NOT NULL, total_cents BIGINT NOT NULL,
            currency VARCHAR(3) NOT NULL DEFAULT 'EUR', supplier_json TEXT NULL,
            issued_on DATE NULL, paid_on DATE NULL, payment_reference VARCHAR(128) NOT NULL DEFAULT '',
            version INT NOT NULL DEFAULT 1, actor_id VARCHAR(96) NOT NULL, created_at DATETIME NOT NULL,
            KEY idx_invoice_account (account_id, created_at)
        ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS billing_sequences (
            sequence_year INT NOT NULL PRIMARY KEY, last_number BIGINT NOT NULL
        ) ENGINE=InnoDB");
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS billing_recurring (
            id VARCHAR(32) NOT NULL PRIMARY KEY, account_id VARCHAR(96) NOT NULL UNIQUE, recipient_type VARCHAR(16) NOT NULL DEFAULT 'customer',
            plan_id VARCHAR(32) NOT NULL, plan_version INT NOT NULL, unit_cents BIGINT NOT NULL,
            billing_period VARCHAR(16) NOT NULL, anchor_day INT NOT NULL,
            customer_name VARCHAR(120) NOT NULL, customer_address TEXT NOT NULL, customer_email VARCHAR(255) NOT NULL,
            vat_basis_points INT NOT NULL, next_on DATE NOT NULL, enabled TINYINT NOT NULL,
            auto_issue TINYINT NOT NULL DEFAULT 0, version INT NOT NULL DEFAULT 1,
            last_error VARCHAR(128) NOT NULL DEFAULT '', actor_id VARCHAR(96) NOT NULL, updated_at DATETIME NOT NULL,
            KEY idx_recurring_due (enabled, next_on)
        ) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        foreach (['billing_invoices', 'billing_recurring'] as $table) {
            $column = $this->pdo->prepare("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'recipient_type'");
            $column->execute([$table]);
            if ((int)$column->fetchColumn() === 0) {
                $this->pdo->exec("ALTER TABLE $table ADD COLUMN recipient_type VARCHAR(16) NOT NULL DEFAULT 'customer'");
            }
        }
    }

    public function invoice(string $identifier, bool $lock = false): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM billing_invoices WHERE id = ?' . $this->lock($lock));
        $statement->execute([$identifier]);
        $invoice = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$invoice) {
            throw new InvalidArgumentException('Factuur niet gevonden.');
        }
        $invoice['supplier'] = $invoice['supplier_json'] ? json_decode($invoice['supplier_json'], true, 512, JSON_THROW_ON_ERROR) : null;
        unset($invoice['supplier_json']);
        return $invoice;
    }

    public function listing(int $page = 1): array
    {
        $total = (int)$this->pdo->query('SELECT COUNT(*) FROM billing_invoices')->fetchColumn();
        $page = max(1, min($page, max(1, (int)ceil($total / 25))));
        $offset = ($page - 1) * 25;
        $rows = $this->pdo->query("SELECT id, account_id, customer_name, recipient_type, status, invoice_number, service_on, due_on,
            total_cents, currency, issued_on, paid_on, version FROM billing_invoices ORDER BY created_at DESC, id DESC LIMIT 25 OFFSET $offset")->fetchAll(PDO::FETCH_ASSOC);
        return ['items' => $rows, 'total' => $total, 'page' => $page, 'pageSize' => 25];
    }

    public function saveDraft(array $input, string $actor): array
    {
        $accountId = AdminSettings::text($input['accountId'] ?? '', 96);
        (new SubscriptionManager($this->pdo))->account($accountId);
        $name = AdminSettings::text($input['customerName'] ?? '', 120);
        $recipient = self::recipient($input['recipientType'] ?? 'customer');
        $address = AdminSettings::text($input['customerAddress'] ?? '', 500);
        $email = AdminSettings::text($input['customerEmail'] ?? '', 255);
        $description = AdminSettings::text($input['description'] ?? '', 1000);
        if ($name === '' || $description === '' || ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL))) {
            throw new InvalidArgumentException('Vul klantnaam, omschrijving en eventueel een geldig e-mailadres in.');
        }
        $service = self::date($input['serviceOn'] ?? '');
        $due = self::date($input['dueOn'] ?? '');
        $quantity = AdminSettings::integer($input['quantity'] ?? 1, 1, 10000);
        $unit = self::money($input['unitPrice'] ?? '');
        $vat = AdminSettings::vat($input['vat'] ?? '');
        $subtotal = $quantity * $unit;
        if ($subtotal > 999999999) {
            throw new InvalidArgumentException('Het factuurbedrag is te hoog.');
        }
        $tax = intdiv($subtotal * $vat + 5000, 10000);
        $key = AdminSettings::text($input['requestKey'] ?? '', 64);
        if (!preg_match('/^[a-zA-Z0-9-]{16,64}$/D', $key)) {
            throw new InvalidArgumentException('Ongeldige factuuraanvraag. Open het formulier opnieuw.');
        }
        $identifier = AdminSettings::text($input['id'] ?? '', 32);
        return $this->transaction(function () use ($input, $accountId, $name, $address, $email, $description, $service, $due, $quantity, $unit, $vat, $subtotal, $tax, $key, $identifier, $actor, $recipient): array {
            if ($identifier === '') {
                $existing = $this->pdo->prepare('SELECT id, account_id FROM billing_invoices WHERE request_key = ?');
                $existing->execute([$key]);
                $row = $existing->fetch(PDO::FETCH_ASSOC);
                if ($row) {
                    if ($row['account_id'] !== $accountId) {
                        throw new SubscriptionConflict('Deze aanvraag hoort bij een andere gebruiker.');
                    }
                    return $this->invoice($row['id']);
                }
                $identifier = bin2hex(random_bytes(16));
                $this->pdo->prepare('INSERT INTO billing_invoices
                    (id, request_key, account_id, customer_name, customer_address, customer_email, description, service_on,
                    due_on, quantity, unit_cents, vat_basis_points, subtotal_cents, vat_cents, total_cents, actor_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
                        $identifier, $key, $accountId, $name, $address, $email, $description, $service, $due, $quantity,
                        $unit, $vat, $subtotal, $tax, $subtotal + $tax, $actor, gmdate('Y-m-d H:i:s')]);
            } else {
                $invoice = $this->invoice($identifier, true);
                if ($invoice['status'] !== 'draft' || (int)$invoice['version'] !== ($input['version'] ?? null) || $invoice['account_id'] !== $accountId) {
                    throw new SubscriptionConflict('Deze factuur is gewijzigd of al definitief.');
                }
                $this->pdo->prepare('UPDATE billing_invoices SET customer_name = ?, customer_address = ?, customer_email = ?,
                    description = ?, service_on = ?, due_on = ?, quantity = ?, unit_cents = ?, vat_basis_points = ?,
                    subtotal_cents = ?, vat_cents = ?, total_cents = ?, version = version + 1 WHERE id = ?')
                    ->execute([$name, $address, $email, $description, $service, $due, $quantity, $unit, $vat,
                        $subtotal, $tax, $subtotal + $tax, $identifier]);
            }
            $this->pdo->prepare('UPDATE billing_invoices SET recipient_type = ? WHERE id = ?')->execute([$recipient, $identifier]);
            (new AdminUserDirectory($this->pdo))->recordAccess($actor, 'save_invoice_draft', $accountId);
            return $this->invoice($identifier);
        });
    }

    public function issue(string $identifier, int $version, string $actor): array
    {
        return $this->transaction(function () use ($identifier, $version, $actor): array {
            $invoice = $this->invoice($identifier, true);
            if ($invoice['status'] !== 'draft') {
                return $invoice;
            }
            if ((int)$invoice['version'] !== $version) {
                throw new SubscriptionConflict('Ververs de gewijzigde conceptfactuur eerst.');
            }
            $supplier = $this->settings->view()['billing'];
            foreach (['companyName', 'address', 'vatId', 'companyNumber'] as $field) {
                if (trim($supplier[$field] ?? '') === '') {
                    throw new InvalidArgumentException('Vul eerst bedrijfsnaam, adres, btw-ID en KvK-nummer in bij Instellingen.');
                }
            }
            if (($supplier['defaultVat'] ?? '') === '') {
                throw new InvalidArgumentException('Controleer eerst de btw-instellingen.');
            }
            $supplier['agbCode'] = AdminSettings::agb($supplier['agbCode'] ?? '', $invoice['recipient_type'] === 'insurer');
            if ($invoice['customer_address'] === '' || $invoice['due_on'] < gmdate('Y-m-d')) {
                throw new InvalidArgumentException('Vul het klantadres en een geldige betaaltermijn in.');
            }
            $year = (int)gmdate('Y');
            $insert = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
                ? 'INSERT IGNORE INTO billing_sequences (sequence_year, last_number) VALUES (?, 0)'
                : 'INSERT OR IGNORE INTO billing_sequences (sequence_year, last_number) VALUES (?, 0)';
            $this->pdo->prepare($insert)->execute([$year]);
            $query = $this->pdo->prepare('SELECT last_number FROM billing_sequences WHERE sequence_year = ?' . $this->lock(true));
            $query->execute([$year]);
            $next = (int)$query->fetchColumn() + 1;
            $this->pdo->prepare('UPDATE billing_sequences SET last_number = ? WHERE sequence_year = ?')->execute([$next, $year]);
            $number = 'TT-' . $year . '-' . str_pad((string)$next, 6, '0', STR_PAD_LEFT);
            $this->pdo->prepare("UPDATE billing_invoices SET status = 'issued', invoice_number = ?, supplier_json = ?,
                issued_on = ?, version = version + 1 WHERE id = ?")
                ->execute([$number, json_encode($supplier, JSON_THROW_ON_ERROR), gmdate('Y-m-d'), $identifier]);
            (new AdminUserDirectory($this->pdo))->recordAccess($actor, 'issue_invoice', $invoice['account_id']);
            return $this->invoice($identifier);
        });
    }

    public function paid(string $identifier, string $paidOn, string $reference, string $actor): array
    {
        $paidOn = self::date($paidOn);
        $reference = AdminSettings::text($reference, 128);
        if ($paidOn > gmdate('Y-m-d') || $reference === '') {
            throw new InvalidArgumentException('Vul een betalingskenmerk en een betaaldatum tot en met vandaag in.');
        }
        return $this->transaction(function () use ($identifier, $paidOn, $reference, $actor): array {
            $invoice = $this->invoice($identifier, true);
            if ($invoice['status'] === 'paid') {
                return $invoice;
            }
            if ($invoice['status'] !== 'issued' || $paidOn < $invoice['issued_on']) {
                throw new InvalidArgumentException('Alleen een definitieve factuur kan als betaald worden geregistreerd.');
            }
            $this->pdo->prepare("UPDATE billing_invoices SET status = 'paid', paid_on = ?, payment_reference = ?, version = version + 1 WHERE id = ?")
                ->execute([$paidOn, $reference, $identifier]);
            (new AdminUserDirectory($this->pdo))->recordAccess($actor, 'invoice_paid', $invoice['account_id']);
            return $this->invoice($identifier);
        });
    }

    public function recurring(string $accountId): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM billing_recurring WHERE account_id = ?');
        $statement->execute([$accountId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    public function recurringList(): array
    {
        return $this->pdo->query('SELECT id, account_id, customer_name, plan_id, next_on, enabled, auto_issue, last_error
            FROM billing_recurring ORDER BY enabled DESC, next_on, account_id LIMIT 100')->fetchAll(PDO::FETCH_ASSOC);
    }

    public function saveRecurring(array $input, string $actor): array
    {
        $accountId = AdminSettings::text($input['accountId'] ?? '', 96);
        return $this->transaction(function () use ($input, $accountId, $actor): array {
            $account = (new SubscriptionManager($this->pdo))->account($accountId, true);
            $existing = $this->recurring($accountId);
            if ($existing && (int)$existing['version'] !== ($input['version'] ?? null)) {
                throw new SubscriptionConflict('Ververs de gewijzigde facturatieafspraak eerst.');
            }
            if (!is_bool($input['enabled'] ?? null) || !is_bool($input['autoIssue'] ?? null)) {
                throw new InvalidArgumentException('Ongeldige facturatie-instelling.');
            }
            if (!$input['enabled'] && $existing) {
                $this->pdo->prepare('UPDATE billing_recurring SET enabled = 0, version = version + 1, updated_at = ? WHERE account_id = ?')
                    ->execute([gmdate('Y-m-d H:i:s'), $accountId]);
                (new AdminUserDirectory($this->pdo))->recordAccess($actor, 'pause_recurring_billing', $accountId);
                return $this->recurring($accountId);
            }
            $statement = $this->pdo->prepare('SELECT * FROM subscription_plans WHERE plan_id = ?' . $this->lock(true));
            $statement->execute([$account['subscription_plan']]);
            $plan = $statement->fetch(PDO::FETCH_ASSOC);
            if (($input['confirmed'] ?? false) !== true || ($input['expectedPlan'] ?? '') !== $account['subscription_plan']
                || !$plan || ($input['expectedPlanVersion'] ?? null) !== (int)$plan['version']) {
                throw new SubscriptionConflict('Controleer en bevestig eerst de actuele plan- en prijsafspraak.');
            }
            if (!$plan || !in_array($plan['billing_period'], ['month', 'year'], true) || $plan['price_cents'] === null || (int)$plan['price_cents'] <= 0) {
                throw new InvalidArgumentException('Stel eerst een maand- of jaarplan met een positieve prijs in.');
            }
            $name = AdminSettings::text($input['customerName'] ?? '', 120);
            $recipient = self::recipient($input['recipientType'] ?? 'customer');
            $address = AdminSettings::text($input['customerAddress'] ?? '', 500);
            $email = AdminSettings::text($input['customerEmail'] ?? '', 255);
            $next = self::date($input['nextOn'] ?? '');
            $vat = AdminSettings::vat($input['vat'] ?? '');
            if ($name === '' || $address === '' || ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) || $next < gmdate('Y-m-d')) {
                throw new InvalidArgumentException('Vul klantnaam, adres en een eerstvolgende factuurdatum vanaf vandaag in.');
            }
            if (!$existing) {
                $this->pdo->prepare('INSERT INTO billing_recurring (id, account_id, plan_id, plan_version, unit_cents, billing_period,
                    anchor_day, customer_name, customer_address, customer_email, vat_basis_points, next_on, enabled, auto_issue, actor_id, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')->execute([
                        bin2hex(random_bytes(16)), $accountId, $plan['plan_id'], $plan['version'], $plan['price_cents'], $plan['billing_period'],
                        (int)substr($next, 8, 2), $name, $address, $email, $vat, $next, (int)$input['enabled'], (int)$input['autoIssue'], $actor, gmdate('Y-m-d H:i:s')]);
            } else {
                $this->pdo->prepare("UPDATE billing_recurring SET plan_id = ?, plan_version = ?, unit_cents = ?, billing_period = ?,
                    anchor_day = ?, customer_name = ?, customer_address = ?, customer_email = ?, vat_basis_points = ?, next_on = ?,
                    enabled = ?, auto_issue = ?, version = version + 1, last_error = '', actor_id = ?, updated_at = ? WHERE account_id = ?")
                    ->execute([$plan['plan_id'], $plan['version'], $plan['price_cents'], $plan['billing_period'], (int)substr($next, 8, 2),
                        $name, $address, $email, $vat, $next, (int)$input['enabled'], (int)$input['autoIssue'], $actor, gmdate('Y-m-d H:i:s'), $accountId]);
            }
            $this->pdo->prepare('UPDATE billing_recurring SET recipient_type = ? WHERE account_id = ?')->execute([$recipient, $accountId]);
            (new AdminUserDirectory($this->pdo))->recordAccess($actor, 'save_recurring_billing', $accountId);
            return $this->recurring($accountId);
        });
    }

    public function processRecurring(?string $today = null): array
    {
        $today = self::date($today ?? gmdate('Y-m-d'));
        $query = $this->pdo->prepare('SELECT account_id FROM billing_recurring WHERE enabled = 1 AND next_on <= ? ORDER BY next_on LIMIT 100');
        $query->execute([$today]);
        $counts = ['created' => 0, 'blocked' => 0, 'skipped' => 0];
        foreach ($query->fetchAll(PDO::FETCH_COLUMN) as $accountId) {
            $result = $this->transaction(function () use ($accountId, $today): array {
                $statement = $this->pdo->prepare('SELECT subscription_plan, subscription_expires_at, account_status FROM account_profiles WHERE account_id = ?' . $this->lock(true));
                $statement->execute([$accountId]);
                $account = $statement->fetch(PDO::FETCH_ASSOC);
                $statement = $this->pdo->prepare('SELECT * FROM billing_recurring WHERE account_id = ?' . $this->lock(true));
                $statement->execute([$accountId]);
                $rule = $statement->fetch(PDO::FETCH_ASSOC);
                if (!$rule || !(int)$rule['enabled'] || $rule['next_on'] > $today) {
                    return ['status' => 'skipped'];
                }
                $statement = $this->pdo->prepare('SELECT version FROM subscription_plans WHERE plan_id = ?' . $this->lock(true));
                $statement->execute([$rule['plan_id']]);
                $planVersion = $statement->fetchColumn();
                if (!$account || !AccountAccess::allowed($this->pdo, $accountId) || !in_array($account['account_status'], ['active', 'trial'], true)
                    || $account['subscription_plan'] !== $rule['plan_id'] || (int)$planVersion !== (int)$rule['plan_version']
                    || ($account['subscription_expires_at'] !== null && $account['subscription_expires_at'] < $rule['next_on'])) {
                    $this->pdo->prepare("UPDATE billing_recurring SET enabled = 0, version = version + 1,
                        last_error = 'Gepauzeerd: controleer accountstatus, einddatum en plan/prijsafspraak.' WHERE account_id = ?")->execute([$accountId]);
                    (new AdminUserDirectory($this->pdo))->recordAccess('billing-worker', 'recurring_review_required', $accountId);
                    return ['status' => 'blocked'];
                }
                $next = self::nextPeriod($rule['next_on'], $rule['billing_period'], (int)$rule['anchor_day']);
                $periodEnd = (new DateTimeImmutable($next, new DateTimeZone('UTC')))->modify('-1 day')->format('Y-m-d');
                $days = (int)($this->settings->view()['billing']['paymentDays'] ?? 14);
                $invoice = $this->saveDraft(['accountId' => $accountId, 'customerName' => $rule['customer_name'],
                    'recipientType' => $rule['recipient_type'],
                    'customerAddress' => $rule['customer_address'], 'customerEmail' => $rule['customer_email'],
                    'description' => 'Abonnement ' . $rule['plan_id'] . ': ' . $rule['next_on'] . ' t/m ' . $periodEnd,
                    'serviceOn' => $rule['next_on'], 'dueOn' => (new DateTimeImmutable($today))->modify('+' . $days . ' days')->format('Y-m-d'),
                    'quantity' => 1, 'unitPrice' => number_format((int)$rule['unit_cents'] / 100, 2, '.', ''),
                    'vat' => number_format((int)$rule['vat_basis_points'] / 100, 2, '.', ''),
                    'requestKey' => 'renewal-' . $rule['id'] . '-' . $rule['next_on']], 'billing-worker');
                $error = '';
                if ((int)$rule['auto_issue'] === 1) {
                    try {
                        $this->issue($invoice['id'], (int)$invoice['version'], 'billing-worker');
                    } catch (InvalidArgumentException $failure) {
                        $error = 'Concept gemaakt; controleer bedrijfsgegevens/btw/AGB-code en maak handmatig definitief.';
                    }
                }
                $this->pdo->prepare('UPDATE billing_recurring SET next_on = ?, last_error = ?, version = version + 1, updated_at = ? WHERE account_id = ?')
                    ->execute([$next, $error, gmdate('Y-m-d H:i:s'), $accountId]);
                return ['status' => 'created'];
            });
            $counts[$result['status']]++;
        }
        return $counts;
    }

    public static function nextPeriod(string $start, string $period, int $anchor): string
    {
        $date = new DateTimeImmutable(self::date($start), new DateTimeZone('UTC'));
        if (!in_array($period, ['month', 'year'], true)) {
            throw new InvalidArgumentException('Ongeldige factuurperiode.');
        }
        $next = $period === 'month' ? $date->modify('first day of next month')
            : $date->setDate((int)$date->format('Y') + 1, (int)$date->format('m'), 1);
        return $next->setDate((int)$next->format('Y'), (int)$next->format('m'), min(max(1, $anchor), (int)$next->format('t')))->format('Y-m-d');
    }

    public static function date(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $value)) {
            throw new InvalidArgumentException('Vul een geldige datum in.');
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
        if (!$date || $date->format('Y-m-d') !== $value || substr($value, 0, 4) < '1000') {
            throw new InvalidArgumentException('Vul een geldige datum in.');
        }
        return $value;
    }

    private static function recipient(mixed $value): string
    {
        if (!is_string($value) || !in_array($value, ['customer', 'insurer'], true)) {
            throw new InvalidArgumentException('Kies klant of zorgverzekeraar als ontvanger.');
        }
        return $value;
    }

    private static function money(mixed $value): int
    {
        $value = str_replace(',', '.', AdminSettings::text($value, 12));
        if (!preg_match('/^(\d{1,6})(?:\.(\d{1,2}))?$/D', $value, $parts)) {
            throw new InvalidArgumentException('Gebruik een bedrag met maximaal twee decimalen.');
        }
        return (int)$parts[1] * 100 + (int)str_pad($parts[2] ?? '', 2, '0');
    }

    private function lock(bool $lock): string
    {
        return $lock && $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
    }

    private function transaction(callable $operation): array
    {
        $nested = $this->pdo->inTransaction();
        $savepoint = 'billing_' . bin2hex(random_bytes(6));
        $nested ? $this->pdo->exec('SAVEPOINT ' . $savepoint) : $this->pdo->beginTransaction();
        try {
            $result = $operation();
            $nested ? $this->pdo->exec('RELEASE SAVEPOINT ' . $savepoint) : $this->pdo->commit();
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
