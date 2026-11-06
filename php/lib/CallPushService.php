<?php
declare(strict_types=1);

require_once __DIR__ . '/AccountAccess.php';

final class CallPushFailure extends RuntimeException
{
    public function __construct(string $message, public int $status = 400) { parent::__construct($message); }
}

final class CallPushService
{
    private Closure $clock;

    public function __construct(private PDO $pdo, private string $key, private string $environment,
        private ?Closure $policy = null, ?Closure $clock = null)
    {
        if (strlen($key) !== 32 || !in_array($environment, ['production', 'sandbox'], true)) {
            throw new CallPushFailure('Oproepmeldingen zijn niet geconfigureerd.', 503);
        }
        $this->clock = $clock ?? static fn(): int => time();
    }

    public function ensureSchema(): void
    {
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_bin' : '';
        foreach ([
            'call_push_lock' => 'lock_id INTEGER PRIMARY KEY, touched BIGINT NOT NULL',
            'call_push_devices' => 'device_id VARCHAR(36) PRIMARY KEY, account_id VARCHAR(96) NOT NULL,
                session_binding VARCHAR(64) NOT NULL, generation VARCHAR(32) NOT NULL, access_version INTEGER NOT NULL,
                environment VARCHAR(16) NOT NULL, token_hash VARCHAR(64) NOT NULL UNIQUE, token_cipher TEXT NOT NULL,
                registered_ms BIGINT NOT NULL, expires BIGINT NOT NULL',
            'call_push_calls' => 'call_id VARCHAR(36) PRIMARY KEY, caller VARCHAR(96) NOT NULL, recipient VARCHAR(96) NOT NULL,
                caller_version INTEGER NOT NULL, recipient_version INTEGER NOT NULL, sid VARCHAR(128) NOT NULL,
                has_video INTEGER NOT NULL, state VARCHAR(16) NOT NULL, created BIGINT NOT NULL, expires BIGINT NOT NULL,
                accepted_device VARCHAR(36) NULL, accepted_generation VARCHAR(32) NULL, recipient_jid VARCHAR(512) NULL,
                UNIQUE(caller, sid)',
            'call_push_jobs' => 'job_id VARCHAR(32) PRIMARY KEY, call_id VARCHAR(36) NOT NULL, device_id VARCHAR(36) NOT NULL,
                generation VARCHAR(32) NOT NULL, state VARCHAR(16) NOT NULL, created BIGINT NOT NULL,
                UNIQUE(call_id, device_id, generation)'
        ] as $table => $columns) {
            $this->pdo->exec('CREATE TABLE IF NOT EXISTS ' . $table . ' (' . $columns . ')' . $suffix);
        }
        try { $this->write('INSERT INTO call_push_lock VALUES (1, 0)'); }
        catch (PDOException $error) { if (!in_array((string)$error->getCode(), ['23000', '23505'], true)) throw $error; }
    }

    public static function authorize(PDO $pdo, array &$session, string $method, ?string $csrf): string
    {
        if (!in_array($method, ['GET', 'POST'], true)) throw new CallPushFailure('Methode niet toegestaan.', 405);
        AccountAccess::guardSession($pdo, $session);
        $account = $session['teletyptel_account_id'] ?? '';
        if (!is_string($account) || $account === '') throw new CallPushFailure('Meld je eerst aan.', 401);
        $query = $pdo->prepare('SELECT account_id FROM account_profiles WHERE account_id = ?');
        $query->execute([$account]);
        if (!$query->fetchColumn()) throw new CallPushFailure('Meld je opnieuw aan.', 401);
        if ($method === 'POST' && (!is_string($csrf) || !is_string($session['teletyptel_call_push_csrf'] ?? null)
            || !hash_equals($session['teletyptel_call_push_csrf'], $csrf))) throw new CallPushFailure('Sessie verlopen.', 403);
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

    private function atomic(Closure $operation): mixed
    {
        $this->pdo->beginTransaction();
        try {
            $this->write('UPDATE call_push_lock SET touched = ? WHERE lock_id = 1', [($this->clock)()]);
            if (!$this->rows('SELECT lock_id FROM call_push_lock WHERE lock_id = 1')) throw new CallPushFailure('Oproepopslag is niet ingericht.', 503);
            $result = $operation();
            $this->pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    private static function uuid(string $value): string
    {
        if (!preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/i', $value)) {
            throw new CallPushFailure('Ongeldige identificatie.');
        }
        return strtolower($value);
    }

    private static function newUuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 15) | 64);
        $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }

