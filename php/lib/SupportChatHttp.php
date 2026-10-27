<?php
declare(strict_types=1);
require_once __DIR__ . '/SupportChatService.php';
require_once __DIR__ . '/SupportTranslationService.php';
require_once __DIR__ . '/AdminSettings.php';
require_once __DIR__ . '/SupportAttachment.php';

final class SupportChatHttp
{
    public static function serve(PDO $pdo, bool $staff, ?TranslationService $translator = null): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        try {
            $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
            if (!$secure && !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) throw new SupportChatFailure('Open deze chat via HTTPS.', 403);
            $method = $_SERVER['REQUEST_METHOD'];
            if (!in_array($method, ['GET', 'POST'], true)) throw new SupportChatFailure('Methode niet toegestaan.', 405);
            if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new SupportChatFailure('Open de chat op de TeleTypTel-website.', 403);
            ini_set('session.use_strict_mode', '1');
            session_name($staff ? 'teletyptel_admin' : 'teletyptel_support');
            session_set_cookie_params(['httponly' => true, 'secure' => $secure, 'samesite' => 'Strict', 'path' => '/']);
            session_start();
            $admin = $staff ? SupportChatService::staff($pdo, $_SESSION) : null;
            $_SESSION['support_chat_csrf'] ??= bin2hex(random_bytes(32));
            $csrf = $_SESSION['support_chat_csrf'];
            if (!$staff) $_SESSION['support_chat_visitor'] ??= bin2hex(random_bytes(24));
            $visitor = $staff ? '' : $_SESSION['support_chat_visitor'];
            if ($method === 'POST' && (!is_string($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null) || !hash_equals($csrf, $_SERVER['HTTP_X_CSRF_TOKEN']))) throw new SupportChatFailure('Ververs de chat en probeer opnieuw.', 403);
            session_write_close();
            $service = new SupportChatService($pdo);
            $service->ensureSchema();
            $service->cleanup();
            $translations = new SupportTranslationService($pdo, $translator ?? new TranslationService($pdo, (new AdminSettings())->configuration()['translation'] ?? []));
            $translations->ensureSchema();
            $actor = $staff ? ['role' => 'staff', 'id' => $admin['admin_id'], 'version' => (int)$admin['session_version']] : ['role' => 'visitor', 'id' => $visitor];
            $thread = $_GET['thread'] ?? '';
            if (!is_string($thread) || strlen($thread) > 64) throw new SupportChatFailure('Ongeldig gesprek.');
            if ($method === 'GET' && isset($_GET['attachment'])) {
                if (!is_string($_GET['attachment'])) throw new SupportChatFailure('Ongeldig bestand / Invalid file.');
                $file = $service->attachment($visitor, $admin, $thread, $_GET['attachment']);
                $bytes = base64_decode($file['content'], true);
                if ($bytes === false) throw new SupportChatFailure('Bestand niet beschikbaar / File unavailable.', 503);
                $inline = ($_GET['preview'] ?? '') === '1' && str_starts_with($file['mime'], 'image/');
                header('Content-Type: ' . $file['mime']);
                header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="download.' . pathinfo($file['name'], PATHINFO_EXTENSION) . '"; filename*=UTF-8\'\'' . rawurlencode($file['name']));
                header("Content-Security-Policy: default-src 'none'; sandbox");
                header('Cross-Origin-Resource-Policy: same-origin');
                header('Content-Length: ' . strlen($bytes));
                echo $bytes; return;
            }
            if ($method === 'POST') {
                $attachment = null;
                if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data') === 0) {
                    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > SupportAttachment::MAX_BYTES + 65536) throw new SupportChatFailure('Maximaal 5 MB per bestand / Maximum 5 MB per file.', 413);
                    if (count($_FILES) !== 1 || !is_array($_FILES['file'] ?? null)) throw new SupportChatFailure('Kies één bestand, maximaal 5 MB / Choose one file, maximum 5 MB.', 413);
                    $input = ['action' => 'send', 'threadId' => $_POST['threadId'] ?? null, 'clientId' => $_POST['clientId'] ?? null];
                    $attachment = SupportAttachment::upload($_FILES['file']);
                } else {
                    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) throw new SupportChatFailure('JSON vereist.', 415);
                    $body = file_get_contents('php://input', false, null, 0, 16001);
                    if (strlen($body) > 16000) throw new SupportChatFailure('Bericht te groot.', 413);
                    $input = json_decode($body, true);
                }
                if (!is_array($input)) throw new SupportChatFailure('Ongeldige aanvraag.');
                if (in_array($input['action'] ?? '', ['translation_settings', 'translate'], true)) {
                    $identifier = $input['threadId'] ?? '';
                    if (!is_string($identifier) || strlen($identifier) > 64) throw new SupportChatFailure('Ongeldig gesprek / Invalid chat.');
                    $result = ($input['action'] === 'translation_settings')
                        ? ['translationSettings' => $translations->save($actor, $identifier, $input)]
                        : ['translation' => $translations->translate($actor, $identifier, $input)];
                } else {
                    $startTranslation = !$staff && ($input['action'] ?? '') === 'start' && ($input['translationConsent'] ?? false) === true;
                    if ($startTranslation && (!is_string($input['targetLanguage'] ?? null) || !isset(TranslationService::LANGUAGES[$input['targetLanguage']]))) throw new SupportChatFailure('Kies een taal / Choose a language.');
                    $result = $staff ? $service->staffAction($admin, $input, $attachment) : $service->visitorAction($visitor, $_SERVER['REMOTE_ADDR'] ?? '', $input, $attachment);
                    if ($startTranslation) $translations->save($actor, $result['threadId'], ['targetLanguage' => $input['targetLanguage'], 'mode' => 'automatic', 'consent' => true, 'liveConsent' => true]);
                }
            } elseif ($staff) {
                $filter = $_GET['filter'] ?? 'open';
                if (!is_string($filter) || !is_scalar($_GET['page'] ?? 1)) throw new SupportChatFailure('Ongeldig filter.');
                $result = $service->staffView($admin, $thread, (int)($_GET['page'] ?? 1), $filter);
            } else $result = $service->visitorView($visitor, $thread);
            if (!empty($result['thread']) && (!$staff || $result['thread']['mine'])) $result['translationSettings'] = $translations->view($actor, $result['thread']['id']);
            echo json_encode(['ok' => true, 'csrfToken' => $csrf] + $result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        } catch (TranslationFailure $error) {
            http_response_code($error->status);
            if ($error->status === 429) header('Retry-After: 60');
            echo json_encode(['ok' => false, 'message' => $error->status === 429
                ? 'Vertaallimiet bereikt; probeer later / Translation limit reached; try later.'
                : 'Vertalen niet beschikbaar; origineel blijft behouden / Translation unavailable; original preserved.']);
        } catch (SupportChatFailure $error) {
            http_response_code($error->status);
            echo json_encode(['ok' => false, 'message' => $error->getMessage()]);
        } catch (Throwable $error) {
            http_response_code(503);
            echo json_encode(['ok' => false, 'message' => 'De klantenservice-chat is tijdelijk niet bereikbaar. Probeer het later opnieuw.']);
        }
    }
}
