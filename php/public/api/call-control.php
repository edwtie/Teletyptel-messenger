<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/CallPushService.php';
require_once dirname(__DIR__, 2) . '/lib/CallPushPolicy.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

try {
    if (getenv('TELETYPTEL_CALL_PUSH_REGISTRY') !== '1' || getenv('TELETYPTEL_CALL_PUSH_NATIVE_CONTROL') !== '1') {
        throw new CallPushFailure('Oproepmeldingen zijn niet ingeschakeld.', 404);
    }
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') throw new CallPushFailure('Een beveiligde verbinding is vereist.', 403);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new CallPushFailure('Methode niet toegestaan.', 405);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') {
        throw new CallPushFailure('JSON is vereist.', 415);
    }
    $authorization = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/\ABearer ([0-9a-f]{2,960}\.[0-9a-f]{64})\z/', $authorization, $matches)) {
        throw new CallPushFailure('Oproeptoegang vereist.', 401);
    }
    $raw = file_get_contents('php://input', false, null, 0, 16385);
    if ($raw === false || strlen($raw) > 16384) throw new CallPushFailure('Aanvraag te groot.', 413);
    $input = json_decode($raw, true);
    if (!is_array($input) || array_keys($input) !== ['calls'] || !is_array($input['calls'])) {
        throw new CallPushFailure('Ongeldige oproeplijst.');
    }
    $pdo = Database::connect();
    $key = base64_decode((string)getenv('TELETYPTEL_CALL_PUSH_STORAGE_KEY'), true);
    $service = new CallPushService($pdo, $key === false ? '' : $key,
        (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT'), CallPushPolicy::load($pdo));
    echo json_encode(['ok' => true, 'calls' => $service->reconcileControl($matches[1], $input['calls'])], JSON_THROW_ON_ERROR);
} catch (CallPushFailure $error) {
    http_response_code($error->status);
    echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
} catch (AccountAccessDenied $error) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Oproeptoegang ingetrokken.']);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['ok' => false, 'error' => 'Oproepmeldingen zijn tijdelijk niet beschikbaar.']);
}
