<?php
declare(strict_types=1);
require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/CallPushRecovery.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
try {
    if (getenv('TELETYPTEL_CALL_RECOVERY_LAB') !== '1' || getenv('TELETYPTEL_CALL_PUSH_REGISTRY') !== '1') throw new CallPushFailure('Oproepherstel niet ingeschakeld.', 404);
    if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') throw new CallPushFailure('Beveiligde verbinding vereist.', 403);
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') throw new CallPushFailure('Methode niet toegestaan.', 405);
    if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') throw new CallPushFailure('JSON vereist.', 415);
    if (!preg_match('/\ABearer (tcd1\.[A-Za-z0-9_-]{40,1800})\z/', $_SERVER['HTTP_AUTHORIZATION'] ?? '', $match)) throw new CallPushFailure('Oproeptoegang vereist.', 401);
    $raw = file_get_contents('php://input', false, null, 0, 4097);
    $input = is_string($raw) && strlen($raw) <= 4096 ? json_decode($raw, true) : null;
    if (!is_array($input)) throw new CallPushFailure('Ongeldige aanvraag.');
    $result = CallPushRecovery::configured(Database::connect())->handle($match[1], $input);
    echo json_encode($result, JSON_THROW_ON_ERROR);
} catch (CallPushFailure $error) {
    http_response_code($error->status);
    echo json_encode(['error' => 'Oproepherstel niet beschikbaar.', 'code' => $error->status === 425 ? 'resource_proof_pending' : 'rejected']);
} catch (AccountAccessDenied $error) {
    http_response_code(403);
    echo json_encode(['error' => 'Oproepherstel niet beschikbaar.', 'code' => 'rejected']);
} catch (Throwable $error) {
    http_response_code(503);
    echo json_encode(['error' => 'Oproepherstel tijdelijk niet beschikbaar.']);
}
