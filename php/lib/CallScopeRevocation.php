<?php
declare(strict_types=1);

final class CallScopeRevocation
{
    public function __construct(private PDO $pdo, private string $key, private string $environment,
        private string $domain, private string $issuer, private Closure $transport, private ?Closure $clock = null)
    {
        if (strlen($key) !== 32 || !in_array($environment, ['production', 'sandbox'], true)
            || !preg_match('/\A[a-z0-9][a-z0-9.-]{0,252}\z/', $domain)
            || !preg_match('/\A[A-Za-z0-9_-]{1,64}\z/', $issuer)) throw new CallPushFailure('Intrekking niet ingericht.', 503);
        $this->clock ??= static fn(): int => time();
    }

    public static function ensureSchema(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS call_scope_revocations (event_id VARCHAR(32) PRIMARY KEY,
            device_id VARCHAR(36) NOT NULL, generation VARCHAR(32) NOT NULL, environment VARCHAR(16) NOT NULL,
            created BIGINT NOT NULL, delivered BIGINT NULL, UNIQUE(device_id, generation))'
            . ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_bin' : ''));
    }

    public static function queue(PDO $pdo, array $devices, int $now): array
    {
        if (getenv('TELETYPTEL_CALL_SCOPE_REVOCATION') !== '1') return [];
        if (!$pdo->inTransaction()) throw new CallPushFailure('Intrekking vereist een transactie.', 503);
        $ids = [];
        foreach ($devices as $device) {
            $query = $pdo->prepare('SELECT event_id FROM call_scope_revocations WHERE device_id = ? AND generation = ?');
            $query->execute([$device['device_id'], $device['generation']]);
            $id = $query->fetchColumn();
            if (!$id) {
                $id = bin2hex(random_bytes(16));
                $pdo->prepare('INSERT INTO call_scope_revocations VALUES (?, ?, ?, ?, ?, NULL)')->execute(
                    [$id, $device['device_id'], $device['generation'], $device['environment'], $now]);
            }
            $pdo->prepare("UPDATE call_push_calls SET state = 'ended' WHERE accepted_device = ? AND accepted_generation = ? AND state = 'accepted'")
                ->execute([$device['device_id'], $device['generation']]);
            $ids[] = $id;
        }
        return $ids;
    }

    public static function deliverConfigured(PDO $pdo, array $ids): void
    {
        if (!$ids || getenv('TELETYPTEL_CALL_SCOPE_REVOCATION') !== '1') return;
        try { self::configured($pdo)->drain($ids); } catch (Throwable $error) {}
    }

