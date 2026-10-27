<?php
declare(strict_types=1);

final class AdminUserDirectory
{
    private PDO $pdo;
    private array $tables = [];

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function users(string $search = '', string $status = '', int $page = 1, int $pageSize = 25): array
    {
        $pageSize = max(1, min(100, $pageSize));
        $conditions = [];
        $parameters = [];
        $access = $this->hasTable('account_access_controls');
        $trashCondition = 'EXISTS (SELECT 1 FROM account_access_controls access_state WHERE access_state.account_id = p.account_id AND access_state.trashed_at IS NOT NULL)';
        if ($access) $conditions[] = ($status === 'trash' ? '' : 'NOT ') . $trashCondition;
        elseif ($status === 'trash' || $status === 'blocked') $conditions[] = '1 = 0';
        $search = substr(trim($search), 0, 255);
        if ($search !== '') {
            $pattern = '%' . strtr($search, ['!' => '!!', '%' => '!%', '_' => '!_']) . '%';
            $parts = [];
            foreach (['p.display_name', 'p.jid', 'p.account_id'] as $column) {
                $parts[] = "$column LIKE ? ESCAPE '!'";
                $parameters[] = $pattern;
            }
            if ($this->hasTable('account_identities')) {
                $parts[] = "EXISTS (SELECT 1 FROM account_identities search_identity WHERE search_identity.account_id = p.account_id AND search_identity.email LIKE ? ESCAPE '!')";
                $parameters[] = $pattern;
            }
            $conditions[] = '(' . implode(' OR ', $parts) . ')';
        }
        if ($status === 'blocked' && $access) {
            $conditions[] = 'EXISTS (SELECT 1 FROM account_access_controls access_state WHERE access_state.account_id = p.account_id AND access_state.web_blocked = 1)';
        } elseif ($status !== '' && !in_array($status, ['trash', 'blocked'], true)) {
            if (!in_array($status, ['active', 'trial', 'suspended', 'closed'], true)) {
                throw new InvalidArgumentException('Ongeldige accountstatus.');
            }
            $conditions[] = 'p.account_status = ?';
            $parameters[] = $status;
        }
        $where = $conditions ? ' WHERE ' . implode(' AND ', $conditions) : '';
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM account_profiles p' . $where);
        $statement->execute($parameters);
        $total = (int)$statement->fetchColumn();
        $page = max(1, min($page, max(1, (int)ceil($total / $pageSize))));
        $offset = ($page - 1) * $pageSize;
        $statement = $this->pdo->prepare(
            $this->userSelect() . $where . " ORDER BY p.display_name, p.account_id LIMIT $pageSize OFFSET $offset"
        );
        $statement->execute($parameters);
        return [
            'items' => $statement->fetchAll(PDO::FETCH_ASSOC),
            'total' => $total,
            'page' => $page,
            'pageSize' => $pageSize,
        ];
    }

    public function user(string $accountId): ?array
    {
        $statement = $this->pdo->prepare($this->userSelect() . ' WHERE p.account_id = ?');
        $statement->execute([$accountId]);
        $account = $statement->fetch(PDO::FETCH_ASSOC);
        if (!is_array($account)) {
            return null;
        }
        $account['identities'] = [];
        if ($this->hasTable('account_identities')) {
            $statement = $this->pdo->prepare(
                'SELECT provider, email, email_verified, linked_at, last_used_at
                 FROM account_identities WHERE account_id = ? ORDER BY provider, email'
            );
            $statement->execute([$accountId]);
            $account['identities'] = $statement->fetchAll(PDO::FETCH_ASSOC);
        }
        return $account;
    }

