<?php
declare(strict_types=1);

require_once __DIR__ . '/AdminSettings.php';
require_once __DIR__ . '/SubscriptionManager.php';

final class IntakeDenied extends RuntimeException {}
final class IntakeUnavailable extends RuntimeException {}

final class IntakeManager
{
    public const MAX_FILE_BYTES = 4194304;
    private PDO $pdo;
    private array $config;
    private ?string $key;
    private array $insurers;

    public function __construct(PDO $pdo, ?array $config = null, ?string $key = null)
    {
        $this->pdo = $pdo;
        $this->config = $config ?? ((new AdminSettings())->configuration()['intake'] ?? []);
        $this->key = $key;
        if ($key === null) {
            $keyPath = dirname(__DIR__) . '/storage/intake.key';
            if (is_file($keyPath)) {
                $decoded = base64_decode(trim((string)file_get_contents($keyPath)), true);
                $this->key = is_string($decoded) && strlen($decoded) === 32 ? $decoded : null;
            }
        }
        if ($this->key !== null && strlen($this->key) !== 32) {
            throw new RuntimeException('Intake-encryptiesleutel ongeldig.');
        }
        $this->insurers = json_decode(file_get_contents(dirname(__DIR__) . '/data/insurers.json'), true, 512, JSON_THROW_ON_ERROR);
    }

    public function ensureSchema(): void
    {
        $this->pdo->exec(file_get_contents(dirname(__DIR__) . '/intake-schema.sql'));
    }

    public static function reviewer(?array $admin): bool
    {
        return $admin !== null && (int)($admin['enabled'] ?? 0) === 1
            && (in_array($admin['role'] ?? '', ['owner', 'admin'], true)
                || (($admin['role'] ?? '') === 'staff' && (int)($admin['can_review_intake'] ?? 0) === 1));
    }

    public function readiness(): array
    {
        $privacy = $this->config['privacy_url'] ?? '';
        $privacyReady = is_string($privacy) && filter_var($privacy, FILTER_VALIDATE_URL)
            && parse_url($privacy, PHP_URL_SCHEME) === 'https' && parse_url($privacy, PHP_URL_USER) === null;
        $base = ($this->config['enabled'] ?? false) === true && $privacyReady
            && is_string($this->config['privacy_version'] ?? null) && trim($this->config['privacy_version']) !== ''
            && (int)($this->config['retention_days'] ?? 0) > 0 && (int)$this->config['retention_days'] <= 3650
            && $this->key !== null && function_exists('openssl_encrypt');
        $medical = $base && ($this->config['medical_processing_approved'] ?? false) === true
            && trim((string)($this->config['medical_basis'] ?? '')) !== '';
        $bsn = $base && ($this->config['bsn_processing_approved'] ?? false) === true
            && trim((string)($this->config['bsn_legal_basis'] ?? '')) !== '';
        $scanner = $this->config['scanner_path'] ?? '';
        return ['medicalReady' => $medical && is_string($scanner) && $scanner !== '' && is_file($scanner) && function_exists('proc_open'),
            'bsnReady' => $bsn, 'privacyUrl' => $privacyReady ? $privacy : '',
            'privacyVersion' => $this->config['privacy_version'] ?? '', 'retentionDays' => (int)($this->config['retention_days'] ?? 0),
            'maxFileBytes' => self::MAX_FILE_BYTES];
    }

    public function insurers(): array
    {
        return $this->insurers;
    }

    public function plans(bool $all = false): array
    {
        $where = $all ? '' : ' WHERE plans.enabled = 1 AND rules.published = 1';
        return $this->pdo->query('SELECT plans.plan_id, plans.name, plans.description, plans.price_cents, plans.billing_period,
            plans.version AS plan_version, plans.enabled, COALESCE(rules.published, 0) AS published,
            COALESCE(rules.requires_documents, 0) AS requires_documents, COALESCE(rules.requires_bsn, 0) AS requires_bsn,
            COALESCE(rules.version, 0) AS rule_version
            FROM subscription_plans plans LEFT JOIN intake_plan_rules rules ON rules.plan_id = plans.plan_id'
            . $where . ' ORDER BY plans.name, plans.plan_id')->fetchAll(PDO::FETCH_ASSOC);
    }

