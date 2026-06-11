<?php
declare(strict_types=1);

$rootPath = dirname(__DIR__);
$configPath = $rootPath . DIRECTORY_SEPARATOR . 'config.php';
$schemaPath = $rootPath . DIRECTORY_SEPARATOR . 'schema.sql';
$runtimePath = $rootPath . DIRECTORY_SEPARATOR . 'install-runtime';

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
    'relay_port' => '8787',
    'admin_name' => 'TeleTypTel beheerder',
    'admin_email' => '',
    'admin_password' => '',
    'admin_password_confirm' => '',
    'google_client_id' => '',
    'google_client_secret' => '',
    'facebook_app_id' => '',
    'facebook_app_secret' => '',
    'apple_client_id' => '',
    'apple_client_secret' => '',
    'auth0_domain' => '',
    'auth0_client_id' => '',
    'auth0_client_secret' => '',
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
            createAdminAccount($state);
            $generated = writeRuntimeScripts($runtimePath, $rootPath, $state);
            $installed = true;
            $messages[] = 'Configuratie opgeslagen in php/config.php.';
            $messages[] = 'Databaseverbinding gelukt en schema is aangemaakt/bijgewerkt.';
            foreach ($generated as $path) {
                $messages[] = 'Startbestand gemaakt: ' . $path;
            }
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

$checks = collectSystemChecks($rootPath, $configPath, $schemaPath, $state);
renderInstallPage($state, $messages, $errors, $installed, $force, $checks, $runtimePath);

