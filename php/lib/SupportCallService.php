<?php
declare(strict_types=1);
require_once __DIR__ . '/SupportChatService.php';
require_once __DIR__ . '/InterpreterService.php';

final class SupportCallService
{
    private PDO $pdo;
    public function __construct(PDO $pdo) { $this->pdo = $pdo; }

    public function ensureSchema(): void
    {
        (new SupportChatService($this->pdo))->ensureSchema();
        (new InterpreterService($this->pdo))->ensureSchema();
        AccountAccess::ensureSchema($this->pdo);
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' : '';
        foreach ([
            'support_calls' => 'call_id VARCHAR(48) PRIMARY KEY, thread_id VARCHAR(48) NOT NULL, visitor_id VARCHAR(64) NOT NULL,
                staff_id VARCHAR(96) NOT NULL, staff_version INTEGER NOT NULL, mode VARCHAR(8) NOT NULL, status VARCHAR(16) NOT NULL,
                created BIGINT NOT NULL, expires BIGINT NOT NULL, requested INTEGER NOT NULL DEFAULT 0,
                interpreter_id VARCHAR(96) NULL, interpreter_version INTEGER NULL, requested_at BIGINT NULL',
            'support_call_members' => 'call_id VARCHAR(48) NOT NULL, role VARCHAR(16) NOT NULL, client_id VARCHAR(64) NOT NULL DEFAULT \'\',
                joined INTEGER NOT NULL DEFAULT 0, seen BIGINT NOT NULL DEFAULT 0, permission INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(call_id, role)',
            'support_call_signals' => 'signal_id VARCHAR(48) PRIMARY KEY, call_id VARCHAR(48) NOT NULL, sender VARCHAR(16) NOT NULL,
                recipient VARCHAR(16) NOT NULL, payload TEXT NOT NULL, created BIGINT NOT NULL'
        ] as $name => $definition) $this->pdo->exec('CREATE TABLE IF NOT EXISTS ' . $name . ' (' . $definition . ')' . $suffix);
    }

    private function rows(string $sql, array $params = []): array
    {
        $statement = $this->pdo->prepare($sql); $statement->execute($params); return $statement->fetchAll(PDO::FETCH_ASSOC);
    }
    private function write(string $sql, array $params = []): void { $statement = $this->pdo->prepare($sql); $statement->execute($params); }
    private function atomic(callable $operation): array
    {
        $this->pdo->beginTransaction();
        try {
            $this->pdo->exec('UPDATE support_chat_state SET stamp = 1 - stamp WHERE id = 1');
            $this->write('UPDATE interpreter_lock SET touched = ? WHERE lock_id = 1', [time()]);
            $this->purge(); $result = $operation(); $this->pdo->commit(); return $result;
        } catch (Throwable $error) { if ($this->pdo->inTransaction()) $this->pdo->rollBack(); throw $error; }
    }

    public function cleanup(): array { return $this->atomic(fn() => []); }

    private function end(string $call): void
    {
        $this->write("UPDATE support_calls SET status = 'ended', requested = 0, interpreter_id = NULL, interpreter_version = NULL WHERE call_id = ?", [$call]);
        $this->write('DELETE FROM support_call_signals WHERE call_id = ?', [$call]);
        $this->write('DELETE FROM support_call_members WHERE call_id = ?', [$call]);
        $this->write('DELETE FROM interpreter_reservations WHERE session_id = ?', [$call]);
    }

    private function removeInterpreter(string $call): void
    {
        $this->write('UPDATE support_calls SET requested = 0, interpreter_id = NULL, interpreter_version = NULL, requested_at = NULL WHERE call_id = ?', [$call]);
        $this->write("DELETE FROM support_call_members WHERE call_id = ? AND role = 'interpreter'", [$call]);
        $this->write('UPDATE support_call_members SET permission = 0 WHERE call_id = ?', [$call]);
        $this->write("DELETE FROM support_call_signals WHERE call_id = ? AND (sender = 'interpreter' OR recipient = 'interpreter')", [$call]);
        $this->write('DELETE FROM interpreter_reservations WHERE session_id = ?', [$call]);
    }

    private function interpreterEnabled(string $account, ?int $version = null): bool
    {
        $profile = $this->rows("SELECT account_id FROM interpreter_profiles WHERE account_id = ? AND status = 'enabled'", [$account]);
        return (bool)$profile && AccountAccess::allowed($this->pdo, $account)
            && ($version === null || AccountAccess::versionAllowed($this->pdo, $account, $version));
    }

