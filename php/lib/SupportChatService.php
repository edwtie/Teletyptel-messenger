<?php
declare(strict_types=1);

require_once __DIR__ . '/AdminSession.php';

final class SupportChatFailure extends RuntimeException
{
    public int $status;

    public function __construct(string $message, int $status = 400)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

final class SupportChatService
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function ensureSchema(): void
    {
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' : '';
        foreach ([
            'support_chat_attachments' => '(attachment_id VARCHAR(48) NOT NULL PRIMARY KEY, thread_id VARCHAR(48) NOT NULL, sequence INTEGER NOT NULL, name VARCHAR(180) NOT NULL, mime VARCHAR(100) NOT NULL, size INTEGER NOT NULL, created INTEGER NOT NULL, content ' . ($suffix !== '' ? 'MEDIUMTEXT' : 'TEXT') . ' NOT NULL, UNIQUE(thread_id, sequence))',
            'support_chat_state' => '(id INTEGER NOT NULL PRIMARY KEY, secret VARCHAR(64) NOT NULL, stamp INTEGER NOT NULL DEFAULT 0)',
            'support_chat_threads' => '(thread_id VARCHAR(48) NOT NULL PRIMARY KEY, visitor_id VARCHAR(64) NOT NULL,
                visitor_name VARCHAR(80) NOT NULL, status VARCHAR(16) NOT NULL, staff_id VARCHAR(96) NULL,
                staff_version INTEGER NULL, created INTEGER NOT NULL, updated INTEGER NOT NULL, closed_at INTEGER NULL)',
            'support_chat_messages' => '(thread_id VARCHAR(48) NOT NULL, sequence INTEGER NOT NULL, author_kind VARCHAR(12) NOT NULL,
                author_id VARCHAR(96) NOT NULL, author_name VARCHAR(120) NOT NULL, body TEXT NOT NULL, created INTEGER NOT NULL,
                client_id VARCHAR(64) NOT NULL, PRIMARY KEY (thread_id, sequence), UNIQUE (thread_id, author_id, client_id))',
            'support_chat_presence' => '(staff_id VARCHAR(96) NOT NULL PRIMARY KEY, session_version INTEGER NOT NULL, seen INTEGER NOT NULL, available INTEGER NOT NULL DEFAULT 0)',
            'support_chat_limits' => '(bucket_key VARCHAR(128) NOT NULL PRIMARY KEY, hits INTEGER NOT NULL, expires INTEGER NOT NULL)',
            'support_chat_audit' => '(audit_id VARCHAR(48) NOT NULL PRIMARY KEY, thread_id VARCHAR(48) NOT NULL,
                actor_id VARCHAR(96) NOT NULL, action VARCHAR(16) NOT NULL, created INTEGER NOT NULL)'
        ] as $table => $definition) {
            $this->pdo->exec('CREATE TABLE IF NOT EXISTS ' . $table . ' ' . $definition . $suffix);
        }
        $insert = $suffix !== '' ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
        $this->pdo->prepare($insert . ' INTO support_chat_state (id, secret, stamp) VALUES (1, ?, 0)')->execute([bin2hex(random_bytes(32))]);
    }

    public static function staff(PDO $pdo, array &$session): array
    {
        $admin = AdminSession::current($pdo, $session);
        if (!$admin || !in_array($admin['role'], ['owner', 'admin', 'staff'], true)) {
            throw new SupportChatFailure('Log in met je eigen staff- of beheeraccount.', 401);
        }
        return $admin;
    }

    public function cleanup(): array
    {
        return $this->locked(function (): array {
            $now = time();
            $this->pdo->prepare("UPDATE support_chat_threads SET status = 'closed', closed_at = ?, updated = ? WHERE status <> 'closed' AND updated < ?")
                ->execute([$now, $now, $now - 86400]);
            $this->pdo->prepare("UPDATE support_chat_threads SET status = 'waiting', staff_id = NULL, staff_version = NULL
                WHERE status = 'active' AND NOT EXISTS (SELECT 1 FROM admin_users admin WHERE admin.admin_id = support_chat_threads.staff_id
                AND admin.enabled = 1 AND admin.role IN ('owner', 'admin', 'staff') AND admin.session_version = support_chat_threads.staff_version)")->execute();
            $expired = "SELECT thread_id FROM support_chat_threads WHERE closed_at IS NOT NULL AND closed_at < ?";
            foreach (['support_chat_attachments', 'support_chat_messages', 'support_chat_audit'] as $table) {
                $this->pdo->prepare('DELETE FROM ' . $table . ' WHERE thread_id IN (' . $expired . ')')->execute([$now - 30 * 86400]);
            }
            $statement = $this->pdo->prepare('DELETE FROM support_chat_threads WHERE closed_at IS NOT NULL AND closed_at < ?');
            $statement->execute([$now - 30 * 86400]);
            $removed = $statement->rowCount();
            $this->pdo->prepare('DELETE FROM support_chat_limits WHERE expires < ?')->execute([$now]);
            $this->pdo->prepare('DELETE FROM support_chat_presence WHERE seen < ?')->execute([$now - 45]);
            return ['removed' => $removed];
        });
    }

    public function visitorView(string $visitor, string $threadId = ''): array
    {
        if ($threadId === '') {
            $statement = $this->pdo->prepare('SELECT thread_id FROM support_chat_threads WHERE visitor_id = ? ORDER BY created DESC, thread_id DESC LIMIT 1');
            $statement->execute([$visitor]);
            $threadId = (string)($statement->fetchColumn() ?: '');
        }
        $thread = $threadId !== '' ? $this->thread($threadId) : null;
        if ($thread && !hash_equals($thread['visitor_id'], $visitor)) throw new SupportChatFailure('Gesprek niet gevonden.', 404);
        return ['thread' => $thread ? $this->publicThread($thread) : null,
            'messages' => $thread ? $this->messages($threadId) : [], 'available' => $this->available()];
    }

    public function visitorAction(string $visitor, string $address, array $input, ?array $attachment = null): array
    {
        return $this->locked(function () use ($visitor, $address, $input, $attachment): array {
            $action = $input['action'] ?? '';
            if ($action === 'start') {
                if (($input['acknowledged'] ?? false) !== true) throw new SupportChatFailure('Lees eerst de informatie over deze chat.');
                $name = $this->text($input['name'] ?? null, 80, false);
                $statement = $this->pdo->prepare("SELECT thread_id FROM support_chat_threads WHERE visitor_id = ? AND status <> 'closed' LIMIT 1");
                $statement->execute([$visitor]);
                if ($existing = $statement->fetchColumn()) return ['threadId' => $existing];
                $secret = (string)$this->pdo->query('SELECT secret FROM support_chat_state WHERE id = 1')->fetchColumn();
                $this->rate('start-ip-' . hash_hmac('sha256', $address, $secret), 5, 3600);
                $this->rate('start-visitor-' . $visitor, 5, 3600);
                $identifier = bin2hex(random_bytes(24));
                $this->pdo->prepare("INSERT INTO support_chat_threads (thread_id, visitor_id, visitor_name, status, created, updated) VALUES (?, ?, ?, 'waiting', ?, ?)")
                    ->execute([$identifier, $visitor, $name, time(), time()]);
                return ['threadId' => $identifier];
            }
            $thread = $this->thread($this->identifier($input['threadId'] ?? null));
            if (!hash_equals($thread['visitor_id'], $visitor)) throw new SupportChatFailure('Gesprek niet gevonden.', 404);
            if ($action === 'send') {
                $this->send($thread, 'visitor', $visitor, $thread['visitor_name'], $input, $attachment);
            } elseif ($action === 'close') {
                $this->close($thread, $visitor);
            } else throw new SupportChatFailure('Onbekende chatactie.');
            return ['threadId' => $thread['thread_id']];
        });
    }

    public function staffView(array $admin, string $threadId = '', int $page = 1, string $filter = 'open'): array
    {
        $this->checkStaff($admin);
        $insert = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? 'INSERT IGNORE' : 'INSERT OR IGNORE';
        $this->pdo->prepare($insert . ' INTO support_chat_presence VALUES (?, ?, ?, 0)')->execute([$admin['admin_id'], $admin['session_version'], time()]);
        $this->pdo->prepare('UPDATE support_chat_presence SET seen = ? WHERE staff_id = ? AND session_version = ?')->execute([time(), $admin['admin_id'], $admin['session_version']]);
        $thread = null;
        if ($threadId !== '') {
            $thread = $this->thread($threadId);
            $this->canRead($admin, $thread);
            $this->audit($threadId, $admin['admin_id'], 'view');
        }
        $page = max(1, min(10000, $page));
        $where = ['open' => "status <> 'closed'", 'waiting' => "status = 'waiting'", 'mine' => "staff_id = ? AND status <> 'closed'", 'closed' => "status = 'closed'"][$filter] ?? null;
        if ($where === null) throw new SupportChatFailure('Ongeldig filter.');
        $parameters = $filter === 'mine' ? [$admin['admin_id']] : [];
        if ($filter === 'closed' && $admin['role'] === 'staff') { $where .= ' AND staff_id = ?'; $parameters[] = $admin['admin_id']; }
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM support_chat_threads WHERE ' . $where);
        $statement->execute($parameters);
        $total = (int)$statement->fetchColumn();
        $statement = $this->pdo->prepare('SELECT * FROM support_chat_threads WHERE ' . $where . ' ORDER BY updated DESC, thread_id DESC LIMIT 30 OFFSET ' . (($page - 1) * 30));
        $statement->execute($parameters);
        $threads = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $item) {
            $threads[] = $this->publicThread($item) + ['mine' => $item['staff_id'] === $admin['admin_id'],
                'canRead' => $item['staff_id'] === $admin['admin_id'] || $admin['role'] !== 'staff'];
        }
        $presence = $this->pdo->prepare('SELECT available FROM support_chat_presence WHERE staff_id = ? AND session_version = ? AND seen >= ?');
        $presence->execute([$admin['admin_id'], $admin['session_version'], time() - 45]);
        return ['threads' => $threads, 'page' => $page, 'total' => $total, 'available' => (bool)$presence->fetchColumn(),
            'thread' => $thread ? $this->publicThread($thread) + ['mine' => $thread['staff_id'] === $admin['admin_id']] : null,
            'messages' => $thread ? $this->messages($threadId) : []];
    }

    public function staffAction(array $admin, array $input, ?array $attachment = null): array
    {
        return $this->locked(function () use ($admin, $input, $attachment): array {
            $this->checkStaff($admin);
            $action = $input['action'] ?? '';
            if ($action === 'presence') {
                if (!is_bool($input['available'] ?? null)) throw new SupportChatFailure('Kies je beschikbaarheid.');
                $this->pdo->prepare('DELETE FROM support_chat_presence WHERE staff_id = ?')->execute([$admin['admin_id']]);
                $this->pdo->prepare('INSERT INTO support_chat_presence VALUES (?, ?, ?, ?)')->execute([$admin['admin_id'], $admin['session_version'], time(), $input['available'] ? 1 : 0]);
                return [];
            }
            $thread = $this->thread($this->identifier($input['threadId'] ?? null));
            if ($action === 'claim') {
                if ($thread['status'] !== 'waiting') throw new SupportChatFailure('Dit gesprek is al opgepakt of afgesloten.', 409);
                $this->pdo->prepare("UPDATE support_chat_threads SET status = 'active', staff_id = ?, staff_version = ?, updated = ? WHERE thread_id = ?")
                    ->execute([$admin['admin_id'], $admin['session_version'], time(), $thread['thread_id']]);
                $this->audit($thread['thread_id'], $admin['admin_id'], 'claim');
            } else {
                $this->canRead($admin, $thread);
                if ($action === 'send') {
                    if ($thread['staff_id'] !== $admin['admin_id']) throw new SupportChatFailure('Alleen de toegewezen medewerker kan antwoorden.', 403);
                    $name = $this->text($admin['display_name'] ?: 'Medewerker', 120, false);
                    $this->send($thread, 'staff', $admin['admin_id'], $name, $input, $attachment);
                } elseif ($action === 'release') {
                    if ($thread['status'] !== 'active') throw new SupportChatFailure('Dit gesprek is niet in behandeling.', 409);
                    $this->pdo->prepare("UPDATE support_chat_threads SET status = 'waiting', staff_id = NULL, staff_version = NULL, updated = ? WHERE thread_id = ?")
                        ->execute([time(), $thread['thread_id']]);
                    $this->audit($thread['thread_id'], $admin['admin_id'], 'release');
                } elseif ($action === 'close') {
                    $this->close($thread, $admin['admin_id']);
                } else throw new SupportChatFailure('Onbekende chatactie.');
            }
            return ['threadId' => $thread['thread_id']];
        });
    }

    private function checkStaff(array $admin): void
    {
        $statement = $this->pdo->prepare('SELECT enabled, role, session_version FROM admin_users WHERE admin_id = ?');
        $statement->execute([$admin['admin_id'] ?? '']);
        $current = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$current || !(int)$current['enabled'] || !in_array($current['role'], ['owner', 'admin', 'staff'], true)
            || $current['role'] !== ($admin['role'] ?? '') || (int)$current['session_version'] !== (int)($admin['session_version'] ?? 0)) {
            throw new SupportChatFailure('Deze staffsessie is ingetrokken.', 401);
        }
    }

    private function canRead(array $admin, array $thread): void
    {
        if ($admin['role'] === 'staff' && $thread['staff_id'] !== $admin['admin_id']) {
            throw new SupportChatFailure('Pak eerst een wachtend gesprek op. Je kunt geen gesprekken van een andere medewerker openen.', 403);
        }
    }

    private function send(array $thread, string $kind, string $author, string $name, array $input, ?array $attachment = null): void
    {
        $body = $attachment ? '' : $this->text($input['text'] ?? null, 2000, true);
        $client = $this->identifier($input['clientId'] ?? null);
        $statement = $this->pdo->prepare('SELECT sequence FROM support_chat_messages WHERE thread_id = ? AND author_id = ? AND client_id = ?');
        $statement->execute([$thread['thread_id'], $author, $client]);
        if ($statement->fetchColumn() !== false) return;
        if ($thread['status'] === 'closed') throw new SupportChatFailure('Dit gesprek is afgesloten.', 409);
        $this->rate('send-' . $kind . '-' . hash('sha256', $author), 30, 60);
        $statement = $this->pdo->prepare('SELECT COALESCE(MAX(sequence), 0) FROM support_chat_messages WHERE thread_id = ?');
        $statement->execute([$thread['thread_id']]);
        $sequence = (int)$statement->fetchColumn() + 1;
        if ($sequence > 500) throw new SupportChatFailure('Dit gesprek is vol. Sluit het af en start zo nodig een nieuw gesprek.', 409);
        if ($attachment) {
            $statement = $this->pdo->prepare('SELECT COALESCE(SUM(size), 0) FROM support_chat_attachments WHERE thread_id = ?');
            $statement->execute([$thread['thread_id']]);
            if ((int)$statement->fetchColumn() + $attachment['size'] > 20 * 1024 * 1024) throw new SupportChatFailure('Maximaal 20 MB per gesprek / Maximum 20 MB per chat.', 413);
            $statement = $this->pdo->prepare('SELECT COALESCE(SUM(size), 0) FROM support_chat_attachments WHERE created >= ?');
            $statement->execute([time() - 86400]);
            if ((int)$statement->fetchColumn() + $attachment['size'] > 100 * 1024 * 1024) throw new SupportChatFailure('Uploadlimiet bereikt / Upload limit reached.', 429);
            $this->pdo->prepare('INSERT INTO support_chat_attachments VALUES (?, ?, ?, ?, ?, ?, ?, ?)')->execute([$attachment['id'], $thread['thread_id'], $sequence, $attachment['name'], $attachment['mime'], $attachment['size'], time(), $attachment['content']]);
        }
        $this->pdo->prepare('INSERT INTO support_chat_messages VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$thread['thread_id'], $sequence, $kind, $author, $name, $body, time(), $client]);
        $this->pdo->prepare('UPDATE support_chat_threads SET updated = ? WHERE thread_id = ?')->execute([time(), $thread['thread_id']]);
    }

    private function close(array $thread, string $actor): void
    {
        if ($thread['status'] === 'closed') return;
        $this->pdo->prepare("UPDATE support_chat_threads SET status = 'closed', updated = ?, closed_at = ? WHERE thread_id = ?")->execute([time(), time(), $thread['thread_id']]);
        $this->audit($thread['thread_id'], $actor, 'close');
    }

    private function thread(string $identifier): array
    {
        $statement = $this->pdo->prepare('SELECT * FROM support_chat_threads WHERE thread_id = ?');
        $statement->execute([$this->identifier($identifier)]);
        $thread = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$thread) throw new SupportChatFailure('Gesprek niet gevonden of bewaartermijn verstreken.', 404);
        return $thread;
    }

    private function publicThread(array $thread): array
    {
        $name = null;
        $online = false;
        if ($thread['staff_id']) {
            $statement = $this->pdo->prepare('SELECT admin.display_name, presence.seen FROM admin_users admin
                LEFT JOIN support_chat_presence presence ON presence.staff_id = admin.admin_id AND presence.session_version = admin.session_version
                WHERE admin.admin_id = ? AND admin.enabled = 1 AND admin.session_version = ?');
            $statement->execute([$thread['staff_id'], $thread['staff_version']]);
            if ($member = $statement->fetch(PDO::FETCH_ASSOC)) { $name = $member['display_name'] ?: 'Medewerker'; $online = (int)$member['seen'] >= time() - 45; }
        }
        return ['id' => $thread['thread_id'], 'name' => $thread['visitor_name'], 'status' => $thread['status'],
            'staffName' => $name, 'staffOnline' => $online, 'created' => (int)$thread['created'], 'updated' => (int)$thread['updated']];
    }

    private function messages(string $identifier): array
    {
        $statement = $this->pdo->prepare('SELECT sequence, author_kind AS kind, author_name AS name, body AS text, created FROM support_chat_messages WHERE thread_id = ? ORDER BY sequence LIMIT 500');
        $statement->execute([$identifier]);
        $messages = $statement->fetchAll(PDO::FETCH_ASSOC);
        $statement = $this->pdo->prepare('SELECT attachment_id AS id, sequence, name, mime, size FROM support_chat_attachments WHERE thread_id = ?');
        $statement->execute([$identifier]);
        $attachments = array_column($statement->fetchAll(PDO::FETCH_ASSOC), null, 'sequence');
        foreach ($messages as &$message) if (isset($attachments[$message['sequence']])) $message['attachment'] = $attachments[$message['sequence']];
        return $messages;
    }

    public function attachment(string $visitor, ?array $admin, string $threadId, string $identifier): array
    {
        $thread = $this->thread($threadId);
        if ($admin) { $this->checkStaff($admin); $this->canRead($admin, $thread); }
        elseif (!hash_equals($thread['visitor_id'], $visitor)) throw new SupportChatFailure('Bestand niet gevonden / File not found.', 404);
        $statement = $this->pdo->prepare('SELECT * FROM support_chat_attachments WHERE attachment_id = ? AND thread_id = ?');
        $statement->execute([$this->identifier($identifier), $threadId]);
        $file = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$file) throw new SupportChatFailure('Bestand niet gevonden / File not found.', 404);
        $this->audit($threadId, $admin['admin_id'] ?? $visitor, 'download');
        return $file;
    }

    private function available(): bool
    {
        $statement = $this->pdo->prepare("SELECT COUNT(*) FROM support_chat_presence presence JOIN admin_users admin ON admin.admin_id = presence.staff_id
            WHERE presence.seen >= ? AND presence.available = 1 AND admin.enabled = 1 AND admin.role IN ('owner', 'admin', 'staff') AND admin.session_version = presence.session_version");
        $statement->execute([time() - 45]);
        return (int)$statement->fetchColumn() > 0;
    }

    private function audit(string $thread, string $actor, string $action): void
    {
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM support_chat_audit WHERE thread_id = ? AND actor_id = ? AND action = ? AND created >= ?');
        $statement->execute([$thread, $actor, $action, time() - 60]);
        if ((int)$statement->fetchColumn() === 0) $this->pdo->prepare('INSERT INTO support_chat_audit VALUES (?, ?, ?, ?, ?)')->execute([bin2hex(random_bytes(24)), $thread, $actor, $action, time()]);
    }

    private function rate(string $key, int $maximum, int $seconds): void
    {
        $window = intdiv(time(), $seconds) * $seconds;
        $key .= '-' . $window;
        $statement = $this->pdo->prepare('SELECT hits FROM support_chat_limits WHERE bucket_key = ?');
        $statement->execute([$key]);
        $hits = $statement->fetchColumn();
        if ($hits !== false && (int)$hits >= $maximum) throw new SupportChatFailure('Even wachten: je hebt te veel aanvragen verstuurd. Probeer het later opnieuw.', 429);
        if ($hits === false) $this->pdo->prepare('INSERT INTO support_chat_limits VALUES (?, 1, ?)')->execute([$key, $window + $seconds]);
        else $this->pdo->prepare('UPDATE support_chat_limits SET hits = hits + 1 WHERE bucket_key = ?')->execute([$key]);
    }

    private function text($value, int $maximum, bool $multiline): string
    {
        if (!is_string($value) || !preg_match('//u', $value)) throw new SupportChatFailure('Vul geldige tekst in.');
        $value = trim($value);
        if ($value === '' || mb_strlen($value, 'UTF-8') > $maximum || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)
            || (!$multiline && preg_match('/[\r\n\t]/', $value))) throw new SupportChatFailure('Controleer de tekst en de maximale lengte.');
        return $value;
    }

    private function identifier($value): string
    {
        if (!is_string($value) || !preg_match('/\A[a-zA-Z0-9_-]{16,64}\z/D', $value)) throw new SupportChatFailure('Ongeldig gesprek of bericht.');
        return $value;
    }

    private function locked(callable $operation): array
    {
        $this->pdo->beginTransaction();
        try {
            $this->pdo->exec('UPDATE support_chat_state SET stamp = stamp + 1 WHERE id = 1');
            $result = $operation();
            $this->pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }
}