    public function activity(string $accountId, array $filters = []): array
    {
        $from = $this->dateFilter((string)($filters['from'] ?? ''));
        $to = $this->dateFilter((string)($filters['to'] ?? ''));
        if ($from !== null && $to !== null && $from > $to) {
            throw new InvalidArgumentException('De begindatum moet voor of op de einddatum liggen.');
        }
        $kind = (string)($filters['kind'] ?? '');
        if (!in_array($kind, ['', 'contact', 'group'], true)) {
            throw new InvalidArgumentException('Ongeldig gesprekstype.');
        }
        $peer = trim((string)($filters['peer'] ?? ''));
        if (strlen($peer) > 255) {
            throw new InvalidArgumentException('De gesprekspartner is te lang.');
        }
        $pageSize = 50;
        $sources = [];
        $queries = [];
        $parameters = [];
        if ($this->hasTable('message_history')) {
            $sources[] = 'message_history';
            $queries[] = "SELECT id AS event_id, 'message' AS event_type, conversation_peer,
                conversation_name, conversation_kind, direction, status, message_timestamp AS happened_at,
                NULL AS ended_at, '' AS call_type, 0 AS duration_seconds
                FROM message_history WHERE account_id = ?";
            $parameters[] = $accountId;
        }
        if ($this->hasTable('conversation_history')) {
            $sources[] = 'conversation_history';
            $queries[] = "SELECT id AS event_id, 'call' AS event_type, conversation_peer,
                conversation_name, conversation_kind, direction, status, started_at AS happened_at,
                ended_at, call_type, duration_seconds
                FROM conversation_history WHERE account_id = ?";
            $parameters[] = $accountId;
        }
        if (!$queries) {
            return ['items' => [], 'conversations' => [], 'conversationsTruncated' => false,
                'total' => 0, 'page' => 1, 'pageSize' => $pageSize, 'sources' => []];
        }
        $conditions = [];
        if ($from !== null) {
            $conditions[] = 'happened_at >= ?';
            $parameters[] = $from->format('Y-m-d H:i:s');
        }
        if ($to !== null) {
            $conditions[] = 'happened_at < ?';
            $parameters[] = $to->modify('+1 day')->format('Y-m-d H:i:s');
        }
        if ($kind !== '') {
            $conditions[] = 'conversation_kind = ?';
            $parameters[] = $kind;
        }
        if ($peer !== '') {
            $conditions[] = 'conversation_peer = ?';
            $parameters[] = $peer;
        }
        $source = ' FROM (' . implode(' UNION ALL ', $queries) . ') activity';
        $where = $conditions ? ' WHERE ' . implode(' AND ', $conditions) : '';
        $statement = $this->pdo->prepare('SELECT COUNT(*)' . $source . $where);
        $statement->execute($parameters);
        $total = (int)$statement->fetchColumn();
        $page = max(1, min((int)($filters['page'] ?? 1), max(1, (int)ceil($total / $pageSize))));
        $offset = ($page - 1) * $pageSize;
        $statement = $this->pdo->prepare(
            'SELECT event_id, event_type, conversation_peer, conversation_name, conversation_kind,
                direction, status, happened_at, ended_at, call_type, duration_seconds'
            . $source . $where . " ORDER BY happened_at DESC, event_type, event_id DESC LIMIT $pageSize OFFSET $offset"
        );
        $statement->execute($parameters);
        $items = $statement->fetchAll(PDO::FETCH_ASSOC);
        $statement = $this->pdo->prepare(
            "SELECT conversation_peer, conversation_kind, MAX(conversation_name) AS conversation_name,
                SUM(CASE WHEN event_type = 'message' THEN 1 ELSE 0 END) AS message_count,
                SUM(CASE WHEN event_type = 'call' THEN 1 ELSE 0 END) AS call_count,
                SUM(CASE WHEN event_type = 'message' AND direction = 'self' THEN 1 ELSE 0 END) AS sent_count,
                SUM(CASE WHEN event_type = 'message' AND direction = 'peer' THEN 1 ELSE 0 END) AS received_count,
                MIN(happened_at) AS first_activity, MAX(happened_at) AS last_activity"
            . $source . $where . ' GROUP BY conversation_peer, conversation_kind
                ORDER BY last_activity DESC, conversation_peer, conversation_kind LIMIT 101'
        );
        $statement->execute($parameters);
        $conversations = $statement->fetchAll(PDO::FETCH_ASSOC);
        return [
            'items' => $items,
            'conversations' => array_slice($conversations, 0, 100),
            'conversationsTruncated' => count($conversations) > 100,
            'total' => $total,
            'page' => $page,
            'pageSize' => $pageSize,
            'sources' => $sources,
        ];
    }

