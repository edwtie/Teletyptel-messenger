<?php
declare(strict_types=1);

require_once __DIR__ . '/CallPushSignaling.php';

final class CallPushBootstrap
{
    private Closure $clock;

    public function __construct(private PDO $pdo, private CallPushSignaling $signaling,
        private string $key, private string $environment, private string $domain, private string $issuer,
        ?Closure $clock = null)
    {
        if (strlen($key) !== 32 || !in_array($environment, ['production', 'sandbox'], true)
            || !preg_match('/\A[a-z0-9][a-z0-9.-]{0,252}\z/', $domain)
            || !preg_match('/\A[A-Za-z0-9_-]{1,64}\z/', $issuer)) {
            throw new CallPushFailure('Oproeptoegang is niet geconfigureerd.', 503);
        }
        $storage = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
        if ($storage !== false && hash_equals($storage, $key)) throw new CallPushFailure('Afzonderlijke oproeptoegangssleutel vereist.', 503);
        $this->clock = $clock ?? static fn(): int => time();
    }

    public function ensureSchema(): void
    {
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_bin' : '';
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS call_bootstrap_issues (nonce VARCHAR(32) PRIMARY KEY,
            call_id VARCHAR(36) NOT NULL, device_id VARCHAR(36) NOT NULL, generation VARCHAR(32) NOT NULL,
            created BIGINT NOT NULL, expires BIGINT NOT NULL)' . $suffix);
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS call_bootstrap_leases (nonce VARCHAR(32) PRIMARY KEY,
            expires BIGINT NOT NULL)' . $suffix);
    }

