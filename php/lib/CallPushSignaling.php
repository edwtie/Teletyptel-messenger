<?php
declare(strict_types=1);

require_once __DIR__ . '/CallPushService.php';

final class CallPushSignaling
{
    private Closure $clock;
    private string $scope;

    public function __construct(private PDO $pdo, private string $key, private string $environment,
        private string $domain, private string $issuer, ?Closure $clock = null)
    {
        if (strlen($key) !== 32 || !in_array($environment, ['production', 'sandbox'], true)
            || !preg_match('/\A[a-z0-9][a-z0-9.-]{0,252}\z/', $domain)
            || !preg_match('/\A[a-zA-Z0-9_-]{1,64}\z/', $issuer)) {
            throw new CallPushFailure('Oproepsignalering is niet geconfigureerd.', 503);
        }
        $this->clock = $clock ?? static fn(): int => time();
        $this->scope = hash('sha256', $environment . ':' . $domain . ':' . $issuer);
    }

    public static function configured(PDO $pdo): self
    {
        if (getenv('TELETYPTEL_CALL_SIGNALING') !== '1') throw new CallPushFailure('Oproepsignalering is niet ingeschakeld.', 503);
        $file = realpath((string)getenv('TELETYPTEL_CALL_SIGNALING_KEY_FILE'));
        if ($file === false || !is_file($file) || filesize($file) > 128) throw new CallPushFailure('Signaleringssleutel ontbreekt.', 503);
        $normalize = static fn(string $path): string => PHP_OS_FAMILY === 'Windows' ? strtolower(str_replace('\\', '/', $path)) : $path;
        foreach ([dirname(__DIR__, 2), $_SERVER['DOCUMENT_ROOT'] ?? ''] as $directory) {
            if ($directory === '') continue;
            $root = realpath($directory);
            if ($root !== false && str_starts_with($normalize($file), rtrim($normalize($root), '/') . '/')) {
                throw new CallPushFailure('Signaleringssleutel moet buiten de website en broncode staan.', 503);
            }
        }
        if (PHP_OS_FAMILY !== 'Windows' && (fileperms($file) & 0077) !== 0) {
            throw new CallPushFailure('Signaleringssleutel heeft onveilige bestandsrechten.', 503);
        }
        $encoded = file_get_contents($file, false, null, 0, 129);
        $key = is_string($encoded) ? base64_decode(trim($encoded), true) : false;
        if ($key === false || strlen($key) !== 32 || strlen($encoded) > 128 || base64_encode($key) !== trim($encoded)) {
            throw new CallPushFailure('Ongeldige signaleringssleutel.', 503);
        }
        $storage = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
        if ($storage !== false && hash_equals($key, $storage)) throw new CallPushFailure('Afzonderlijke signaleringssleutel vereist.', 503);
        return new self($pdo, $key, (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT'),
            (string)getenv('TELETYPTEL_CALL_SIGNALING_DOMAIN'), (string)getenv('TELETYPTEL_CALL_SIGNALING_ISSUER'));
    }

    public function ensureSchema(): void
    {
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_bin' : '';
        foreach ([
            'events' => 'scope_id VARCHAR(64) NOT NULL, nonce VARCHAR(32) NOT NULL, digest VARCHAR(64) NOT NULL,
                created BIGINT NOT NULL, PRIMARY KEY(scope_id, nonce)',
            'resources' => 'scope_id VARCHAR(64) NOT NULL, full_jid VARCHAR(512) NOT NULL, account_id VARCHAR(96) NOT NULL,
                access_version INTEGER NOT NULL, revision BIGINT NOT NULL, online INTEGER NOT NULL,
                expires BIGINT NOT NULL, touched BIGINT NOT NULL, PRIMARY KEY(scope_id, full_jid)',
            'policies' => 'scope_id VARCHAR(64) NOT NULL, owner_id VARCHAR(96) NOT NULL, peer_id VARCHAR(96) NOT NULL,
                owner_version INTEGER NOT NULL, peer_version INTEGER NOT NULL, allowed INTEGER NOT NULL,
                revision BIGINT NOT NULL, expires BIGINT NOT NULL, touched BIGINT NOT NULL,
                PRIMARY KEY(scope_id, owner_id, peer_id)',
            'calls' => 'scope_id VARCHAR(64) NOT NULL, caller VARCHAR(96) NOT NULL, sid VARCHAR(128) NOT NULL,
                recipient VARCHAR(96) NOT NULL, caller_jid VARCHAR(512) NOT NULL, media_profile VARCHAR(16) NOT NULL,
                caller_version INTEGER NOT NULL, recipient_version INTEGER NOT NULL, revision BIGINT NOT NULL,
                state VARCHAR(16) NOT NULL, expires BIGINT NOT NULL, created BIGINT NOT NULL, touched BIGINT NOT NULL,
                call_id VARCHAR(36) NULL, PRIMARY KEY(scope_id, caller, sid)',
            'handoffs' => 'scope_id VARCHAR(64) NOT NULL, call_id VARCHAR(36) NOT NULL, device_id VARCHAR(36) NOT NULL,
                generation VARCHAR(32) NOT NULL, full_jid VARCHAR(512) NOT NULL, revision BIGINT NOT NULL,
                expires BIGINT NOT NULL, touched BIGINT NOT NULL, PRIMARY KEY(scope_id, call_id, device_id, generation)',
        ] as $table => $columns) $this->pdo->exec('CREATE TABLE IF NOT EXISTS call_signaling_' . $table . ' (' . $columns . ')' . $suffix);
    }

    private function rows(string $sql, array $values = []): array
    {
        $query = $this->pdo->prepare($sql);
        $query->execute($values);
        return $query->fetchAll(PDO::FETCH_ASSOC);
    }

    private function write(string $sql, array $values = []): void
    {
        $query = $this->pdo->prepare($sql);
        $query->execute($values);
    }

    private function atomic(Closure $operation): mixed
    {
        if ($this->pdo->inTransaction()) throw new CallPushFailure('Signaleringsopslag is bezet.', 503);
        $this->pdo->beginTransaction();
        try {
            $this->write('UPDATE call_push_lock SET touched = ? WHERE lock_id = 1', [($this->clock)()]);
            if (!$this->rows('SELECT lock_id FROM call_push_lock WHERE lock_id = 1')) throw new CallPushFailure('Signaleringsopslag is niet ingericht.', 503);
            $result = $operation();
            $this->pdo->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    private static function fields(array $input, array $expected): void
    {
        $actual = array_keys($input);
        sort($actual); sort($expected);
        if ($actual !== $expected) throw new CallPushFailure('Ongeldige signaleringsvelden.');
    }

    private function account(mixed $jid, bool $full = false): array
    {
        if (!is_string($jid) || strlen($jid) > 512 || preg_match('//u', $jid) !== 1
            || preg_match('/[\x00-\x20\x7f]/', $jid)) throw new CallPushFailure('Ongeldige signaleringsidentiteit.');
        $parts = explode('/', $jid, 2);
        if (!preg_match('/\A[a-z0-9._-]{1,256}@' . preg_quote($this->domain, '/') . '\z/', $parts[0])
            || ($full ? count($parts) !== 2 || $parts[1] === '' || strlen($parts[1]) > 256 : count($parts) !== 1)) {
            throw new CallPushFailure('Ongeldige signaleringsidentiteit.');
        }
        $rows = $this->rows('SELECT account_id, jid FROM account_profiles WHERE jid = ?', [$parts[0]]);
        if (count($rows) !== 1 || $rows[0]['jid'] !== $parts[0]) throw new CallPushFailure('Signaleringsaccount niet beschikbaar.', 403);
        return $rows[0] + ['version' => (int)AccountAccess::state($this->pdo, $rows[0]['account_id'])['version']];
    }

    private static function identifier(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/\A[A-Za-z0-9_-]{1,128}\z/', $value)) throw new CallPushFailure('Ongeldige oproepidentificatie.');
        return $value;
    }

    private static function uuid(mixed $value): string
    {
        if (!is_string($value) || !preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/', $value)) {
            throw new CallPushFailure('Ongeldige toestel- of oproepidentificatie.');
        }
        return $value;
    }

    private function lease(mixed $expires, int $maximum, int $issued): int
    {
        $now = ($this->clock)();
        if (!is_int($expires) || $expires <= $now || $expires > $now + $maximum || $expires > $issued + $maximum) throw new CallPushFailure('Signaleringsstatus is verlopen.');
        return $expires;
    }

    private function revision(mixed $value, ?array $previous): int
    {
        if (!is_int($value) || $value < 1 || $value > 9007199254740991
            || $previous !== null && $value <= (int)$previous['revision']) throw new CallPushFailure('Verouderde signaleringsvolgorde.', 409);
        return $value;
    }

    public function ingest(string $raw): array
    {
        if (strlen($raw) > 16384) throw new CallPushFailure('Signaleringsgebeurtenis te groot.', 413);
        try { $envelope = json_decode($raw, true, 8, JSON_THROW_ON_ERROR); }
        catch (JsonException $error) { throw new CallPushFailure('Ongeldige signaleringsgebeurtenis.'); }
        if (!is_array($envelope)) throw new CallPushFailure('Ongeldige signaleringsgebeurtenis.');
        self::fields($envelope, ['payload', 'signature']);
        $payload = $envelope['payload']; $signature = $envelope['signature'];
        if (!is_string($payload) || strlen($payload) > 12000 || !is_string($signature)
            || !preg_match('/\A[0-9a-f]{64}\z/', $signature)
            || !hash_equals(hash_hmac('sha256', 'teletyptel-call-signaling-v1:' . $this->environment . ':' . $this->domain . ':' . $this->issuer . ':' . $payload, $this->key), $signature)) {
            throw new CallPushFailure('Signaleringsbron niet geverifieerd.', 403);
        }
        $decoded = base64_decode($payload, true);
        if ($decoded === false || strlen($decoded) > 8192 || base64_encode($decoded) !== $payload) throw new CallPushFailure('Ongeldige signaleringsgebeurtenis.');
        try { $body = json_decode($decoded, true, 8, JSON_THROW_ON_ERROR); }
        catch (JsonException $error) { throw new CallPushFailure('Ongeldige signaleringsgebeurtenis.'); }
        if (!is_array($body)) throw new CallPushFailure('Ongeldige signaleringsgebeurtenis.');
        self::fields($body, ['version', 'issuer', 'timestamp', 'nonce', 'event']);
        $now = ($this->clock)();
        if ($body['version'] !== 1 || $body['issuer'] !== $this->issuer || !is_int($body['timestamp'])
            || $body['timestamp'] < $now - 30 || $body['timestamp'] > $now + 5
            || !is_string($body['nonce']) || !preg_match('/\A[0-9a-f]{32}\z/', $body['nonce']) || !is_array($body['event'])) {
            throw new CallPushFailure('Signaleringsgebeurtenis niet geldig.', 403);
        }
        return $this->atomic(function () use ($body, $decoded, $now) {
            $digest = hash('sha256', $decoded);
            $previous = $this->rows('SELECT digest FROM call_signaling_events WHERE scope_id = ? AND nonce = ?', [$this->scope, $body['nonce']])[0] ?? null;
            if ($previous) {
                if (!hash_equals($previous['digest'], $digest)) throw new CallPushFailure('Signaleringsconflict.', 409);
                return ['accepted' => true, 'duplicate' => true];
            }
            $this->cleanupInside($now);
            if ((int)$this->rows('SELECT COUNT(*) AS total FROM call_signaling_events WHERE scope_id = ? AND created >= ?', [$this->scope, $now - 60])[0]['total'] >= 10000) {
                throw new CallPushFailure('Te veel signaleringsgebeurtenissen.', 429);
            }
            $event = $body['event'];
            match ($event['type'] ?? '') {
                'resource' => $this->resourceEvent($event, $now, $body['timestamp']),
                'policy' => $this->policyEvent($event, $now, $body['timestamp']),
                'offer', 'end' => $this->callEvent($event, $now, $body['timestamp']),
                'handoff' => $this->handoffEvent($event, $now, $body['timestamp']),
                default => throw new CallPushFailure('Onbekende signaleringsgebeurtenis.'),
            };
            $this->write("UPDATE call_push_jobs SET state = 'skipped' WHERE state = 'pending' AND call_id IN
                (SELECT call_id FROM call_push_calls WHERE state IN ('ended', 'expired'))");
            $this->write('INSERT INTO call_signaling_events VALUES (?, ?, ?, ?)', [$this->scope, $body['nonce'], $digest, $now]);
            return ['accepted' => true, 'duplicate' => false];
        });
    }

    private function resourceEvent(array $event, int $now, int $issued): void
    {
        self::fields($event, ['type', 'jid', 'online', 'revision', 'expiresAt']);
        $account = $this->account($event['jid'], true);
        if (!is_bool($event['online'])) throw new CallPushFailure('Ongeldige verbindingsstatus.');
        $expires = $this->lease($event['expiresAt'], 30, $issued);
        $previous = $this->rows('SELECT * FROM call_signaling_resources WHERE scope_id = ? AND full_jid = ?', [$this->scope, $event['jid']])[0] ?? null;
        $revision = $this->revision($event['revision'], $previous);
        if (!$previous && (int)$this->rows('SELECT COUNT(*) AS total FROM call_signaling_resources WHERE scope_id = ? AND account_id = ?', [$this->scope, $account['account_id']])[0]['total'] >= 64) {
            throw new CallPushFailure('Te veel verbindingsidentiteiten.', 429);
        }
        $this->write('DELETE FROM call_signaling_resources WHERE scope_id = ? AND full_jid = ?', [$this->scope, $event['jid']]);
        $this->write('INSERT INTO call_signaling_resources VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$this->scope, $event['jid'], $account['account_id'], $account['version'], $revision, (int)$event['online'], $expires, $now]);
        if (!$event['online']) {
            $this->write("UPDATE call_signaling_calls SET state = 'ended', touched = ? WHERE scope_id = ? AND caller_jid = ?", [$now, $this->scope, $event['jid']]);
            $this->write("UPDATE call_push_calls SET state = 'ended' WHERE state IN ('ringing', 'accepted') AND (caller = ? AND sid IN
                (SELECT sid FROM call_signaling_calls WHERE scope_id = ? AND caller_jid = ?) OR recipient_jid = ?)",
                [$account['account_id'], $this->scope, $event['jid'], $event['jid']]);
        }
    }

    private function policyEvent(array $event, int $now, int $issued): void
    {
        self::fields($event, ['type', 'owner', 'peer', 'allowed', 'revision', 'expiresAt']);
        $owner = $this->account($event['owner']); $peer = $this->account($event['peer']);
        if ($owner['account_id'] === $peer['account_id'] || !is_bool($event['allowed'])) throw new CallPushFailure('Ongeldige oproeppolicy.');
        $expires = $this->lease($event['expiresAt'], 30, $issued);
        $parameters = [$this->scope, $owner['account_id'], $peer['account_id']];
        $previous = $this->rows('SELECT * FROM call_signaling_policies WHERE scope_id = ? AND owner_id = ? AND peer_id = ?', $parameters)[0] ?? null;
        $revision = $this->revision($event['revision'], $previous);
        $this->write('DELETE FROM call_signaling_policies WHERE scope_id = ? AND owner_id = ? AND peer_id = ?', $parameters);
        $this->write('INSERT INTO call_signaling_policies VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [...$parameters, $owner['version'], $peer['version'], (int)$event['allowed'], $revision, $expires, $now]);
        if (!$event['allowed']) {
            $pair = [$owner['account_id'], $peer['account_id'], $peer['account_id'], $owner['account_id']];
            $this->write("UPDATE call_signaling_calls SET state = 'ended', touched = ? WHERE scope_id = ? AND
                ((caller = ? AND recipient = ?) OR (caller = ? AND recipient = ?))", [$now, $this->scope, ...$pair]);
            $this->write("UPDATE call_push_calls SET state = 'ended' WHERE state IN ('ringing', 'accepted') AND
                ((caller = ? AND recipient = ?) OR (caller = ? AND recipient = ?))", $pair);
        }
    }

    private function callEvent(array $event, int $now, int $issued): void
    {
        $ending = $event['type'] === 'end';
        self::fields($event, $ending ? ['type', 'caller', 'recipient', 'sid', 'actor', 'revision']
            : ['type', 'caller', 'recipient', 'sid', 'mediaProfile', 'revision', 'expiresAt']);
        $caller = $this->account($event['caller'], true); $recipient = $this->account($event['recipient']);
        $sid = self::identifier($event['sid']);
        if ($caller['account_id'] === $recipient['account_id']) throw new CallPushFailure('Ongeldige oproep.');
        $parameters = [$this->scope, $caller['account_id'], $sid];
        $previous = $this->rows('SELECT * FROM call_signaling_calls WHERE scope_id = ? AND caller = ? AND sid = ?', $parameters)[0] ?? null;
        $revision = $this->revision($event['revision'], $previous);
        if ($previous && ($previous['caller_jid'] !== $event['caller'] || $previous['recipient'] !== $recipient['account_id'])) {
            throw new CallPushFailure('Oproepidentiteit gewijzigd.', 409);
        }
        if ($ending) {
            $actor = $this->account($event['actor'], true);
            if (!$this->resourceAllowed($event['actor'], $actor['account_id']) || !in_array($actor['account_id'], [$caller['account_id'], $recipient['account_id']], true)
                || $actor['account_id'] === $caller['account_id'] && $event['actor'] !== $event['caller']) {
                throw new CallPushFailure('Oproepafsluiting niet toegestaan.', 403);
            }
            $reserved = $this->rows("SELECT recipient_jid FROM call_push_calls WHERE caller = ? AND sid = ? AND state = 'accepted'", [$caller['account_id'], $sid])[0] ?? null;
            if ($reserved && $actor['account_id'] === $recipient['account_id'] && $reserved['recipient_jid'] !== $event['actor']) {
                throw new CallPushFailure('Oproep door ander toestel beantwoord.', 409);
            }
        } else {
            if ($previous) throw new CallPushFailure('Een oproepsessie kan niet worden hergebruikt.', 409);
            if (!is_string($event['mediaProfile']) || !in_array($event['mediaProfile'], ['audio', 'video', 'audio-rtt', 'total'], true)) throw new CallPushFailure('Ongeldig mediaprofiel.');
            $this->lease($event['expiresAt'], 60, $issued);
            if (!$this->resourceAllowed($event['caller'], $caller['account_id']) || !$this->pairAllowed($caller['account_id'], $recipient['account_id'])) {
                throw new CallPushFailure('Geen actuele oproeptoestemming.', 403);
            }
            if ((int)$this->rows('SELECT COUNT(*) AS total FROM call_signaling_calls WHERE scope_id = ? AND caller = ? AND created >= ?', [$this->scope, $caller['account_id'], $now - 60])[0]['total'] >= 5) {
                throw new CallPushFailure('Te veel oproepen.', 429);
            }
        }
        $this->write('DELETE FROM call_signaling_calls WHERE scope_id = ? AND caller = ? AND sid = ?', $parameters);
        $this->write('INSERT INTO call_signaling_calls VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$this->scope, $caller['account_id'], $sid, $recipient['account_id'], $event['caller'],
             $previous['media_profile'] ?? ($ending ? 'audio' : $event['mediaProfile']), $caller['version'], $recipient['version'], $revision,
             $ending ? 'ended' : 'pending', $previous['expires'] ?? ($ending ? $now : $event['expiresAt']), $previous['created'] ?? $now, $now, $previous['call_id'] ?? null]);
        if ($ending) $this->write("UPDATE call_push_calls SET state = 'ended' WHERE caller = ? AND sid = ?", [$caller['account_id'], $sid]);
    }

    private function handoffEvent(array $event, int $now, int $issued): void
    {
        self::fields($event, ['type', 'callId', 'sid', 'jid', 'deviceId', 'generation', 'revision', 'expiresAt']);
        $callId = self::uuid($event['callId']); $deviceId = self::uuid($event['deviceId']);
        $sid = self::identifier($event['sid']); $account = $this->account($event['jid'], true);
        if (!is_string($event['generation']) || !preg_match('/\A[0-9a-f]{32}\z/', $event['generation'])) throw new CallPushFailure('Ongeldige toestelgeneratie.');
        $expires = $this->lease($event['expiresAt'], 15, $issued);
        $call = $this->rows('SELECT * FROM call_push_calls WHERE call_id = ?', [$callId])[0] ?? null;
        $device = $this->rows('SELECT * FROM call_push_devices WHERE device_id = ?', [$deviceId])[0] ?? null;
        if (!$call || !$device || $call['recipient'] !== $account['account_id'] || $call['sid'] !== $sid
            || !$this->allows($call, 'read') || !$this->resourceAllowed($event['jid'], $account['account_id'])
            || $device['account_id'] !== $account['account_id'] || $device['generation'] !== $event['generation']
            || $device['environment'] !== $this->environment || (int)$device['expires'] <= $now
            || (int)$device['access_version'] !== $account['version']
            || $call['state'] === 'accepted' && ($call['accepted_device'] !== $deviceId || $call['accepted_generation'] !== $event['generation'] || $call['recipient_jid'] !== $event['jid'])) {
            throw new CallPushFailure('Oproepherstel niet bevestigd.', 403);
        }
        $parameters = [$this->scope, $callId, $deviceId, $event['generation']];
        $previous = $this->rows('SELECT * FROM call_signaling_handoffs WHERE scope_id = ? AND call_id = ? AND device_id = ? AND generation = ?', $parameters)[0] ?? null;
        $revision = $this->revision($event['revision'], $previous);
        $this->write('DELETE FROM call_signaling_handoffs WHERE scope_id = ? AND call_id = ? AND device_id = ? AND generation = ?', $parameters);
        $this->write('INSERT INTO call_signaling_handoffs VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [...$parameters, $event['jid'], $revision, min($expires, (int)$call['expires']), $now]);
    }

    private function resourceAllowed(string $jid, string $account): bool
    {
        $row = $this->rows('SELECT * FROM call_signaling_resources WHERE scope_id = ? AND full_jid = ?', [$this->scope, $jid])[0] ?? null;
        return $row && $row['account_id'] === $account && (int)$row['online'] === 1 && (int)$row['expires'] > ($this->clock)()
            && AccountAccess::versionAllowed($this->pdo, $account, (int)$row['access_version']);
    }

    private function pairAllowed(string $caller, string $recipient): bool
    {
        foreach ([[$caller, $recipient], [$recipient, $caller]] as [$owner, $peer]) {
            $policy = $this->rows('SELECT * FROM call_signaling_policies WHERE scope_id = ? AND owner_id = ? AND peer_id = ?', [$this->scope, $owner, $peer])[0] ?? null;
            if (!$policy || (int)$policy['allowed'] !== 1 || (int)$policy['expires'] <= ($this->clock)()
                || !AccountAccess::versionAllowed($this->pdo, $owner, (int)$policy['owner_version'])
                || !AccountAccess::versionAllowed($this->pdo, $peer, (int)$policy['peer_version'])) return false;
        }
        return true;
    }

    public function allows(array $call, string $operation): bool
    {
        try {
            if (!in_array($operation, ['invite', 'dispatch', 'read', 'accept'], true)
                || !is_string($call['caller'] ?? null) || !is_string($call['recipient'] ?? null) || !is_string($call['sid'] ?? null)) return false;
            $record = $this->rows('SELECT * FROM call_signaling_calls WHERE scope_id = ? AND caller = ? AND sid = ?', [$this->scope, $call['caller'], $call['sid']])[0] ?? null;
            $now = ($this->clock)();
            if (!$record || $record['state'] !== 'pending' || $record['recipient'] !== $call['recipient'] || (int)$record['expires'] <= $now
                || $record['media_profile'] !== ($call['media_profile'] ?? null)
                || (bool)($call['has_video'] ?? null) !== in_array($record['media_profile'], ['video', 'total'], true)
                || (int)($call['expires'] ?? 0) > (int)$record['expires'] || (int)($call['expires'] ?? 0) <= $now
                || (int)($call['created'] ?? 0) < (int)$record['created']
                || !in_array($call['state'] ?? null, ['ringing', 'accepted'], true)
                || $operation !== 'invite' && $record['call_id'] !== null && $record['call_id'] !== ($call['call_id'] ?? null)
                || (int)($call['caller_version'] ?? 0) !== (int)$record['caller_version']
                || (int)($call['recipient_version'] ?? 0) !== (int)$record['recipient_version']
                || !AccountAccess::versionAllowed($this->pdo, $record['caller'], (int)$record['caller_version'])
                || !AccountAccess::versionAllowed($this->pdo, $record['recipient'], (int)$record['recipient_version'])
                || !$this->resourceAllowed($record['caller_jid'], $record['caller']) || !$this->pairAllowed($record['caller'], $record['recipient'])) return false;
            if ($operation !== 'accept') return true;
            $handoff = $this->rows('SELECT * FROM call_signaling_handoffs WHERE scope_id = ? AND call_id = ? AND device_id = ? AND generation = ?',
                [$this->scope, $call['call_id'] ?? '', $call['accepted_device'] ?? '', $call['accepted_generation'] ?? ''])[0] ?? null;
            return $handoff && $handoff['full_jid'] === ($call['recipient_jid'] ?? null) && (int)$handoff['expires'] > $now
                && $this->resourceAllowed($handoff['full_jid'], $record['recipient']);
        } catch (Throwable $error) { return false; }
    }

    public function bootstrapCaller(array $call, string $bootstrapKey, string $environment, string $domain): string
    {
        if (hash_equals($this->key, $bootstrapKey)) throw new CallPushFailure('Afzonderlijke oproeptoegangssleutel vereist.', 503);
        if ($environment !== $this->environment || $domain !== $this->domain) throw new CallPushFailure('Oproepomgeving komt niet overeen.', 403);
        if (!$this->allows($call, 'read')) throw new CallPushFailure('Oproepherstel niet toegestaan.', 403);
        $record = $this->rows('SELECT caller_jid FROM call_signaling_calls WHERE scope_id = ? AND caller = ? AND sid = ?',
            [$this->scope, $call['caller'], $call['sid']])[0] ?? null;
        if (!$record || !is_string($record['caller_jid'])) throw new CallPushFailure('Oproepbron ontbreekt.', 403);
        return $record['caller_jid'];
    }

    public function enqueue(CallPushService $service, int $limit = 8): array
    {
        if ($limit < 1 || $limit > 32) throw new CallPushFailure('Ongeldige werkbatch.');
        $queued = 0; $deferred = 0;
        $records = $this->rows("SELECT * FROM call_signaling_calls WHERE scope_id = ? AND state = 'pending' AND call_id IS NULL AND expires > ? ORDER BY created, sid LIMIT " . $limit,
            [$this->scope, ($this->clock)()]);
        foreach ($records as $record) {
            try {
                $remaining = (int)$record['expires'] - ($this->clock)();
                if ($remaining < 1 || $remaining > 60) { $deferred++; continue; }
                $call = $service->inviteVerified($record['caller'], $record['recipient'], $record['sid'],
                    in_array($record['media_profile'], ['video', 'total'], true), $remaining, $record['media_profile']);
                $this->atomic(function () use ($record, $call) {
                    $this->write("UPDATE call_signaling_calls SET call_id = ? WHERE scope_id = ? AND caller = ? AND sid = ? AND state = 'pending' AND call_id IS NULL",
                        [$call['callId'], $this->scope, $record['caller'], $record['sid']]);
                });
                $queued++;
            } catch (CallPushFailure | AccountAccessDenied $error) { $deferred++; }
        }
        return ['queued' => $queued, 'deferred' => $deferred];
    }

    public function accept(CallPushService $service, string $account, string $binding, array $input): array
    {
        self::fields($input, ['action', 'callId', 'deviceId', 'generation', 'fullJid']);
        if ($input['action'] !== 'accept' || !is_string($input['fullJid'])
            || !is_string($input['generation']) || !preg_match('/\A[0-9a-f]{32}\z/', $input['generation'])) {
            throw new CallPushFailure('Ongeldige antwoordaanvraag.');
        }
        $owner = $this->account($input['fullJid'], true);
        if ($owner['account_id'] !== $account) throw new CallPushFailure('Oproep niet beschikbaar.', 403);
        $callId = self::uuid($input['callId']); $deviceId = self::uuid($input['deviceId']);
        $candidate = $this->rows('SELECT * FROM call_push_calls WHERE call_id = ?', [$callId])[0] ?? null;
        $devices = array_filter($service->devices($account, $binding), static fn(array $device): bool =>
            $device['device_id'] === $deviceId && hash_equals($device['generation'], $input['generation']));
        if (!$candidate || !$devices) throw new CallPushFailure('Oproep niet beschikbaar.', 403);
        $status = $service->reconcileDevice($account, $binding, $deviceId,
            [['callId' => $callId, 'sid' => $candidate['sid'], 'end' => false]])[0]['state'];
        if (!in_array($status, ['ringing', 'accepted'], true)) throw new CallPushFailure('Oproep niet beschikbaar.', 409);
        $proof = $this->rows('SELECT full_jid FROM call_signaling_handoffs WHERE scope_id = ? AND call_id = ? AND device_id = ? AND generation = ?',
            [$this->scope, $callId, $deviceId, $input['generation']])[0] ?? null;
        if (!$proof) throw new CallPushFailure('resource_proof_pending', 425);
        $result = $service->acceptVerified($account, $binding, self::uuid($input['callId']),
            self::uuid($input['deviceId']), $input['generation'], $input['fullJid']);
        $call = $this->rows('SELECT * FROM call_push_calls WHERE call_id = ?', [$result['callId']])[0] ?? null;
        $record = $call ? ($this->rows('SELECT caller_jid FROM call_signaling_calls WHERE scope_id = ? AND caller = ? AND sid = ?',
            [$this->scope, $call['caller'], $call['sid']])[0] ?? null) : null;
        if (!$call || !$record || $call['recipient_jid'] !== $input['fullJid'] || !$this->allows($call, 'read')) {
            throw new CallPushFailure('Oproep niet meer beschikbaar.', 409);
        }
        return $result + ['callerJid' => $record['caller_jid'], 'recipientJid' => $call['recipient_jid']];
    }

    private function cleanupInside(int $now): void
    {
        $this->write('DELETE FROM call_signaling_events WHERE scope_id = ? AND created < ?', [$this->scope, $now - 120]);
        foreach (['resources', 'policies', 'handoffs', 'calls'] as $table) {
            $this->write('DELETE FROM call_signaling_' . $table . ' WHERE scope_id = ? AND touched < ?', [$this->scope, $now - 86400]);
        }
    }
}