    private function binding(string $binding): string
    {
        if (!preg_match('/\A[0-9a-f]{64}\z/', $binding)) throw new CallPushFailure('Ongeldige sessie.', 401);
        return hash('sha256', $binding);
    }

    private function profile(string $account): array
    {
        $profile = $this->rows('SELECT account_id, jid FROM account_profiles WHERE account_id = ?', [$account])[0] ?? null;
        if (!$profile) throw new CallPushFailure('Account niet beschikbaar.', 403);
        AccountAccess::assertAllowed($this->pdo, $account);
        return $profile;
    }

    private function crypt(string $value, array $device, bool $decrypt = false): string
    {
        $context = implode('|', [$device['device_id'], $device['account_id'], $device['generation'], $device['environment']]);
        if (!$decrypt) {
            $nonce = random_bytes(12);
            $tag = '';
            $cipher = openssl_encrypt($value, 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $nonce, $tag, $context, 16);
            if ($cipher !== false) return base64_encode($nonce . $tag . $cipher);
        } else {
            $packed = base64_decode($value, true);
            if ($packed !== false && strlen($packed) > 28) {
                $plain = openssl_decrypt(substr($packed, 28), 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA,
                    substr($packed, 0, 12), substr($packed, 12, 16), $context);
                if ($plain !== false) return $plain;
            }
        }
        throw new CallPushFailure('Toestelregistratie niet leesbaar.', 503);
    }

