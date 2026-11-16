<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushBootstrap.php';

final class BootstrapFixture
{
    public PDO $pdo;
    public CallPushService $registry;
    public CallPushSignaling $ledger;
    public CallPushBootstrap $issuer;
    public string $signalingKey;
    public string $storageKey;
    public string $key;
    public string $binding;
    public string $device = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    public array $registration;
    public array $call;

    public function __construct(public int $now = 1800000000, ?string $key = null, string $profile = 'total')
    {
        $this->key = $key ?? random_bytes(32); $this->signalingKey = random_bytes(32); $this->storageKey = random_bytes(32);
        $this->binding = str_repeat('1', 64);
        $this->pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $this->pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT)');
        foreach (['alice', 'bob', 'charlie'] as $name) $this->pdo->prepare('INSERT INTO account_profiles VALUES (?, ?)')->execute([$name, $name . '@example.test']);
        AccountAccess::ensureSchema($this->pdo);
        $clock = fn(): int => $this->now;
        $this->ledger = new CallPushSignaling($this->pdo, $this->signalingKey, 'production', 'example.test', 'fixture', $clock);
        $this->registry = new CallPushService($this->pdo, $this->storageKey, 'production', $this->ledger->allows(...), $clock);
        $this->registry->ensureSchema(); $this->ledger->ensureSchema();
        $this->registration = $this->registry->register('bob', $this->binding, $this->device, str_repeat('ab', 32), true);
        $this->issuer = new CallPushBootstrap($this->pdo, $this->ledger, $this->key, 'production', 'example.test', 'fixture', $clock);
        $this->issuer->ensureSchema();
        $this->event(['type' => 'resource', 'jid' => 'alice@example.test/caller', 'online' => true, 'revision' => 1, 'expiresAt' => $this->now + 30]);
        foreach ([['alice', 'bob'], ['bob', 'alice']] as [$owner, $peer]) $this->event(['type' => 'policy', 'owner' => $owner . '@example.test',
            'peer' => $peer . '@example.test', 'allowed' => true, 'revision' => 1, 'expiresAt' => $this->now + 30]);
        $this->event(['type' => 'offer', 'caller' => 'alice@example.test/caller', 'recipient' => 'bob@example.test', 'sid' => 'call-bootstrap-1',
            'mediaProfile' => $profile, 'revision' => 1, 'expiresAt' => $this->now + 45]);
        $this->ledger->enqueue($this->registry);
        $id = $this->pdo->query('SELECT call_id FROM call_push_calls')->fetchColumn();
        $this->call = $this->registry->callFor('bob', $id);
    }

    public function event(array $event): void
    {
        $body = ['version' => 1, 'issuer' => 'fixture', 'timestamp' => $this->now, 'nonce' => bin2hex(random_bytes(16)), 'event' => $event];
        $payload = base64_encode(json_encode($body, JSON_THROW_ON_ERROR));
        $this->ledger->ingest(json_encode(['payload' => $payload,
            'signature' => hash_hmac('sha256', 'teletyptel-call-signaling-v1:production:example.test:fixture:' . $payload, $this->signalingKey)], JSON_THROW_ON_ERROR));
    }
    public function issue(): array { return $this->issuer->issue('bob', $this->binding, $this->device, $this->registration['generation'], $this->call['callId']); }
}
