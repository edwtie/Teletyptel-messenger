<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushSignaling.php';
require_once dirname(__DIR__) . '/lib/CallPushPolicy.php';

final class CallSignalingFixture
{
    public PDO $pdo;
    public CallPushSignaling $ledger;
    public CallPushService $service;
    public string $key;
    public string $storageKey;
    public int $now = 1800000000;
    public string $device = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    public string $otherDevice = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    public string $binding;
    public string $otherBinding;
    public array $registered;
    public array $otherRegistered;

    public function __construct(?string $key = null, string $dsn = 'sqlite::memory:')
    {
        $this->key = $key ?? random_bytes(32);
        $this->binding = str_repeat('1', 64); $this->otherBinding = str_repeat('2', 64);
        $this->pdo = new PDO($dsn, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $this->pdo->exec('CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT)');
        foreach (['alice', 'bob', 'charlie'] as $name) $this->pdo->prepare('INSERT INTO account_profiles VALUES (?, ?)')->execute([$name, $name . '@example.test']);
        AccountAccess::ensureSchema($this->pdo);
        $clock = fn(): int => $this->now;
        $this->ledger = new CallPushSignaling($this->pdo, $this->key, 'production', 'example.test', 'fixture', $clock);
        $this->storageKey = random_bytes(32);
        $this->service = new CallPushService($this->pdo, $this->storageKey, 'production', $this->ledger->allows(...), $clock);
        $this->service->ensureSchema(); $this->ledger->ensureSchema(); $this->ledger->ensureSchema();
        $this->registered = $this->service->register('bob', $this->binding, $this->device, str_repeat('ab', 32), true);
        $this->otherRegistered = $this->service->register('bob', $this->otherBinding, $this->otherDevice, str_repeat('cd', 32), true);
    }

    public function envelope(array $event, array $replace = []): string
    {
        $body = array_replace(['version' => 1, 'issuer' => 'fixture', 'timestamp' => $this->now, 'nonce' => bin2hex(random_bytes(16)), 'event' => $event], $replace);
        $payload = base64_encode(json_encode($body, JSON_THROW_ON_ERROR));
        return json_encode(['payload' => $payload,
            'signature' => hash_hmac('sha256', 'teletyptel-call-signaling-v1:production:example.test:fixture:' . $payload, $this->key)], JSON_THROW_ON_ERROR);
    }

    public function event(array $event): array { return $this->ledger->ingest($this->envelope($event)); }

    public function resource(string $jid, bool $online = true, int $revision = 1): void
    {
        $this->event(['type' => 'resource', 'jid' => $jid, 'online' => $online, 'revision' => $revision, 'expiresAt' => $this->now + 30]);
    }

    public function policy(string $owner, string $peer, bool $allowed = true, int $revision = 1): void
    {
        $this->event(['type' => 'policy', 'owner' => $owner . '@example.test', 'peer' => $peer . '@example.test',
            'allowed' => $allowed, 'revision' => $revision, 'expiresAt' => $this->now + 30]);
    }

    public function seed(): void
    {
        foreach (['alice/browser', 'bob/phone', 'bob/tablet'] as $identity) {
            [$name, $resource] = explode('/', $identity); $this->resource($name . '@example.test/' . $resource);
        }
        $this->policy('alice', 'bob'); $this->policy('bob', 'alice');
    }

    public function offer(string $sid = 'first-call', string $profile = 'total'): array
    {
        return ['type' => 'offer', 'caller' => 'alice@example.test/browser', 'recipient' => 'bob@example.test',
            'sid' => $sid, 'mediaProfile' => $profile, 'revision' => 1, 'expiresAt' => $this->now + 45];
    }

    public function call(string $sid = 'first-call', string $profile = 'total'): array
    {
        $this->event($this->offer($sid, $profile)); $this->ledger->enqueue($this->service);
        return $this->service->callFor('bob', $this->pdo->query('SELECT call_id FROM call_push_calls ORDER BY created DESC, sid DESC LIMIT 1')->fetchColumn());
    }

    public function proof(array $call, bool $other = false): array
    {
        return ['type' => 'handoff', 'callId' => $call['callId'], 'sid' => $call['sid'],
            'jid' => 'bob@example.test/' . ($other ? 'tablet' : 'phone'),
            'deviceId' => $other ? $this->otherDevice : $this->device,
            'generation' => ($other ? $this->otherRegistered : $this->registered)['generation'],
            'revision' => 1, 'expiresAt' => $this->now + 15];
    }

    public function answer(array $call, bool $other = false): array
    {
        $proof = $this->proof($call, $other);
        return $this->ledger->accept($this->service, 'bob', $other ? $this->otherBinding : $this->binding,
            ['action' => 'accept', 'callId' => $call['callId'], 'deviceId' => $proof['deviceId'], 'generation' => $proof['generation'], 'fullJid' => $proof['jid']]);
    }

    public function version(string $account, int $version, bool $blocked = false): void
    {
        $this->pdo->prepare('DELETE FROM account_access_controls WHERE account_id = ?')->execute([$account]);
        $this->pdo->prepare('INSERT INTO account_access_controls VALUES (?, ?, NULL, ?, ?)')->execute([$account, (int)$blocked, $version, '2026-11-15 00:00:00']);
    }
}

if (($argv[1] ?? '') === '--answer-race') {
    try {
        $input = json_decode(stream_get_contents(STDIN, 10000), true, 8, JSON_THROW_ON_ERROR);
        $pdo = new PDO('sqlite:' . $argv[2], null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $pdo->exec('PRAGMA busy_timeout=5000');
        $clock = static fn(): int => 1800000000;
        $ledger = new CallPushSignaling($pdo, base64_decode($input['key'], true), 'production', 'example.test', 'fixture', $clock);
        $service = new CallPushService($pdo, base64_decode($input['storageKey'], true), 'production', $ledger->allows(...), $clock);
        $ledger->accept($service, 'bob', $input['binding'], $input['request']);
        echo '{"accepted":true}';
    } catch (CallPushFailure $error) { echo '{"accepted":false}'; }
    exit;
}

if (($argv[1] ?? '') === '--node-fixture') {
    try {
        $input = json_decode(stream_get_contents(STDIN, 20000), true, 8, JSON_THROW_ON_ERROR);
        $fixture = new CallSignalingFixture(base64_decode($input['key'], true));
        echo json_encode($fixture->ledger->ingest(json_encode($input['envelope'], JSON_THROW_ON_ERROR)), JSON_THROW_ON_ERROR);
    } catch (Throwable $error) { echo '{"accepted":false}'; exit(1); }
    exit;
}

$checks = 0;
$check = function (bool $value, string $label) use (&$checks): void {
    if (!$value) throw new RuntimeException($label);
    $checks++;
};
$denied = function (Closure $operation, string $label) use ($check): void {
    try { $operation(); }
    catch (CallPushFailure | AccountAccessDenied $error) { $check(true, $label); return; }
    throw new RuntimeException('Not denied: ' . $label);
};

$fixture = new CallSignalingFixture();
$resource = ['type' => 'resource', 'jid' => 'alice@example.test/browser', 'online' => true, 'revision' => 1, 'expiresAt' => $fixture->now + 30];
$raw = $fixture->envelope($resource, ['nonce' => str_repeat('a', 32)]);
$check($fixture->ledger->ingest($raw) === ['accepted' => true, 'duplicate' => false], 'signed resource accepted');
$check($fixture->ledger->ingest($raw)['duplicate'], 'exact envelope replay is idempotent');
$denied(fn() => $fixture->ledger->ingest($fixture->envelope(array_replace($resource, ['online' => false]), ['nonce' => str_repeat('a', 32)])), 'nonce substitution denied');
$denied(fn() => $fixture->event($resource), 'stale resource revision denied');
foreach ([-31, 6] as $offset) $denied(fn() => $fixture->ledger->ingest($fixture->envelope($resource, ['timestamp' => $fixture->now + $offset])), 'timestamp skew bounded');
foreach ([['issuer' => 'other'], ['version' => 2], ['nonce' => 'wrong']] as $override) {
    $denied(fn() => $fixture->ledger->ingest($fixture->envelope($resource, $override)), 'envelope scope validated');
}
$tampered = json_decode($raw, true); $tampered['signature'][0] = $tampered['signature'][0] === 'a' ? 'b' : 'a';
$denied(fn() => $fixture->ledger->ingest(json_encode($tampered)), 'signature mutation denied');
$denied(fn() => $fixture->ledger->ingest(str_repeat('x', 16385)), 'bounded input');
$denied(fn() => $fixture->event(array_replace($resource, ['revision' => 2, 'password' => 'never-stored'])), 'extra sensitive fields rejected');
$denied(fn() => $fixture->event(array_replace($resource, ['revision' => 2, 'jid' => 'alice@foreign.test/phone'])), 'pinned local domain');
$denied(fn() => $fixture->event(array_replace($resource, ['revision' => 2, 'jid' => 'unknown@example.test/phone'])), 'unknown account denied');
$denied(fn() => $fixture->event(array_replace($resource, ['revision' => 2, 'online' => 1])), 'boolean status required');
$denied(fn() => $fixture->event(array_replace($resource, ['revision' => 2, 'expiresAt' => $fixture->now + 31])), 'bounded resource lease');
$denied(fn() => $fixture->ledger->ingest($fixture->envelope(array_replace($resource, ['revision' => 2]), ['timestamp' => $fixture->now - 1])), 'delivery cannot extend signed snapshot validity');
$check((int)$fixture->pdo->query('SELECT COUNT(*) FROM call_signaling_events')->fetchColumn() === 1, 'invalid/reordered events leave no partial journal');
$other = new CallPushSignaling($fixture->pdo, $fixture->key, 'sandbox', 'example.test', 'fixture', fn() => $fixture->now);
$denied(fn() => $other->ingest($raw), 'environment-separated signature');
$other = new CallPushSignaling($fixture->pdo, random_bytes(32), 'production', 'example.test', 'fixture', fn() => $fixture->now);
$denied(fn() => $other->ingest($raw), 'other signing key denied');

foreach (['audio', 'video', 'audio-rtt', 'total'] as $profile) {
    $fixture = new CallSignalingFixture();
    $denied(fn() => $fixture->event($fixture->offer('call', $profile)), 'no resource/policy means no offer');
    $fixture->seed();
    $offer = $fixture->envelope($fixture->offer('call', $profile));
    $fixture->ledger->ingest($offer);
    $check($fixture->ledger->enqueue($fixture->service) === ['queued' => 1, 'deferred' => 0], 'verified offer queues durable registry invitation');
    $fixture->ledger->ingest($offer);
    $check($fixture->ledger->enqueue($fixture->service)['queued'] === 0, 'replay does not duplicate queue');
    $check((int)$fixture->pdo->query('SELECT COUNT(*) FROM call_push_jobs')->fetchColumn() === 2, 'one job per registered generation');
    $public = $fixture->service->callFor('bob', $fixture->pdo->query('SELECT call_id FROM call_push_calls')->fetchColumn());
    $check($public['mediaProfile'] === $profile && $public['hasVideo'] === in_array($profile, ['video', 'total'], true), 'all media profiles preserved');
    $sent = 0;
    $fixture->service->dispatchOne(function (string $token, array $call) use (&$sent, $check, $profile) {
        $sent++; $check($call['mediaProfile'] === $profile && !isset($call['caller'], $call['sdp'], $call['rtt']), 'mock transport receives only minimal invitation');
        return ['accepted' => true];
    });
    $check($sent === 1, 'verified dispatch reaches injected transport once');
}

$fixture = new CallSignalingFixture(); $fixture->seed(); $call = $fixture->call();
$denied(fn() => $fixture->service->inviteVerified('alice', 'charlie', 'first-call', true, 45, 'total'), 'recipient cannot change');
$denied(fn() => $fixture->service->inviteVerified('alice', 'bob', 'first-call', false, 45, 'audio'), 'profile cannot change');
$fixture->policy('bob', 'alice', false, 2);
$check($fixture->pdo->query('SELECT state FROM call_push_calls')->fetchColumn() === 'ended', 'policy revocation ends pending call atomically');
$check((int)$fixture->pdo->query("SELECT COUNT(*) FROM call_push_jobs WHERE state = 'skipped'")->fetchColumn() === 2, 'revocation cancels queued notifications');
$fixture->policy('bob', 'alice', true, 3);
$denied(fn() => $fixture->event(array_replace($fixture->offer(), ['revision' => 4])), 'unblocking cannot resurrect old SID');
$sent = 0; $fixture->service->dispatchOne(function () use (&$sent) { $sent++; return ['accepted' => true]; });
$check($sent === 0, 'revoked call never reaches transport');

$fixture = new CallSignalingFixture(); $fixture->seed();
$end = ['type' => 'end', 'caller' => 'alice@example.test/browser', 'recipient' => 'bob@example.test', 'sid' => 'first-call', 'actor' => 'alice@example.test/browser', 'revision' => 2];
$fixture->event($end);
$denied(fn() => $fixture->event($fixture->offer()), 'end-before-offer tombstone survives event reordering');
$check($fixture->ledger->enqueue($fixture->service)['queued'] === 0, 'no call after preemptive cancellation');

$fixture = new CallSignalingFixture(); $fixture->seed(); $fixture->event($fixture->offer());
$fixture->resource('alice@example.test/browser', false, 2);
$check($fixture->ledger->enqueue($fixture->service)['queued'] === 0, 'caller disconnect before enqueue closes invitation');
$fixture->resource('alice@example.test/browser', true, 3);
$denied(fn() => $fixture->event(array_replace($fixture->offer(), ['revision' => 4])), 'reconnect cannot revive abandoned call');

$fixture = new CallSignalingFixture(); $fixture->seed(); $call = $fixture->call(); $fixture->now += 31;
$sent = 0; $fixture->service->dispatchOne(function () use (&$sent) { $sent++; return ['accepted' => true]; });
$check($sent === 0, 'stale authoritative leases suppress dispatch before invitation deadline');

$fixture = new CallSignalingFixture(); $fixture->seed(); $call = $fixture->call();
$fixture->version('bob', 2);
$fixture->resource('bob@example.test/phone', true, 2);
$denied(fn() => $fixture->event($fixture->offer('new-version')), 'new resource does not promote stale privacy decision after account version change');
$fixture->policy('bob', 'alice', true, 2); $fixture->policy('alice', 'bob', true, 2);
$fixture->event($fixture->offer('new-version'));
$check($fixture->ledger->enqueue($fixture->service)['queued'] === 1, 'fresh version-bound privacy decision permits new SID');
$fixture->version('bob', 3, true);
$fixture->resource('bob@example.test/phone', false, 3);
$check($fixture->pdo->query("SELECT COUNT(*) FROM call_signaling_resources WHERE full_jid = 'bob@example.test/phone' AND online = 0")->fetchColumn() == 1, 'blocked account can still receive authoritative offline revocation');

$fixture = new CallSignalingFixture(); $fixture->seed(); $call = $fixture->call();
$denied(fn() => $fixture->answer($call), 'HTTP/session identity alone cannot claim unproven resource');
$proof = $fixture->proof($call);
$denied(fn() => $fixture->event(array_replace($proof, ['generation' => str_repeat('0', 32)])), 'stale or invented device generation denied');
$denied(fn() => $fixture->event(array_replace($proof, ['jid' => 'alice@example.test/browser'])), 'caller cannot supply recipient resource proof');
$denied(fn() => $fixture->event(array_replace($proof, ['jid' => 'bob@example.test/vanished'])), 'offline resource proof denied');
$fixture->event($proof); $fixture->event($fixture->proof($call, true));
$check($fixture->answer($call)['state'] === 'accepted', 'verified device and rebound resource reserve call');
$check($fixture->answer($call)['callerJid'] === 'alice@example.test/browser', 'answer returns authoritative full caller resource');
$check($fixture->answer($call)['recipientJid'] === 'bob@example.test/phone', 'answer returns verified winning recipient resource');
$check($fixture->answer($call)['state'] === 'accepted', 'same device/resource reservation idempotent');
$denied(fn() => $fixture->answer($call, true), 'second device cannot win reservation');
$denied(fn() => $fixture->event(array_replace($fixture->proof($call, true), ['revision' => 2])), 'losing device cannot replace reservation proof');
$denied(fn() => $fixture->event(array_replace($end, ['actor' => 'bob@example.test/tablet'])), 'losing recipient resource cannot end winner');
$loser = $fixture->service->reconcileDevice('bob', $fixture->otherBinding, $fixture->otherDevice,
    [['callId' => $call['callId'], 'sid' => $call['sid'], 'end' => true]]);
$check($loser[0]['state'] === 'answered-elsewhere', 'losing native control does not end winner');
$fixture->resource('bob@example.test/tablet', false, 2);
$check($fixture->pdo->query('SELECT state FROM call_push_calls')->fetchColumn() === 'accepted', 'unrelated device disconnect cannot end winner');
$fixture->resource('bob@example.test/phone', false, 2);
$check($fixture->pdo->query('SELECT state FROM call_push_calls')->fetchColumn() === 'ended', 'accepted resource disconnect ends reservation');

$fixture = new CallSignalingFixture(); $fixture->seed(); $call = $fixture->call(); $fixture->event($fixture->proof($call));
$fixture->now += 16;
$denied(fn() => $fixture->answer($call), 'handoff proof expires independently of call deadline');

$fixture = new CallSignalingFixture(); $fixture->seed(); $call = $fixture->call(); $fixture->event($fixture->proof($call));
$fixture->registered = $fixture->service->register('bob', $fixture->binding, $fixture->device, str_repeat('ef', 32), true);
$denied(fn() => $fixture->answer($call), 'token renewal does not transfer an old resource proof');

$fixture = new CallSignalingFixture(); $fixture->seed(); $fixture->event($fixture->offer());
$unlinked = $fixture->service->inviteVerified('alice', 'bob', 'first-call', true, 45, 'total');
$check($fixture->ledger->enqueue($fixture->service)['queued'] === 1, 'enqueue repairs crash between registry insert and journal linkage');
$check($fixture->pdo->query('SELECT call_id FROM call_signaling_calls')->fetchColumn() === $unlinked['callId'], 'repair retains original call UUID');
$check((int)$fixture->pdo->query('SELECT COUNT(*) FROM call_push_jobs')->fetchColumn() === 2, 'repair cannot duplicate pushes');

$path = tempnam(sys_get_temp_dir(), 'tt-signaling-race-');
try {
    $race = new CallSignalingFixture(null, 'sqlite:' . $path); $race->seed(); $call = $race->call();
    $race->event($race->proof($call)); $race->event($race->proof($call, true));
    $processes = [];
    foreach ([false, true] as $other) {
        $proof = $race->proof($call, $other);
        $process = proc_open([PHP_BINARY, __FILE__, '--answer-race', $path], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
        if (!is_resource($process)) throw new RuntimeException('Cannot create isolated race fixture');
        fwrite($pipes[0], json_encode(['key' => base64_encode($race->key), 'storageKey' => base64_encode($race->storageKey),
            'binding' => $other ? $race->otherBinding : $race->binding,
            'request' => ['action' => 'accept', 'callId' => $call['callId'], 'deviceId' => $proof['deviceId'],
                'generation' => $proof['generation'], 'fullJid' => $proof['jid']]], JSON_THROW_ON_ERROR));
        fclose($pipes[0]);
        $processes[] = [$process, $pipes];
    }
    $winners = 0;
    foreach ($processes as [$process, $pipes]) {
        $reply = json_decode(stream_get_contents($pipes[1]), true, 8, JSON_THROW_ON_ERROR);
        $errors = stream_get_contents($pipes[2]); fclose($pipes[1]); fclose($pipes[2]);
        $check(proc_close($process) === 0 && $errors === '', 'independent PHP process completes cleanly');
        if ($reply['accepted']) $winners++;
    }
    $check($winners === 1, 'two independent processes select exactly one proven device');
    $check($race->pdo->query("SELECT COUNT(*) FROM call_push_calls WHERE state = 'accepted'")->fetchColumn() == 1, 'winning reservation durable');
} finally {
    unset($race); gc_collect_cycles(); unlink($path);
}

$fixture = new CallSignalingFixture(); $fixture->seed();
for ($index = 0; $index < 5; $index++) $fixture->event($fixture->offer('bounded-' . $index));
$denied(fn() => $fixture->event($fixture->offer('excess')), 'producer cannot bypass caller rate bound');

$names = ['TELETYPTEL_CALL_SIGNALING', 'TELETYPTEL_CALL_SIGNALING_KEY_FILE', 'TELETYPTEL_CALL_SIGNALING_DOMAIN',
    'TELETYPTEL_CALL_SIGNALING_ISSUER', 'TELETYPTEL_CALL_PUSH_ENVIRONMENT', 'TELETYPTEL_CALL_PUSH_POLICY', 'TELETYPTEL_CALL_PUSH_STORAGE_KEY'];
$previous = []; foreach ($names as $name) $previous[$name] = getenv($name);
$file = tempnam(sys_get_temp_dir(), 'tt-signaling-key-');
try {
    file_put_contents($file, base64_encode($fixture->key)); chmod($file, 0600);
    putenv('TELETYPTEL_CALL_SIGNALING=1'); putenv('TELETYPTEL_CALL_SIGNALING_KEY_FILE=' . $file);
    putenv('TELETYPTEL_CALL_SIGNALING_DOMAIN=example.test'); putenv('TELETYPTEL_CALL_SIGNALING_ISSUER=fixture');
    putenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT=production'); putenv('TELETYPTEL_CALL_PUSH_POLICY=signaling-v1');
    putenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY=' . base64_encode($fixture->storageKey));
    $check(CallPushPolicy::load($fixture->pdo)([], 'invite') === false, 'built-in factory remains fail closed with incomplete call');
    putenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY=' . base64_encode($fixture->key));
    $denied(fn() => CallPushSignaling::configured($fixture->pdo), 'signaling and token storage keys must differ');
    putenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY=' . base64_encode($fixture->storageKey));
    file_put_contents($file, base64_encode($fixture->key) . str_repeat(' ', 129)); clearstatcache(true, $file);
    $denied(fn() => CallPushSignaling::configured($fixture->pdo), 'oversized secret files rejected');
    file_put_contents($file, base64_encode($fixture->key)); clearstatcache(true, $file);
    putenv('TELETYPTEL_CALL_SIGNALING_KEY_FILE=' . dirname(__DIR__, 2) . '/package.json');
    $denied(fn() => CallPushSignaling::configured($fixture->pdo), 'repository cannot contain deployment signing key');
    putenv('TELETYPTEL_CALL_SIGNALING=0');
    $denied(fn() => CallPushSignaling::configured($fixture->pdo), 'explicit opt-in required');
} finally {
    unlink($file);
    foreach ($previous as $name => $value) putenv($value === false ? $name : $name . '=' . $value);
}

echo 'Call signaling: ' . $checks . " checks passed; isolated SQLite, fake registrations, no live server or APNs.\n";
