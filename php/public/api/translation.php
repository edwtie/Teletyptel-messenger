<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/TranslationService.php';
require_once dirname(__DIR__, 2) . '/lib/TranslationXmppService.php';

session_set_cookie_params(['httponly' => true, 'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off', 'samesite' => 'Lax']);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    $method = $_SERVER['REQUEST_METHOD'];
    if (!in_array($method, ['GET', 'POST'], true)) throw new TranslationFailure('method_not_allowed', 405);
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 32768) throw new TranslationFailure('invalid_text', 413);
    $pdo = Database::connect();
    $accountId = TranslationService::authorize($pdo, $_SESSION, $method, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
    $service = new TranslationService($pdo, (new AdminSettings())->configuration()['translation'] ?? []);
    $service->ensureSchema();
    if ($method === 'GET') {
        $xmpp = TranslationXmppService::configuration();
        $_SESSION['teletyptel_translation_csrf'] ??= bin2hex(random_bytes(32));
        echo json_encode(['ok' => true, 'accountId' => $accountId, 'csrfToken' => $_SESSION['teletyptel_translation_csrf'],
            'available' => $service->available(), 'provider' => 'Google Cloud Translation',
            'xmppServiceJid' => ($xmpp['enabled'] ?? false) === true ? ($xmpp['jid'] ?? '') : '',
            'languages' => TranslationService::LANGUAGES, 'preferences' => $service->preferences($accountId)], JSON_UNESCAPED_UNICODE);
    } else {
        $input = json_decode(file_get_contents('php://input', false, null, 0, 32769) ?: '', true);
        if (!is_array($input)) throw new TranslationFailure('invalid_request', 400);
        session_write_close();
        if (($input['action'] ?? '') === 'preferences') {
            $result = ['preferences' => $service->savePreferences($accountId, $input)];
        } elseif (($input['action'] ?? '') === 'translate') {
            $result = ['translation' => $service->translate($accountId, $input)];
        } else {
            throw new TranslationFailure('invalid_request', 400);
        }
        echo json_encode(['ok' => true] + $result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }
} catch (AccountAccessDenied $error) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'sign_in']);
} catch (TranslationFailure $error) {
    http_response_code($error->status);
    if ($error->status === 429) header('Retry-After: 60');
    echo json_encode(['ok' => false, 'error' => $error->errorCode]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'server_error']);
}
