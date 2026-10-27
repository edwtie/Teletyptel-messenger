<?php
declare(strict_types=1);

final class AdminSettings
{
    private string $path;
    private array $base;

    public function __construct(?string $path = null, ?array $base = null)
    {
        $this->path = $path ?? dirname(__DIR__) . '/storage/admin-settings.json';
        $basePath = dirname(__DIR__) . '/config.php';
        $this->base = $base ?? (is_file($basePath) ? require $basePath : []);
    }

    public function configuration(): array
    {
        return array_replace_recursive($this->base, $this->stored()['values'] ?? []);
    }

    public function view(): array
    {
        $config = $this->configuration();
        $result = ['revision' => $this->stored()['revision'] ?? '',
            'general' => array_intersect_key($config['general'] ?? [], array_flip(['siteName', 'publicUrl'])),
            'billing' => array_intersect_key($config['billing'] ?? [], array_flip(['companyName', 'address', 'vatId',
                'companyNumber', 'agbCode', 'iban', 'taxNote', 'defaultVat', 'currency', 'paymentDays']))];
        foreach (['mysql', 'xmpp_mysql'] as $name) {
            $database = $this->database($name, $config);
            $database = array_intersect_key($database, array_flip(['host', 'port', 'database', 'username']));
            $database['passwordConfigured'] = $this->database($name, $config)['password'] !== '';
            $database['environmentManaged'] = $this->environmentManaged($name);
            $result[$name] = $database;
        }
        $translation = $config['translation'] ?? [];
        $result['translation'] = [
            'enabled' => ($translation['enabled'] ?? false) === true,
            'provider' => 'google',
            'apiKeyConfigured' => ($translation['apiKey'] ?? '') !== '',
            'dailyCharacters' => (int)($translation['dailyCharacters'] ?? 50000),
            'globalDailyCharacters' => (int)($translation['globalDailyCharacters'] ?? 500000),
        ];
        return $result;
    }

    public function candidate(array $input): array
    {
        $config = $this->configuration();
        $values = [];
        foreach (['general', 'billing', 'mysql', 'xmpp_mysql', 'translation'] as $section) {
            if (isset($input[$section]) && !is_array($input[$section])) {
                throw new InvalidArgumentException('Ongeldige instellingengroep.');
            }
        }
        $general = $input['general'] ?? [];
        $publicUrl = self::text($general['publicUrl'] ?? '', 255);
        if ($publicUrl !== '' && (!filter_var($publicUrl, FILTER_VALIDATE_URL) || parse_url($publicUrl, PHP_URL_SCHEME) !== 'https'
            || parse_url($publicUrl, PHP_URL_USER) !== null || parse_url($publicUrl, PHP_URL_QUERY) !== null || parse_url($publicUrl, PHP_URL_FRAGMENT) !== null)) {
            throw new InvalidArgumentException('Gebruik een HTTPS-siteadres zonder gebruikersnaam, query of fragment.');
        }
        $values['general'] = ['siteName' => self::text($general['siteName'] ?? '', 120), 'publicUrl' => rtrim($publicUrl, '/')];
        $billing = $input['billing'] ?? [];
        foreach (['companyName' => 120, 'address' => 500, 'vatId' => 64, 'companyNumber' => 64, 'iban' => 64, 'taxNote' => 500] as $key => $limit) {
            $values['billing'][$key] = self::text($billing[$key] ?? '', $limit);
        }
        $values['billing']['agbCode'] = self::agb($billing['agbCode'] ?? '');
        $values['billing']['defaultVat'] = self::text($billing['defaultVat'] ?? '', 6);
        if ($values['billing']['defaultVat'] !== '') {
            self::vat($values['billing']['defaultVat']);
        }
        $values['billing']['currency'] = 'EUR';
        $values['billing']['paymentDays'] = self::integer($billing['paymentDays'] ?? 14, 1, 365);
        foreach (['mysql', 'xmpp_mysql'] as $name) {
            $current = $this->database($name, $config);
            if ($this->environmentManaged($name)) {
                $values[$name] = $config[$name] ?? ($name === 'xmpp_mysql' ? ($config['mysql'] ?? []) : []);
                continue;
            }
            $submitted = $input[$name] ?? [];
            $host = self::text($submitted['host'] ?? $current['host'], 255);
            $database = self::text($submitted['database'] ?? $current['database'], 64);
            if (!preg_match('/^[a-zA-Z0-9.:\[\]_-]+$/D', $host) || !preg_match('/^[a-zA-Z0-9_$-]+$/D', $database)) {
                throw new InvalidArgumentException('Ongeldige databasehost of databasenaam.');
            }
            $username = self::text($submitted['username'] ?? $current['username'], 96);
            if ($username === '') {
                throw new InvalidArgumentException('Een databasegebruikersnaam is verplicht.');
            }
            $password = $submitted['password'] ?? '';
            if (!is_string($password) || strlen($password) > 1024 || str_contains($password, "\0")) {
                throw new InvalidArgumentException('Ongeldig databasewachtwoord.');
            }
            $values[$name] = ['host' => $host, 'port' => self::integer($submitted['port'] ?? $current['port'], 1, 65535),
                'database' => $database, 'username' => $username, 'charset' => 'utf8mb4',
                'password' => ($submitted['clearPassword'] ?? false) === true ? '' : ($password === '' ? $current['password'] : $password)];
        }
        $previous = $config['translation'] ?? [];
        $translation = $input['translation'] ?? [];
        $apiKey = $translation['apiKey'] ?? '';
        if (!is_string($apiKey) || strlen($apiKey) > 512 || preg_match('/[\x00-\x20\x7f]/', $apiKey)) {
            throw new InvalidArgumentException('Ongeldige vertaalsleutel.');
        }
        $apiKey = ($translation['clearApiKey'] ?? false) === true ? '' : ($apiKey === '' ? ($previous['apiKey'] ?? '') : $apiKey);
        $enabled = ($translation['enabled'] ?? $previous['enabled'] ?? false) === true;
        if ($enabled && $apiKey === '') {
            throw new InvalidArgumentException('Stel eerst een Google Cloud Translation API-sleutel in, of schakel vertalen uit.');
        }
        $values['translation'] = ['provider' => 'google', 'enabled' => $enabled, 'apiKey' => $apiKey,
            'dailyCharacters' => self::integer($translation['dailyCharacters'] ?? $previous['dailyCharacters'] ?? 50000, 1000, 1000000),
            'globalDailyCharacters' => self::integer($translation['globalDailyCharacters'] ?? $previous['globalDailyCharacters'] ?? 500000, 1000, 10000000)];
        return $values;
    }