function validateInstallInput(array $state, array &$errors): void
{
    foreach (['host', 'database', 'username', 'xmpp_domain', 'relay_websocket', 'xmpp_websocket'] as $key) {
        if ($state[$key] === '') {
            $errors[] = "Veld '{$key}' is verplicht.";
        }
    }

    foreach (['port', 'xmpp_port', 'relay_port'] as $key) {
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

    if (!filter_var($state['admin_email'], FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Admin e-mail is verplicht en moet een geldig e-mailadres zijn.';
    }
    if (strlen($state['admin_password']) < 10) {
        $errors[] = 'Admin wachtwoord moet minimaal 10 tekens hebben.';
    }
    if (!hash_equals($state['admin_password'], $state['admin_password_confirm'])) {
        $errors[] = 'Admin wachtwoord en herhaling zijn niet gelijk.';
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

function createAdminAccount(array $state): void
{
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $state['host'],
        (int)$state['port'],
        $state['database']
    );
    $pdo = new PDO($dsn, $state['username'], $state['password'], pdoOptions());
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS admin_users (
            admin_id VARCHAR(96) NOT NULL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            display_name VARCHAR(120) NOT NULL DEFAULT "",
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(32) NOT NULL DEFAULT "owner",
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME NULL,
            UNIQUE KEY uq_admin_users_email (email(190))
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );

    $adminId = 'admin-' . substr(hash('sha256', strtolower($state['admin_email'])), 0, 32);
    $statement = $pdo->prepare(
        'INSERT INTO admin_users (admin_id, email, display_name, password_hash, role, enabled)
         VALUES (:admin_id, :email, :display_name, :password_hash, "owner", 1)
         ON DUPLICATE KEY UPDATE
             display_name = VALUES(display_name),
             password_hash = VALUES(password_hash),
             enabled = 1'
    );
    $statement->execute([
        'admin_id' => $adminId,
        'email' => strtolower($state['admin_email']),
        'display_name' => cleanInstallerText($state['admin_name'], 120),
        'password_hash' => password_hash($state['admin_password'], PASSWORD_DEFAULT),
    ]);
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
        . "        'google' => [\n"
        . "            'client_id' => " . var_export((string)$state['google_client_id'], true) . ",\n"
        . "            'client_secret' => " . var_export((string)$state['google_client_secret'], true) . ",\n"
        . "            'redirect_uri' => " . var_export(defaultProviderRedirectUri('google'), true) . ",\n"
        . "            'authorization_endpoint' => 'https://accounts.google.com/o/oauth2/v2/auth',\n"
        . "            'token_endpoint' => 'https://oauth2.googleapis.com/token',\n"
        . "            'userinfo_endpoint' => 'https://openidconnect.googleapis.com/v1/userinfo',\n"
        . "            'scopes' => ['openid', 'email', 'profile'],\n"
        . "        ],\n"
        . "        'facebook' => [\n"
        . "            'app_id' => " . var_export((string)$state['facebook_app_id'], true) . ",\n"
        . "            'app_secret' => " . var_export((string)$state['facebook_app_secret'], true) . ",\n"
        . "            'redirect_uri' => " . var_export(defaultProviderRedirectUri('facebook'), true) . ",\n"
        . "            'authorization_endpoint' => 'https://www.facebook.com/v19.0/dialog/oauth',\n"
        . "            'token_endpoint' => 'https://graph.facebook.com/v19.0/oauth/access_token',\n"
        . "            'userinfo_endpoint' => 'https://graph.facebook.com/me',\n"
        . "            'scopes' => ['email', 'public_profile'],\n"
        . "        ],\n"
        . "        'apple' => [\n"
        . "            'client_id' => " . var_export((string)$state['apple_client_id'], true) . ",\n"
        . "            'client_secret' => " . var_export((string)$state['apple_client_secret'], true) . ",\n"
        . "            'redirect_uri' => " . var_export(defaultProviderRedirectUri('apple'), true) . ",\n"
        . "            'authorization_endpoint' => 'https://appleid.apple.com/auth/authorize',\n"
        . "            'token_endpoint' => 'https://appleid.apple.com/auth/token',\n"
        . "            'scopes' => ['name', 'email'],\n"
        . "        ],\n"
        . "        'auth0' => [\n"
        . "            'auth0_domain' => " . var_export((string)$state['auth0_domain'], true) . ",\n"
        . "            'client_id' => " . var_export((string)$state['auth0_client_id'], true) . ",\n"
        . "            'client_secret' => " . var_export((string)$state['auth0_client_secret'], true) . ",\n"
        . "            'redirect_uri' => " . var_export(defaultProviderRedirectUri('auth0'), true) . ",\n"
        . "            'scopes' => ['openid', 'email', 'profile'],\n"
        . "        ],\n"
        . "    ],\n"
        . "    'relay' => [\n"
        . arrayEntry('websocket', $state['relay_websocket'])
        . "    ],\n"
        . "    'sip' => [\n"
        . arrayEntry('enabled', 0, false)
        . arrayEntry('host', $state['xmpp_domain'])
        . arrayEntry('port', 5060, false)
        . arrayEntry('tls_port', 5061, false)
        . arrayEntry('module', 'ejabberd_sip / mod_sip')
        . "    ],\n"
        . "    'admin' => [\n"
        . arrayEntry('token', '')
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
    $google = is_array($oauth['google'] ?? null) ? $oauth['google'] : [];
    $facebook = is_array($oauth['facebook'] ?? null) ? $oauth['facebook'] : [];
    $apple = is_array($oauth['apple'] ?? null) ? $oauth['apple'] : [];
    $auth0 = is_array($oauth['auth0'] ?? null) ? $oauth['auth0'] : [];
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
        'relay_port' => (string)relayPortFromUrl((string)($relay['websocket'] ?? defaultRelayWebSocket())),
        'admin_name' => 'TeleTypTel beheerder',
        'admin_email' => '',
        'admin_password' => '',
        'admin_password_confirm' => '',
        'google_client_id' => (string)($google['client_id'] ?? ''),
        'google_client_secret' => (string)($google['client_secret'] ?? ''),
        'facebook_app_id' => (string)($facebook['app_id'] ?? $facebook['client_id'] ?? ''),
        'facebook_app_secret' => (string)($facebook['app_secret'] ?? $facebook['client_secret'] ?? ''),
        'apple_client_id' => (string)($apple['client_id'] ?? ''),
        'apple_client_secret' => (string)($apple['client_secret'] ?? ''),
        'auth0_domain' => (string)($auth0['auth0_domain'] ?? $auth0['domain'] ?? ''),
        'auth0_client_id' => (string)($auth0['client_id'] ?? ''),
        'auth0_client_secret' => (string)($auth0['client_secret'] ?? ''),
    ];
}

function collectSystemChecks(string $rootPath, string $configPath, string $schemaPath, array $state): array
{
    $relayScript = $rootPath . DIRECTORY_SEPARATOR . 'rtt-websocket-server.php';
    $runtimePath = $rootPath . DIRECTORY_SEPARATOR . 'install-runtime';
    $checks = [];
    $checks[] = checkItem('Besturingssysteem', PHP_OS_FAMILY . ' (' . PHP_OS . ')', true);
    $checks[] = checkItem('PHP versie', PHP_VERSION, version_compare(PHP_VERSION, '8.0.0', '>='));
    $checks[] = checkItem('PDO MySQL', extension_loaded('pdo_mysql') ? 'beschikbaar' : 'niet beschikbaar', extension_loaded('pdo_mysql'));
    $checks[] = checkItem('OpenSSL', extension_loaded('openssl') ? 'beschikbaar' : 'niet beschikbaar', extension_loaded('openssl'));
    $checks[] = checkItem('Schema', $schemaPath, is_file($schemaPath));
    $checks[] = checkItem('Config schrijfbaar', dirname($configPath), is_writable(dirname($configPath)));
    $checks[] = checkItem('Runtime map schrijfbaar', $runtimePath, is_dir($runtimePath) ? is_writable($runtimePath) : is_writable($rootPath));
    $checks[] = checkItem('RTT relay script', $relayScript, is_file($relayScript));
    $checks[] = checkItem('RTT relay poort ' . $state['relay_port'], relayPortStatus((int)$state['relay_port']), true);

    if (PHP_OS_FAMILY === 'Linux') {
        $checks[] = checkItem('ejabberd', ejabberdStatus(), commandExists('ejabberdctl') || commandExists('ejabberd'));
        $checks[] = checkItem('Linux service voorbeeld', 'linux/etc/systemd/system/teletyptel-rtt-relay.service', true);
        $checks[] = checkItem('Aanbevolen WSS route', '/rtt-relay via Apache/Nginx reverse proxy', true);
    } elseif (PHP_OS_FAMILY === 'Windows') {
        $checks[] = checkItem('ejabberd', 'controle gebeurt straks op de Linux-server', true);
        $checks[] = checkItem('Windows startscript', 'scripts/start-rtt-relay.ps1 of gegenereerde .cmd', true);
    }

    return $checks;
}

function checkItem(string $label, string $detail, bool $ok): array
{
    return ['label' => $label, 'detail' => $detail, 'ok' => $ok];
}

function relayPortStatus(int $port): string
{
    $socket = @fsockopen('127.0.0.1', $port, $errno, $errstr, 0.25);
    if (is_resource($socket)) {
        fclose($socket);
        return 'luistert op 127.0.0.1:' . $port;
    }

    return 'nog niet actief op 127.0.0.1:' . $port;
}

function ejabberdStatus(): string
{
    if (commandExists('ejabberdctl')) {
        $service = trim((string)runCommand('systemctl is-active ejabberd 2>/dev/null'));
        return $service !== '' && $service !== 'unknown'
            ? 'aanwezig, systemd status: ' . $service
            : 'aanwezig via ejabberdctl';
    }

    if (commandExists('ejabberd')) {
        return 'aanwezig';
    }

    return 'niet gevonden, gebruik install-linux-ejabberd.sh op Linux';
}

function commandExists(string $command): bool
{
    if (PHP_OS_FAMILY === 'Windows') {
        return false;
    }

    $result = runCommand('command -v ' . escapeshellarg($command) . ' 2>/dev/null');
    return trim((string)$result) !== '';
}

function runCommand(string $command): ?string
{
    if (!function_exists('shell_exec')) {
        return null;
    }

    $disabled = array_map('trim', explode(',', (string)ini_get('disable_functions')));
    if (in_array('shell_exec', $disabled, true)) {
        return null;
    }

    return shell_exec($command);
}

function writeRuntimeScripts(string $runtimePath, string $rootPath, array $state): array
{
    if (!is_dir($runtimePath) && !mkdir($runtimePath, 0775, true) && !is_dir($runtimePath)) {
        throw new RuntimeException('Kan install-runtime map niet maken.');
    }

    $relayPort = (int)$state['relay_port'];
    $phpBinary = PHP_BINARY ?: 'php';
    $relayScript = $rootPath . DIRECTORY_SEPARATOR . 'rtt-websocket-server.php';
    $windowsRelayScript = str_replace('/', '\\', $relayScript);
    $linuxRoot = '/var/www/teletyptel';

    $cmdPath = $runtimePath . DIRECTORY_SEPARATOR . 'start-rtt-relay.cmd';
    $cmd = "@echo off\r\n"
        . "set RTT_RELAY_HOST=127.0.0.1\r\n"
        . "set RTT_RELAY_PORT={$relayPort}\r\n"
        . '"' . $phpBinary . '" "' . $windowsRelayScript . '"' . "\r\n";
    file_put_contents($cmdPath, $cmd, LOCK_EX);

    $shPath = $runtimePath . DIRECTORY_SEPARATOR . 'start-rtt-relay.sh';
    $sh = "#!/usr/bin/env sh\n"
        . "set -eu\n"
        . "export RTT_RELAY_HOST=127.0.0.1\n"
        . "export RTT_RELAY_PORT={$relayPort}\n"
        . "exec /usr/bin/php {$linuxRoot}/rtt-websocket-server.php\n";
    file_put_contents($shPath, $sh, LOCK_EX);
    @chmod($shPath, 0755);

    $servicePath = $runtimePath . DIRECTORY_SEPARATOR . 'teletyptel-rtt-relay.service';
    $service = "[Unit]\n"
        . "Description=TeleTypTel RTT WebSocket relay\n"
        . "After=network-online.target\n"
        . "Wants=network-online.target\n\n"
        . "[Service]\n"
        . "Type=simple\n"
        . "User=www-data\n"
        . "Group=www-data\n"
        . "WorkingDirectory={$linuxRoot}\n"
        . "Environment=RTT_RELAY_HOST=127.0.0.1\n"
        . "Environment=RTT_RELAY_PORT={$relayPort}\n"
        . "ExecStart=/usr/bin/php {$linuxRoot}/rtt-websocket-server.php\n"
        . "Restart=always\n"
        . "RestartSec=3\n"
        . "NoNewPrivileges=true\n"
        . "PrivateTmp=true\n"
        . "ProtectSystem=full\n"
        . "ProtectHome=true\n\n"
        . "[Install]\n"
        . "WantedBy=multi-user.target\n";
    file_put_contents($servicePath, $service, LOCK_EX);

    $installShPath = $runtimePath . DIRECTORY_SEPARATOR . 'install-linux-rtt-relay.sh';
    $installSh = "#!/usr/bin/env sh\n"
        . "set -eu\n"
        . "sudo cp {$linuxRoot}/install-runtime/teletyptel-rtt-relay.service /etc/systemd/system/\n"
        . "sudo systemctl daemon-reload\n"
        . "sudo systemctl enable --now teletyptel-rtt-relay.service\n"
        . "sudo systemctl status teletyptel-rtt-relay.service --no-pager\n";
    file_put_contents($installShPath, $installSh, LOCK_EX);
    @chmod($installShPath, 0755);

    $ejabberdInstallPath = $runtimePath . DIRECTORY_SEPARATOR . 'install-linux-ejabberd.sh';
    $domain = shellQuote($state['xmpp_domain']);
    $ejabberdInstall = "#!/usr/bin/env sh\n"
        . "set -eu\n"
        . "DOMAIN={$domain}\n"
        . "if command -v ejabberdctl >/dev/null 2>&1; then\n"
        . "  echo \"ejabberd is already installed.\"\n"
        . "else\n"
        . "  if command -v apt-get >/dev/null 2>&1; then\n"
        . "    sudo apt-get update\n"
        . "    sudo apt-get install -y ejabberd\n"
        . "  elif command -v dnf >/dev/null 2>&1; then\n"
        . "    sudo dnf install -y ejabberd\n"
        . "  elif command -v yum >/dev/null 2>&1; then\n"
        . "    sudo yum install -y ejabberd\n"
        . "  else\n"
        . "    echo \"No supported package manager found. Install ejabberd manually.\"\n"
        . "    exit 1\n"
        . "  fi\n"
        . "fi\n"
        . "sudo systemctl enable --now ejabberd\n"
        . "sudo systemctl status ejabberd --no-pager\n"
        . "echo \"Next: add host/domain \${DOMAIN} and required modules in /etc/ejabberd/ejabberd.yml.\"\n"
        . "echo \"Recommended modules: mod_roster, mod_muc, mod_mam, mod_pubsub, mod_http_upload, mod_register, mod_websocket, mod_bosh.\"\n";
    file_put_contents($ejabberdInstallPath, $ejabberdInstall, LOCK_EX);
    @chmod($ejabberdInstallPath, 0755);

    return [$cmdPath, $shPath, $servicePath, $installShPath, $ejabberdInstallPath];
}

function shellQuote(string $value): string
{
    return "'" . str_replace("'", "'\"'\"'", $value) . "'";
}

function relayPortFromUrl(string $url): int
{
    $port = parse_url($url, PHP_URL_PORT);
    if (is_int($port) && $port >= 1 && $port <= 65535) {
        return $port;
    }

    return 8787;
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

function defaultAuth0RedirectUri(): string
{
    return defaultProviderRedirectUri('auth0');
}

function defaultProviderRedirectUri(string $provider): string
{
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return (isHttpsRequest() ? 'https' : 'http') . '://' . $host . '/api/auth/' . rawurlencode($provider) . '/callback';
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

function renderInstallPage(array $state, array $messages, array $errors, bool $installed, bool $force, array $checks, string $runtimePath): void
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
    form, .notice, .checks { background: #fff; border: 1px solid #9cc7ff; border-radius: 8px; padding: 18px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    label { display: grid; gap: 6px; font-weight: 700; }
    input { border: 1px solid #8bb6e8; border-radius: 6px; padding: 10px; font: inherit; }
    button, a.button { display: inline-block; border: 1px solid #0b63ce; border-radius: 6px; background: #0b73e7; color: #fff; padding: 11px 16px; font: inherit; text-decoration: none; cursor: pointer; }
    fieldset { border: 1px solid #c7ddff; border-radius: 8px; margin: 18px 0; padding: 14px; }
    legend { padding: 0 8px; font-weight: 700; }
    .full { grid-column: 1 / -1; }
    .ok { border-color: #21a366; background: #e9f9ef; }
    .error { border-color: #d92d20; background: #fff1f0; }
    .check-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
    .check-list li { display: grid; grid-template-columns: 150px 1fr; gap: 10px; align-items: start; border-bottom: 1px solid #e2e8f0; padding: 8px 0; }
    .check-list li:last-child { border-bottom: 0; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 9px; font-size: 13px; font-weight: 700; }
    .badge.ok-badge { background: #dcfce7; color: #166534; }
    .badge.warn-badge { background: #fee2e2; color: #991b1b; }
    code { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 4px; padding: 2px 5px; }
    pre { overflow: auto; background: #0f172a; color: #e2e8f0; border-radius: 8px; padding: 12px; }
    .actions { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .small { color: #475569; font-size: 14px; }
    @media (max-width: 720px) { .grid, .check-list li { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <h1>TeleTypTel installatie</h1>
  <p>Controleer de server, maak de database, schrijf <strong>php/config.php</strong>, importeer het schema en maak startbestanden voor de WebSocket-relay.</p>

  <section class="checks">
    <h2>Systeemcheck</h2>
    <ul class="check-list">
      <?php foreach ($checks as $check): ?>
        <li>
          <span><span class="badge <?= $check['ok'] ? 'ok-badge' : 'warn-badge' ?>"><?= $check['ok'] ? 'OK' : 'Check' ?></span> <?= e($check['label']) ?></span>
          <span><?= e($check['detail']) ?></span>
        </li>
      <?php endforeach; ?>
    </ul>
  </section>

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
        <a class="button" href="install.php?force=1">Opnieuw configureren / admin maken</a>
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
          <?= input('relay_port', 'RTT relay poort', $state['relay_port'], 'number') ?>
          <?= input('xmpp_websocket', 'XMPP WebSocket', $state['xmpp_websocket'], 'text', 'full') ?>
          <?= input('xmpp_domain', 'XMPP domein', $state['xmpp_domain'], 'text', 'full') ?>
        </div>
      </fieldset>

      <fieldset>
        <legend>Admin-account</legend>
        <p class="small">Dit account gebruikt straks <code>admin.php</code>. Bewaar dit wachtwoord goed.</p>
        <div class="grid">
          <?= input('admin_name', 'Naam beheerder', $state['admin_name']) ?>
          <?= input('admin_email', 'Admin e-mail', $state['admin_email'], 'email') ?>
          <?= input('admin_password', 'Admin wachtwoord', $state['admin_password'], 'password') ?>
          <?= input('admin_password_confirm', 'Herhaal wachtwoord', $state['admin_password_confirm'], 'password') ?>
        </div>
      </fieldset>

      <fieldset>
        <legend>Social login optioneel</legend>
        <p class="small">Laat leeg wat je nog niet gebruikt. Zet deze callback-URLs ook bij de provider.</p>
        <div class="grid">
          <?= input('google_client_id', 'Google client ID', $state['google_client_id'], 'text', 'full') ?>
          <?= input('google_client_secret', 'Google client secret', $state['google_client_secret'], 'password', 'full') ?>
          <p class="small full">Google callback: <code><?= e(defaultProviderRedirectUri('google')) ?></code></p>
          <?= input('facebook_app_id', 'Facebook app ID', $state['facebook_app_id'], 'text', 'full') ?>
          <?= input('facebook_app_secret', 'Facebook app secret', $state['facebook_app_secret'], 'password', 'full') ?>
          <p class="small full">Facebook callback: <code><?= e(defaultProviderRedirectUri('facebook')) ?></code></p>
          <?= input('apple_client_id', 'Apple client ID', $state['apple_client_id'], 'text', 'full') ?>
          <?= input('apple_client_secret', 'Apple client secret', $state['apple_client_secret'], 'password', 'full') ?>
          <p class="small full">Apple callback: <code><?= e(defaultProviderRedirectUri('apple')) ?></code></p>
          <?= input('auth0_domain', 'Auth0 domein', $state['auth0_domain'], 'text', 'full') ?>
          <?= input('auth0_client_id', 'Auth0 client ID', $state['auth0_client_id'], 'text', 'full') ?>
          <?= input('auth0_client_secret', 'Auth0 client secret', $state['auth0_client_secret'], 'password', 'full') ?>
          <p class="small full">Auth0 callback: <code><?= e(defaultAuth0RedirectUri()) ?></code></p>
        </div>
      </fieldset>

      <p class="actions">
        <button type="submit">Installeren</button>
        <span class="small">Na installatie: blokkeer of verwijder install.php op productie.</span>
      </p>
    </form>
  <?php endif; ?>

  <section class="notice">
    <h2>WebSocket automatisch starten</h2>
    <p>Na installatie maakt deze pagina startbestanden in <code><?= e($runtimePath) ?></code>.</p>
    <p>Windows gebruikt <code>start-rtt-relay.cmd</code>. Linux gebruikt liever systemd:</p>
    <pre>sudo cp linux/etc/systemd/system/teletyptel-rtt-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teletyptel-rtt-relay.service
sudo systemctl status teletyptel-rtt-relay.service</pre>
    <p class="small">Op productie hoort Apache/Nginx <code>/rtt-relay</code> door te sturen naar <code>127.0.0.1:<?= e((string)$state['relay_port']) ?></code>.</p>
  </section>

  <section class="notice">
    <h2>ejabberd installeren</h2>
    <p>Als de systeemcheck ejabberd niet vindt, gebruik dan na installatie het gegenereerde Linux-script:</p>
    <pre>cd /var/www/teletyptel
sudo sh php/install-runtime/install-linux-ejabberd.sh</pre>
    <p>Daarna moet <code>/etc/ejabberd/ejabberd.yml</code> nog het juiste domein en modules krijgen.</p>
    <p class="small">Aanbevolen modules: roster, MUC, MAM, PubSub/PEP, HTTP upload, register, WebSocket en BOSH. Voor echte video/spraak komt later ook TURN/coturn erbij.</p>
  </section>
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

function cleanInstallerText(string $value, int $maxLength): string
{
    $text = trim($value);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $text) ?? '';
    return substr($text, 0, $maxLength);
}