    public function register(string $account, string $binding, string $deviceId, string $token, bool $consent): array
    {
        $deviceId = self::uuid($deviceId);
        $binding = $this->binding($binding);
        if (!$consent || !preg_match('/\A[0-9a-f]{32,512}\z/i', $token) || strlen($token) % 2) {
            throw new CallPushFailure('Toestemming en een geldige toestelregistratie zijn vereist.');
        }
        $token = strtolower($token);
        $tokenHash = hash_hmac('sha256', $this->environment . ':' . $token, $this->key);
        return $this->atomic(function () use ($account, $binding, $deviceId, $token, $tokenHash) {
            $this->profile($account);
            $this->cleanupInside();
            $existing = $this->rows('SELECT * FROM call_push_devices WHERE device_id = ? OR token_hash = ?', [$deviceId, $tokenHash]);
            foreach ($existing as $device) {
                if ($device['account_id'] !== $account || $device['device_id'] !== $deviceId) {
                    throw new CallPushFailure('Toestelregistratie is niet beschikbaar.', 409);
                }
            }
            if (!$existing && count($this->rows('SELECT device_id FROM call_push_devices WHERE account_id = ?', [$account])) >= 8) {
                throw new CallPushFailure('Maximum aantal toestellen bereikt.', 429);
            }
            $now = ($this->clock)();
            $generation = bin2hex(random_bytes(16));
            $device = ['device_id' => $deviceId, 'account_id' => $account, 'generation' => $generation, 'environment' => $this->environment];
            $cipher = $this->crypt($token, $device);
            $this->write('DELETE FROM call_push_devices WHERE device_id = ?', [$deviceId]);
            $this->write('INSERT INTO call_push_devices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [$deviceId, $account, $binding, $generation, (int)AccountAccess::state($this->pdo, $account)['version'],
                 $this->environment, $tokenHash, $cipher, $now * 1000 + 999, $now + 86400]);
            return ['deviceId' => $deviceId, 'generation' => $generation, 'expiresAt' => $now + 86400];
        });
    }

    public function revokeSession(string $account, string $binding): void
    {
        $binding = $this->binding($binding);
        $this->atomic(function () use ($account, $binding) {
            $this->write('DELETE FROM call_push_devices WHERE account_id = ? AND session_binding = ?', [$account, $binding]);
        });
    }

    public function revokeDevice(string $account, string $deviceId): void
    {
        $deviceId = self::uuid($deviceId);
        $this->atomic(function () use ($account, $deviceId) {
            $this->profile($account);
            $this->write('DELETE FROM call_push_devices WHERE account_id = ? AND device_id = ?', [$account, $deviceId]);
        });
    }

    public static function revokeWebSession(PDO $pdo, array &$session): void
    {
        $binding = $session['teletyptel_call_push_binding'] ?? null;
        if ($binding === null) return;
        if (!is_string($binding) || !preg_match('/\A[0-9a-f]{64}\z/', $binding)) throw new CallPushFailure('Ongeldige sessie.', 401);
        if ($pdo->inTransaction()) throw new CallPushFailure('Afmelden van oproepmeldingen moet buiten een transactie plaatsvinden.', 503);
        try {
            $pdo->beginTransaction();
            $pdo->exec('UPDATE call_push_lock SET touched = touched + 1 WHERE lock_id = 1');
            if (!$pdo->query('SELECT lock_id FROM call_push_lock WHERE lock_id = 1')->fetchColumn()) throw new RuntimeException('Missing lock');
            $query = $pdo->prepare('DELETE FROM call_push_devices WHERE session_binding = ?');
            $query->execute([hash('sha256', $binding)]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw new CallPushFailure('Afmelden van oproepmeldingen is niet gelukt. Probeer opnieuw.', 503);
        }
        unset($session['teletyptel_call_push_binding'], $session['teletyptel_call_push_csrf']);
    }

    public function devices(string $account, string $binding): array
    {
        $this->profile($account);
        return $this->rows('SELECT device_id, generation, expires FROM call_push_devices
            WHERE account_id = ? AND session_binding = ? AND expires > ? AND access_version = ? AND environment = ?',
            [$account, $this->binding($binding), ($this->clock)(), (int)AccountAccess::state($this->pdo, $account)['version'], $this->environment]);
    }

    private function permitted(array $call, string $operation): bool
    {
        if (!$this->policy) return false;
        try {
            $this->profile($call['caller']);
            $this->profile($call['recipient']);
            return AccountAccess::versionAllowed($this->pdo, $call['caller'], (int)$call['caller_version'])
                && AccountAccess::versionAllowed($this->pdo, $call['recipient'], (int)$call['recipient_version'])
                && ($this->policy)($call, $operation) === true;
        } catch (Throwable $error) { return false; }
    }

    public function inviteVerified(string $caller, string $recipient, string $sid, bool $hasVideo, int $ttl = 45): array
    {
        if ($caller === $recipient || !preg_match('/\A[A-Za-z0-9_-]{1,128}\z/', $sid) || $ttl < 1 || $ttl > 60) {
            throw new CallPushFailure('Ongeldige oproep.');
        }
        return $this->atomic(function () use ($caller, $recipient, $sid, $hasVideo, $ttl) {
            $this->cleanupInside();
            $now = ($this->clock)();
            $call = ['call_id' => self::newUuid(), 'caller' => $caller, 'recipient' => $recipient,
                'caller_version' => (int)AccountAccess::state($this->pdo, $caller)['version'],
                'recipient_version' => (int)AccountAccess::state($this->pdo, $recipient)['version'],
                'sid' => $sid, 'has_video' => (int)$hasVideo, 'state' => 'ringing', 'created' => $now, 'expires' => $now + $ttl];
            if (!$this->permitted($call, 'invite')) throw new CallPushFailure('Oproep niet toegestaan.', 403);
            $existing = $this->rows('SELECT * FROM call_push_calls WHERE caller = ? AND sid = ?', [$caller, $sid])[0] ?? null;
            if ($existing) {
                if ($existing['recipient'] !== $recipient || (int)$existing['has_video'] !== (int)$hasVideo) throw new CallPushFailure('Oproepconflict.', 409);
                return $this->publicCall($existing);
            }
            if (count($this->rows('SELECT call_id FROM call_push_calls WHERE caller = ? AND created > ?', [$caller, $now - 60])) >= 5) {
                throw new CallPushFailure('Te veel oproepen. Probeer later opnieuw.', 429);
            }
            if ($this->rows("SELECT call_id FROM call_push_calls WHERE recipient = ? AND state IN ('ringing', 'accepted')", [$recipient])) {
                throw new CallPushFailure('Ontvanger is bezet.', 409);
            }
            $this->write('INSERT INTO call_push_calls (call_id, caller, recipient, caller_version, recipient_version, sid, has_video, state, created, expires)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', array_values($call));
            foreach ($this->rows('SELECT * FROM call_push_devices WHERE account_id = ? AND environment = ?', [$recipient, $this->environment]) as $device) {
                if (!$this->deviceAllowed($device, $call)) continue;
                $this->write('INSERT INTO call_push_jobs VALUES (?, ?, ?, ?, ?, ?)',
                    [bin2hex(random_bytes(16)), $call['call_id'], $device['device_id'], $device['generation'], 'pending', $now]);
            }
            return $this->publicCall($call);
        });
    }

    private function publicCall(array $call): array
    {
        return ['callId' => $call['call_id'], 'sid' => $call['sid'], 'hasVideo' => (bool)$call['has_video'],
            'expiresAt' => (int)$call['expires'], 'state' => $call['state']];
    }

    public function callFor(string $account, string $callId): array
    {
        $this->profile($account);
        return $this->atomic(function () use ($account, $callId) {
            $this->cleanupInside();
            $call = $this->rows('SELECT * FROM call_push_calls WHERE call_id = ?', [self::uuid($callId)])[0] ?? null;
            if (!$call || !in_array($account, [$call['caller'], $call['recipient']], true)) throw new CallPushFailure('Oproep niet beschikbaar.', 404);
            if (!$this->permitted($call, 'read')) throw new CallPushFailure('Oproep niet beschikbaar.', 404);
            return $this->publicCall($call);
        });
    }

    public function end(string $account, string $callId): void
    {
        $this->atomic(function () use ($account, $callId) {
            $call = $this->rows('SELECT * FROM call_push_calls WHERE call_id = ?', [self::uuid($callId)])[0] ?? null;
            if (!$call || !in_array($account, [$call['caller'], $call['recipient']], true)) throw new CallPushFailure('Oproep niet beschikbaar.', 404);
            $this->write("UPDATE call_push_calls SET state = 'ended' WHERE call_id = ?", [$call['call_id']]);
            $this->write("UPDATE call_push_jobs SET state = 'skipped' WHERE call_id = ? AND state = 'pending'", [$call['call_id']]);
        });
    }

    private function deviceAllowed(array $device, array $call): bool
    {
        return $device['account_id'] === $call['recipient'] && $device['environment'] === $this->environment
            && (int)$device['expires'] > ($this->clock)()
            && AccountAccess::versionAllowed($this->pdo, $device['account_id'], (int)$device['access_version']);
    }

    public function acceptVerified(string $recipient, string $binding, string $callId, string $deviceId, string $generation, string $fullJid): array
    {
        $deviceId = self::uuid($deviceId);
        return $this->atomic(function () use ($recipient, $binding, $callId, $deviceId, $generation, $fullJid) {
            $this->cleanupInside();
            $call = $this->rows('SELECT * FROM call_push_calls WHERE call_id = ?', [self::uuid($callId)])[0] ?? null;
            $device = $this->rows('SELECT * FROM call_push_devices WHERE device_id = ?', [self::uuid($deviceId)])[0] ?? null;
            if (!$call || !$device || $call['recipient'] !== $recipient || !$this->deviceAllowed($device, $call)
                || !hash_equals($device['generation'], $generation) || !hash_equals($device['session_binding'], $this->binding($binding))) {
                throw new CallPushFailure('Oproep niet beschikbaar.', 404);
            }
            $profile = $this->profile($recipient);
            if (strlen($fullJid) > 512 || !str_starts_with($fullJid, $profile['jid'] . '/')
                || strlen($fullJid) <= strlen($profile['jid']) + 1 || preg_match('/[\x00-\x20\x7f]/', $fullJid)) {
                throw new CallPushFailure('Ongeldige XMPP-verbinding.');
            }
            $call['recipient_jid'] = $fullJid;
            if (!$this->permitted($call, 'accept')) throw new CallPushFailure('XMPP-verbinding niet bevestigd.', 403);
            if ($call['state'] === 'accepted' && $call['accepted_device'] === $deviceId && $call['accepted_generation'] === $generation) {
                return $this->publicCall($call);
            }
            if ($call['state'] !== 'ringing') throw new CallPushFailure('Oproep is niet meer beschikbaar.', 409);
            $this->write("UPDATE call_push_calls SET state = 'accepted', accepted_device = ?, accepted_generation = ?, recipient_jid = ? WHERE call_id = ?",
                [$deviceId, $generation, $fullJid, $call['call_id']]);
            $this->write("UPDATE call_push_jobs SET state = 'skipped' WHERE call_id = ? AND state = 'pending'", [$call['call_id']]);
            $call['state'] = 'accepted';
            return $this->publicCall($call);
        });
    }

    public function dispatchOne(Closure $send): array
    {
        $job = $this->atomic(function () {
            $this->cleanupInside();
            foreach ($this->rows("SELECT * FROM call_push_jobs WHERE state = 'pending' ORDER BY created, job_id LIMIT 32") as $job) {
                $call = $this->rows('SELECT * FROM call_push_calls WHERE call_id = ?', [$job['call_id']])[0] ?? null;
                $device = $this->rows('SELECT * FROM call_push_devices WHERE device_id = ?', [$job['device_id']])[0] ?? null;
                if (!$call || !$device || $call['state'] !== 'ringing' || (int)$call['expires'] <= ($this->clock)()
                    || !hash_equals($device['generation'], $job['generation']) || !$this->deviceAllowed($device, $call)
                    || !$this->permitted($call, 'dispatch')) {
                    $this->write("UPDATE call_push_jobs SET state = 'skipped' WHERE job_id = ?", [$job['job_id']]);
                    continue;
                }
                $token = $this->crypt($device['token_cipher'], $device, true);
                $this->write("UPDATE call_push_jobs SET state = 'dispatching' WHERE job_id = ?", [$job['job_id']]);
                return $job + ['token' => $token, 'call' => $this->publicCall($call), 'registered_ms' => (int)$device['registered_ms']];
            }
            return null;
        });
        if (!$job) return ['state' => 'idle'];
        try { $result = $send($job['token'], $job['call']); }
        catch (Throwable $error) { $result = null; }
        $state = is_array($result) && ($result['accepted'] ?? null) === true ? 'accepted' : 'unknown';
        if (is_array($result) && ($result['accepted'] ?? null) === false && ($result['reason'] ?? '') !== 'TransportUnavailable') $state = 'rejected';
        $this->atomic(function () use ($job, $result, $state) {
            $this->write('UPDATE call_push_jobs SET state = ? WHERE job_id = ?', [$state, $job['job_id']]);
            if (is_array($result) && ($result['invalidateDevice'] ?? null) === true && ($result['reason'] ?? '') === 'Unregistered'
                && is_int($result['invalidatedAt'] ?? null) && $job['registered_ms'] <= $result['invalidatedAt']) {
                $this->write('DELETE FROM call_push_devices WHERE device_id = ? AND generation = ? AND registered_ms <= ?',
                    [$job['device_id'], $job['generation'], $result['invalidatedAt']]);
            }
        });
        return ['state' => $state];
    }

    private function cleanupInside(): void
    {
        $now = ($this->clock)();
        $this->write("UPDATE call_push_calls SET state = 'expired' WHERE expires <= ? AND state IN ('ringing', 'accepted')", [$now]);
        $this->write('DELETE FROM call_push_devices WHERE expires <= ?', [$now]);
        $this->write('DELETE FROM call_push_jobs WHERE created < ?', [$now - 86400]);
        $this->write('DELETE FROM call_push_calls WHERE created < ?', [$now - 86400]);
    }

    public function cleanup(): void { $this->atomic(fn() => $this->cleanupInside()); }
}
