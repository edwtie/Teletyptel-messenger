<?php
declare(strict_types=1);

require_once __DIR__ . '/AccountAccess.php';

final class TranslationFailure extends RuntimeException
{
    public string $errorCode;
    public int $status;

    public function __construct(string $errorCode, int $status)
    {
        parent::__construct($errorCode);
        $this->errorCode = $errorCode;
        $this->status = $status;
    }
}

final class TranslationService
{
    public const LANGUAGES = ['nl' => 'Nederlands', 'en' => 'English', 'de' => 'Deutsch', 'fr' => 'Français',
        'es' => 'Español', 'it' => 'Italiano', 'pt' => 'Português', 'pl' => 'Polski', 'tr' => 'Türkçe',
        'ar' => 'العربية', 'uk' => 'Українська', 'zh-CN' => '简体中文'];

    private PDO $pdo;
    private array $config;
    private ?Closure $transport;

    public function __construct(PDO $pdo, array $config, ?Closure $transport = null)
    {
        $this->pdo = $pdo;
        $this->config = $config;
        $this->transport = $transport;
    }

    public static function authorize(PDO $pdo, array &$session, string $method, ?string $csrf): string
    {
        AccountAccess::guardSession($pdo, $session);
        $accountId = $session['teletyptel_account_id'] ?? '';
        if (!is_string($accountId) || $accountId === '') throw new TranslationFailure('sign_in', 401);
        $statement = $pdo->prepare('SELECT account_id FROM account_profiles WHERE account_id = ?');
        $statement->execute([$accountId]);
        if (!$statement->fetchColumn()) throw new TranslationFailure('sign_in', 401);
        if ($method === 'POST' && (!is_string($session['teletyptel_translation_csrf'] ?? null)
            || !is_string($csrf) || !hash_equals($session['teletyptel_translation_csrf'], $csrf))) {
            throw new TranslationFailure('session_expired', 403);
        }
        return $accountId;
    }

    public function ensureSchema(): void
    {
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' : '';
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS translation_preferences (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            target_language VARCHAR(16) NOT NULL DEFAULT \'nl\',
            translation_mode VARCHAR(16) NOT NULL DEFAULT \'manual\',
            automatic_consent INTEGER NOT NULL DEFAULT 0,
            live_rtt_consent INTEGER NOT NULL DEFAULT 0,
            own_live_rtt_consent INTEGER NOT NULL DEFAULT 0
        )' . $suffix);
        foreach (['live_rtt_consent', 'own_live_rtt_consent'] as $column) {
            try {
                $this->pdo->query('SELECT ' . $column . ' FROM translation_preferences LIMIT 0');
            } catch (PDOException $error) {
                if (($error->errorInfo[1] ?? null) !== 1054 && !str_contains($error->getMessage(), 'no such column: ' . $column)) throw $error;
                try {
                    $this->pdo->exec('ALTER TABLE translation_preferences ADD COLUMN ' . $column . ' INTEGER NOT NULL DEFAULT 0');
                } catch (PDOException $migrationError) {
                    if (($migrationError->errorInfo[1] ?? null) !== 1060 && !str_contains($migrationError->getMessage(), 'duplicate column name: ' . $column)) throw $migrationError;
                }
            }
        }
        $this->pdo->exec('CREATE TABLE IF NOT EXISTS translation_usage (
            scope_key VARCHAR(128) NOT NULL,
            window_start BIGINT NOT NULL,
            window_end BIGINT NOT NULL,
            requests INTEGER NOT NULL DEFAULT 0,
            characters INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (scope_key, window_start)
        )' . $suffix);
    }

    public function available(): bool
    {
        return ($this->config['enabled'] ?? false) === true && ($this->config['provider'] ?? 'google') === 'google'
            && is_string($this->config['apiKey'] ?? null) && $this->config['apiKey'] !== '';
    }