    public function test(array $candidate, array $owner): void
    {
        foreach (['mysql', 'xmpp_mysql'] as $name) {
            $current = $this->database($name, $this->configuration());
            $target = $this->database($name, array_replace_recursive($this->configuration(), $candidate));
            if ($name === 'xmpp_mysql' && $target === $current) {
                continue;
            }
            try {
                $connection = self::connect($target);
                $connection->query('SELECT 1');
                if ($name === 'mysql') {
                    $statement = $connection->prepare('SELECT email, password_hash, role, enabled FROM admin_users WHERE admin_id = ?');
                    $statement->execute([$owner['admin_id']]);
                    $sameOwner = $statement->fetch(PDO::FETCH_ASSOC);
                    if (!$sameOwner || $sameOwner['role'] !== 'owner' || (int)$sameOwner['enabled'] !== 1
                        || $sameOwner['email'] !== $owner['email'] || !hash_equals($owner['password_hash'], $sameOwner['password_hash'])) {
                        throw new RuntimeException('Owner mismatch');
                    }
                    foreach (['account_profiles', 'admin_audit_log', 'subscription_plans', 'subscription_history',
                        'billing_invoices', 'billing_sequences', 'billing_recurring', 'subscription_schedules'] as $table) {
                        $connection->query("SELECT 1 FROM $table LIMIT 0");
                    }
                }
            } catch (Throwable $error) {
                throw new InvalidArgumentException('Verbindingstest mislukt voor ' . $name . '. Controleer host, poort, rechten en database. De app-database moet dezelfde beheerder en bestaande tabellen bevatten.');
            }
        }
    }

