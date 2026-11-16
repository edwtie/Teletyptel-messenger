<?php
declare(strict_types=1);
require_once __DIR__ . '/CallPushBootstrap.php';

final class CallPushRecovery
{
    private Closure $clock;

    public function __construct(private PDO $pdo, private CallPushService $registry, private CallPushBootstrap $bootstrap,
        private CallPushSignaling $signaling, private string $key, private string $environment,
        private string $domain, private string $issuer, ?Closure $clock = null)
    {
        if (strlen($key) !== 32) throw new CallPushFailure('Oproepherstel is niet ingericht.', 503);
        $signaling->assertBootstrapConfiguration($key, $environment, $domain);
        $this->clock = $clock ?? static fn(): int => time();
    }

    public static function configured(PDO $pdo): self
    {
        if (getenv('TELETYPTEL_CALL_RECOVERY_LAB') !== '1' || getenv('TELETYPTEL_CALL_PUSH_POLICY') !== 'signaling-v1') {
            throw new CallPushFailure('Oproepherstel is niet ingeschakeld.', 404);
        }
        $path = (string)getenv('TELETYPTEL_CALL_BOOTSTRAP_KEY_FILE');
        $file = realpath($path);
        if ($file === false || !is_file($file) || is_link($path) || filesize($file) > 128
            || (PHP_OS_FAMILY !== 'Windows' && (fileperms($file) & 0077) !== 0)) {
            throw new CallPushFailure('Oproepherstel is niet veilig ingericht.', 503);
        }
        $normalize = static fn(string $value): string => PHP_OS_FAMILY === 'Windows' ? strtolower(str_replace('\\', '/', $value)) : $value;
        foreach ([dirname(__DIR__, 2), $_SERVER['DOCUMENT_ROOT'] ?? ''] as $directory) {
            $root = $directory === '' ? false : realpath($directory);
            if ($root !== false && str_starts_with($normalize($file), rtrim($normalize($root), '/') . '/')) {
                throw new CallPushFailure('Oproepherstelsleutel mag niet in de website staan.', 503);
            }
        }
        $encoded = file_get_contents($file, false, null, 0, 129);
        $key = is_string($encoded) ? base64_decode(trim($encoded), true) : false;
        if ($key === false || strlen($key) !== 32 || base64_encode($key) !== trim($encoded)) throw new CallPushFailure('Ongeldige oproepherstelsleutel.', 503);
        $signaling = CallPushSignaling::configured($pdo);
        $environment = (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT');
        $domain = (string)getenv('TELETYPTEL_CALL_SIGNALING_DOMAIN');
        $issuer = (string)getenv('TELETYPTEL_CALL_SIGNALING_ISSUER');
        $storage = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
        $registry = new CallPushService($pdo, $storage === false ? '' : $storage, $environment, $signaling->allows(...));
        return new self($pdo, $registry, new CallPushBootstrap($pdo, $signaling, $key, $environment, $domain, $issuer),
            $signaling, $key, $environment, $domain, $issuer);
    }

    private function row(string $query, array $values): ?array
    {
        $statement = $this->pdo->prepare($query); $statement->execute($values);
        return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private function aad(): string { return 'teletyptel-call-device-v1:' . $this->environment . ':' . $this->domain . ':' . $this->issuer; }

    public function enroll(string $account, string $binding, string $deviceId): array
    {
        foreach ($this->registry->devices($account, $binding) as $device) {
            if ($device['device_id'] !== $deviceId) continue;
            $profile = $this->row('SELECT jid FROM account_profiles WHERE account_id = ?', [$account]);
            if (!$profile || !preg_match('/\A[a-z0-9._-]{1,256}@' . preg_quote($this->domain, '/') . '\z/', $profile['jid'])) break;
            $claims = ['scope' => 'call-device-v1', 'account' => $account, 'binding' => $binding, 'device' => $deviceId,
                'generation' => $device['generation'], 'expires' => min((int)$device['expires'], ($this->clock)() + 86400)];
            $iv = random_bytes(12); $tag = '';
            $cipher = openssl_encrypt(json_encode($claims, JSON_THROW_ON_ERROR), 'aes-256-gcm', $this->key, OPENSSL_RAW_DATA, $iv, $tag, $this->aad());
            if ($cipher === false || strlen($tag) !== 16) throw new CallPushFailure('Oproepherstel kan niet worden voorbereid.', 503);
            return ['version' => 1, 'credential' => 'tcd1.' . rtrim(strtr(base64_encode($iv . $tag . $cipher), '+/', '-_'), '='),
                'owner' => $profile['jid'], 'domain' => $this->domain, 'issuer' => $this->issuer, 'environment' => $this->environment,
                'expiresAt' => $claims['expires']];
        }
        throw new CallPushFailure('Toestelregistratie ontbreekt.', 403);
    }

    private function authorize(string $credential): array
    {
        if (!preg_match('/\Atcd1\.([A-Za-z0-9_-]{40,1800})\z/', $credential, $match)) throw new CallPushFailure('Oproeptoegang vereist.', 401);
        $raw = base64_decode(strtr($match[1], '-_', '+/') . str_repeat('=', (4 - strlen($match[1]) % 4) % 4), true);
        $plain = is_string($raw) && strlen($raw) > 28 ? openssl_decrypt(substr($raw, 28), 'aes-256-gcm', $this->key,
            OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16), $this->aad()) : false;
        $claims = $plain === false ? null : json_decode($plain, true);
        if (!is_array($claims) || array_keys($claims) !== ['scope', 'account', 'binding', 'device', 'generation', 'expires']
            || $claims['scope'] !== 'call-device-v1' || !is_int($claims['expires']) || $claims['expires'] <= ($this->clock)()) {
            throw new CallPushFailure('Oproeptoegang verlopen of ingetrokken.', 401);
        }
        foreach ($this->registry->devices($claims['account'], $claims['binding']) as $device) {
            if ($device['device_id'] === $claims['device'] && hash_equals($device['generation'], $claims['generation'])) return $claims;
        }
        throw new CallPushFailure('Toestelregistratie ingetrokken.', 403);
    }

    public function handle(string $credential, array $input): array
    {
        $claims = $this->authorize($credential);
        $action = $input['action'] ?? '';
        $fields = ['action', 'callId', 'sid', 'mediaProfile', 'deviceId', 'generation'];
        if ($action === 'accept') $fields[] = 'fullJid';
        $keys = array_keys($input); sort($keys); sort($fields);
        if ($keys !== $fields || !in_array($action, ['bootstrap', 'accept', 'end'], true)) throw new CallPushFailure('Ongeldige herstelopdracht.');
        foreach ($input as $value) if (!is_string($value)) throw new CallPushFailure('Ongeldige herstelgegevens.');
        if ($input['deviceId'] !== $claims['device'] || !hash_equals($claims['generation'], $input['generation'])) throw new CallPushFailure('Verkeerd toestel.', 403);
        $call = $this->row('SELECT * FROM call_push_calls WHERE call_id = ?', [$input['callId']]);
        if (!$call || $call['recipient'] !== $claims['account'] || $call['sid'] !== $input['sid'] || $call['media_profile'] !== $input['mediaProfile']
            || ($call['state'] === 'accepted' && ($call['accepted_device'] !== $claims['device'] || $call['accepted_generation'] !== $claims['generation']))) {
            throw new CallPushFailure('Oproep niet beschikbaar.', 403);
        }
        if ($action === 'end') {
            $result = $this->registry->reconcileDevice($claims['account'], $claims['binding'], $claims['device'], [['callId' => $call['call_id'], 'sid' => $call['sid'], 'end' => true]]);
            if (($result[0]['state'] ?? '') !== 'ended') throw new CallPushFailure('Oproep is niet door dit toestel afgesloten.', 409);
            return ['ended' => true];
        }
        if ($action === 'bootstrap') return $this->bootstrap->issue($claims['account'], $claims['binding'], $claims['device'], $claims['generation'], $input['callId']);
        if (!preg_match('/\/tc-call-([0-9a-f]{32})\z/', $input['fullJid'], $match)
            || !$this->row('SELECT nonce FROM call_bootstrap_issues WHERE nonce = ? AND call_id = ? AND device_id = ? AND generation = ? AND expires > ?',
                [$match[1], $call['call_id'], $claims['device'], $claims['generation'], ($this->clock)()])) throw new CallPushFailure('Verbindingsbewijs ontbreekt.', 403);
        $caller = $this->signaling->bootstrapCaller($call, $this->key, $this->environment, $this->domain);
        if (!$this->signaling->allows(array_replace($call, ['accepted_device' => $claims['device'],
            'accepted_generation' => $claims['generation'], 'recipient_jid' => $input['fullJid']]), 'accept')) {
            throw new CallPushFailure('Verbindingsbewijs wordt verwerkt.', 425);
        }
        $this->registry->acceptVerified($claims['account'], $claims['binding'], $input['callId'], $claims['device'], $claims['generation'], $input['fullJid']);
        return ['callerJid' => $caller, 'recipientJid' => $input['fullJid']];
    }
}