    public function preferences(string $accountId): array
    {
        $statement = $this->pdo->prepare('SELECT target_language, translation_mode, automatic_consent, live_rtt_consent, own_live_rtt_consent FROM translation_preferences WHERE account_id = ?');
        $statement->execute([$accountId]);
        $row = $statement->fetch(PDO::FETCH_ASSOC) ?: [];
        return ['targetLanguage' => $row['target_language'] ?? 'nl', 'mode' => $row['translation_mode'] ?? 'manual',
            'automaticConsent' => (bool)($row['automatic_consent'] ?? false), 'liveRttConsent' => (bool)($row['live_rtt_consent'] ?? false),
            'ownLiveRttConsent' => (bool)($row['own_live_rtt_consent'] ?? false)];
    }

    public function savePreferences(string $accountId, array $input): array
    {
        $target = $this->language($input['targetLanguage'] ?? null);
        $mode = $input['mode'] ?? null;
        if (!in_array($mode, ['off', 'manual', 'automatic'], true)) throw new TranslationFailure('invalid_preferences', 400);
        $consent = ($input['automaticConsent'] ?? false) === true;
        if ($mode === 'automatic' && !$consent) throw new TranslationFailure('consent_required', 400);
        $mysql = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $sql = 'INSERT INTO translation_preferences (account_id, target_language, translation_mode, automatic_consent, live_rtt_consent, own_live_rtt_consent) VALUES (?, ?, ?, ?, ?, ?) ';
        $sql .= $mysql ? 'ON DUPLICATE KEY UPDATE target_language = VALUES(target_language), translation_mode = VALUES(translation_mode), automatic_consent = VALUES(automatic_consent), live_rtt_consent = VALUES(live_rtt_consent), own_live_rtt_consent = VALUES(own_live_rtt_consent)'
            : 'ON CONFLICT(account_id) DO UPDATE SET target_language = excluded.target_language, translation_mode = excluded.translation_mode, automatic_consent = excluded.automatic_consent, live_rtt_consent = excluded.live_rtt_consent, own_live_rtt_consent = excluded.own_live_rtt_consent';
        $this->pdo->prepare($sql)->execute([$accountId, $target, $mode, $mode === 'automatic' && $consent ? 1 : 0,
            $mode !== 'off' && ($input['liveRttConsent'] ?? false) === true ? 1 : 0,
            $mode !== 'off' && ($input['ownLiveRttConsent'] ?? false) === true ? 1 : 0]);
        return $this->preferences($accountId);
    }

    private function language($value): string
    {
        if (!is_string($value) || !array_key_exists($value, self::LANGUAGES)) throw new TranslationFailure('invalid_language', 400);
        return $value;
    }

    public function translate(string $accountId, array $input): array
    {
        if (!$this->available()) throw new TranslationFailure('unavailable', 503);
        $preferences = $this->preferences($accountId);
        if ($preferences['mode'] === 'off') throw new TranslationFailure('disabled', 403);
        if (($input['consent'] ?? false) !== true) throw new TranslationFailure('consent_required', 400);
        if (($input['liveRtt'] ?? false) === true) {
            $direction = $input['liveDirection'] ?? 'peer';
            if (!in_array($direction, ['peer', 'self'], true)) throw new TranslationFailure('invalid_request', 400);
            if (!$preferences[$direction === 'self' ? 'ownLiveRttConsent' : 'liveRttConsent']) throw new TranslationFailure('consent_required', 403);
        }
        if (($input['automatic'] ?? false) === true && ($preferences['mode'] !== 'automatic' || !$preferences['automaticConsent'])) {
            throw new TranslationFailure('consent_required', 403);
        }
        $target = $this->language($input['targetLanguage'] ?? null);
        if ($target !== $preferences['targetLanguage']) throw new TranslationFailure('preferences_changed', 409);
        return $this->translateAuthorizedText($accountId, $input['text'] ?? null, $target);
    }

