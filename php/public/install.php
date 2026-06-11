<?php
declare(strict_types=1);

$rootPath = dirname(__DIR__);
$configPath = $rootPath . DIRECTORY_SEPARATOR . 'config.php';
$schemaPath = $rootPath . DIRECTORY_SEPARATOR . 'schema.sql';

$state = [
    'host' => '127.0.0.1',
    'port' => '3306',
    'database' => 'teletyptel',
    'username' => 'teletyptel',
    'password' => '',
    'xmpp_host' => '127.0.0.1',
    'xmpp_port' => '3306',
    'xmpp_database' => 'ejabberd',
    'xmpp_username' => 'ejabberd',
    'xmpp_password' => '',
    'relay_websocket' => defaultRelayWebSocket(),
    'xmpp_websocket' => defaultXmppWebSocket(),
    'xmpp_domain' => defaultXmppDomain(),
];
$errors = [];
$messages = [];
$installed = is_file($configPath);
$force = isset($_GET['force']) && $_GET['force'] === '1';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    foreach (array_keys($state) as $key) {
        $state[$key] = trim((string)($_POST[$key] ?? $state[$key]));
    }

    if ($installed && !$force) {
        $errors[] = 'Installatie is al uitgevoerd. Open install.php?force=1 om bewust opnieuw te configureren.';
    }

    validateInstallInput($state, $errors);

    if ($errors === []) {
        try {
            ensureDatabase($state);
            writeConfig($configPath, $state);
            importSchema($schemaPath, $state);
            $installed = true;
            $messages[] = 'Configuratie opgeslagen in php/config.php.';
            $messages[] = 'Databaseverbinding gelukt en schema is aangemaakt/bijgewerkt.';
            $messages[] = 'Verwijder of blokkeer install.php op een publieke server zodra installatie klaar is.';
        } catch (Throwable $exception) {
            $errors[] = $exception->getMessage();
        }
    }
} elseif ($installed) {
    $existing = loadExistingConfig($configPath);
    if ($existing !== null) {
        $state = array_merge($state, $existing);
    }
}

renderInstallPage($state, $messages, $errors, $installed, $force);

function validateInstallInput(array $state, array &$errors): void
{
    foreach (['host', 'database', 'username', 'xmpp_domain', 'relay_websocket', 'xmpp_websocket'] as $key) {
        if ($state[$key] === '') {
            $errors[] = "Veld '{$key}' is verplicht.";
        }
    }

    foreach (['port', 'xmpp_port'] as $key) {
        $port = filter_var($state[$key], FILTER_VALIDATE_INT, [
            'options' => ['min_range' => 1, 'max_range' => 65535],
        ]);
        if ($port === false) {
            $errors[] = "Veld '{$key}' moet een poort tussen 1 en 65535 zijn.";
        }
    }

    foreach (['relay_websocket', 'xmpp_websocket'] as $key) {
        if (!preg_match('/^wss?:\/\//i', $state[$key])) {
            $errors[] = "Veld '{$key}' moet beginnen met ws:// of wss://.";
        }
    }
}

function ensureDatabase(array $state): void
{
    $serverDsn = sprintf(
        'mysql:host=%s;port=%d;charset=utf8mb4',
        $state['host'],
        (int)$state['port']
    );
    $pdo = new PDO($serverDsn, $state['username'], $state['password'], pdoOptions());
    $database = str_replace('`', '``', $state['database']);
    try {
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$database}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    } catch (PDOException) {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $state['host'],
            (int)$state['port'],
            $state['database']
        );
        new PDO($dsn, $state['username'], $state['password'], pdoOptions());
    }
}

function importSchema(string $schemaPath, array $state): void
{
    if (!is_file($schemaPath)) {
        throw new RuntimeException('schema.sql niet gevonden.');
    }

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $state['host'],
        (int)$state['port'],
        $state['database']
    );
    $pdo = new PDO($dsn, $state['username'], $state['password'], pdoOptions());
    $sql = (string)file_get_contents($schemaPath);
    $sql = preg_replace('/^\s*CREATE\s+DATABASE\b.*?;\s*/ims', '', $sql) ?? $sql;
    $sql = preg_replace('/^\s*USE\s+`?[^`;]+`?\s*;\s*/im', '', $sql) ?? $sql;

    foreach (splitSqlStatements($sql) as $statement) {
        $pdo->exec($statement);
    }
}