    public function recordAccess(string $actorId, string $action, string $accountId = ''): void
    {
        $statement = $this->pdo->prepare(
            'INSERT INTO admin_audit_log (actor_id, action, target_account_id, created_at) VALUES (?, ?, ?, ?)'
        );
        $statement->execute([$actorId, $action, $accountId, gmdate('Y-m-d H:i:s')]);
    }

    private function userSelect(): string
    {
        $columns = [
            'p.account_id', 'p.jid', 'p.display_name', 'p.provider_id', 'p.preferred_language',
            'p.phone_number', 'p.created_at', 'p.updated_at', 'p.subscription_plan', 'p.account_status',
            'p.subscription_expires_at', 'p.admin_note',
        ];
        $joins = [];
        if ($this->hasTable('account_access_controls')) {
            $columns[] = 'COALESCE(access_state.web_blocked, 0) AS web_blocked';
            $columns[] = 'access_state.trashed_at';
            $columns[] = 'COALESCE(access_state.version, 1) AS access_version';
            $joins[] = 'LEFT JOIN account_access_controls access_state ON access_state.account_id = p.account_id';
        } else {
            $columns[] = '0 AS web_blocked';
            $columns[] = 'NULL AS trashed_at';
            $columns[] = '1 AS access_version';
        }
        if ($this->hasTable('account_identities')) {
            $columns[] = 'identity_summary.email';
            $columns[] = 'identity_summary.last_login_at';
            $joins[] = "LEFT JOIN (SELECT account_id, MIN(NULLIF(email, '')) AS email,
                MAX(last_used_at) AS last_login_at FROM account_identities GROUP BY account_id)
                identity_summary ON identity_summary.account_id = p.account_id";
        } else {
            $columns[] = "'' AS email";
            $columns[] = 'NULL AS last_login_at';
        }
        foreach (['message_history' => ['account_id', 'message_count'], 'uploaded_files' => ['uploader_account_id', 'upload_count']] as $table => [$accountColumn, $countColumn]) {
            if ($this->hasTable($table)) {
                $columns[] = "COALESCE($countColumn.total, 0) AS $countColumn";
                $joins[] = "LEFT JOIN (SELECT $accountColumn AS account_id, COUNT(*) AS total
                    FROM $table GROUP BY $accountColumn) $countColumn ON $countColumn.account_id = p.account_id";
            } else {
                $columns[] = "0 AS $countColumn";
            }
        }
        return 'SELECT ' . implode(', ', $columns) . ' FROM account_profiles p ' . implode(' ', $joins);
    }

    private function dateFilter(string $value): ?DateTimeImmutable
    {
        if ($value === '') {
            return null;
        }
        $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value, new DateTimeZone('UTC'));
        if ($date === false || $date->format('Y-m-d') !== $value) {
            throw new InvalidArgumentException('Gebruik een geldige datum (jjjj-mm-dd).');
        }
        return $date;
    }

    private function hasTable(string $table): bool
    {
        if (!array_key_exists($table, $this->tables)) {
            try {
                $this->pdo->query("SELECT 1 FROM $table LIMIT 0");
                $this->tables[$table] = true;
            } catch (PDOException $error) {
                if (($error->errorInfo[1] ?? null) !== 1146 && !str_contains($error->getMessage(), 'no such table:')) {
                    throw $error;
                }
                $this->tables[$table] = false;
            }
        }
        return $this->tables[$table];
    }
}