    public static function configured(PDO $pdo): self
    {
        if (getenv('TELETYPTEL_CALL_SCOPE_REVOCATION') !== '1') throw new CallPushFailure('Intrekking niet ingeschakeld.', 404);
        $path = (string)getenv('TELETYPTEL_CALL_BOOTSTRAP_KEY_FILE');
        $file = realpath($path);
        if ($file === false || !is_file($file) || is_link($path) || filesize($file) > 128
            || PHP_OS_FAMILY !== 'Windows' && (fileperms($file) & 0077) !== 0) throw new CallPushFailure('Intrekkingssleutel niet veilig ingericht.', 503);
        $normalize = static fn(string $value): string => PHP_OS_FAMILY === 'Windows' ? strtolower(str_replace('\\', '/', $value)) : $value;
        foreach ([dirname(__DIR__, 2), $_SERVER['DOCUMENT_ROOT'] ?? ''] as $root) {
            $resolved = $root === '' ? false : realpath($root);
            if ($resolved !== false && str_starts_with($normalize($file), rtrim($normalize($resolved), '/') . '/')) {
                throw new CallPushFailure('Intrekkingssleutel moet buiten de website staan.', 503);
            }
        }
        $encoded = trim((string)file_get_contents($file)); $key = base64_decode($encoded, true);
        if ($key === false || strlen($key) !== 32 || base64_encode($key) !== $encoded) throw new CallPushFailure('Ongeldige intrekkingssleutel.', 503);
        $url = (string)getenv('TELETYPTEL_CALL_SCOPE_REVOCATION_URL'); $parts = parse_url($url);
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || empty($parts['host']) || ($parts['path'] ?? '') !== '/call-revocations'
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            throw new CallPushFailure('Intrekkingsroute vereist vaste HTTPS.', 503);
        }
        $ca = (string)getenv('TELETYPTEL_CALL_SCOPE_CA_FILE');
        if ($ca !== '' && (!is_file($ca) || is_link($ca))) throw new CallPushFailure('Intrekkingscertificaat ontbreekt.', 503);
        return new self($pdo, $key, (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT'),
            (string)getenv('TELETYPTEL_CALL_SIGNALING_DOMAIN'), (string)getenv('TELETYPTEL_CALL_SIGNALING_ISSUER'),
            static function (string $body) use ($url, $ca): array {
                $handle = curl_init($url); $response = '';
                try {
                    curl_setopt_array($handle, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body,
                        CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_FOLLOWLOCATION => false,
                        CURLOPT_PROTOCOLS => CURLPROTO_HTTPS, CURLOPT_CONNECTTIMEOUT_MS => 500, CURLOPT_TIMEOUT_MS => 1500,
                        CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2,
                        CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$response): int {
                            if (strlen($response) + strlen($chunk) > 1024) return 0;
                            $response .= $chunk; return strlen($chunk);
                        }]);
                    if ($ca !== '') curl_setopt($handle, CURLOPT_CAINFO, $ca);
                    $ok = curl_exec($handle);
                    return ['status' => $ok === false ? 0 : curl_getinfo($handle, CURLINFO_RESPONSE_CODE), 'body' => $response];
                } finally { curl_close($handle); }
            });
    }

    public function drain(?array $ids = null): array
    {
        if ($this->pdo->inTransaction()) throw new CallPushFailure('Netwerkintrekking mag niet binnen een transactie.', 503);
        if ($ids === []) return ['delivered' => 0, 'pending' => 0];
        if ($ids !== null && count($ids) > 64) throw new CallPushFailure('Te veel intrekkingen.');
        if ($ids !== null) foreach ($ids as $id) if (!is_string($id) || !preg_match('/\A[0-9a-f]{32}\z/', $id)) throw new CallPushFailure('Ongeldige intrekking.');
        $filter = $ids === null ? '' : ' AND event_id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        $query = $this->pdo->prepare('SELECT * FROM call_scope_revocations WHERE delivered IS NULL AND environment = ?' . $filter . ' ORDER BY created, event_id LIMIT 64');
        $query->execute([$this->environment, ...($ids ?? [])]); $delivered = 0; $pending = 0;
        $records = $query->fetchAll(PDO::FETCH_ASSOC);
        foreach ($records as $record) {
            $now = ($this->clock)();
            $claims = ['version' => 1, 'environment' => $this->environment, 'domain' => $this->domain, 'issuer' => $this->issuer,
                'eventId' => $record['event_id'], 'deviceId' => $record['device_id'], 'generation' => $record['generation'],
                'issuedAt' => $now, 'expiresAt' => $now + 30];
            $payload = rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES)), '+/', '-_'), '=');
            $body = json_encode(['payload' => $payload, 'signature' => hash_hmac('sha256',
                'teletyptel-call-revoke-v1:' . $this->environment . ':' . $this->domain . ':' . $this->issuer . ':' . $payload, $this->key)], JSON_THROW_ON_ERROR);
            try { $reply = ($this->transport)($body); } catch (Throwable $error) { $reply = null; }
            $decoded = is_array($reply) && is_string($reply['body'] ?? null) && strlen($reply['body']) <= 1024 ? json_decode($reply['body'], true) : null;
            if (($reply['status'] ?? 0) === 200 && is_array($decoded) && count($decoded) === 2
                && ($decoded['revoked'] ?? null) === true && ($decoded['eventId'] ?? null) === $record['event_id']) {
                $this->pdo->prepare('UPDATE call_scope_revocations SET delivered = ? WHERE event_id = ? AND delivered IS NULL')->execute([$now, $record['event_id']]);
                $delivered++;
            } else { $pending = count($records) - $delivered; break; }
        }
        return ['delivered' => $delivered, 'pending' => $pending];
    }

    public function probe(): bool
    {
        if ($this->pdo->inTransaction()) throw new CallPushFailure('Netwerkcontrole mag niet binnen een transactie.', 503);
        $now = ($this->clock)(); $nonce = bin2hex(random_bytes(16));
        $payload = rtrim(strtr(base64_encode(json_encode(['version' => 1, 'environment' => $this->environment,
            'domain' => $this->domain, 'issuer' => $this->issuer, 'nonce' => $nonce, 'issuedAt' => $now, 'expiresAt' => $now + 5], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        try {
            $reply = ($this->transport)(json_encode(['health' => $payload, 'signature' => hash_hmac('sha256',
                'teletyptel-call-health-v1:' . $this->environment . ':' . $this->domain . ':' . $this->issuer . ':' . $payload, $this->key)], JSON_THROW_ON_ERROR));
            $value = is_string($reply['body'] ?? null) && strlen($reply['body']) <= 1024 ? json_decode($reply['body'], true) : null;
            return ($reply['status'] ?? 0) === 200 && is_array($value) && count($value) === 2
                && ($value['ready'] ?? null) === true && ($value['nonce'] ?? null) === $nonce;
        } catch (Throwable $error) { return false; }
    }
}