function splitSqlStatements(string $sql): array
{
    $statements = [];
    $buffer = '';
    $quote = null;
    $length = strlen($sql);

    for ($i = 0; $i < $length; $i++) {
        $char = $sql[$i];
        $next = $i + 1 < $length ? $sql[$i + 1] : '';

        if ($quote !== null) {
            $buffer .= $char;
            if ($char === '\\') {
                if ($i + 1 < $length) {
                    $buffer .= $sql[++$i];
                }
                continue;
            }
            if ($char === $quote) {
                $quote = null;
            }
            continue;
        }

        if (($char === '-' && $next === '-') || $char === '#') {
            while ($i < $length && $sql[$i] !== "\n") {
                $i++;
            }
            $buffer .= "\n";
            continue;
        }

        if ($char === '/' && $next === '*') {
            $i += 2;
            while ($i < $length - 1 && !($sql[$i] === '*' && $sql[$i + 1] === '/')) {
                $i++;
            }
            $i++;
            continue;
        }

        if ($char === '\'' || $char === '"') {
            $quote = $char;
            $buffer .= $char;
            continue;
        }

        if ($char === ';') {
            $statement = trim($buffer);
            if ($statement !== '') {
                $statements[] = $statement;
            }
            $buffer = '';
            continue;
        }

        $buffer .= $char;
    }

    $statement = trim($buffer);
    if ($statement !== '') {
        $statements[] = $statement;
    }

    return $statements;
}

function writeConfig(string $configPath, array $state): void
{
    $content = "<?php\n"
        . "declare(strict_types=1);\n\n"
        . "return [\n"
        . "    'mysql' => [\n"
        . arrayEntry('host', $state['host'])
        . arrayEntry('port', (int)$state['port'], false)
        . arrayEntry('database', $state['database'])
        . arrayEntry('username', $state['username'])
        . arrayEntry('password', $state['password'])
        . arrayEntry('charset', 'utf8mb4')
        . "    ],\n"
        . "    'xmpp_mysql' => [\n"
        . arrayEntry('host', $state['xmpp_host'])
        . arrayEntry('port', (int)$state['xmpp_port'], false)
        . arrayEntry('database', $state['xmpp_database'])
        . arrayEntry('username', $state['xmpp_username'])
        . arrayEntry('password', $state['xmpp_password'])
        . arrayEntry('charset', 'utf8mb4')
        . "    ],\n"
        . "    'oauth' => [\n"
        . arrayEntry('xmpp_domain', $state['xmpp_domain'])
        . arrayEntry('xmpp_host', $state['xmpp_domain'])
        . arrayEntry('xmpp_websocket', $state['xmpp_websocket'])
        . "    ],\n"
        . "    'relay' => [\n"
        . arrayEntry('websocket', $state['relay_websocket'])
        . "    ],\n"
        . "];\n";

    $directory = dirname($configPath);
    if (!is_dir($directory) || !is_writable($directory)) {
        throw new RuntimeException('Kan php/config.php niet schrijven. Controleer schrijfrechten op de php-map.');
    }

    if (file_put_contents($configPath, $content, LOCK_EX) === false) {
        throw new RuntimeException('Opslaan van php/config.php is mislukt.');
    }
}

function arrayEntry(string $key, string|int $value, bool $quote = true): string
{
    $encoded = $quote ? var_export((string)$value, true) : (string)$value;
    return "        '{$key}' => {$encoded},\n";
}

function pdoOptions(): array
{
    return [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ];
}

function loadExistingConfig(string $configPath): ?array
{
    $config = require $configPath;
    if (!is_array($config)) {
        return null;
    }

    $mysql = is_array($config['mysql'] ?? null) ? $config['mysql'] : [];
    $xmpp = is_array($config['xmpp_mysql'] ?? null) ? $config['xmpp_mysql'] : [];
    $oauth = is_array($config['oauth'] ?? null) ? $config['oauth'] : [];
    $relay = is_array($config['relay'] ?? null) ? $config['relay'] : [];

    return [
        'host' => (string)($mysql['host'] ?? '127.0.0.1'),
        'port' => (string)($mysql['port'] ?? '3306'),
        'database' => (string)($mysql['database'] ?? 'teletyptel'),
        'username' => (string)($mysql['username'] ?? 'teletyptel'),
        'password' => (string)($mysql['password'] ?? ''),
        'xmpp_host' => (string)($xmpp['host'] ?? '127.0.0.1'),
        'xmpp_port' => (string)($xmpp['port'] ?? '3306'),
        'xmpp_database' => (string)($xmpp['database'] ?? 'ejabberd'),
        'xmpp_username' => (string)($xmpp['username'] ?? 'ejabberd'),
        'xmpp_password' => (string)($xmpp['password'] ?? ''),
        'relay_websocket' => (string)($relay['websocket'] ?? defaultRelayWebSocket()),
        'xmpp_websocket' => (string)($oauth['xmpp_websocket'] ?? defaultXmppWebSocket()),
        'xmpp_domain' => (string)($oauth['xmpp_domain'] ?? defaultXmppDomain()),
    ];
}

function defaultRelayWebSocket(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? '127.0.0.1';
    return isHttpsRequest() ? "wss://{$host}/rtt-relay" : 'ws://127.0.0.1:8787';
}

function defaultXmppWebSocket(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return isHttpsRequest() ? "wss://{$host}/xmpp-websocket" : 'ws://127.0.0.1:8787';
}

function defaultXmppDomain(): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return preg_replace('/:\d+$/', '', $host) ?: 'localhost';
}

