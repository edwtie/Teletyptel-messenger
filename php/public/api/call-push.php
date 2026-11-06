<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/CallPushService.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    if (getenv('TELETYPTEL_CALL_PUSH_REGISTRY') !== '1') throw new CallPushFailure('Oproepmeldingen zijn niet ingeschakeld.', 404);
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') throw new CallPushFailure('Een beveiligde verbinding is vereist.', 403);
    session_set_cookie_params(['httponly' => true, 'secure' => true, 'samesite' => 'Strict']);
    session_start();
    $pdo = Database::connect();
    $method = $_SERVER['REQUEST_METHOD'] ?? '';
    $account = CallPushService::authorize($pdo, $_SESSION, $method, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? null);
    $key = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
    $service = new CallPushService($pdo, $key === false ? '' : $key, (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT'));
    $csrf = $_SESSION['teletyptel_call_push_csrf'] ?? bin2hex(random_bytes(32));
    $binding = $_SESSION['teletyptel_call_push_binding'] ?? bin2hex(random_bytes(32));
    if ($method === 'GET') {
        $result = ['devices' => $service->devices($account, $binding)];
    } else {
        if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
            throw new CallPushFailure('JSON is vereist.', 415);
        }
        $raw = file_get_contents('php://input', false, null, 0, 4097);
        if ($raw === false || strlen($raw) > 4096) throw new CallPushFailure('Aanvraag te groot.', 413);
        $input = json_decode($raw, true);
        if (!is_array($input)) throw new CallPushFailure('Ongeldige aanvraag.');
        if (($input['action'] ?? '') === 'register') {
            if (!is_string($input['deviceId'] ?? null) || !is_string($input['token'] ?? null) || ($input['consent'] ?? null) !== true) {
                throw new CallPushFailure('Toestemming en toestelregistratie zijn vereist.');
            }
            $result = $service->register($account, $binding, $input['deviceId'], $input['token'], true);
        } elseif (($input['action'] ?? '') === 'revoke-device') {
            if (!is_string($input['deviceId'] ?? null)) throw new CallPushFailure('Toestelregistratie is vereist.');
            $service->revokeDevice($account, $input['deviceId']);
            $result = ['revoked' => true];
        } elseif (($input['action'] ?? '') === 'revoke') {
            $service->revokeSession($account, $binding);
            $result = ['revoked' => true];
        } else {
            throw new CallPushFailure('Onbekende actie.');
        }
    }
    $_SESSION['teletyptel_call_push_csrf'] = $csrf;
    $_SESSION['teletyptel_call_push_binding'] = $binding;
    session_write_close();
    echo json_encode(['ok' => true, 'accountId' => $account, 'csrfToken' => $csrf] + $result, JSON_THROW_ON_ERROR);
} catch (CallPushFailure $error) {
    http_response_code($error->status);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
} catch (AccountAccessDenied $error) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Dit account heeft geen toegang.']);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Oproepmeldingen zijn tijdelijk niet beschikbaar.']);
}
