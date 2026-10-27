<?php
declare(strict_types=1);
require_once __DIR__ . '/SupportCallService.php';

final class SupportCallHttp
{
    public static function serve(PDO $pdo, string $role): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, private');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        try {
            $secure = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
            if (!$secure && !in_array($_SERVER['REMOTE_ADDR'] ?? '', ['127.0.0.1', '::1'], true)) throw new SupportChatFailure('Gebruik HTTPS voor deze oproep.', 403);
            $method = $_SERVER['REQUEST_METHOD'];
            if (!in_array($method, ['GET', 'POST'], true)) throw new SupportChatFailure('Methode niet toegestaan.', 405);
            if (($_SERVER['HTTP_SEC_FETCH_SITE'] ?? '') === 'cross-site') throw new SupportChatFailure('Open de oproep op de TeleTypTel-website.', 403);
            ini_set('session.use_strict_mode', '1');
            if ($role !== 'interpreter') session_name($role === 'staff' ? 'teletyptel_admin' : 'teletyptel_support');
            session_set_cookie_params(['httponly' => true, 'secure' => $secure, 'samesite' => 'Strict', 'path' => '/']);
            session_start();
            if ($role === 'staff') {
                $admin = SupportChatService::staff($pdo, $_SESSION);
                $actor = ['role' => 'staff', 'id' => $admin['admin_id'], 'version' => (int)$admin['session_version']];
            } elseif ($role === 'interpreter') {
                $account = InterpreterService::authorize($pdo, $_SESSION, 'GET', null);
                $actor = ['role' => 'interpreter', 'id' => $account, 'version' => (int)AccountAccess::state($pdo, $account)['version']];
            } else {
                $visitor = $_SESSION['support_chat_visitor'] ?? '';
                if (!is_string($visitor) || $visitor === '') throw new SupportChatFailure('Start eerst de klantenservice-chat.', 401);
                $actor = ['role' => 'visitor', 'id' => $visitor];
            }
            $_SESSION['support_call_csrf'] ??= bin2hex(random_bytes(32));
            $csrf = $_SESSION['support_call_csrf'];
            if ($method === 'POST' && (!is_string($_SERVER['HTTP_X_CSRF_TOKEN'] ?? null) || !hash_equals($csrf, $_SERVER['HTTP_X_CSRF_TOKEN']))) throw new SupportChatFailure('Ververs de oproep en probeer opnieuw.', 403);
            session_write_close();
            $service = new SupportCallService($pdo); $service->ensureSchema();
            if ($method === 'POST') {
                if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) throw new SupportChatFailure('JSON vereist.', 415);
                $raw = file_get_contents('php://input', false, null, 0, 70001);
                if (strlen($raw) > 70000) throw new SupportChatFailure('Aanvraag te groot.', 413);
                $input = json_decode($raw, true);
                if (!is_array($input)) throw new SupportChatFailure('Ongeldige aanvraag.');
                $result = $service->action($actor, $input);
            } else {
                $thread = $_GET['thread'] ?? ''; $call = $_GET['call'] ?? ''; $client = $_SERVER['HTTP_X_SUPPORT_CLIENT'] ?? '';
                if (!is_string($thread) || !is_string($call) || !is_string($client) || strlen($thread) > 64 || strlen($call) > 64) throw new SupportChatFailure('Ongeldige oproepreferentie.');
                $result = $service->view($actor, $thread, $call, $client);
            }
            echo json_encode(['ok' => true, 'csrfToken' => $csrf] + $result, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
        } catch (SupportChatFailure | InterpreterFailure $error) {
            http_response_code($error->status); echo json_encode(['ok' => false, 'message' => $error->getMessage()]);
        } catch (AccountAccessDenied $error) {
            http_response_code(401); echo json_encode(['ok' => false, 'message' => 'Je toegang tot deze oproep is ingetrokken.']);
        } catch (Throwable $error) {
            http_response_code(503); echo json_encode(['ok' => false, 'message' => 'Oproepen zijn tijdelijk niet bereikbaar. De gewone tekstchat blijft beschikbaar.']);
        }
    }
}
