<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . '/lib/Database.php';
require_once dirname(__DIR__, 2) . '/lib/IntakeHttp.php';

IntakeHttp::headers();
try {
    IntakeHttp::https();
    session_set_cookie_params(['httponly' => true, 'secure' => true, 'samesite' => 'Lax']);
    session_start();
    $pdo = Database::connect();
    AccountAccess::guardSession($pdo, $_SESSION);
    $intake = new IntakeManager($pdo);
    $_SESSION['teletyptel_intake_csrf'] ??= bin2hex(random_bytes(32));
    $accountId = $_SESSION['teletyptel_account_id'] ?? '';
    $statement = $pdo->prepare("SELECT account_id, display_name FROM account_profiles WHERE account_id = ? AND account_status IN ('active', 'trial')");
    $statement->execute([is_string($accountId) ? $accountId : '']);
    $account = $statement->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $fresh = $account !== null && IntakeHttp::fresh($_SESSION, $account['account_id']);
        IntakeHttp::json(['ok' => true, 'account' => $account, 'fresh' => $fresh,
            'freshUntil' => $fresh ? (int)$_SESSION['teletyptel_authenticated_at'] + 900 : 0,
            'csrfToken' => $_SESSION['teletyptel_intake_csrf'], 'plans' => $intake->plans(),
            'readiness' => $intake->readiness(), 'insurers' => $intake->insurers(),
            'application' => $fresh ? $intake->current($account['account_id']) : null]);
        return;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        IntakeHttp::json(['ok' => false, 'message' => 'Methode niet toegestaan.'], 405);
        return;
    }
    IntakeHttp::csrf($_SESSION['teletyptel_intake_csrf']);
    if ($account === null || !IntakeHttp::fresh($_SESSION, $account['account_id'])) {
        throw new IntakeDenied('Log opnieuw in bij Messenger en druk daarna op Aanmelding laden.');
    }
    if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > IntakeManager::MAX_FILE_BYTES + 65536) {
        throw new InvalidArgumentException('Maximaal 4 MB per document.');
    }
    $multipart = str_starts_with($_SERVER['CONTENT_TYPE'] ?? '', 'multipart/form-data');
    $input = $multipart ? $_POST : json_decode(file_get_contents('php://input', false, null, 0, 16385), true);
    if (!is_array($input)) {
        throw new InvalidArgumentException('Ongeldige aanvraag.');
    }
    if ($multipart) {
        $input['version'] = AdminSettings::integer($input['version'] ?? 0, 1, PHP_INT_MAX);
    }
    $accountId = $account['account_id'];
    $action = $input['action'] ?? '';
    if ($action === 'document') {
        IntakeHttp::download($intake->document(AdminSettings::text($input['id'] ?? '', 32),
            AdminSettings::text($input['documentId'] ?? '', 32), $accountId, 'user:' . $accountId));
        return;
    }
    if ($action === 'reveal_bsn') {
        IntakeHttp::json(['ok' => true, 'bsn' => $intake->revealBsn(AdminSettings::text($input['id'] ?? '', 32), $accountId, 'user:' . $accountId)]);
        return;
    }
    $application = match ($action) {
        'start' => $intake->start($accountId, $input),
        'save_details' => $intake->saveDetails($accountId, $input),
        'upload' => $intake->upload($accountId, $input, $_FILES['document'] ?? []),
        'submit' => $intake->submit($accountId, $input),
        'withdraw' => $intake->withdraw($accountId, $input),
        default => throw new InvalidArgumentException('Onbekende actie.'),
    };
    IntakeHttp::json(['ok' => true, 'application' => $application]);
} catch (AccountAccessDenied $error) {
    IntakeHttp::json(['ok' => false, 'message' => $error->getMessage()], 403);
} catch (IntakeDenied $error) {
    IntakeHttp::json(['ok' => false, 'message' => $error->getMessage()], 403);
} catch (IntakeUnavailable $error) {
    IntakeHttp::json(['ok' => false, 'message' => $error->getMessage()], 503);
} catch (SubscriptionConflict $error) {
    IntakeHttp::json(['ok' => false, 'message' => $error->getMessage()], 409);
} catch (InvalidArgumentException $error) {
    IntakeHttp::json(['ok' => false, 'message' => $error->getMessage()], 400);
} catch (Throwable $error) {
    error_log('TeleTypTel intake request failed: ' . get_class($error));
    IntakeHttp::json(['ok' => false, 'message' => 'Aanmelding niet beschikbaar. Probeer later opnieuw.'], 500);
}
