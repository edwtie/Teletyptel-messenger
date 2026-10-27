<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/TranslationService.php';
require_once dirname(__DIR__) . '/lib/AdminSettings.php';

$checks = 0;
function checkTranslation(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) throw new RuntimeException($message);
    $checks++;
}
function rejectedTranslation(callable $operation, string $code): void
{
    try { $operation(); } catch (TranslationFailure $error) {
        checkTranslation($error->errorCode === $code, 'Expected error ' . $code . ', got ' . $error->errorCode);
        return;
    }
    throw new RuntimeException('Expected rejection: ' . $code);
}

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE account_profiles (account_id VARCHAR(96) PRIMARY KEY)');
$pdo->exec("INSERT INTO account_profiles VALUES ('alice'), ('bob')");
AccountAccess::ensureSchema($pdo);
$calls = [];
$config = ['enabled' => true, 'provider' => 'google', 'apiKey' => 'fixture-key', 'dailyCharacters' => 1000, 'globalDailyCharacters' => 2000];
$transport = function (array $request, string $key) use (&$calls): array {
    checkTranslation($key === 'fixture-key', 'Secret used server-side');
    checkTranslation(array_keys($request) === ['q', 'target', 'format'] && $request['format'] === 'text', 'Only text and translation settings sent');
    $calls[] = $request;
    return ['data' => ['translations' => [['translatedText' => 'Hallo &amp; &lt;img src=x onerror=alert(1)&gt;', 'detectedSourceLanguage' => 'en']]]];
};
$service = new TranslationService($pdo, $config, $transport);
$service->ensureSchema();
$session = ['teletyptel_account_id' => 'alice', 'teletyptel_translation_csrf' => 'fixture-csrf'];
checkTranslation(TranslationService::authorize($pdo, $session, 'GET', null) === 'alice', 'Authenticated account');
checkTranslation(TranslationService::authorize($pdo, $session, 'POST', 'fixture-csrf') === 'alice', 'Valid CSRF');
rejectedTranslation(function () use ($pdo, &$session) { TranslationService::authorize($pdo, $session, 'POST', 'wrong'); }, 'session_expired');
rejectedTranslation(function () use ($pdo) { $guest = ['teletyptel_2fa_pending_account_id' => 'alice']; TranslationService::authorize($pdo, $guest, 'GET', null); }, 'sign_in');
checkTranslation($service->preferences('alice')['mode'] === 'manual', 'No automatic translation by default');
$service->savePreferences('alice', ['targetLanguage' => 'de', 'mode' => 'manual']);
checkTranslation($service->preferences('bob')['targetLanguage'] === 'nl', 'Preferences isolated by account');
checkTranslation((new TranslationService($pdo, $config, $transport))->preferences('alice')['targetLanguage'] === 'de', 'Preferences survive new service instance');
rejectedTranslation(fn() => $service->savePreferences('alice', ['targetLanguage' => 'xx', 'mode' => 'manual']), 'invalid_language');
rejectedTranslation(fn() => $service->savePreferences('alice', ['targetLanguage' => 'nl', 'mode' => 'bad']), 'invalid_preferences');
rejectedTranslation(fn() => $service->savePreferences('alice', ['targetLanguage' => 'nl', 'mode' => 'automatic']), 'consent_required');
$request = ['text' => 'Hello', 'targetLanguage' => 'de', 'consent' => true];
rejectedTranslation(fn() => $service->translate('alice', array_replace($request, ['consent' => false])), 'consent_required');
rejectedTranslation(fn() => $service->translate('alice', $request + ['automatic' => true]), 'consent_required');
rejectedTranslation(fn() => $service->translate('alice', array_replace($request, ['targetLanguage' => 'fr'])), 'preferences_changed');
rejectedTranslation(fn() => $service->translate('alice', array_replace($request, ['text' => str_repeat('a', 5001)])), 'text_too_long');
checkTranslation(count($calls) === 0, 'Rejected requests never reach provider');
$result = $service->translate('alice', $request);
checkTranslation($result['text'] === 'Hallo & <img src=x onerror=alert(1)>', 'Provider entities decoded, client must display as text');
checkTranslation(!str_contains(json_encode($result), 'fixture-key'), 'No secret in result');
$service->savePreferences('alice', ['targetLanguage' => 'de', 'mode' => 'automatic', 'automaticConsent' => true]);
$service->translate('alice', $request + ['automatic' => true]);
$service->savePreferences('alice', ['targetLanguage' => 'de', 'mode' => 'off']);
rejectedTranslation(fn() => $service->translate('alice', $request), 'disabled');
checkTranslation(!$service->preferences('alice')['automaticConsent'], 'Disabling clears automatic consent');
$service->savePreferences('alice', ['targetLanguage' => 'de', 'mode' => 'manual']);
$disabled = new TranslationService($pdo, array_replace($config, ['enabled' => false]), $transport);
rejectedTranslation(fn() => $disabled->translate('alice', $request), 'unavailable');
$failing = new TranslationService($pdo, $config, static function () { throw new RuntimeException('fixture-key and message data'); });
rejectedTranslation(fn() => $failing->translate('alice', $request), 'provider_failed');
$limited = new TranslationService($pdo, array_replace($config, ['dailyCharacters' => 10]), $transport);
rejectedTranslation(fn() => $limited->translate('alice', $request), 'limit_reached');
$globalLimited = new TranslationService($pdo, array_replace($config, ['globalDailyCharacters' => 1]), $transport);
rejectedTranslation(fn() => $globalLimited->translate('bob', array_replace($request, ['targetLanguage' => 'nl'])), 'limit_reached');
for ($index = 0; $index < 27; $index++) $service->translate('alice', $request);
rejectedTranslation(fn() => $service->translate('alice', $request), 'limit_reached');
$pdo->exec("INSERT INTO account_access_controls (account_id, web_blocked, version, updated_at) VALUES ('alice', 1, 2, '2026-10-26')");
try {
    TranslationService::authorize($pdo, $session, 'GET', null);
    throw new RuntimeException('Blocked account accepted');
} catch (AccountAccessDenied $error) {
    checkTranslation(!isset($session['teletyptel_account_id']), 'Blocked session revoked');
}
$settings = new AdminSettings(sys_get_temp_dir() . '/nonexistent-translation-settings-' . bin2hex(random_bytes(8)), ['translation' => $config]);
checkTranslation(!str_contains(json_encode($settings->view()), 'fixture-key'), 'Admin GET never returns key');
checkTranslation($settings->view()['translation']['apiKeyConfigured'], 'Only configured indicator returned');
checkTranslation($settings->candidate([])['translation']['apiKey'] === 'fixture-key', 'Missing section preserves key');
checkTranslation($settings->candidate(['translation' => ['apiKey' => '']])['translation']['apiKey'] === 'fixture-key', 'Blank field preserves key');
checkTranslation($settings->candidate(['translation' => ['clearApiKey' => true, 'enabled' => false]])['translation']['apiKey'] === '', 'Explicit key removal');
foreach ([['apiKey' => "bad\r\nheader"], ['clearApiKey' => true], ['dailyCharacters' => 0]] as $invalid) {
    try { $settings->candidate(['translation' => $invalid]); throw new RuntimeException('Invalid settings accepted'); }
    catch (InvalidArgumentException $error) { $checks++; }
}
$legacy = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$legacy->exec("CREATE TABLE translation_preferences (account_id VARCHAR(96) PRIMARY KEY, target_language VARCHAR(16), translation_mode VARCHAR(16), automatic_consent INTEGER)");
$legacy->exec("INSERT INTO translation_preferences VALUES ('legacy', 'en', 'automatic', 1)");
$liveService = new TranslationService($legacy, $config, $transport);
$liveService->ensureSchema();
$liveService->ensureSchema();
checkTranslation($liveService->preferences('legacy') === ['targetLanguage' => 'en', 'mode' => 'automatic', 'automaticConsent' => true, 'liveRttConsent' => false, 'ownLiveRttConsent' => false], 'Idempotent migration preserves preferences and never opts existing accounts into live RTT');
$liveRequest = ['text' => 'Draft', 'targetLanguage' => 'en', 'consent' => true, 'automatic' => false, 'liveRtt' => true];
rejectedTranslation(fn() => $liveService->translate('legacy', $liveRequest), 'consent_required');
$liveService->savePreferences('legacy', ['targetLanguage' => 'en', 'mode' => 'manual', 'liveRttConsent' => 'true']);
rejectedTranslation(fn() => $liveService->translate('legacy', $liveRequest), 'consent_required');
$liveService->savePreferences('legacy', ['targetLanguage' => 'en', 'mode' => 'manual', 'liveRttConsent' => true]);
checkTranslation($liveService->preferences('legacy')['liveRttConsent'], 'Live RTT opt-in saved independently of automatic completed-message consent');
checkTranslation(!$liveService->preferences('other')['liveRttConsent'], 'Live consent is account-specific');
$liveService->translate('legacy', $liveRequest);
rejectedTranslation(fn() => $liveService->translate('legacy', array_replace($liveRequest, ['consent' => false])), 'consent_required');
$liveService->savePreferences('legacy', ['targetLanguage' => 'en', 'mode' => 'manual', 'liveRttConsent' => false]);
rejectedTranslation(fn() => $liveService->translate('legacy', $liveRequest), 'consent_required');
$liveService->savePreferences('legacy', ['targetLanguage' => 'en', 'mode' => 'off', 'liveRttConsent' => true]);
checkTranslation(!$liveService->preferences('legacy')['liveRttConsent'], 'Off clears live consent');
rejectedTranslation(fn() => $liveService->translate('legacy', $liveRequest), 'disabled');
$liveService->savePreferences('legacy', ['targetLanguage' => 'en', 'mode' => 'manual', 'liveRttConsent' => true]);
for ($index = 0; $index < 29; $index++) $liveService->translate('legacy', $liveRequest);
rejectedTranslation(fn() => $liveService->translate('legacy', $liveRequest), 'limit_reached');
$ownRequest = $liveRequest + ['liveDirection' => 'self'];
rejectedTranslation(fn() => $liveService->translate('legacy', $ownRequest), 'consent_required');
$liveService->savePreferences('own', ['targetLanguage' => 'en', 'mode' => 'manual', 'ownLiveRttConsent' => true]);
checkTranslation($liveService->preferences('own')['ownLiveRttConsent'], 'Own draft consent saved');
checkTranslation(!$liveService->preferences('own')['liveRttConsent'], 'Own consent does not authorize incoming drafts');
rejectedTranslation(fn() => $liveService->translate('own', $liveRequest), 'consent_required');
rejectedTranslation(fn() => $liveService->translate('own', array_replace($ownRequest, ['liveDirection' => 'invalid'])), 'invalid_request');
$liveService->translate('own', $ownRequest);
$liveService->savePreferences('own', ['targetLanguage' => 'en', 'mode' => 'off', 'ownLiveRttConsent' => true]);
checkTranslation(!$liveService->preferences('own')['ownLiveRttConsent'], 'Off revokes own draft consent');
rejectedTranslation(fn() => $liveService->translate('own', $ownRequest), 'disabled');
echo "Translation smoke tests passed: $checks checks. No external provider calls.\n";
