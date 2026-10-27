<?php
declare(strict_types=1);
require_once __DIR__ . '/TranslationService.php';
require_once __DIR__ . '/SupportCallService.php';

final class SupportTranslationService
{
    private PDO $pdo;
    private TranslationService $translator;

    public function __construct(PDO $pdo, TranslationService $translator)
    {
        $this->pdo = $pdo; $this->translator = $translator;
    }

    public function ensureSchema(): void
    {
        $this->translator->ensureSchema();
        $suffix = $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci' : '';
        $this->pdo->exec("CREATE TABLE IF NOT EXISTS support_translation_preferences (
            thread_id VARCHAR(48) NOT NULL, actor_key VARCHAR(64) NOT NULL, target_language VARCHAR(16) NOT NULL,
            mode VARCHAR(16) NOT NULL, consent INTEGER NOT NULL DEFAULT 0, live_consent INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(thread_id, actor_key))" . $suffix);
        $this->pdo->exec('DELETE FROM support_translation_preferences WHERE NOT EXISTS (SELECT 1 FROM support_chat_threads WHERE support_chat_threads.thread_id = support_translation_preferences.thread_id)');
    }

    private function row(string $sql, array $params): ?array
    {
        $statement = $this->pdo->prepare($sql); $statement->execute($params); return $statement->fetch(PDO::FETCH_ASSOC) ?: null;
    }

    private function key(array $actor): string
    {
        return hash('sha256', $actor['role'] . ':' . $actor['id'] . ':' . ($actor['version'] ?? 0));
    }

    private function thread(array $actor, string $identifier): array
    {
        $thread = $this->row('SELECT * FROM support_chat_threads WHERE thread_id = ?', [$identifier]);
        if (!$thread) throw new SupportChatFailure('Gesprek niet gevonden / Chat not found.', 404);
        if ($actor['role'] === 'visitor') {
            if (!hash_equals($thread['visitor_id'], $actor['id'])) throw new SupportChatFailure('Gesprek niet gevonden / Chat not found.', 404);
        } elseif ($actor['role'] === 'staff') {
            $staff = $this->row("SELECT admin_id FROM admin_users WHERE admin_id = ? AND enabled = 1 AND session_version = ? AND role IN ('owner', 'admin', 'staff')", [$actor['id'], $actor['version']]);
            if (!$staff) throw new SupportChatFailure('Log opnieuw in / Sign in again.', 401);
            if ($thread['staff_id'] !== $actor['id'] || (int)$thread['staff_version'] !== (int)$actor['version']) throw new SupportChatFailure('Alleen de toegewezen medewerker mag vertalen.', 403);
        } else throw new SupportChatFailure('Geen toegang / Access denied.', 403);
        return $thread;
    }

    private function preferences(string $thread, array $actor): array
    {
        $row = $this->row('SELECT * FROM support_translation_preferences WHERE thread_id = ? AND actor_key = ?', [$thread, $this->key($actor)]) ?? [];
        $staff = $actor['role'] === 'staff';
        return ['targetLanguage' => $row['target_language'] ?? ($staff ? 'nl' : ''), 'mode' => $row['mode'] ?? ($staff ? 'automatic' : 'off'),
            'consent' => !$staff && (bool)($row['consent'] ?? false), 'liveConsent' => !$staff && (bool)($row['live_consent'] ?? false)];
    }

    public function view(array $actor, string $identifier): array
    {
        $thread = $this->thread($actor, $identifier);
        $visitor = $this->preferences($identifier, ['role' => 'visitor', 'id' => $thread['visitor_id']]);
        $preferences = $this->preferences($identifier, $actor);
        $visitorConsent = $visitor['consent'] && $visitor['mode'] === 'automatic';
        $allowed = $visitorConsent && $preferences['mode'] === 'automatic';
        return ['available' => $this->translator->available(), 'languages' => TranslationService::LANGUAGES,
            'preferences' => $preferences, 'visitorConsent' => $visitorConsent,
            'canTranslate' => $allowed, 'canTranslateLive' => $allowed && $visitor['liveConsent']];
    }

    public function save(array $actor, string $identifier, array $input): array
    {
        $this->thread($actor, $identifier);
        $target = $input['targetLanguage'] ?? null; $mode = $input['mode'] ?? null;
        if (!is_string($target) || !isset(TranslationService::LANGUAGES[$target]) || !in_array($mode, ['off', 'automatic'], true)) throw new SupportChatFailure('Kies een taal en vertaalmodus / Choose a language and mode.');
        $consent = $actor['role'] === 'visitor' && ($input['consent'] ?? false) === true;
        if ($actor['role'] === 'visitor' && $mode !== 'off' && !$consent) throw new SupportChatFailure('Toestemming voor Google vereist / Google consent required.', 403);
        $consent = $consent && $mode !== 'off';
        $sql = 'INSERT INTO support_translation_preferences (thread_id, actor_key, target_language, mode, consent, live_consent) VALUES (?, ?, ?, ?, ?, ?) ';
        $sql .= $this->pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql'
            ? 'ON DUPLICATE KEY UPDATE target_language = VALUES(target_language), mode = VALUES(mode), consent = VALUES(consent), live_consent = VALUES(live_consent)'
            : 'ON CONFLICT(thread_id, actor_key) DO UPDATE SET target_language = excluded.target_language, mode = excluded.mode, consent = excluded.consent, live_consent = excluded.live_consent';
        $this->pdo->prepare($sql)->execute([$identifier, $this->key($actor), $target, $mode, (int)$consent, (int)($consent && ($input['liveConsent'] ?? false) === true)]);
        return $this->view($actor, $identifier);
    }