    public function save(array $candidate, string $revision): void
    {
        $directory = dirname($this->path);
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) {
            throw new RuntimeException('Instellingenmap niet beschikbaar.');
        }
        $lock = fopen($this->path . '.lock', 'c+');
        if ($lock === false || !flock($lock, LOCK_EX)) {
            throw new RuntimeException('Instellingen kunnen niet worden vergrendeld.');
        }
        $temporary = null;
        try {
            if (!hash_equals((string)($this->stored()['revision'] ?? ''), $revision)) {
                throw new InvalidArgumentException('Instellingen zijn intussen gewijzigd. Ververs eerst.');
            }
            $temporary = tempnam($directory, 'settings-');
            if ($temporary === false) {
                throw new RuntimeException('Instellingen kunnen niet worden opgeslagen.');
            }
            chmod($temporary, 0600);
            $encoded = json_encode(['revision' => bin2hex(random_bytes(16)), 'values' => $candidate], JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT);
            if (file_put_contents($temporary, $encoded) === false || !rename($temporary, $this->path)) {
                throw new RuntimeException('Instellingen kunnen niet worden opgeslagen.');
            }
            $temporary = null;
        } finally {
            if (is_string($temporary) && is_file($temporary)) {
                unlink($temporary);
            }
            flock($lock, LOCK_UN);
            fclose($lock);
        }
    }

    public function database(string $name, array $config): array
    {
        $prefix = $name === 'mysql' ? 'TELETYPTEL_DB' : 'TELETYPTEL_XMPP_DB';
        $defaults = ['host' => '127.0.0.1', 'port' => 3306, 'database' => $name === 'mysql' ? 'teletyptel' : 'ejabberd',
            'username' => $name === 'mysql' ? 'teletyptel' : 'ejabberd', 'password' => '', 'charset' => 'utf8mb4'];
        $result = array_replace($defaults, $config[$name] ?? ($name === 'xmpp_mysql' ? ($config['mysql'] ?? []) : []));
        foreach (['host' => 'HOST', 'port' => 'PORT', 'database' => 'NAME', 'username' => 'USER', 'password' => 'PASSWORD'] as $key => $suffix) {
            $environment = getenv($prefix . '_' . $suffix);
            if ($environment !== false && $environment !== '') {
                $result[$key] = $environment;
            }
        }
        $result['port'] = (int)$result['port'];
        return $result;
    }

    public static function connect(array $config): PDO
    {
        return new PDO('mysql:host=' . $config['host'] . ';port=' . $config['port'] . ';dbname=' . $config['database'] . ';charset=utf8mb4',
            $config['username'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_TIMEOUT => 5]);
    }

    public static function text(mixed $value, int $maximum): string
    {
        if (!is_string($value) || !preg_match('//u', $value) || preg_match_all('/./us', $value) > $maximum
            || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $value)) {
            throw new InvalidArgumentException('Ongeldige of te lange tekst.');
        }
        return trim($value);
    }

    public static function integer(mixed $value, int $minimum, int $maximum): int
    {
        $number = filter_var($value, FILTER_VALIDATE_INT);
        if ($number === false || $number < $minimum || $number > $maximum) {
            throw new InvalidArgumentException('Ongeldig getal.');
        }
        return $number;
    }

    public static function agb(mixed $value, bool $required = false): string
    {
        $code = self::text($value, 8);
        if (($required || $code !== '') && (!preg_match('/^[0-9]{8}$/D', $code) || $code === '00000000')) {
            throw new InvalidArgumentException('Vul bij Instellingen een AGB-code van acht cijfers in, niet uitsluitend nullen.');
        }
        return $code;
    }

    public static function vat(mixed $value): int
    {
        $value = str_replace(',', '.', self::text($value, 6));
        if (!preg_match('/^(\d{1,3})(?:\.(\d{1,2}))?$/D', $value, $parts)) {
            throw new InvalidArgumentException('Vul een btw-percentage in met maximaal twee decimalen.');
        }
        return self::integer((int)$parts[1] * 100 + (int)str_pad($parts[2] ?? '', 2, '0'), 0, 10000);
    }

    private function environmentManaged(string $name): bool
    {
        $prefix = $name === 'mysql' ? 'TELETYPTEL_DB' : 'TELETYPTEL_XMPP_DB';
        foreach (['HOST', 'PORT', 'NAME', 'USER', 'PASSWORD'] as $suffix) {
            if (getenv($prefix . '_' . $suffix) !== false && getenv($prefix . '_' . $suffix) !== '') {
                return true;
            }
        }
        return false;
    }

    private function stored(): array
    {
        return is_file($this->path) ? json_decode(file_get_contents($this->path), true, 512, JSON_THROW_ON_ERROR) : [];
    }
}
