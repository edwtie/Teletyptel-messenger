<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/SupportTranslationService.php';
$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$chat = new SupportChatService($pdo); $chat->ensureSchema();
$thread = $chat->visitorAction('short-test', '127.0.0.1', ['action' => 'start', 'name' => 'Test', 'acknowledged' => true])['threadId'];
$providerCalls = 0;
$service = new SupportTranslationService($pdo, new TranslationService($pdo, ['enabled' => true, 'apiKey' => 'fixture-only'], function () use (&$providerCalls): array {
    $providerCalls++;
    return ['data' => ['translations' => [['translatedText' => 'En', 'detectedSourceLanguage' => 'ja']]]];
}));
$service->ensureSchema();
$visitor = ['role' => 'visitor', 'id' => 'short-test'];
$preferences = ['targetLanguage' => 'nl', 'mode' => 'automatic', 'consent' => true, 'liveConsent' => true];
$service->save($visitor, $thread, $preferences);
$checks = 0;
function checkShortTranslation(bool $value, string $message): void { global $checks; if (!$value) throw new RuntimeException($message); $checks++; }
function denyShortTranslation(callable $operation, int $status): void {
    try { $operation(); } catch (SupportChatFailure $failure) { checkShortTranslation($failure->status === $status, $failure->getMessage()); return; }
    throw new RuntimeException('Expected rejection');
}
$sequence = 0;
foreach (['Ja', 'JA!', 'nee...', 'Ok', 'OKÉ', 'Oke', 'Bedankt', 'Dank je wel!', 'Dankuwel', '  Ja?  '] as $text) {
    $sequence++;
    $chat->visitorAction('short-test', '127.0.0.1', ['action' => 'send', 'threadId' => $thread, 'text' => $text, 'clientId' => 'short-translation-' . $sequence]);
    $result = $service->translate($visitor, $thread, ['sequence' => $sequence, 'targetLanguage' => 'nl', 'automatic' => true]);
    checkShortTranslation($result['translationNeeded'] === false && $result['text'] === trim($text) && $result['provider'] === '', 'Keep Dutch acknowledgement without claiming provider translation');
}
$draft = ['live' => true, 'ownDraft' => true, 'sourceRole' => 'visitor', 'text' => 'Ja', 'targetLanguage' => 'nl', 'automatic' => true];
checkShortTranslation($service->translate($visitor, $thread, $draft)['translationNeeded'] === false, 'Own waiting-room RTT is also preserved');
checkShortTranslation($providerCalls === 0, 'No Google call for these Dutch-to-Dutch replies');
denyShortTranslation(fn() => $service->translate(['role' => 'visitor', 'id' => 'stranger'], $thread, $draft), 404);
denyShortTranslation(fn() => $service->translate($visitor, $thread, array_replace($draft, ['sourceRole' => 'staff'])), 403);
foreach (['Yes', 'ja bitte', 'Ja, waar is mijn pakket?'] as $text) $service->translate($visitor, $thread, array_replace($draft, ['text' => $text]));
checkShortTranslation($providerCalls === 3, 'Other short words and mixed/longer text still use translation');
$service->save($visitor, $thread, array_replace($preferences, ['targetLanguage' => 'en']));
$service->translate($visitor, $thread, array_replace($draft, ['targetLanguage' => 'en']));
checkShortTranslation($providerCalls === 4, 'Dutch Ja still translates when target is English');
$service->save($visitor, $thread, $preferences);
$chat->visitorAction('short-test', '127.0.0.1', ['action' => 'delete', 'threadId' => $thread, 'sequence' => 1, 'revision' => 0, 'clientId' => 'short-translation-delete']);
denyShortTranslation(fn() => $service->translate($visitor, $thread, ['sequence' => 1, 'targetLanguage' => 'nl']), 404);
$service->save($visitor, $thread, array_replace($preferences, ['liveConsent' => false]));
denyShortTranslation(fn() => $service->translate($visitor, $thread, $draft), 403);
$service->save($visitor, $thread, array_replace($preferences, ['mode' => 'off']));
denyShortTranslation(fn() => $service->translate($visitor, $thread, ['sequence' => 2, 'targetLanguage' => 'nl']), 403);
echo "Support short-translation passed: $checks checks; isolated fixtures only.\n";