    private function row(string $sql, array $values): ?array
    {
        $query = $this->pdo->prepare($sql); $query->execute($values);
        return $query->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private static function uuid(string $value): string
    {
        if (!preg_match('/\A[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\z/', $value)) {
            throw new CallPushFailure('Ongeldige oproeptoegang.');
        }
        return $value;
    }

    public function issue(string $account, string $binding, string $deviceId, string $generation, string $callId): array
    {
        self::uuid($deviceId); self::uuid($callId);
        if (!preg_match('/\A[0-9a-f]{64}\z/', $binding) || !preg_match('/\A[0-9a-f]{32}\z/', $generation)) {
            throw new CallPushFailure('Ongeldige oproeptoegang.', 401);
        }
        if ($this->pdo->inTransaction()) throw new CallPushFailure('Oproepopslag is bezet.', 503);
        $this->pdo->beginTransaction();
        try {
            $now = ($this->clock)();
            $this->pdo->prepare('UPDATE call_push_lock SET touched = ? WHERE lock_id = 1')->execute([$now]);
            if (!$this->row('SELECT lock_id FROM call_push_lock WHERE lock_id = ?', [1])) throw new CallPushFailure('Oproepopslag ontbreekt.', 503);
            $call = $this->row('SELECT * FROM call_push_calls WHERE call_id = ?', [$callId]);
            $device = $this->row('SELECT * FROM call_push_devices WHERE device_id = ?', [$deviceId]);
            $owner = $this->row('SELECT jid FROM account_profiles WHERE account_id = ?', [$account]);
            if (!$call || !$device || !$owner || $call['recipient'] !== $account || $device['account_id'] !== $account
                || $call['state'] !== 'ringing' || (int)$call['expires'] <= $now || (int)$device['expires'] <= $now
                || $device['environment'] !== $this->environment || !hash_equals($device['generation'], $generation)
                || !hash_equals($device['session_binding'], hash('sha256', $binding))
                || !AccountAccess::versionAllowed($this->pdo, $account, (int)$device['access_version'])
                || !$this->signaling->allows($call, 'read')) throw new CallPushFailure('Oproeptoegang niet beschikbaar.', 403);
            $caller = $this->signaling->bootstrapCaller($call, $this->key, $this->environment, $this->domain);
            foreach ([$owner['jid'], explode('/', $caller, 2)[0]] as $jid) {
                if (!preg_match('/\A[a-z0-9._-]{1,256}@' . preg_quote($this->domain, '/') . '\z/', $jid)) {
                    throw new CallPushFailure('Oproepdomein komt niet overeen.', 403);
                }
            }
            $previous = $this->row('SELECT COUNT(*) AS total FROM call_bootstrap_issues WHERE call_id = ? AND device_id = ?', [$callId, $deviceId]);
            if ((int)($previous['total'] ?? 0) >= 3) throw new CallPushFailure('Te veel herstelpogingen.', 429);
            $nonce = bin2hex(random_bytes(16));
            $expires = min($now + 20, (int)$call['expires'], (int)$device['expires']);
            $claims = ['version' => 1, 'scope' => 'call-xmpp-bootstrap-v1', 'environment' => $this->environment,
                'domain' => $this->domain, 'issuer' => $this->issuer, 'owner' => $owner['jid'], 'peer' => $caller,
                'callId' => $callId, 'sid' => $call['sid'], 'deviceId' => $deviceId, 'generation' => $generation,
                'profile' => $call['media_profile'], 'nonce' => $nonce, 'resource' => 'tc-call-' . $nonce,
                'issuedAt' => $now, 'expiresAt' => $expires];
            $payload = rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
            $credential = 'tcr1.' . $payload . '.' . hash_hmac('sha256',
                'teletyptel-call-xmpp-v1:' . $this->environment . ':' . $this->domain . ':' . $this->issuer . ':' . $payload, $this->key);
            if (strlen($credential) > 1024) throw new CallPushFailure('Oproeptoegang is te groot.', 503);
            $this->pdo->prepare('DELETE FROM call_bootstrap_issues WHERE created < ?')->execute([$now - 86400]);
            $this->pdo->prepare('DELETE FROM call_bootstrap_leases WHERE expires < ?')->execute([$now - 86400]);
            $this->pdo->prepare('INSERT INTO call_bootstrap_issues VALUES (?, ?, ?, ?, ?, ?)')->execute([$nonce, $callId, $deviceId, $generation, $now, $expires]);
            $this->pdo->commit();
            return ['credential' => $credential, 'claims' => $claims];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function answerPermit(string $account, string $binding, string $deviceId, string $generation, string $callId, string $fullJid): string
    {
        if ($this->pdo->inTransaction()) throw new CallPushFailure('Oproepopslag is bezet.', 503);
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('UPDATE call_push_lock SET touched = ? WHERE lock_id = 1')->execute([($this->clock)()]);
            if (!$this->row('SELECT lock_id FROM call_push_lock WHERE lock_id = ?', [1])) throw new CallPushFailure('Oproepopslag ontbreekt.', 503);
            $permit = $this->createAnswerPermit($account, $binding, $deviceId, $generation, $callId, $fullJid);
            $this->pdo->commit();
            return $permit;
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    public function activeLease(string $account, string $binding, string $deviceId, string $generation, string $callId, string $fullJid): array
    {
        if ($this->pdo->inTransaction()) throw new CallPushFailure('Oproepopslag is bezet.', 503);
        $this->pdo->beginTransaction();
        try {
            $now = ($this->clock)();
            $this->pdo->prepare('UPDATE call_push_lock SET touched = ? WHERE lock_id = 1')->execute([$now]);
            if (!$this->row('SELECT lock_id FROM call_push_lock WHERE lock_id = ?', [1])) throw new CallPushFailure('Oproepopslag ontbreekt.', 503);
            $call = $this->row('SELECT * FROM call_push_calls WHERE call_id = ?', [self::uuid($callId)]);
            $device = $this->row('SELECT * FROM call_push_devices WHERE device_id = ?', [self::uuid($deviceId)]);
            $owner = $this->row('SELECT jid FROM account_profiles WHERE account_id = ?', [$account]);
            if (!$call || !$device || !$owner || $call['recipient'] !== $account || $call['state'] !== 'accepted'
                || $call['accepted_device'] !== $deviceId || $call['accepted_generation'] !== $generation || $call['recipient_jid'] !== $fullJid
                || $device['account_id'] !== $account || !hash_equals($device['generation'], $generation)
                || !hash_equals($device['session_binding'], hash('sha256', $binding)) || (int)$device['expires'] <= $now
                || $device['environment'] !== $this->environment || !AccountAccess::versionAllowed($this->pdo, $account, (int)$device['access_version'])
                || !$this->signaling->allows($call, 'read')) throw new CallPushFailure('Gespreksverlenging geweigerd.', 403);
            $active = $this->signaling->activeCall($call);
            if (!$active) throw new CallPushFailure('Gespreksbewijs wordt verwerkt.', 425);
            $issue = $this->row('SELECT * FROM call_bootstrap_issues WHERE nonce = ? AND call_id = ? AND device_id = ? AND generation = ?',
                [$active['nonce'], $callId, $deviceId, $generation]);
            $previous = $this->row('SELECT expires FROM call_bootstrap_leases WHERE nonce = ?', [$active['nonce']]);
            if (!$issue || (int)($previous['expires'] ?? $issue['expires']) <= $now) throw new CallPushFailure('Gesprekstoegang verlopen.', 403);
            $expires = min($now + 25, (int)$active['expires'], (int)$call['expires'], (int)$device['expires']);
            $claims = ['version' => 1, 'scope' => 'call-xmpp-active-v1', 'environment' => $this->environment,
                'domain' => $this->domain, 'issuer' => $this->issuer, 'owner' => $owner['jid'],
                'peer' => $this->signaling->bootstrapCaller($call, $this->key, $this->environment, $this->domain),
                'callId' => $callId, 'sid' => $call['sid'], 'deviceId' => $deviceId, 'generation' => $generation,
                'profile' => $call['media_profile'], 'nonce' => $active['nonce'], 'resource' => 'tc-call-' . $active['nonce'],
                'issuedAt' => $now, 'expiresAt' => $expires];
            $payload = rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
            $credential = 'tcl1.' . $payload . '.' . hash_hmac('sha256',
                'teletyptel-call-active-v1:' . $this->environment . ':' . $this->domain . ':' . $this->issuer . ':' . $payload, $this->key);
            if (strlen($credential) > 1024) throw new CallPushFailure('Oproeptoegang is te groot.', 503);
            $this->pdo->prepare('DELETE FROM call_bootstrap_leases WHERE nonce = ?')->execute([$active['nonce']]);
            $this->pdo->prepare('INSERT INTO call_bootstrap_leases VALUES (?, ?)')->execute([$active['nonce'], max($expires, (int)($previous['expires'] ?? 0))]);
            $this->pdo->commit();
            return ['credential' => $credential, 'claims' => $claims];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }

    private function createAnswerPermit(string $account, string $binding, string $deviceId, string $generation, string $callId, string $fullJid): string
    {
        $now = ($this->clock)();
        $call = $this->row('SELECT * FROM call_push_calls WHERE call_id = ?', [self::uuid($callId)]);
        $device = $this->row('SELECT * FROM call_push_devices WHERE device_id = ?', [self::uuid($deviceId)]);
        $owner = $this->row('SELECT jid FROM account_profiles WHERE account_id = ?', [$account]);
        if (!$call || !$device || !$owner || $call['recipient'] !== $account || $call['state'] !== 'accepted'
            || $call['accepted_device'] !== $deviceId || $call['accepted_generation'] !== $generation || $call['recipient_jid'] !== $fullJid
            || $device['account_id'] !== $account || !hash_equals($device['generation'], $generation)
            || !hash_equals($device['session_binding'], hash('sha256', $binding)) || (int)$device['expires'] <= $now
            || $device['environment'] !== $this->environment || !AccountAccess::versionAllowed($this->pdo, $account, (int)$device['access_version'])
            || !$this->signaling->allows($call, 'accept') || !preg_match('/\A' . preg_quote($owner['jid'], '/') . '\/tc-call-([0-9a-f]{32})\z/', $fullJid, $match)) {
            throw new CallPushFailure('Opnemen is niet toegestaan.', 403);
        }
        $issue = $this->row('SELECT expires FROM call_bootstrap_issues WHERE nonce = ? AND call_id = ? AND device_id = ? AND generation = ? AND expires > ?',
            [$match[1], $callId, $deviceId, $generation, $now]);
        if (!$issue) throw new CallPushFailure('Oproeptoegang verlopen.', 403);
        $claims = ['version' => 1, 'scope' => 'call-xmpp-answer-v1', 'environment' => $this->environment,
            'domain' => $this->domain, 'issuer' => $this->issuer, 'owner' => $owner['jid'],
            'peer' => $this->signaling->bootstrapCaller($call, $this->key, $this->environment, $this->domain),
            'callId' => $callId, 'sid' => $call['sid'], 'deviceId' => $deviceId, 'generation' => $generation,
            'profile' => $call['media_profile'], 'nonce' => $match[1], 'resource' => 'tc-call-' . $match[1],
            'issuedAt' => $now, 'expiresAt' => min((int)$issue['expires'], (int)$call['expires'], (int)$device['expires'])];
        $payload = rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
        $credential = 'tca1.' . $payload . '.' . hash_hmac('sha256',
            'teletyptel-call-answer-v1:' . $this->environment . ':' . $this->domain . ':' . $this->issuer . ':' . $payload, $this->key);
        if (strlen($credential) > 1024) throw new CallPushFailure('Oproeptoegang is te groot.', 503);
        return $credential;
    }
}