    public function translateAuthorizedText(string $scope, $text, string $target): array
    {
        if (!$this->available()) throw new TranslationFailure('unavailable', 503);
        $target = $this->language($target);
        if (!is_string($text) || trim($text) === '' || strlen($text) > 20000 || !preg_match('//u', $text)) {
            throw new TranslationFailure('invalid_text', 400);
        }
        $characters = preg_match_all('/./us', $text);
        if ($characters > 5000) throw new TranslationFailure('text_too_long', 400);
        $this->reserveUsage($scope, $characters);
        $request = ['q' => $text, 'target' => $target, 'format' => 'text'];
        try {
            $response = $this->transport ? ($this->transport)($request, $this->config['apiKey']) : $this->google($request);
            $translation = $response['data']['translations'][0] ?? [];
            if (!is_string($translation['translatedText'] ?? null) || strlen($translation['translatedText']) > 100000) {
                throw new RuntimeException('Invalid provider response');
            }
            $source = $translation['detectedSourceLanguage'] ?? '';
            return ['text' => html_entity_decode($translation['translatedText'], ENT_QUOTES | ENT_HTML5, 'UTF-8'),
                'targetLanguage' => $target, 'sourceLanguage' => is_string($source) && preg_match('/^[a-zA-Z-]{2,16}$/D', $source) ? $source : '',
                'provider' => 'Google Cloud Translation'];
        } catch (Throwable $error) {
            throw new TranslationFailure('provider_failed', 502);
        }
    }

    private function google(array $request): array
    {
        if (!function_exists('curl_init')) throw new RuntimeException('Transport unavailable');
        $handle = curl_init('https://translation.googleapis.com/language/translate/v2');
        $body = '';
        curl_setopt_array($handle, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($request, JSON_THROW_ON_ERROR),
            CURLOPT_HTTPHEADER => ['Content-Type: application/json; charset=utf-8', 'X-goog-api-key: ' . $this->config['apiKey']],
            CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 15, CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true, CURLOPT_SSL_VERIFYHOST => 2, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$body): int {
                if (strlen($body) + strlen($chunk) > 262144) return 0;
                $body .= $chunk;
                return strlen($chunk);
            }]);
        try {
            if (curl_exec($handle) === false || curl_getinfo($handle, CURLINFO_HTTP_CODE) !== 200) throw new RuntimeException('Provider request failed');
            return json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        } finally {
            unset($handle);
        }
    }

    private function reserveUsage(string $accountId, int $characters): void
    {
        $now = time();
        $day = (int)(floor($now / 86400) * 86400);
        $minute = (int)(floor($now / 60) * 60);
        $mysql = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
        $limits = [
            ['global', $day, $day + 86400, 100000, (int)($this->config['globalDailyCharacters'] ?? 500000)],
            ['day:' . $accountId, $day, $day + 86400, 1000, (int)($this->config['dailyCharacters'] ?? 50000)],
            ['minute:' . $accountId, $minute, $minute + 60, 30, 150000],
        ];
        $this->pdo->beginTransaction();
        try {
            $this->pdo->prepare('DELETE FROM translation_usage WHERE window_end < ?')->execute([$now]);
            foreach ($limits as [$scope, $start, $end, $requestsLimit, $charactersLimit]) {
                $this->pdo->prepare(($mysql ? 'INSERT IGNORE' : 'INSERT OR IGNORE') . ' INTO translation_usage (scope_key, window_start, window_end) VALUES (?, ?, ?)')->execute([$scope, $start, $end]);
                $statement = $this->pdo->prepare('SELECT requests, characters FROM translation_usage WHERE scope_key = ? AND window_start = ?' . ($mysql ? ' FOR UPDATE' : ''));
                $statement->execute([$scope, $start]);
                $usage = $statement->fetch(PDO::FETCH_ASSOC);
                if ((int)$usage['requests'] >= $requestsLimit || (int)$usage['characters'] + $characters > $charactersLimit) throw new TranslationFailure('limit_reached', 429);
                $this->pdo->prepare('UPDATE translation_usage SET requests = requests + 1, characters = characters + ? WHERE scope_key = ? AND window_start = ?')->execute([$characters, $scope, $start]);
            }
            $this->pdo->commit();
        } catch (Throwable $error) {
            $this->pdo->rollBack();
            throw $error;
        }
    }
}