    private function purge(): void
    {
        $now = time();
        foreach ($this->rows("SELECT * FROM support_calls WHERE status <> 'ended'") as $call) {
            $valid = $this->rows("SELECT thread.thread_id FROM support_chat_threads thread JOIN admin_users staff ON staff.admin_id = thread.staff_id
                WHERE thread.thread_id = ? AND thread.status = 'active' AND thread.staff_id = ? AND thread.staff_version = ?
                AND staff.enabled = 1 AND staff.session_version = ? AND staff.role IN ('owner', 'admin', 'staff')", [$call['thread_id'], $call['staff_id'], $call['staff_version'], $call['staff_version']]);
            $stale = $this->rows("SELECT role FROM support_call_members WHERE call_id = ? AND role <> 'interpreter' AND joined = 1 AND seen < ?", [$call['call_id'], $now - 45]);
            if (!$valid || $stale || (int)$call['expires'] < $now) { $this->end($call['call_id']); continue; }
            if ($call['interpreter_id']) {
                $reservation = $this->rows('SELECT account_id FROM interpreter_reservations WHERE session_id = ? AND account_id = ? AND expires >= ?', [$call['call_id'], $call['interpreter_id'], $now]);
                if (!$reservation || !$this->interpreterEnabled($call['interpreter_id'], (int)$call['interpreter_version'])) $this->removeInterpreter($call['call_id']);
            } elseif ((int)$call['requested'] && (int)$call['requested_at'] < $now - 600) $this->removeInterpreter($call['call_id']);
        }
        $this->write('DELETE FROM support_call_signals WHERE created < ?', [$now - 60]);
        $this->write("DELETE FROM support_calls WHERE status = 'ended' AND created < ?", [$now - 86400]);
    }

    private function thread(array $actor, string $identifier): array
    {
        $thread = $this->rows('SELECT * FROM support_chat_threads WHERE thread_id = ?', [$this->id($identifier)])[0] ?? null;
        if (!$thread) throw new SupportChatFailure('Gesprek niet gevonden.', 404);
        if ($actor['role'] === 'visitor') {
            if (!hash_equals($thread['visitor_id'], $actor['id'])) throw new SupportChatFailure('Gesprek niet gevonden.', 404);
        } elseif ($actor['role'] === 'staff') {
            $valid = $this->rows("SELECT admin_id FROM admin_users WHERE admin_id = ? AND enabled = 1 AND session_version = ? AND role IN ('owner', 'admin', 'staff')", [$actor['id'], $actor['version']]);
            if (!$valid) throw new SupportChatFailure('Je staffsessie is ingetrokken.', 401);
            if ($thread['staff_id'] !== $actor['id'] || (int)$thread['staff_version'] !== (int)$actor['version']) throw new SupportChatFailure('Alleen de toegewezen medewerker mag aan deze oproep deelnemen.', 403);
        } else throw new SupportChatFailure('Geen toegang tot deze chat.', 403);
        return $thread;
    }

    private function call(array $actor, string $identifier): array
    {
        $call = $this->rows('SELECT * FROM support_calls WHERE call_id = ?', [$this->id($identifier)])[0] ?? null;
        if (!$call) throw new SupportChatFailure('Oproep niet gevonden.', 404);
        if ($actor['role'] === 'interpreter') {
            if (!$this->interpreterEnabled($actor['id'], $actor['version']) || $call['interpreter_id'] !== $actor['id']
                || (int)$call['interpreter_version'] !== (int)$actor['version']) throw new SupportChatFailure('Je neemt niet deel aan deze tolkoproep.', 403);
        } else $this->thread($actor, $call['thread_id']);
        return $call;
    }

    public function view(array $actor, string $thread, string $identifier, string $client): array
    {
        return $this->atomic(function () use ($actor, $thread, $identifier, $client): array {
            if ($actor['role'] === 'interpreter' && $identifier === '') return $this->queue($actor);
            if ($identifier === '') {
                $this->thread($actor, $thread);
                $identifier = $this->rows("SELECT call_id FROM support_calls WHERE thread_id = ? AND status <> 'ended' ORDER BY created DESC LIMIT 1", [$thread])[0]['call_id'] ?? '';
            }
            if ($identifier === '') return ['call' => null, 'members' => [], 'signals' => [], 'role' => $actor['role']];
            $call = $this->call($actor, $identifier);
            $client = $this->id($client);
            $this->write('UPDATE support_call_members SET seen = ? WHERE call_id = ? AND role = ? AND joined = 1 AND client_id = ?', [time(), $identifier, $actor['role'], $client]);
            $members = $this->rows('SELECT role, joined, permission, client_id FROM support_call_members WHERE call_id = ?', [$identifier]);
            $own = null;
            foreach ($members as &$member) {
                $member['owned'] = $member['role'] === $actor['role'] && $member['client_id'] === $client;
                if ($member['role'] === $actor['role']) $own = $member;
                unset($member['client_id']);
                $member['name'] = $this->name($call, $member['role']);
            }
            unset($member);
            if ($actor['role'] === 'interpreter' && $own && $own['owned'] && (int)$own['joined']) $this->write('UPDATE interpreter_reservations SET expires = ? WHERE session_id = ? AND account_id = ?', [time() + 45, $identifier, $actor['id']]);
            $signals = $own && $own['owned'] && (int)$own['joined'] ? $this->rows('SELECT signal_id, sender, payload FROM support_call_signals WHERE call_id = ? AND recipient = ? ORDER BY created, signal_id', [$identifier, $actor['role']]) : [];
            return ['role' => $actor['role'], 'call' => ['id' => $identifier, 'mode' => $call['mode'], 'status' => $call['status'],
                'requested' => (bool)$call['requested'], 'interpreterAssigned' => (bool)$call['interpreter_id']], 'members' => $members, 'signals' => $signals];
        });
    }

    private function name(array $call, string $role): string
    {
        if ($role === 'visitor') return (string)($this->rows('SELECT visitor_name FROM support_chat_threads WHERE thread_id = ?', [$call['thread_id']])[0]['visitor_name'] ?? 'Bezoeker');
        if ($role === 'staff') return (string)($this->rows('SELECT display_name FROM admin_users WHERE admin_id = ?', [$call['staff_id']])[0]['display_name'] ?? 'Medewerker');
        return 'Gebarentolk · ' . ($this->rows('SELECT display_name FROM account_profiles WHERE account_id = ?', [$call['interpreter_id']])[0]['display_name'] ?? 'Tolk');
    }

    private function queue(array $actor): array
    {
        $enabled = $this->interpreterEnabled($actor['id'], $actor['version']);
        $queue = []; $assigned = [];
        if ($enabled) {
            $profile = $this->rows('SELECT * FROM interpreter_profiles WHERE account_id = ?', [$actor['id']])[0];
            if ((int)$profile['available'] && (int)$profile['heartbeat'] >= time() - 30 && !$this->busy($actor['id'])) {
                $queue = $this->rows("SELECT support_call.call_id, support_call.requested_at AS created FROM support_calls support_call WHERE support_call.status = 'active' AND support_call.requested = 1 AND support_call.interpreter_id IS NULL
                    AND (SELECT COUNT(*) FROM support_call_members participant WHERE participant.call_id = support_call.call_id AND participant.role IN ('visitor', 'staff') AND participant.joined = 1 AND participant.permission = 1) = 2
                    ORDER BY support_call.requested_at LIMIT 50");
            }
            $assigned = $this->rows("SELECT call_id FROM support_calls WHERE interpreter_id = ? AND status <> 'ended'", [$actor['id']]);
        }
        return ['enabled' => $enabled, 'queue' => $queue, 'assigned' => $assigned];
    }

    private function busy(string $account): bool
    {
        return (bool)$this->rows("SELECT participant.room_id FROM interpreter_members participant JOIN interpreter_rooms room ON room.room_id = participant.room_id WHERE participant.account_id = ? AND room.status <> 'ended'", [$account])
            || (bool)$this->rows('SELECT account_id FROM interpreter_reservations WHERE account_id = ? AND expires >= ?', [$account, time()]);
    }

    public function action(array $actor, array $input): array
    {
        return $this->atomic(function () use ($actor, $input): array {
            $action = $input['action'] ?? '';
            $client = $this->id($input['clientId'] ?? '');
            if ($action === 'start') {
                $thread = $this->thread($actor, $this->id($input['threadId'] ?? ''));
                if ($thread['status'] !== 'active') throw new SupportChatFailure('Wacht tot een medewerker het gesprek heeft opgepakt.', 409);
                if ($this->rows("SELECT call_id FROM support_calls WHERE staff_id = ? AND thread_id <> ? AND status <> 'ended'", [$thread['staff_id'], $thread['thread_id']])) throw new SupportChatFailure('Deze medewerker heeft al een andere oproep.', 409);
                $mode = $input['mode'] ?? '';
                if (!in_array($mode, ['rtt', 'tc'], true) || ($input['consent'] ?? false) !== true) throw new SupportChatFailure('Bevestig de gekozen gespreksvorm.');
                foreach ($this->rows("SELECT * FROM support_calls WHERE thread_id = ? AND status <> 'ended'", [$thread['thread_id']]) as $existing) {
                    $same = $this->rows('SELECT role FROM support_call_members WHERE call_id = ? AND role = ? AND client_id = ?', [$existing['call_id'], $actor['role'], $client]);
                    if ($same && $existing['mode'] === $mode) return ['callId' => $existing['call_id']];
                    if ($existing['mode'] !== 'rtt' || $mode !== 'tc') throw new SupportChatFailure('Er is al een oproep. Beantwoord of beëindig die eerst.', 409);
                    $this->end($existing['call_id']);
                }
                if (count($this->rows('SELECT call_id FROM support_calls WHERE thread_id = ? AND created > ?', [$thread['thread_id'], time() - 60])) >= 5) throw new SupportChatFailure('Wacht even voordat je opnieuw belt.', 429);
                $identifier = bin2hex(random_bytes(24));
                $this->write("INSERT INTO support_calls (call_id, thread_id, visitor_id, staff_id, staff_version, mode, status, created, expires) VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?)",
                    [$identifier, $thread['thread_id'], $thread['visitor_id'], $thread['staff_id'], $thread['staff_version'], $mode, time(), time() + 600]);
                foreach (['visitor', 'staff'] as $role) $this->write('INSERT INTO support_call_members (call_id, role, joined, client_id, seen) VALUES (?, ?, ?, ?, ?)', [$identifier, $role, $role === $actor['role'] ? 1 : 0, $role === $actor['role'] ? $client : '', time()]);
                return ['callId' => $identifier];
            }
            $identifier = $this->id($input['callId'] ?? '');
            if ($action === 'accept_interpreter') {
                if ($actor['role'] !== 'interpreter' || !$this->interpreterEnabled($actor['id'], $actor['version'])) throw new SupportChatFailure('Alleen een goedgekeurde tolk mag accepteren.', 403);
                $visible = array_column($this->queue($actor)['queue'], 'call_id');
                if (!in_array($identifier, $visible, true)) throw new SupportChatFailure('Deze tolkoproep is niet meer beschikbaar.', 409);
                $this->write('DELETE FROM interpreter_reservations WHERE account_id = ? AND expires < ?', [$actor['id'], time()]);
                $this->write('INSERT INTO interpreter_reservations VALUES (?, ?, ?)', [$actor['id'], $identifier, time() + 120]);
                $this->write('UPDATE support_calls SET interpreter_id = ?, interpreter_version = ? WHERE call_id = ?', [$actor['id'], $actor['version'], $identifier]);
                $this->write("INSERT INTO support_call_members (call_id, role) VALUES (?, 'interpreter')", [$identifier]);
                $this->write('UPDATE interpreter_profiles SET available = 0 WHERE account_id = ?', [$actor['id']]);
                return ['callId' => $identifier];
            }
            $call = $this->call($actor, $identifier);
            if ($action === 'end') { if ($actor['role'] === 'interpreter') $this->removeInterpreter($identifier); else $this->end($identifier); return []; }
            if ($call['status'] === 'ended') throw new SupportChatFailure('Deze oproep is beëindigd.', 409);
            $member = $this->rows('SELECT * FROM support_call_members WHERE call_id = ? AND role = ?', [$identifier, $actor['role']])[0] ?? null;
            if (!$member) throw new SupportChatFailure('Geen toegang tot deze oproep.', 403);
            if ($action === 'join') {
                if (($input['consent'] ?? false) !== true) throw new SupportChatFailure('Geef eerst toestemming om deel te nemen.');
                if ((int)$member['joined'] && $member['client_id'] !== $client) throw new SupportChatFailure('Deze oproep staat al in een ander venster open.', 409);
                $this->write('UPDATE support_call_members SET joined = 1, client_id = ?, seen = ? WHERE call_id = ? AND role = ?', [$client, time(), $identifier, $actor['role']]);
                if (count($this->rows("SELECT role FROM support_call_members WHERE call_id = ? AND role IN ('visitor', 'staff') AND joined = 1", [$identifier])) === 2 && $call['status'] !== 'active') $this->write("UPDATE support_calls SET status = 'active', expires = ? WHERE call_id = ?", [time() + 7200, $identifier]);
                return [];
            }
            if ($action === 'cancel_interpreter' && $actor['role'] !== 'interpreter') { $this->removeInterpreter($identifier); return []; }
            if (!(int)$member['joined'] || $member['client_id'] !== $client) throw new SupportChatFailure('Neem eerst in dit venster deel aan de oproep.', 403);
            if (in_array($action, ['request_interpreter', 'allow_interpreter'], true)) {
                if ($actor['role'] === 'interpreter' || $call['mode'] !== 'tc') throw new SupportChatFailure('Start eerst Total Conversation.', 409);
                if ($action === 'allow_interpreter' && !(int)$call['requested']) throw new SupportChatFailure('Er staat geen tolkaanvraag open.', 409);
                if (!(int)$call['requested']) $this->write('UPDATE support_calls SET requested = 1, requested_at = ? WHERE call_id = ?', [time(), $identifier]);
                $this->write('UPDATE support_call_members SET permission = 1 WHERE call_id = ? AND role = ?', [$identifier, $actor['role']]);
                return [];
            }
            if ($action === 'signal') {
                $recipient = $input['recipient'] ?? '';
                if (!in_array($recipient, ['visitor', 'staff', 'interpreter'], true) || $recipient === $actor['role']) throw new SupportChatFailure('Ongeldige deelnemer.');
                $target = $this->rows('SELECT joined FROM support_call_members WHERE call_id = ? AND role = ?', [$identifier, $recipient])[0] ?? null;
                if ($call['status'] !== 'active' || !$target || !(int)$target['joined']) throw new SupportChatFailure('De andere deelnemer heeft nog niet ingestemd.', 403);
                if (in_array('interpreter', [$actor['role'], $recipient], true) && count($this->rows("SELECT role FROM support_call_members WHERE call_id = ? AND role IN ('visitor', 'staff') AND permission = 1 AND joined = 1", [$identifier])) !== 2) throw new SupportChatFailure('Beide deelnemers moeten de tolk toelaten.', 403);
                $payload = $this->signal($input['payload'] ?? null);
                if (count($this->rows('SELECT signal_id FROM support_call_signals WHERE call_id = ? AND sender = ?', [$identifier, $actor['role']])) >= 300) throw new SupportChatFailure('Te veel verbindingsberichten.', 429);
                $this->write('INSERT INTO support_call_signals VALUES (?, ?, ?, ?, ?, ?)', [bin2hex(random_bytes(24)), $identifier, $actor['role'], $recipient, $payload, time()]);
                return [];
            }
            throw new SupportChatFailure('Onbekende oproepactie.');
        });
    }

    private function signal($payload): string
    {
        if (!is_array($payload) || !in_array($payload['type'] ?? '', ['offer', 'answer', 'candidate'], true)) throw new SupportChatFailure('Ongeldig verbindingsbericht.');
        if ($payload['type'] === 'candidate') {
            $candidate = $payload['candidate'] ?? null;
            if (!is_array($candidate) || !is_string($candidate['candidate'] ?? null) || strlen($candidate['candidate']) > 4096 || !str_starts_with($candidate['candidate'], 'candidate:')
                || array_diff(array_keys($payload), ['type', 'candidate']) || array_diff(array_keys($candidate), ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'])) throw new SupportChatFailure('Ongeldige ICE-kandidaat.');
        } elseif (!is_string($payload['sdp'] ?? null) || !str_starts_with($payload['sdp'], 'v=0') || array_diff(array_keys($payload), ['type', 'sdp'])) throw new SupportChatFailure('Ongeldige sessiebeschrijving.');
        $encoded = json_encode($payload, JSON_THROW_ON_ERROR);
        if (strlen($encoded) > 60000) throw new SupportChatFailure('Verbindingsbericht te groot.', 413);
        return $encoded;
    }

    private function id($value): string
    {
        if (!is_string($value) || !preg_match('/\A[a-zA-Z0-9_-]{16,64}\z/D', $value)) throw new SupportChatFailure('Ongeldige oproepreferentie.');
        return $value;
    }
}
