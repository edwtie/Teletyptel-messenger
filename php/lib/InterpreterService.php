<?php
declare(strict_types=1);

require_once __DIR__ . '/AccountAccess.php';

final class InterpreterFailure extends RuntimeException
{
    public int $status;
    public function __construct(string $message, int $status = 400)
    {
        parent::__construct($message);
        $this->status = $status;
    }
}

final class InterpreterService
{
    private PDO $pdo;

    public function __construct(PDO $pdo) { $this->pdo = $pdo; }

    public function ensureSchema(): void
    {
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' : '';
        foreach ([
            'interpreter_lock' => 'lock_id INTEGER PRIMARY KEY, touched BIGINT NOT NULL',
            'interpreter_reservations' => 'account_id VARCHAR(96) PRIMARY KEY, session_id VARCHAR(64) NOT NULL, expires BIGINT NOT NULL',
            'interpreter_profiles' => "account_id VARCHAR(96) PRIMARY KEY, status VARCHAR(16) NOT NULL, available INTEGER NOT NULL DEFAULT 0, heartbeat BIGINT NOT NULL DEFAULT 0",
            'interpreter_rooms' => 'room_id VARCHAR(64) PRIMARY KEY, requester VARCHAR(96) NOT NULL, peer VARCHAR(96) NOT NULL, interpreter_id VARCHAR(96) NULL, status VARCHAR(16) NOT NULL, created BIGINT NOT NULL, expires BIGINT NOT NULL',
            'interpreter_members' => 'room_id VARCHAR(64) NOT NULL, account_id VARCHAR(96) NOT NULL, joined INTEGER NOT NULL DEFAULT 0, heartbeat BIGINT NOT NULL DEFAULT 0, PRIMARY KEY(room_id, account_id)',
            'interpreter_signals' => 'signal_id VARCHAR(64) PRIMARY KEY, room_id VARCHAR(64) NOT NULL, sender VARCHAR(96) NOT NULL, recipient VARCHAR(96) NOT NULL, payload TEXT NOT NULL, created BIGINT NOT NULL',
            'interpreter_declines' => 'room_id VARCHAR(64) NOT NULL, account_id VARCHAR(96) NOT NULL, PRIMARY KEY(room_id, account_id)',
            'interpreter_audit' => 'event_id VARCHAR(64) PRIMARY KEY, actor VARCHAR(96) NOT NULL, subject VARCHAR(96) NOT NULL, action VARCHAR(32) NOT NULL, created BIGINT NOT NULL'
        ] as $table => $definition) $this->pdo->exec('CREATE TABLE IF NOT EXISTS ' . $table . ' (' . $definition . ')' . $suffix);
        try { $this->pdo->query('SELECT call_id FROM interpreter_rooms LIMIT 0'); }
        catch (PDOException $error) {
            if (($error->errorInfo[1] ?? null) !== 1054 && !str_contains($error->getMessage(), 'no such column: call_id')) throw $error;
            try { $this->pdo->exec("ALTER TABLE interpreter_rooms ADD COLUMN call_id VARCHAR(160) NOT NULL DEFAULT ''"); }
            catch (PDOException $migration) { if (($migration->errorInfo[1] ?? null) !== 1060 && !str_contains($migration->getMessage(), 'duplicate column name')) throw $migration; }
        }
        try { $this->pdo->exec('INSERT INTO interpreter_lock VALUES (1, 0)'); }
        catch (PDOException $error) { if (!in_array((string)$error->getCode(), ['23000', '23505'], true)) throw $error; }
    }

    public static function authorize(PDO $pdo, array &$session, string $method, ?string $csrf): string
    {
        AccountAccess::guardSession($pdo, $session);
        $account = $session['teletyptel_account_id'] ?? '';
        if (!is_string($account) || $account === '') throw new InterpreterFailure('Meld je eerst aan bij Messenger.', 401);
        $query = $pdo->prepare('SELECT account_id FROM account_profiles WHERE account_id = ?');
        $query->execute([$account]);
        if (!$query->fetchColumn()) throw new InterpreterFailure('Meld je opnieuw aan.', 401);
        if ($method === 'POST' && (!is_string($csrf) || !isset($session['teletyptel_interpreter_csrf'])
            || !hash_equals($session['teletyptel_interpreter_csrf'], $csrf))) throw new InterpreterFailure('Sessie verlopen. Ververs de pagina.', 403);
        return $account;
    }

