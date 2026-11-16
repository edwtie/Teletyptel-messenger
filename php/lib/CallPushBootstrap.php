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
            $this->pdo->prepare('INSERT INTO call_bootstrap_issues VALUES (?, ?, ?, ?, ?, ?)')->execute([$nonce, $callId, $deviceId, $generation, $now, $expires]);
            $this->pdo->commit();
            return ['credential' => $credential, 'claims' => $claims];
        } catch (Throwable $error) {
            if ($this->pdo->inTransaction()) $this->pdo->rollBack();
            throw $error;
        }
    }
}