function isHttpsRequest(): bool
{
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
}

function e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

function renderInstallPage(array $state, array $messages, array $errors, bool $installed, bool $force): void
{
    http_response_code($errors === [] ? 200 : 400);
    ?>
<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>TeleTypTel installatie</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { margin: 0; background: #eef4ff; color: #0f172a; }
    main { max-width: 880px; margin: 0 auto; padding: 32px 18px 48px; }
    h1 { margin: 0 0 8px; font-size: 32px; }
    p { line-height: 1.45; }
    form, .notice { background: #fff; border: 1px solid #9cc7ff; border-radius: 8px; padding: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: grid; gap: 6px; font-weight: 700; }
    input { border: 1px solid #8bb6e8; border-radius: 6px; padding: 10px; font: inherit; }
    button, a.button { display: inline-block; border: 1px solid #0b63ce; border-radius: 6px; background: #0b73e7; color: #fff; padding: 11px 16px; font: inherit; text-decoration: none; cursor: pointer; }
    fieldset { border: 1px solid #c7ddff; border-radius: 8px; margin: 18px 0; padding: 14px; }
    legend { padding: 0 8px; font-weight: 700; }
    .full { grid-column: 1 / -1; }
    .ok { border-color: #21a366; background: #e9f9ef; }
    .error { border-color: #d92d20; background: #fff1f0; }
    .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .small { color: #475569; font-size: 14px; }
    @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>TeleTypTel installatie</h1>
  <p>Maak of controleer de database, schrijf <strong>php/config.php</strong> en importeer het schema.</p>

  <?php if ($messages !== []): ?>
    <section class="notice ok">
      <?php foreach ($messages as $message): ?><p><?= e($message) ?></p><?php endforeach; ?>
      <p class="actions"><a class="button" href="chat.html">Open TeleTypTel</a></p>
    </section>
  <?php endif; ?>

  <?php if ($errors !== []): ?>
    <section class="notice error">
      <?php foreach ($errors as $error): ?><p><?= e($error) ?></p><?php endforeach; ?>
    </section>
  <?php endif; ?>

  <?php if ($installed && !$force && $messages === []): ?>
    <section class="notice">
      <p>Er bestaat al een configuratie. De installer verandert niets zonder bewuste herconfiguratie.</p>
      <p class="actions">
        <a class="button" href="chat.html">Open TeleTypTel</a>
        <a class="button" href="install.php?force=1">Opnieuw configureren</a>
      </p>
    </section>
  <?php else: ?>
    <form method="post" autocomplete="off">
      <fieldset>
        <legend>TeleTypTel database</legend>
        <div class="grid">
          <?= input('host', 'Host', $state['host']) ?>
          <?= input('port', 'Poort', $state['port'], 'number') ?>
          <?= input('database', 'Database', $state['database']) ?>
          <?= input('username', 'Gebruiker', $state['username']) ?>
          <?= input('password', 'Wachtwoord', $state['password'], 'password', 'full') ?>
        </div>
      </fieldset>

      <fieldset>
        <legend>ejabberd database optioneel</legend>
        <p class="small">Nodig voor server-integratie. Voor alleen web/proof-of-concept mag dit voorlopig blijven staan.</p>
        <div class="grid">
          <?= input('xmpp_host', 'Host', $state['xmpp_host']) ?>
          <?= input('xmpp_port', 'Poort', $state['xmpp_port'], 'number') ?>
          <?= input('xmpp_database', 'Database', $state['xmpp_database']) ?>
          <?= input('xmpp_username', 'Gebruiker', $state['xmpp_username']) ?>
          <?= input('xmpp_password', 'Wachtwoord', $state['xmpp_password'], 'password', 'full') ?>
        </div>
      </fieldset>

      <fieldset>
        <legend>WebSocket en domein</legend>
        <div class="grid">
          <?= input('relay_websocket', 'RTT relay WebSocket', $state['relay_websocket'], 'text', 'full') ?>
          <?= input('xmpp_websocket', 'XMPP WebSocket', $state['xmpp_websocket'], 'text', 'full') ?>
          <?= input('xmpp_domain', 'XMPP domein', $state['xmpp_domain'], 'text', 'full') ?>
        </div>
      </fieldset>

      <p class="actions">
        <button type="submit">Installeren</button>
        <span class="small">Na installatie: blokkeer of verwijder install.php op productie.</span>
      </p>
    </form>
  <?php endif; ?>
</main>
</body>
</html>
<?php
}

function input(string $name, string $label, string $value, string $type = 'text', string $class = ''): string
{
    $id = 'field_' . $name;
    $classAttribute = $class !== '' ? ' class="' . e($class) . '"' : '';
    return '<label' . $classAttribute . ' for="' . e($id) . '"><span>' . e($label) . '</span>'
        . '<input id="' . e($id) . '" name="' . e($name) . '" type="' . e($type) . '" value="' . e($value) . '"></label>';
}