    public function saveRule(array $input, string $actor): void
    {
        $planId = AdminSettings::text($input['planId'] ?? '', 32);
        foreach (['published', 'requiresDocuments', 'requiresBsn'] as $flag) {
            if (!is_bool($input[$flag] ?? null)) {
                throw new InvalidArgumentException('Ongeldige aanmeldvoorwaarde.');
            }
        }
        $version = AdminSettings::integer($input['version'] ?? 0, 0, PHP_INT_MAX);
        $this->transaction(function () use ($input, $planId, $actor, $version): array {
            $statement = $this->pdo->prepare('SELECT plan_id FROM subscription_plans WHERE plan_id = ?' . $this->lock());
            $statement->execute([$planId]);
            if (!$statement->fetchColumn()) {
                throw new InvalidArgumentException('Plan niet gevonden.');
            }
            $statement->closeCursor();
            $statement = $this->pdo->prepare('SELECT version FROM intake_plan_rules WHERE plan_id = ?' . $this->lock());
            $statement->execute([$planId]);
            $current = $statement->fetchColumn();
            $statement->closeCursor();
            if (($current === false ? 0 : (int)$current) !== $version) {
                throw new SubscriptionConflict('Aanmeldvoorwaarden zijn gewijzigd. Ververs eerst.');
            }
            if ($current === false) {
                $this->pdo->prepare('INSERT INTO intake_plan_rules (plan_id, published, requires_documents, requires_bsn)
                    VALUES (?, ?, ?, ?)')->execute([$planId, (int)$input['published'], (int)$input['requiresDocuments'], (int)$input['requiresBsn']]);
            } else {
                $this->pdo->prepare('UPDATE intake_plan_rules SET published = ?, requires_documents = ?, requires_bsn = ?,
                    version = version + 1 WHERE plan_id = ?')->execute([(int)$input['published'], (int)$input['requiresDocuments'], (int)$input['requiresBsn'], $planId]);
            }
            $this->audit($actor, 'update_intake_rule');
            return [];
        });
    }

    public function current(string $accountId): ?array
    {
        $statement = $this->pdo->prepare("SELECT id FROM intake_applications WHERE account_id = ? AND status NOT IN ('withdrawn', 'expired') ORDER BY created_at DESC, id DESC LIMIT 1");
        $statement->execute([$accountId]);
        $identifier = $statement->fetchColumn();
        $statement->closeCursor();
        return $identifier === false ? null : $this->view($identifier, $accountId, 'user:' . $accountId);
    }

    public function start(string $accountId, array $input): array
    {
        $planId = AdminSettings::text($input['planId'] ?? '', 32);
        return $this->transaction(function () use ($accountId, $input, $planId): array {
            $this->account($accountId, true);
            $statement = $this->pdo->prepare("SELECT id FROM intake_applications WHERE account_id = ? AND status NOT IN ('withdrawn', 'expired') LIMIT 1");
            $statement->execute([$accountId]);
            if ($statement->fetchColumn() !== false) {
                throw new SubscriptionConflict('Er is al een aanmelding. Open die, of trek die eerst in.');
            }
            $statement->closeCursor();
            $plan = $this->plan($planId);
            if ((int)$plan['plan_version'] !== ($input['planVersion'] ?? null) || (int)$plan['rule_version'] !== ($input['ruleVersion'] ?? null)) {
                throw new SubscriptionConflict('Het plan is gewijzigd. Kies het opnieuw.');
            }
            $this->requireReady($plan);
            $identifier = bin2hex(random_bytes(16));
            $days = $this->sensitive($plan) ? (int)$this->config['retention_days'] : 30;
            $now = gmdate('Y-m-d H:i:s');
            $expires = gmdate('Y-m-d H:i:s', time() + $days * 86400);
            $this->pdo->prepare('INSERT INTO intake_applications
                (id, account_id, plan_id, plan_version, rule_version, plan_name, price_cents, billing_period,
                requires_documents, requires_bsn, created_at, updated_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
                ->execute([$identifier, $accountId, $planId, $plan['plan_version'], $plan['rule_version'], $plan['name'],
                    $plan['price_cents'], $plan['billing_period'], $plan['requires_documents'], $plan['requires_bsn'], $now, $now, $expires]);
            $this->audit('user:' . $accountId, 'start_application', $identifier);
            return $this->view($identifier, $accountId, 'user:' . $accountId);
        });
    }

    public function view(string $identifier, ?string $accountId, string $actor): array
    {
        $row = $this->row($identifier, $accountId);
        $this->audit($actor, 'view_application', $identifier);
        $payload = $row['payload'] === null ? [] : json_decode($this->decrypt($row['payload'], $identifier . ':payload'), true, 512, JSON_THROW_ON_ERROR);
        unset($row['payload']);
        $row['insurer'] = $payload['insurer'] ?? null;
        $row['bsnMasked'] = isset($payload['bsn']) ? '*****' . substr($payload['bsn'], -4) : '';
        $documents = $this->pdo->prepare('SELECT id, kind, extension, file_size, created_at FROM intake_documents WHERE application_id = ? ORDER BY kind');
        $documents->execute([$identifier]);
        $row['documents'] = $documents->fetchAll(PDO::FETCH_ASSOC);
        return $row;
    }

    public function listing(int $page): array
    {
        $total = (int)$this->pdo->query('SELECT COUNT(*) FROM intake_applications')->fetchColumn();
        $page = max(1, min($page, max(1, (int)ceil($total / 25))));
        $offset = ($page - 1) * 25;
        $items = $this->pdo->query('SELECT applications.id, applications.account_id, accounts.display_name, applications.plan_name,
            applications.status, applications.created_at, applications.submitted_at FROM intake_applications applications
            LEFT JOIN account_profiles accounts ON accounts.account_id = applications.account_id
            ORDER BY applications.created_at DESC, applications.id DESC LIMIT 25 OFFSET ' . $offset)->fetchAll(PDO::FETCH_ASSOC);
        return ['items' => $items, 'page' => $page, 'pageSize' => 25, 'total' => $total];
    }

    public function saveDetails(string $accountId, array $input): array
    {
        return $this->transaction(function () use ($accountId, $input): array {
            $row = $this->editable($input, $accountId);
            $bsn = $input['bsn'] ?? '';
            if (!is_string($bsn)) {
                throw new InvalidArgumentException('Ongeldig BSN.');
            }
            $insurerId = AdminSettings::text($input['insurerId'] ?? '', 96);
            if (!$this->sensitive($row)) {
                if ($bsn !== '' || $insurerId !== '') {
                    throw new InvalidArgumentException('Dit abonnement vraagt geen BSN of zorgverzekeraar.');
                }
            } else {
                $this->requireReady($row);
                $previous = $row['payload'] === null ? [] : json_decode($this->decrypt($row['payload'], $row['id'] . ':payload'), true, 512, JSON_THROW_ON_ERROR);
                $matches = array_values(array_filter($this->insurers['items'], fn(array $entry): bool => $entry['id'] === $insurerId));
                if (!$matches) {
                    throw new InvalidArgumentException('Kies een zorgverzekeraar uit de lijst.');
                }
                $payload = ['insurer' => $matches[0]];
                if ((int)$row['requires_bsn'] === 1) {
                    $payload['bsn'] = $bsn === '' && isset($previous['bsn']) ? $previous['bsn'] : self::bsn($bsn);
                } elseif ($bsn !== '') {
                    throw new InvalidArgumentException('Dit abonnement vraagt geen BSN.');
                }
                $cipher = $this->encrypt(json_encode($payload, JSON_THROW_ON_ERROR), $row['id'] . ':payload');
                $this->pdo->prepare('UPDATE intake_applications SET payload = ?, version = version + 1, updated_at = ? WHERE id = ?')
                    ->execute([$cipher, gmdate('Y-m-d H:i:s'), $row['id']]);
            }
            $this->audit('user:' . $accountId, 'save_application', $row['id']);
            return $this->view($row['id'], $accountId, 'user:' . $accountId);
        });
    }

    public function upload(string $accountId, array $input, array $file): array
    {
        $row = $this->row(AdminSettings::text($input['id'] ?? '', 32), $accountId);
        $this->requireReady($row);
        if ((int)$row['requires_documents'] !== 1) {
            throw new InvalidArgumentException('Dit abonnement vraagt geen medische documenten.');
        }
        $kind = AdminSettings::text($input['kind'] ?? '', 20);
        if (!in_array($kind, ['audiogram', 'prescription'], true)) {
            throw new InvalidArgumentException('Kies audiogram of voorschrift.');
        }
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'] ?? '')) {
            throw new InvalidArgumentException('Upload mislukt. Kies een PDF, PNG of JPEG van maximaal 4 MB.');
        }
        $path = $file['tmp_name'];
        $size = filesize($path);
        if ($size < 1 || $size > self::MAX_FILE_BYTES) {
            throw new InvalidArgumentException('Maximaal 4 MB per document.');
        }
        $content = file_get_contents($path);
        $extension = self::documentExtension($content);
        $this->scan($path);
        return $this->storeDocument($accountId, $input, $kind, $content, $extension);
    }

    private function storeDocument(string $accountId, array $input, string $kind, string $content, string $extension): array
    {
        return $this->transaction(function () use ($accountId, $input, $kind, $content, $extension): array {
            $row = $this->editable($input, $accountId);
            $this->requireReady($row);
            $encrypted = $this->encrypt($content, $row['id'] . ':' . $kind);
            $this->pdo->prepare('DELETE FROM intake_documents WHERE application_id = ? AND kind = ?')->execute([$row['id'], $kind]);
            $this->pdo->prepare('INSERT INTO intake_documents (id, application_id, kind, extension, file_size, encrypted_content, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)')->execute([bin2hex(random_bytes(16)), $row['id'], $kind, $extension, strlen($content), $encrypted, gmdate('Y-m-d H:i:s')]);
            $this->pdo->prepare('UPDATE intake_applications SET version = version + 1, updated_at = ? WHERE id = ?')->execute([gmdate('Y-m-d H:i:s'), $row['id']]);
            $this->audit('user:' . $accountId, 'upload_' . $kind, $row['id']);
            return $this->view($row['id'], $accountId, 'user:' . $accountId);
        });
    }

    public function submit(string $accountId, array $input): array
    {
        return $this->transaction(function () use ($accountId, $input): array {
            $row = $this->editable($input, $accountId);
            $this->account($accountId);
            $plan = $this->plan($row['plan_id']);
            if ((int)$plan['plan_version'] !== (int)$row['plan_version'] || (int)$plan['rule_version'] !== (int)$row['rule_version']) {
                throw new SubscriptionConflict('Het plan of de voorwaarden zijn gewijzigd. Trek deze aanmelding in en kies opnieuw.');
            }
            $this->requireReady($row);
            if (($input['confirmed'] ?? false) !== true) {
                throw new InvalidArgumentException('Bevestig eerst de aanmelding.');
            }
            if ($this->sensitive($row)) {
                if (($input['privacyVersion'] ?? '') !== $this->config['privacy_version']) {
                    throw new SubscriptionConflict('Lees de actuele privacy-informatie opnieuw.');
                }
                $payload = $row['payload'] === null ? [] : json_decode($this->decrypt($row['payload'], $row['id'] . ':payload'), true, 512, JSON_THROW_ON_ERROR);
                if (empty($payload['insurer'])) {
                    throw new InvalidArgumentException('Vul eerst de zorgverzekeraar in.');
                }
                if ((int)$row['requires_bsn'] === 1) {
                    self::bsn($payload['bsn'] ?? '');
                }
                if ((int)$row['requires_documents'] === 1) {
                    $statement = $this->pdo->prepare('SELECT kind FROM intake_documents WHERE application_id = ?');
                    $statement->execute([$row['id']]);
                    if (array_diff(['audiogram', 'prescription'], $statement->fetchAll(PDO::FETCH_COLUMN))) {
                        throw new InvalidArgumentException('Upload zowel het audiogram als het voorschrift van arts/audioloog.');
                    }
                }
            }
            $this->pdo->prepare("UPDATE intake_applications SET status = 'submitted', consent_version = ?, feedback_code = '',
                submitted_at = ?, updated_at = ?, version = version + 1 WHERE id = ?")
                ->execute([$this->sensitive($row) ? $this->config['privacy_version'] : 'general-1', gmdate('Y-m-d H:i:s'), gmdate('Y-m-d H:i:s'), $row['id']]);
            $this->audit('user:' . $accountId, 'submit_application', $row['id']);
            return $this->view($row['id'], $accountId, 'user:' . $accountId);
        });
    }

    public function review(array $input, string $actor): array
    {
        return $this->transaction(function () use ($input, $actor): array {
            $row = $this->row(AdminSettings::text($input['id'] ?? '', 32), null, true);
            $this->checkVersion($row, $input);
            $status = $input['status'] ?? '';
            $feedback = $input['feedback'] ?? '';
            if (!in_array($row['status'], ['submitted', 'processing', 'needs_info'], true)
                || !in_array($status, ['processing', 'needs_info', 'reviewed', 'closed'], true)
                || !in_array($feedback, ['', 'contact_us', 'replace_audiogram', 'replace_prescription', 'check_insurer', 'complete'], true)) {
                throw new InvalidArgumentException('Ongeldige status of vervolgactie.');
            }
            if ($status === 'needs_info' && $feedback === '') {
                throw new InvalidArgumentException('Kies welke aanvullende informatie nodig is.');
            }
            $this->pdo->prepare('UPDATE intake_applications SET status = ?, feedback_code = ?, reviewed_at = ?, updated_at = ?,
                version = version + 1 WHERE id = ?')->execute([$status, $feedback, gmdate('Y-m-d H:i:s'), gmdate('Y-m-d H:i:s'), $row['id']]);
            $this->audit($actor, 'review_' . $status, $row['id']);
            return $this->view($row['id'], null, $actor);
        });
    }

    public function withdraw(string $accountId, array $input): array
    {
        return $this->transaction(function () use ($accountId, $input): array {
            $row = $this->row(AdminSettings::text($input['id'] ?? '', 32), $accountId, true);
            $this->checkVersion($row, $input);
            if (($input['confirmed'] ?? false) !== true) {
                throw new InvalidArgumentException('Bevestig het intrekken en verwijderen van de zorggegevens.');
            }
            $this->purgeRow($row['id'], 'withdrawn');
            $this->audit('user:' . $accountId, 'withdraw_application', $row['id']);
            return $this->view($row['id'], $accountId, 'user:' . $accountId);
        });
    }

    public function revealBsn(string $identifier, ?string $accountId, string $actor): string
    {
        $row = $this->row($identifier, $accountId);
        $this->audit($actor, 'reveal_bsn', $identifier);
        $payload = $row['payload'] === null ? [] : json_decode($this->decrypt($row['payload'], $identifier . ':payload'), true, 512, JSON_THROW_ON_ERROR);
        return $payload['bsn'] ?? '';
    }

    public function document(string $identifier, string $documentId, ?string $accountId, string $actor): array
    {
        $this->row($identifier, $accountId);
        $statement = $this->pdo->prepare('SELECT * FROM intake_documents WHERE id = ? AND application_id = ?');
        $statement->execute([$documentId, $identifier]);
        $file = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$file) {
            throw new IntakeDenied('Document niet beschikbaar.');
        }
        $this->audit($actor, 'download_document', $identifier);
        return ['name' => ($file['kind'] === 'audiogram' ? 'audiogram' : 'voorschrift') . '.' . $file['extension'],
            'content' => $this->decrypt($file['encrypted_content'], $identifier . ':' . $file['kind'])];
    }

    public function purgeExpired(): int
    {
        $statement = $this->pdo->prepare("SELECT id FROM intake_applications WHERE expires_at <= ? AND status NOT IN ('withdrawn', 'expired') LIMIT 100");
        $statement->execute([gmdate('Y-m-d H:i:s')]);
        $identifiers = $statement->fetchAll(PDO::FETCH_COLUMN);
        foreach ($identifiers as $identifier) {
            $this->transaction(function () use ($identifier): array {
                $row = $this->row($identifier, null, true, false);
                if ($row['expires_at'] <= gmdate('Y-m-d H:i:s')) {
                    $this->purgeRow($identifier, 'expired');
                    $this->audit('intake-worker', 'purge_expired', $identifier);
                }
                return [];
            });
        }
        return count($identifiers);
    }

    public function audit(string $actor, string $action, string $identifier = ''): void
    {
        $this->pdo->prepare('INSERT INTO intake_audit (actor_id, action, application_id, created_at) VALUES (?, ?, ?, ?)')
            ->execute([$actor, $action, $identifier, gmdate('Y-m-d H:i:s')]);
    }

    public static function bsn(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/^[0-9]{8,9}$/D', $value)) {
            throw new InvalidArgumentException('Vul een BSN van acht of negen cijfers in.');
        }
        $value = str_pad($value, 9, '0', STR_PAD_LEFT);
        $sum = -(int)$value[8];
        for ($position = 0; $position < 8; $position++) {
            $sum += (9 - $position) * (int)$value[$position];
        }
        if ($value === '000000000' || $sum % 11 !== 0) {
            throw new InvalidArgumentException('Controleer het BSN; de cijfercontrole klopt niet.');
        }
        return $value;
    }

    public static function documentExtension(string $content): string
    {
        if ($content === '' || strlen($content) > self::MAX_FILE_BYTES) {
            throw new InvalidArgumentException('Maximaal 4 MB per document.');
        }
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($content);
        $extensions = ['application/pdf' => 'pdf', 'image/png' => 'png', 'image/jpeg' => 'jpg'];
        if (!isset($extensions[$mime])) {
            throw new InvalidArgumentException('Alleen echte PDF-, PNG- of JPEG-bestanden zijn toegestaan.');
        }
        return $extensions[$mime];
    }

    private function plan(string $planId): array
    {
        $statement = $this->pdo->prepare('SELECT plans.plan_id, plans.name, plans.price_cents, plans.billing_period,
            plans.version AS plan_version, rules.version AS rule_version, rules.requires_bsn, rules.requires_documents
            FROM subscription_plans plans JOIN intake_plan_rules rules ON rules.plan_id = plans.plan_id
            WHERE plans.plan_id = ? AND plans.enabled = 1 AND rules.published = 1' . $this->lock());
        $statement->execute([$planId]);
        $plan = $statement->fetch(PDO::FETCH_ASSOC);
        $statement->closeCursor();
        if ($plan) {
            return $plan;
        }
        throw new InvalidArgumentException('Dit abonnement is niet beschikbaar voor aanmelding.');
    }

    private function account(string $accountId, bool $lock = false): void
    {
        $statement = $this->pdo->prepare('SELECT account_status FROM account_profiles WHERE account_id = ?' . ($lock ? $this->lock() : ''));
        $statement->execute([$accountId]);
        $status = $statement->fetchColumn();
        $statement->closeCursor();
        if (!in_array($status, ['active', 'trial'], true)) {
            throw new IntakeDenied('Log in met een actief eigen account.');
        }
    }

    private function row(string $identifier, ?string $accountId, bool $lock = false, bool $expiry = true): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM intake_applications WHERE id = ?'
            . ($accountId === null ? '' : ' AND account_id = ?') . ($lock ? $this->lock() : ''));
        $statement->execute($accountId === null ? [$identifier] : [$identifier, $accountId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC);
        $statement->closeCursor();
        if (!$row || ($expiry && $row['expires_at'] <= gmdate('Y-m-d H:i:s') && !in_array($row['status'], ['expired', 'withdrawn'], true))) {
            throw new IntakeDenied('Aanmelding niet beschikbaar of bewaartermijn verstreken.');
        }
        return $row;
    }

    private function editable(array $input, string $accountId): array
    {
        $row = $this->row(AdminSettings::text($input['id'] ?? '', 32), $accountId, true);
        $this->checkVersion($row, $input);
        if (!in_array($row['status'], ['draft', 'needs_info'], true)) {
            throw new SubscriptionConflict('Deze aanmelding kan nu niet worden aangepast.');
        }
        return $row;
    }

    private function checkVersion(array $row, array $input): void
    {
        if ((int)$row['version'] !== ($input['version'] ?? null)) {
            throw new SubscriptionConflict('De aanmelding is gewijzigd. Ververs eerst.');
        }
    }

    private function sensitive(array $row): bool
    {
        return (int)$row['requires_documents'] === 1 || (int)$row['requires_bsn'] === 1;
    }

    private function requireReady(array $row): void
    {
        $ready = $this->readiness();
        if (((int)$row['requires_documents'] === 1 && !$ready['medicalReady'])
            || ((int)$row['requires_bsn'] === 1 && !$ready['bsnReady'])) {
            throw new IntakeUnavailable('Deze zorgaanmelding is nog niet geactiveerd: privacy, wettelijke bevoegdheid en beveiligde opslag moeten eerst worden ingericht.');
        }
    }

    private function encrypt(string $plain, string $context): string
    {
        if ($this->key === null) {
            throw new IntakeUnavailable('Beveiligde opslag is niet ingericht.');
        }
        $nonce = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $nonce, $tag, $context, 16);
        if ($cipher === false) {
            throw new RuntimeException('Versleutelen mislukt.');
        }
        return base64_encode($nonce . $tag . $cipher);
    }

    private function decrypt(string $envelope, string $context): string
    {
        $raw = base64_decode($envelope, true);
        if ($this->key === null || $raw === false || strlen($raw) < 28) {
            throw new IntakeUnavailable('Beveiligde gegevens zijn niet leesbaar.');
        }
        $plain = openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16), $context);
        if ($plain === false) {
            throw new IntakeUnavailable('Beveiligde gegevens zijn niet leesbaar.');
        }
        return $plain;
    }

    private function scan(string $path): void
    {
        $pipes = [];
        $process = proc_open([$this->config['scanner_path'], '--no-summary', '--', $path],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null, null, ['bypass_shell' => true, 'create_no_window' => true]);
        if (!is_resource($process)) {
            throw new IntakeUnavailable('Bestandscontrole niet beschikbaar.');
        }
        fclose($pipes[0]);
        stream_set_blocking($pipes[1], false);
        stream_set_blocking($pipes[2], false);
        $deadline = microtime(true) + 20;
        do {
            stream_get_contents($pipes[1]);
            stream_get_contents($pipes[2]);
            $status = proc_get_status($process);
            if (!$status['running']) {
                break;
            }
            usleep(50000);
        } while (microtime(true) < $deadline);
        if ($status['running']) {
            proc_terminate($process);
        }
        fclose($pipes[1]);
        fclose($pipes[2]);
        proc_close($process);
        if ($status['running'] || $status['exitcode'] !== 0) {
            throw new InvalidArgumentException('Bestandscontrole niet geslaagd. Het document is niet opgeslagen.');
        }
    }

    private function purgeRow(string $identifier, string $status): void
    {
        $this->pdo->prepare('DELETE FROM intake_documents WHERE application_id = ?')->execute([$identifier]);
        $this->pdo->prepare("UPDATE intake_applications SET payload = NULL, status = ?, feedback_code = '',
            requires_documents = 0, requires_bsn = 0, version = version + 1, updated_at = ? WHERE id = ?")
            ->execute([$status, gmdate('Y-m-d H:i:s'), $identifier]);
    }

    private function lock(): string
    {
        return $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
    }

    private function transaction(callable $operation): array
    {
        $nested = $this->pdo->inTransaction();
        $savepoint = 'intake_' . bin2hex(random_bytes(6));
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