    private function rows(string $sql, array $params = []): array
    {
        $query = $this->pdo->prepare($sql);
        $query->execute($params);
        return $query->fetchAll(PDO::FETCH_ASSOC);
    }

    private function write(string $sql, array $params = []): void
    {
        $query = $this->pdo->prepare($sql);
        $query->execute($params);
    }

    private function atomic(Closure $operation)
    {
        $this->pdo->beginTransaction();
        try {
            $this->write('UPDATE interpreter_lock SET touched = ? WHERE lock_id = 1', [time()]);
            $result = $operation();
            $this->pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    private function profile(string $account): ?array
    {
        return $this->rows('SELECT * FROM interpreter_profiles WHERE account_id = ?', [$account])[0] ?? null;
    }

    private function enabled(string $account): bool
    {
        return ($this->profile($account)['status'] ?? '') === 'enabled' && AccountAccess::allowed($this->pdo, $account);
    }

    private function reserved(string $account): bool
    {
        return (bool)$this->rows('SELECT account_id FROM interpreter_reservations WHERE account_id = ? AND expires >= ?', [$account, time()]);
    }

    private function endRoom(string $room): void
    {
        $this->write("UPDATE interpreter_rooms SET status = 'ended' WHERE room_id = ?", [$room]);
        $this->write('DELETE FROM interpreter_signals WHERE room_id = ?', [$room]);
        $this->write('DELETE FROM interpreter_declines WHERE room_id = ?', [$room]);
    }

    private function cleanup(): void
    {
        $now = time();
        $this->write('DELETE FROM interpreter_reservations WHERE expires < ?', [$now]);
        foreach ($this->rows("SELECT * FROM interpreter_rooms WHERE status <> 'ended'") as $room) {
            $allowed = AccountAccess::allowed($this->pdo, $room['requester']) && AccountAccess::allowed($this->pdo, $room['peer']);
            if ($room['interpreter_id']) $allowed = $allowed && $this->enabled($room['interpreter_id']);
            $stale = $this->rows('SELECT account_id FROM interpreter_members WHERE room_id = ? AND joined = 1 AND heartbeat < ?', [$room['room_id'], $now - 45]);
            if (!$allowed || (int)$room['expires'] < $now || $stale) $this->endRoom($room['room_id']);
        }
        $this->write('DELETE FROM interpreter_signals WHERE created < ?', [$now - 60]);
        foreach ($this->rows("SELECT room_id FROM interpreter_rooms WHERE status = 'ended' AND created < ?", [$now - 86400]) as $room) {
            $this->write('DELETE FROM interpreter_members WHERE room_id = ?', [$room['room_id']]);
            $this->write('DELETE FROM interpreter_rooms WHERE room_id = ?', [$room['room_id']]);
        }
        $this->write('DELETE FROM interpreter_audit WHERE created < ?', [$now - 90 * 86400]);
    }

    private function roomFor(string $account, string $identifier): array
    {
        $room = $this->rows('SELECT r.* FROM interpreter_rooms r JOIN interpreter_members m ON m.room_id = r.room_id WHERE r.room_id = ? AND m.account_id = ?', [$identifier, $account])[0] ?? null;
        if (!$room) throw new InterpreterFailure('Geen toegang tot deze tolksessie.', 403);
        return $room;
    }

    public function dashboard(string $account): array
    {
        return $this->atomic(function () use ($account) {
            $this->cleanup();
            AccountAccess::assertAllowed($this->pdo, $account);
            $profile = $this->profile($account);
            $queue = [];
            if ($profile && $this->enabled($account) && !$this->reserved($account) && (int)$profile['available'] && (int)$profile['heartbeat'] >= time() - 30) {
                $queue = $this->rows("SELECT r.room_id, r.created, (r.call_id <> '') AS inline_call FROM interpreter_rooms r WHERE r.status = 'waiting' AND r.requester <> ? AND r.peer <> ? AND NOT EXISTS (SELECT 1 FROM interpreter_declines d WHERE d.room_id = r.room_id AND d.account_id = ?) ORDER BY r.created LIMIT 50", [$account, $account, $account]);
            }
            $rooms = $this->rows("SELECT r.*, caller.jid AS requester_jid, contact.jid AS peer_jid FROM interpreter_rooms r JOIN interpreter_members m ON m.room_id = r.room_id JOIN account_profiles caller ON caller.account_id = r.requester JOIN account_profiles contact ON contact.account_id = r.peer WHERE m.account_id = ? AND r.status <> 'ended' ORDER BY r.created DESC LIMIT 20", [$account]);
            return ['accountId' => $account, 'jid' => $this->rows('SELECT jid FROM account_profiles WHERE account_id = ?', [$account])[0]['jid'], 'profile' => $profile, 'rooms' => $rooms, 'queue' => $queue,
                'external' => ['name' => 'Tolkcontact', 'enabled' => false, 'status' => 'Nog niet gekoppeld']];
        });
    }

    public function action(string $account, array $input): array
    {
        return $this->atomic(function () use ($account, $input) {
            $this->cleanup();
            AccountAccess::assertAllowed($this->pdo, $account);
            $action = $input['action'] ?? '';
            if ($action === 'register') {
                if (!$this->profile($account)) $this->write("INSERT INTO interpreter_profiles (account_id, status) VALUES (?, 'pending')", [$account]);
                return [];
            }
            if ($action === 'available') {
                if (!$this->enabled($account)) throw new InterpreterFailure('Een beheerder moet je eerst als tolk goedkeuren.', 403);
                if (!is_bool($input['available'] ?? null)) throw new InterpreterFailure('Ongeldige beschikbaarheid.');
                if ($input['available'] && $this->reserved($account)) throw new InterpreterFailure('Je neemt al deel aan een klantenservicegesprek.', 409);
                $this->write('UPDATE interpreter_profiles SET available = ?, heartbeat = ? WHERE account_id = ?', [$input['available'] ? 1 : 0, time(), $account]);
                return [];
            }
            if ($action === 'request') {
                if (($input['provider'] ?? '') !== 'internal') throw new InterpreterFailure('Tolkcontact is nog niet gekoppeld.', 409);
                if (count($this->rows('SELECT room_id FROM interpreter_rooms WHERE requester = ? AND created > ?', [$account, time() - 60])) >= 5) throw new InterpreterFailure('Wacht even voordat je opnieuw een tolk aanvraagt.', 429);
                if (!is_string($input['peer'] ?? null)) throw new InterpreterFailure('Ongeldig contact.');
                $jid = strtolower(trim($input['peer']));
                if (strlen($jid) > 255) throw new InterpreterFailure('Ongeldig contact.');
                $peers = $this->rows('SELECT account_id FROM account_profiles WHERE LOWER(jid) = ?', [$jid]);
                if (count($peers) !== 1 || $peers[0]['account_id'] === $account) throw new InterpreterFailure('Kies één ander lokaal Messenger-contact. Externe SIP/XMPP-contacten worden nog niet ondersteund.');
                $peer = $peers[0]['account_id'];
                AccountAccess::assertAllowed($this->pdo, $peer);
                if ($this->reserved($account) || $this->reserved($peer)) throw new InterpreterFailure('Een deelnemer heeft al een open tolksessie.', 409);
                if ($this->rows("SELECT m.room_id FROM interpreter_members m JOIN interpreter_rooms r ON m.room_id = r.room_id WHERE r.status <> 'ended' AND m.account_id IN (?, ?)", [$account, $peer])) throw new InterpreterFailure('Een deelnemer heeft al een open tolksessie.', 409);
                $identifier = bin2hex(random_bytes(24));
                $callId = $input['callId'] ?? '';
                if (!is_string($callId) || strlen($callId) > 160 || ($callId !== '' && !preg_match('/^[A-Za-z0-9_.:-]+$/D', $callId))) throw new InterpreterFailure('Ongeldige oproepreferentie.');
                $this->write("INSERT INTO interpreter_rooms (room_id, requester, peer, interpreter_id, status, created, expires, call_id) VALUES (?, ?, ?, NULL, 'waiting', ?, ?, ?)", [$identifier, $account, $peer, time(), time() + 600, $callId]);
                foreach ([$account, $peer] as $member) $this->write('INSERT INTO interpreter_members (room_id, account_id) VALUES (?, ?)', [$identifier, $member]);
                return ['roomId' => $identifier];
            }
            $identifier = $input['roomId'] ?? '';
            if (!is_string($identifier) || !preg_match('/^[a-f0-9]{48}$/D', $identifier)) throw new InterpreterFailure('Ongeldige sessie.');
            if (in_array($action, ['accept', 'decline'], true)) {
                if ($this->reserved($account)) throw new InterpreterFailure('Je neemt al deel aan een klantenservicegesprek.', 409);
                $profile = $this->profile($account);
                if (!$this->enabled($account) || !(int)$profile['available'] || (int)$profile['heartbeat'] < time() - 30) throw new InterpreterFailure('Zet je tolkstatus eerst op beschikbaar.', 403);
                $room = $this->rows("SELECT * FROM interpreter_rooms WHERE room_id = ? AND status = 'waiting'", [$identifier])[0] ?? null;
                if (!$room || in_array($account, [$room['requester'], $room['peer']], true)) throw new InterpreterFailure('Deze aanvraag is niet beschikbaar.', 409);
                if ($action === 'decline') {
                    if (!$this->rows('SELECT room_id FROM interpreter_declines WHERE room_id = ? AND account_id = ?', [$identifier, $account])) $this->write('INSERT INTO interpreter_declines VALUES (?, ?)', [$identifier, $account]);
                } else {
                    if ($this->rows("SELECT m.room_id FROM interpreter_members m JOIN interpreter_rooms r ON r.room_id = m.room_id WHERE m.account_id = ? AND r.status <> 'ended'", [$account])) throw new InterpreterFailure('Je hebt al een open tolksessie.', 409);
                    $this->write("UPDATE interpreter_rooms SET status = 'ready', interpreter_id = ?, expires = ? WHERE room_id = ?", [$account, time() + 600, $identifier]);
                    $this->write('INSERT INTO interpreter_members (room_id, account_id) VALUES (?, ?)', [$identifier, $account]);
                    $this->write('UPDATE interpreter_profiles SET available = 0 WHERE account_id = ?', [$account]);
                }
                return [];
            }
            $room = $this->roomFor($account, $identifier);
            if ($action === 'leave') { $this->endRoom($identifier); return []; }
            if (!in_array($room['status'], ['ready', 'active'], true)) throw new InterpreterFailure('Deze tolksessie is nog niet gereed of is beëindigd.', 409);
            if ($action === 'join') {
                if (($input['consent'] ?? false) !== true) throw new InterpreterFailure('Bevestig deelname aan deze besloten sessie.');
                if ($room['call_id'] !== '' && $account !== $room['interpreter_id'] && ($input['callId'] ?? '') !== $room['call_id']) throw new InterpreterFailure('Open deze tolk in het bijbehorende Messenger-gesprek.', 409);
                if ($this->rows('SELECT account_id FROM interpreter_members WHERE room_id = ? AND account_id = ? AND joined = 1', [$identifier, $account])) throw new InterpreterFailure('Je neemt al deel in een ander venster. Beëindig die sessie eerst.', 409);
                $this->write('UPDATE interpreter_members SET joined = 1, heartbeat = ? WHERE room_id = ? AND account_id = ?', [time(), $identifier, $account]);
                if (count($this->rows('SELECT account_id FROM interpreter_members WHERE room_id = ? AND joined = 1', [$identifier])) === 3 && $room['status'] !== 'active') {
                    $this->write("UPDATE interpreter_rooms SET status = 'active', expires = ? WHERE room_id = ?", [time() + 7200, $identifier]);
                }
                return [];
            }
            if ($action === 'signal') {
                $members = $this->rows('SELECT account_id FROM interpreter_members WHERE room_id = ? AND joined = 1', [$identifier]);
                $ids = array_column($members, 'account_id');
                $recipient = $input['recipient'] ?? '';
                if ($room['call_id'] !== '' && (count($ids) !== 3 || !in_array($room['interpreter_id'], [$account, $recipient], true))) throw new InterpreterFailure('Iedere deelnemer moet eerst instemmen; het oorspronkelijke gesprek blijft apart.', 403);
                if (!in_array($account, $ids, true) || !in_array($recipient, $ids, true) || $recipient === $account) throw new InterpreterFailure('Deelnemer heeft niet ingestemd.', 403);
                $payload = $input['payload'] ?? null;
                if (!is_array($payload) || !in_array($payload['type'] ?? '', ['offer', 'answer', 'candidate'], true)) throw new InterpreterFailure('Ongeldig verbindingsbericht.');
                if ($payload['type'] === 'candidate') {
                    $candidate = $payload['candidate'] ?? null;
                    if (!is_array($candidate) || !is_string($candidate['candidate'] ?? null) || strlen($candidate['candidate']) > 4096
                        || !str_starts_with($candidate['candidate'], 'candidate:')
                        || array_diff(array_keys($payload), ['type', 'candidate'])
                        || array_diff(array_keys($candidate), ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'])) throw new InterpreterFailure('Ongeldige ICE-kandidaat.');
                } elseif (!is_string($payload['sdp'] ?? null) || !str_starts_with($payload['sdp'], 'v=0')
                    || array_diff(array_keys($payload), ['type', 'sdp'])) throw new InterpreterFailure('Ongeldige sessiebeschrijving.');
                if (count($this->rows('SELECT signal_id FROM interpreter_signals WHERE room_id = ? AND sender = ?', [$identifier, $account])) >= 200) throw new InterpreterFailure('Te veel verbindingsberichten.', 429);
                $encoded = json_encode($payload, JSON_THROW_ON_ERROR);
                if (strlen($encoded) > 60000) throw new InterpreterFailure('Verbindingsbericht te groot.');
                $this->write('INSERT INTO interpreter_signals VALUES (?, ?, ?, ?, ?, ?)', [bin2hex(random_bytes(16)), $identifier, $account, $recipient, $encoded, time()]);
                return [];
            }
            throw new InterpreterFailure('Onbekende actie.');
        });
    }

    public function room(string $account, string $identifier): array
    {
        return $this->atomic(function () use ($account, $identifier) {
            $this->cleanup();
            $room = $this->roomFor($account, $identifier);
            $this->write('UPDATE interpreter_members SET heartbeat = ? WHERE room_id = ? AND account_id = ? AND joined = 1', [time(), $identifier, $account]);
            $members = $this->rows('SELECT m.account_id, m.joined, a.display_name FROM interpreter_members m JOIN account_profiles a ON a.account_id = m.account_id WHERE m.room_id = ?', [$identifier]);
            $signals = $this->rows('SELECT signal_id, sender, payload FROM interpreter_signals WHERE room_id = ? AND recipient = ? ORDER BY created, signal_id', [$identifier, $account]);
            return ['room' => $room, 'members' => $members, 'signals' => $signals, 'accountId' => $account];
        });
    }

    public function adminList(): array
    {
        return $this->rows('SELECT i.*, a.jid, a.display_name FROM interpreter_profiles i JOIN account_profiles a ON a.account_id = i.account_id ORDER BY a.display_name LIMIT 500');
    }

    public function administer(string $actor, string $account, string $status): void
    {
        if (!in_array($status, ['enabled', 'blocked'], true)) throw new InterpreterFailure('Ongeldige tolkstatus.');
        $this->atomic(function () use ($actor, $account, $status) {
            if (!$this->profile($account)) throw new InterpreterFailure('Laat deze gebruiker zich eerst aanmelden als tolk.');
            $this->write('UPDATE interpreter_profiles SET status = ?, available = 0 WHERE account_id = ?', [$status, $account]);
            if ($status === 'blocked') foreach ($this->rows("SELECT room_id FROM interpreter_rooms WHERE interpreter_id = ? AND status <> 'ended'", [$account]) as $room) $this->endRoom($room['room_id']);
            $this->write('INSERT INTO interpreter_audit VALUES (?, ?, ?, ?, ?)', [bin2hex(random_bytes(16)), $actor, $account, $status, time()]);
        });
    }
}