    private function checkLiveCall(array $actor, string $identifier, array $input): void
    {
        $callId = $input['callId'] ?? ''; $client = $input['clientId'] ?? '';
        if (!is_string($callId) || !is_string($client) || !in_array($input['sourceRole'] ?? '', ['visitor', 'staff'], true)) throw new SupportChatFailure('Ongeldige live aanvraag / Invalid live request.');
        if (!$this->row('SELECT call_id FROM support_calls WHERE call_id = ? AND thread_id = ?', [$callId, $identifier])) throw new SupportChatFailure('Oproep niet gevonden / Call not found.', 404);
        $call = (new SupportCallService($this->pdo))->view($actor, $identifier, $callId, $client);
        $members = array_column($call['members'], null, 'role');
        if (($call['call']['status'] ?? '') !== 'active' || empty($members[$actor['role']]['owned']) || empty($members['visitor']['joined']) || empty($members['staff']['joined'])) throw new SupportChatFailure('Neem eerst deel aan RTT / Join RTT first.', 403);
    }

    private function checkLiveAccess(array $actor, string $identifier, array $input, array $thread): void
    {
        if (($input['ownDraft'] ?? false) === true) {
            if (!in_array($thread['status'], ['waiting', 'active'], true) || ($input['sourceRole'] ?? '') !== $actor['role']) throw new SupportChatFailure('Geen toegang tot eigen concept / Own draft not allowed.', 403);
            return;
        }
        if ($thread['status'] !== 'active') throw new SupportChatFailure('Live vertaling staat uit / Live translation is off.', 403);
        $this->checkLiveCall($actor, $identifier, $input);
    }

    public function translate(array $actor, string $identifier, array $input): array
    {
        $thread = $this->thread($actor, $identifier);
        $settings = $this->view($actor, $identifier);
        $preferences = $settings['preferences'];
        if (!$settings['canTranslate']) throw new SupportChatFailure('Vertaling staat uit / Translation is off.', 403);
        if (($input['targetLanguage'] ?? '') !== $preferences['targetLanguage']) throw new SupportChatFailure('Taal gewijzigd / Language changed.', 409);
        if (($input['automatic'] ?? false) && $preferences['mode'] !== 'automatic') throw new SupportChatFailure('Automatische vertaling staat uit / Automatic translation is off.', 403);
        if (($input['live'] ?? false) === true) {
            if (!$settings['canTranslateLive']) throw new SupportChatFailure('Live vertaling staat uit / Live translation is off.', 403);
            $this->checkLiveAccess($actor, $identifier, $input, $thread);
            $text = $input['text'] ?? null;
            if (!is_string($text) || strlen($text) > 8000 || preg_match_all('/./us', $text) > 2000) throw new SupportChatFailure('Live tekst te lang / Live text too long.');
        } else {
            if (!is_int($input['sequence'] ?? null)) throw new SupportChatFailure('Ongeldig bericht / Invalid message.');
            $messageSql = 'SELECT message.body, message.author_kind, message.author_id, COALESCE(state.revision, 0) AS revision, state.deleted_at FROM support_chat_messages message LEFT JOIN support_chat_message_state state ON state.thread_id = message.thread_id AND state.sequence = message.sequence WHERE message.thread_id = ? AND message.sequence = ?';
            $message = $this->row($messageSql, [$identifier, $input['sequence']]);
            if (!$message || $message['deleted_at'] !== null) throw new SupportChatFailure('Bericht niet gevonden / Message not found.', 404);
            if (isset($input['messageRevision']) && (!is_int($input['messageRevision']) || $input['messageRevision'] !== (int)$message['revision'])) throw new SupportChatFailure('Bericht gewijzigd / Message changed.', 409);
            if ($message['body'] === '') throw new SupportChatFailure('Bestanden worden niet vertaald / Files are not translated.');
            if ($message['author_kind'] === 'staff' && $message['author_id'] !== $thread['staff_id']) throw new SupportChatFailure('Vertaling van eerdere medewerkers niet beschikbaar / Translation of previous agents is unavailable.', 403);
            $text = $message['body'];
        }
        $alreadyDutch = $preferences['targetLanguage'] === 'nl'
            && preg_match('/\A\s*(?:ja|nee|ok[eé]?|bedankt|dank\s*(?:je|u)(?:\s*wel)?)[\s,.!?…]*\z/iu', $text) === 1;
        $result = $alreadyDutch
            ? ['text' => $text, 'targetLanguage' => 'nl', 'sourceLanguage' => '', 'provider' => '', 'translationNeeded' => false]
            : $this->translator->translateAuthorizedText('support:' . $this->key($actor), $text, $preferences['targetLanguage']);
        $current = $this->view($actor, $identifier);
        $currentThread = $this->thread($actor, $identifier);
        if ($current['preferences'] !== $preferences || !$current['canTranslate']
            || $currentThread['staff_id'] !== $thread['staff_id'] || $currentThread['staff_version'] !== $thread['staff_version']
            || (($input['live'] ?? false) && (!$current['canTranslateLive'] || $currentThread['status'] === 'closed'))) throw new SupportChatFailure('Vertaalinstellingen of gesprek gewijzigd / Translation settings or chat changed.', 409);
        if (($input['live'] ?? false) === true) $this->checkLiveAccess($actor, $identifier, $input, $currentThread);
        elseif ($message !== $this->row($messageSql, [$identifier, $input['sequence']])) throw new SupportChatFailure('Bericht gewijzigd / Message changed.', 409);
        return $result;
    }
}
