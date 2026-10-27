<?php
declare(strict_types=1);

require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'Database.php';
require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'AdminUserDirectory.php';
require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'SubscriptionManager.php';
require_once dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'lib' . DIRECTORY_SEPARATOR . 'BillingManager.php';
require_once dirname(__DIR__, 2) . '/lib/IntakeAdmin.php';
require_once dirname(__DIR__, 2) . '/lib/AdminSession.php';
require_once dirname(__DIR__, 2) . '/lib/AdminAccountActions.php';
require_once dirname(__DIR__, 2) . '/lib/AdminPlanConfiguration.php';

session_name('teletyptel_admin');
session_set_cookie_params([
    'httponly' => true,
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'samesite' => 'Strict',
]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');

try {
    $pdo = Database::connect();
    ensureAdminSchema($pdo);
    AccountAccess::ensureSchema($pdo);
    $requestInput = null;

    if ($_SERVER['REQUEST_METHOD'] === 'GET' && ($_GET['action'] ?? '') === 'session') {
        $admin = currentAdminUser($pdo);
        jsonResponse([
            'ok' => true,
            'admin' => $admin !== null ? adminUserToClient($admin) : null,
            'csrfToken' => adminCsrfToken(),
            'setupRequired' => scalarInt($pdo, 'SELECT COUNT(*) FROM admin_users') === 0,
            'localSetupAllowed' => isLocalRequest(),
        ]);
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $requestInput = json_decode(file_get_contents('php://input') ?: '', true);
        if (!is_array($requestInput)) {
            jsonResponse(['ok' => false, 'error' => 'invalid_json'], 400);
            return;
        }

        $action = cleanAdminText($requestInput['action'] ?? 'update_account', 32);
        requireAdminCsrf();
        if ($action === 'setup') {
            setupAdmin($pdo, $requestInput);
            return;
        }
        if ($action === 'login') {
            loginAdmin($pdo, $requestInput);
            return;
        }
        if ($action === 'logout') {
            logoutAdmin();
            return;
        }
    }

    $action = $_SERVER['REQUEST_METHOD'] === 'GET' ? adminQuery('action', 'overview') : ($action ?? '');
    if (str_starts_with($action, 'intake_')) {
        handleIntakeAdmin($pdo, $action, $requestInput);
        return;
    }
    requireAdminAccess($pdo);
    $subscriptions = new SubscriptionManager($pdo);
    $subscriptions->ensureSchema();
    $billing = new BillingManager($pdo);
    $billing->ensureSchema();

    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $action = adminQuery('action', 'overview');
        if ($action === 'users') {
            $directory = new AdminUserDirectory($pdo);
            $users = $directory->users(adminQuery('search'), adminQuery('status'), (int)adminQuery('page', '1'));
            $directory->recordAccess(adminActorId($pdo), 'users_list');
            jsonResponse(['ok' => true, 'users' => $users, 'plans' => $subscriptions->plans()]);
        } elseif ($action === 'user') {
            readAdminUser($pdo);
        } elseif ($action === 'overview') {
            readAdminData($pdo);
        } elseif ($action === 'dashboard') {
            readAdminData($pdo, false);
        } elseif ($action === 'logs') {
            readAdminLogs($pdo);
        } elseif ($action === 'plans') {
            $intakeConfig = null;
            if ((currentAdminUser($pdo)['role'] ?? '') === 'owner') {
                $intake = new IntakeManager($pdo);
                $intake->ensureSchema();
                $intakeConfig = ['plans' => $intake->plans(true), 'readiness' => $intake->readiness()];
            }
            (new AdminUserDirectory($pdo))->recordAccess(adminActorId($pdo), 'view_plans');
            jsonResponse(['ok' => true, 'plans' => $subscriptions->plans(), 'intake' => $intakeConfig,
                'history' => $subscriptions->history('', (int)adminQuery('page', '1')),
                'schedules' => $subscriptions->schedules('', (int)adminQuery('schedulePage', '1')), 'worker' => workerStatus()]);
        } elseif ($action === 'subscription') {
            $account = $subscriptions->account(adminQuery('accountId'));
            (new AdminUserDirectory($pdo))->recordAccess(adminActorId($pdo), 'view_subscription', $account['account_id']);
            jsonResponse(['ok' => true, 'account' => $account, 'plans' => $subscriptions->plans(),
                'history' => $subscriptions->history($account['account_id']), 'schedules' => $subscriptions->schedules($account['account_id'])]);
        } elseif ($action === 'settings') {
            $owner = requireSettingsOwner($pdo);
            (new AdminUserDirectory($pdo))->recordAccess($owner['admin_id'], 'view_settings');
            jsonResponse(['ok' => true, 'settings' => (new AdminSettings())->view()]);
        } elseif ($action === 'billing') {
            (new AdminUserDirectory($pdo))->recordAccess(adminActorId($pdo), 'view_billing');
            jsonResponse(['ok' => true, 'invoices' => $billing->listing((int)adminQuery('page', '1')),
                'recurring' => $billing->recurringList(), 'defaults' => (new AdminSettings())->view()['billing'], 'worker' => workerStatus()]);
        } elseif ($action === 'invoice') {
            $invoice = $billing->invoice(adminQuery('id'));
            (new AdminUserDirectory($pdo))->recordAccess(adminActorId($pdo), 'view_invoice', $invoice['account_id']);
            jsonResponse(['ok' => true, 'invoice' => $invoice]);
        } elseif ($action === 'billing_account') {
            $account = $subscriptions->account(adminQuery('accountId'));
            (new AdminUserDirectory($pdo))->recordAccess(adminActorId($pdo), 'view_billing_account', $account['account_id']);
            jsonResponse(['ok' => true, 'account' => $account, 'plans' => $subscriptions->plans(),
                'recurring' => $billing->recurring($account['account_id']), 'defaults' => (new AdminSettings())->view()['billing']]);
        } else {
            jsonResponse(['ok' => false, 'error' => 'unknown_action'], 400);
        }
        return;
    }

    if ($_SERVER['REQUEST_METHOD'] === 'POST' && is_array($requestInput)) {
        if ($action === 'bulk_accounts') {
            jsonResponse(['ok' => true] + (new AdminAccountActions($pdo))->apply($requestInput, currentAdminUser($pdo)));
            return;
        }
        if (in_array($action, ['test_settings', 'save_settings'], true)) {
            $owner = requireSettingsOwner($pdo);
            $password = $requestInput['ownerPassword'] ?? '';
            if (!is_string($password) || !password_verify($password, $owner['password_hash'])) {
                jsonResponse(['ok' => false, 'message' => 'Bevestig met je huidige beheerwachtwoord.'], 403);
                return;
            }
            $settings = new AdminSettings();
            $candidate = $settings->candidate($requestInput);
            $settings->test($candidate, $owner);
            if ($action === 'save_settings') {
                $settings->save($candidate, AdminSettings::text($requestInput['revision'] ?? '', 64));
                (new AdminUserDirectory($pdo))->recordAccess($owner['admin_id'], 'save_settings');
            }
            jsonResponse(['ok' => true, 'settings' => $settings->view()]);
            return;
        }
        if ($action === 'schedule_subscription') {
            jsonResponse(['ok' => true] + $subscriptions->schedule($requestInput, adminActorId($pdo)));
            return;
        }
        if ($action === 'cancel_schedule') {
            jsonResponse(['ok' => true] + $subscriptions->cancelSchedule(AdminSettings::integer($requestInput['id'] ?? 0, 1, PHP_INT_MAX), adminActorId($pdo)));
            return;
        }
        if ($action === 'save_invoice') {
            jsonResponse(['ok' => true, 'invoice' => $billing->saveDraft($requestInput, adminActorId($pdo))]);
            return;
        }
        if ($action === 'issue_invoice') {
            if (($requestInput['confirmed'] ?? false) !== true) {
                throw new InvalidArgumentException('Bevestig het definitief maken van de factuur.');
            }
            jsonResponse(['ok' => true, 'invoice' => $billing->issue(AdminSettings::text($requestInput['id'] ?? '', 32),
                AdminSettings::integer($requestInput['version'] ?? 0, 1, PHP_INT_MAX), adminActorId($pdo))]);
            return;
        }
        if ($action === 'invoice_paid') {
            jsonResponse(['ok' => true, 'invoice' => $billing->paid(AdminSettings::text($requestInput['id'] ?? '', 32),
                AdminSettings::text($requestInput['paidOn'] ?? '', 10), AdminSettings::text($requestInput['reference'] ?? '', 128), adminActorId($pdo))]);
            return;
        }
        if ($action === 'save_recurring') {
            jsonResponse(['ok' => true, 'recurring' => $billing->saveRecurring($requestInput, adminActorId($pdo))]);
            return;
        }
        if (in_array($action, ['create_plan', 'update_plan'], true)) {
            if (array_key_exists('intake', $requestInput)) IntakeHttp::https();
            $plan = array_key_exists('intake', $requestInput)
                ? (new AdminPlanConfiguration($pdo))->save($requestInput, currentAdminUser($pdo), $action === 'create_plan')
                : $subscriptions->savePlan($requestInput, adminActorId($pdo), $action === 'create_plan');
            jsonResponse(['ok' => true, 'plan' => $plan]);
            return;
        }
        if ($action === 'change_subscription') {
            jsonResponse(['ok' => true] + $subscriptions->change($requestInput, adminActorId($pdo)));
            return;
        }
        if ($action !== 'update_account') {
            jsonResponse(['ok' => false, 'error' => 'unknown_action'], 400);
            return;
        }
        updateAccountAdminFields($pdo, $requestInput);
        return;
    }

    jsonResponse(['ok' => false, 'error' => 'method_not_allowed'], 405);
} catch (AccountAccessDenied $error) {
    jsonResponse(['ok' => false, 'message' => $error->getMessage()], 403);
} catch (IntakeDenied $error) {
    jsonResponse(['ok' => false, 'message' => $error->getMessage()], 403);
} catch (IntakeUnavailable $error) {
    jsonResponse(['ok' => false, 'message' => $error->getMessage()], 503);
} catch (SubscriptionConflict $error) {
    jsonResponse(['ok' => false, 'error' => 'subscription_conflict', 'message' => $error->getMessage()], 409);
} catch (InvalidArgumentException $error) {
    jsonResponse(['ok' => false, 'error' => 'invalid_filter', 'message' => $error->getMessage()], 400);
} catch (Throwable $error) {
    error_log('TeleTypTel admin request failed: ' . get_class($error));
    jsonResponse(['ok' => false, 'error' => 'server_error', 'message' => 'Beheer kon de aanvraag niet verwerken.'], 500);
}

function requireSettingsOwner(PDO $pdo): array
{
    $owner = currentAdminUser($pdo);
    if ($owner === null || $owner['role'] !== 'owner') {
        jsonResponse(['ok' => false, 'message' => 'Alleen de eigenaar kan algemene instellingen beheren.'], 403);
        exit;
    }
    return $owner;
}

function workerStatus(): array
{
    $path = dirname(__DIR__, 2) . '/storage/admin-worker.json';
    $status = is_file($path) ? json_decode(file_get_contents($path), true) : [];
    return ['lastRun' => $status['lastRun'] ?? null, 'ok' => (bool)($status['ok'] ?? false)];
}

function requireAdminAccess(PDO $pdo): void
{
    $admin = currentAdminUser($pdo);
    if ($admin !== null && in_array($admin['role'], ['owner', 'admin'], true)) {
        return;
    }

    $configuredToken = adminToken();
    $providedToken = cleanAdminText($_SERVER['HTTP_X_TELETYPTEL_ADMIN_TOKEN'] ?? '', 255);
    if ($configuredToken !== '' && hash_equals($configuredToken, $providedToken)) {
        return;
    }

    jsonResponse(['ok' => false, 'error' => 'admin_login_required', 'message' => 'Log in met een bevoegd beheeraccount.'], $admin === null ? 401 : 403);
    exit;
}

function adminCsrfToken(): string
{
    if (!isset($_SESSION['teletyptel_admin_csrf'])) {
        $_SESSION['teletyptel_admin_csrf'] = bin2hex(random_bytes(32));
    }
    return (string)$_SESSION['teletyptel_admin_csrf'];
}

function requireAdminCsrf(): void
{
    $configuredToken = adminToken();
    $providedToken = (string)($_SERVER['HTTP_X_TELETYPTEL_ADMIN_TOKEN'] ?? '');
    if ($configuredToken !== '' && hash_equals($configuredToken, $providedToken)) {
        return;
    }
    if (!hash_equals(adminCsrfToken(), (string)($_SERVER['HTTP_X_TELETYPTEL_CSRF'] ?? ''))) {
        jsonResponse(['ok' => false, 'error' => 'csrf_required', 'message' => 'Ververs de beheerpagina en probeer opnieuw.'], 403);
        exit;
    }
}

function setupAdmin(PDO $pdo, array $input): void
{
    if (!isLocalRequest() || scalarInt($pdo, 'SELECT COUNT(*) FROM admin_users') !== 0) {
        jsonResponse(['ok' => false, 'error' => 'setup_unavailable'], 403);
        return;
    }
    $email = strtolower(cleanAdminText($input['email'] ?? '', 255));
    $password = is_string($input['password'] ?? null) ? $input['password'] : '';
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($password) < 12 || strlen($password) > 72) {
        jsonResponse(['ok' => false, 'error' => 'invalid_setup', 'message' => 'Gebruik een geldig e-mailadres en een wachtwoord van minimaal 12 tekens (maximaal 72 bytes).'], 400);
        return;
    }
    try {
        $pdo->prepare('INSERT INTO admin_users (admin_id, email, display_name, password_hash, role)
            VALUES (?, ?, ?, ?, ?)')->execute([
                'initial-owner', $email, cleanAdminText($input['displayName'] ?? '', 120),
                password_hash($password, PASSWORD_DEFAULT), 'owner',
            ]);
    } catch (PDOException $error) {
        if ($error->getCode() !== '23000') {
            throw $error;
        }
        jsonResponse(['ok' => false, 'error' => 'setup_unavailable'], 409);
        return;
    }
    (new AdminUserDirectory($pdo))->recordAccess('initial-owner', 'admin_setup');
    loginAdmin($pdo, $input);
}

function adminActorId(PDO $pdo): string
{
    $admin = currentAdminUser($pdo);
    return $admin !== null ? (string)$admin['admin_id'] : 'emergency-token';
}

function adminQuery(string $key, string $fallback = ''): string
{
    $value = $_GET[$key] ?? $fallback;
    if (!is_string($value)) {
        throw new InvalidArgumentException('Ongeldig filter.');
    }
    return $value;
}

function readAdminUser(PDO $pdo): void
{
    $accountId = adminQuery('accountId');
    if ($accountId === '' || strlen($accountId) > 96) {
        jsonResponse(['ok' => false, 'error' => 'invalid_account_id'], 400);
        return;
    }
    $directory = new AdminUserDirectory($pdo);
    $account = $directory->user($accountId);
    if ($account === null) {
        jsonResponse(['ok' => false, 'error' => 'account_not_found'], 404);
        return;
    }
    $filters = [];
    foreach (['from', 'to', 'kind', 'peer', 'page'] as $key) {
        $filters[$key] = adminQuery($key);
    }
    $activity = $directory->activity($accountId, $filters);
    $directory->recordAccess(adminActorId($pdo), 'view_user_activity', $accountId);
    jsonResponse(['ok' => true, 'account' => $account, 'activity' => $activity]);
}

function loginAdmin(PDO $pdo, array $input): void
{
    $email = strtolower(cleanAdminText($input['email'] ?? '', 255));
    $password = is_string($input['password'] ?? null) ? $input['password'] : '';
    if ($email === '' || $password === '') {
        jsonResponse(['ok' => false, 'error' => 'missing_credentials'], 400);
        return;
    }

    $statement = $pdo->prepare('SELECT * FROM admin_users WHERE email = :email AND enabled = 1 LIMIT 1');
    $statement->execute(['email' => $email]);
    $row = $statement->fetch();
    if (!is_array($row) || !in_array($row['role'], ['owner', 'admin', 'staff'], true) || !password_verify($password, (string)($row['password_hash'] ?? ''))) {
        jsonResponse(['ok' => false, 'error' => 'invalid_credentials'], 401);
        return;
    }

    session_regenerate_id(true);
    $_SESSION['teletyptel_admin_id'] = (string)$row['admin_id'];
    $_SESSION['teletyptel_admin_session_version'] = (int)$row['session_version'];
    $_SESSION['teletyptel_admin_last_activity'] = time();
    unset($_SESSION['teletyptel_admin_csrf']);
    $pdo->prepare('UPDATE admin_users SET last_login_at = NOW() WHERE admin_id = :admin_id')
        ->execute(['admin_id' => $row['admin_id']]);
    (new AdminUserDirectory($pdo))->recordAccess((string)$row['admin_id'], 'admin_login');
    jsonResponse(['ok' => true, 'admin' => adminUserToClient($row), 'csrfToken' => adminCsrfToken()]);
}

function logoutAdmin(): void
{
    $_SESSION = [];
    session_regenerate_id(true);
    jsonResponse(['ok' => true, 'csrfToken' => adminCsrfToken()]);
}

function currentAdminUser(PDO $pdo): ?array
{
    return AdminSession::current($pdo, $_SESSION);
}

function adminToken(): string
{
    $env = getenv('TELETYPTEL_ADMIN_TOKEN');
    if (is_string($env) && $env !== '') {
        return $env;
    }

    $path = dirname(__DIR__, 2) . DIRECTORY_SEPARATOR . 'config.php';
    if (!is_file($path)) {
        return '';
    }

    $config = require $path;
    if (!is_array($config)) {
        return '';
    }

    $admin = $config['admin'] ?? [];
    return is_array($admin) ? cleanAdminText($admin['token'] ?? '', 255) : '';
}

function isLocalRequest(): bool
{
    $remote = $_SERVER['REMOTE_ADDR'] ?? '';
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $host = preg_replace('/:\d+$/', '', $host) ?: $host;
    return in_array($remote, ['127.0.0.1', '::1'], true)
        && in_array($host, ['127.0.0.1', '::1', '[::1]', 'localhost'], true);
}

function readAdminData(PDO $pdo, bool $includeUsers = true): void
{
    $admin = currentAdminUser($pdo);
    $directory = new AdminUserDirectory($pdo);
    $directory->recordAccess(adminActorId($pdo), $includeUsers ? 'users_list' : 'view_dashboard');
    $data = [
        'ok' => true,
        'generatedAt' => gmdate('c'),
        'admin' => $admin !== null ? adminUserToClient($admin) : null,
        'server' => serverSummary($pdo),
        'stats' => statsSummary($pdo),
    ];
    if ($includeUsers) {
        $users = $directory->users(adminQuery('search'), adminQuery('status'), (int)adminQuery('page', '1'));
        $data['accounts'] = $users['items'];
        $data['users'] = $users;
        $data['logs'] = logRows($pdo);
    }
    jsonResponse($data);
}

function readAdminLogs(PDO $pdo): void
{
    (new AdminUserDirectory($pdo))->recordAccess(adminActorId($pdo), 'view_logs');
    jsonResponse(['ok' => true, 'logs' => logRows($pdo)]);
}

function updateAccountAdminFields(PDO $pdo, array $input): void
{
    $accountId = cleanAdminText($input['accountId'] ?? '', 96);
    if ($accountId === '') {
        jsonResponse(['ok' => false, 'error' => 'missing_account_id'], 400);
        return;
    }

    if (array_key_exists('subscriptionPlan', $input) || array_key_exists('subscriptionExpiresAt', $input)) {
        throw new InvalidArgumentException('Gebruik Abonnement wijzigen voor een planovergang. Ververs deze pagina.');
    }
    (new SubscriptionManager($pdo))->account($accountId);
    $accountStatus = normalizeAccountStatus($input['accountStatus'] ?? 'active');
    $adminNote = cleanAdminText($input['adminNote'] ?? '', 1000);

    $statement = $pdo->prepare(
        'UPDATE account_profiles
         SET account_status = :account_status,
             admin_note = :admin_note
         WHERE account_id = :account_id'
    );
    $statement->execute([
        'account_id' => $accountId,
        'account_status' => $accountStatus,
        'admin_note' => $adminNote,
    ]);

    $updated = $statement->rowCount();
    (new AdminUserDirectory($pdo))->recordAccess(adminActorId($pdo), 'update_account', $accountId);
    jsonResponse(['ok' => true, 'updated' => $updated]);
}

function statsSummary(PDO $pdo): array
{
    return [
        'accounts' => scalarInt($pdo, 'SELECT COUNT(*) FROM account_profiles'),
        'activeAccounts' => scalarInt($pdo, 'SELECT COUNT(*) FROM account_profiles WHERE account_status = "active"'),
        'messages' => tableExists($pdo, 'message_history') ? scalarInt($pdo, 'SELECT COUNT(*) FROM message_history') : 0,
        'uploads' => tableExists($pdo, 'uploaded_files') ? scalarInt($pdo, 'SELECT COUNT(*) FROM uploaded_files') : 0,
        'failedMails' => tableExists($pdo, 'account_mail_log') ? scalarInt($pdo, 'SELECT COUNT(*) FROM account_mail_log WHERE sent = 0') : 0,
    ];
}

function logRows(PDO $pdo): array
{
    $statement = $pdo->query('SELECT "admin" AS source, actor_id AS subject,
        CONCAT(action, " ", target_account_id) AS detail, created_at
        FROM admin_audit_log ORDER BY id DESC LIMIT 50');
    $logs = $statement->fetchAll() ?: [];
    if (tableExists($pdo, 'account_mail_log')) {
        $statement = $pdo->query(
            'SELECT "mail" AS source, jid AS subject, error_text AS detail, created_at
             FROM account_mail_log
             ORDER BY created_at DESC
             LIMIT 50'
        );
        $logs = array_merge($logs, $statement->fetchAll() ?: []);
    }

    if (tableExists($pdo, 'message_history')) {
        $statement = $pdo->query(
            'SELECT "message" AS source, account_id AS subject, CONCAT(status, " ", conversation_peer) AS detail, created_at
             FROM message_history
             ORDER BY created_at DESC
             LIMIT 50'
        );
        $logs = array_merge($logs, $statement->fetchAll() ?: []);
    }

    usort($logs, static fn(array $a, array $b): int => strcmp((string)($b['created_at'] ?? ''), (string)($a['created_at'] ?? '')));
    return array_slice($logs, 0, 80);
}

function serverSummary(PDO $pdo): array
{
    $config = loadAdminConfig();
    return [
        'phpVersion' => PHP_VERSION,
        'os' => PHP_OS_FAMILY,
        'host' => $_SERVER['HTTP_HOST'] ?? '',
        'https' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
        'pdoMysql' => extension_loaded('pdo_mysql'),
        'openssl' => extension_loaded('openssl'),
        'adminTokenConfigured' => adminToken() !== '',
        'adminSession' => isset($_SESSION['teletyptel_admin_id']),
        'localRequest' => isLocalRequest(),
        'runtime' => runtimeSummary($pdo, $config),
        'ejabberd' => ejabberdSipSummary($config),
    ];
}

function runtimeSummary(PDO $pdo, array $config): array
{
    $mysqlConfig = is_array($config['mysql'] ?? null) ? $config['mysql'] : [];
    $mysqlHost = cleanAdminText($mysqlConfig['host'] ?? '127.0.0.1', 255);
    $mysqlPort = normalizePort($mysqlConfig['port'] ?? 3306, 3306);
    $serverSoftware = cleanAdminText($_SERVER['SERVER_SOFTWARE'] ?? '', 255);
    $phpSapi = cleanAdminText(PHP_SAPI, 80);
    $apachePorts = servicePorts([80, 443, 8080]);
    $mysqlPortOpen = tcpPortOpen($mysqlHost, $mysqlPort);

    return [
        'apache' => [
            'label' => 'Apache',
            'active' => stripos($serverSoftware, 'apache') !== false || $phpSapi === 'apache2handler' || anyPortOpen($apachePorts),
            'version' => apacheVersion($serverSoftware),
            'detail' => $serverSoftware !== '' ? $serverSoftware : 'Webserver via ' . $phpSapi,
            'ports' => $apachePorts,
        ],
        'mysql' => [
            'label' => 'MySQL',
            'active' => databaseResponds($pdo),
            'version' => databaseVersion($pdo),
            'detail' => $mysqlHost . ':' . $mysqlPort . ($mysqlPortOpen ? ' bereikbaar' : ' verbonden via PDO'),
            'host' => $mysqlHost,
            'port' => $mysqlPort,
            'portOpen' => $mysqlPortOpen,
        ],
        'php' => [
            'label' => 'PHP',
            'active' => true,
            'version' => PHP_VERSION,
            'detail' => 'PHP ' . PHP_VERSION . ' via ' . $phpSapi,
            'sapi' => $phpSapi,
            'extensions' => [
                'pdo_mysql' => extension_loaded('pdo_mysql'),
                'openssl' => extension_loaded('openssl'),
            ],
        ],
    ];
}

function apacheVersion(string $serverSoftware): string
{
    if (preg_match('/Apache\/([^\s]+)/i', $serverSoftware, $matches) === 1) {
        return cleanAdminText($matches[1], 80);
    }
    return '';
}

function servicePorts(array $ports): array
{
    $result = [];
    foreach ($ports as $port) {
        $normalized = normalizePort($port, 0);
        if ($normalized > 0) {
            $result[] = [
                'port' => $normalized,
                'open' => tcpPortOpen('127.0.0.1', $normalized),
            ];
        }
    }
    return $result;
}

function anyPortOpen(array $ports): bool
{
    foreach ($ports as $port) {
        if (!empty($port['open'])) {
            return true;
        }
    }
    return false;
}

function databaseVersion(PDO $pdo): string
{
    try {
        $version = $pdo->query('SELECT VERSION()')->fetchColumn();
        return cleanAdminText(is_scalar($version) ? (string)$version : '', 120);
    } catch (Throwable) {
        return '';
    }
}

function databaseResponds(PDO $pdo): bool
{
    try {
        return (string)$pdo->query('SELECT 1')->fetchColumn() === '1';
    } catch (Throwable) {
        return false;
    }
}

function ejabberdSipSummary(array $config): array
{
    $xmppMysql = is_array($config['xmpp_mysql'] ?? null) ? $config['xmpp_mysql'] : [];
    $oauth = is_array($config['oauth'] ?? null) ? $config['oauth'] : [];
    $sip = is_array($config['sip'] ?? null) ? $config['sip'] : [];
    $host = cleanAdminText($sip['host'] ?? $oauth['xmpp_domain'] ?? $xmppMysql['host'] ?? 'localhost', 255);
    $sipPort = normalizePort($sip['port'] ?? 5060, 5060);
    $sipsPort = normalizePort($sip['tls_port'] ?? 5061, 5061);

    return [
        'xmppDomain' => cleanAdminText($oauth['xmpp_domain'] ?? '', 255),
        'xmppWebSocket' => cleanAdminText($oauth['xmpp_websocket'] ?? '', 255),
        'xmppDatabaseHost' => cleanAdminText($xmppMysql['host'] ?? '', 255),
        'xmppDatabase' => cleanAdminText($xmppMysql['database'] ?? '', 255),
        'ejabberdCtlAvailable' => commandExists('ejabberdctl'),
        'ejabberdService' => ejabberdServiceStatus(),
        'sipHost' => $host,
        'sipPort' => $sipPort,
        'sipsPort' => $sipsPort,
        'sipConfigured' => (bool)($sip['enabled'] ?? false),
        'sipPortOpen' => tcpPortOpen($host, $sipPort),
        'sipsPortOpen' => tcpPortOpen($host, $sipsPort),
        'moduleHint' => 'ejabberd_sip / mod_sip',
        'gatewayRole' => 'SIP is gatewaylaag voor telefonie/relay, niet de browser-client zelf.',
    ];
}

function loadAdminConfig(): array
{
    return (new AdminSettings())->configuration();
}

function normalizePort(mixed $value, int $fallback): int
{
    $port = filter_var($value, FILTER_VALIDATE_INT, [
        'options' => ['min_range' => 1, 'max_range' => 65535],
    ]);
    return $port === false ? $fallback : (int)$port;
}

function tcpPortOpen(string $host, int $port): bool
{
    if ($host === '') {
        return false;
    }
    $errno = 0;
    $errstr = '';
    $socket = @fsockopen($host, $port, $errno, $errstr, 0.35);
    if (is_resource($socket)) {
        fclose($socket);
        return true;
    }
    return false;
}

function ejabberdServiceStatus(): string
{
    if (PHP_OS_FAMILY !== 'Linux') {
        return 'alleen op Linux-server te controleren';
    }
    if (!commandExists('systemctl')) {
        return commandExists('ejabberdctl') ? 'ejabberdctl aanwezig' : 'systemctl niet beschikbaar';
    }
    $status = trim((string)runAdminCommand('systemctl is-active ejabberd 2>/dev/null'));
    return $status !== '' ? $status : 'onbekend';
}

function commandExists(string $command): bool
{
    $probe = PHP_OS_FAMILY === 'Windows' ? "where {$command} 2>NUL" : "command -v {$command} 2>/dev/null";
    return trim((string)runAdminCommand($probe)) !== '';
}

function runAdminCommand(string $command): ?string
{
    if (!function_exists('shell_exec')) {
        return null;
    }
    return shell_exec($command);
}

function ensureAdminSchema(PDO $pdo): void
{
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS account_profiles (
            account_id VARCHAR(96) NOT NULL PRIMARY KEY,
            jid VARCHAR(255) NOT NULL,
            display_name VARCHAR(120) NOT NULL DEFAULT "",
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_account_profiles_jid (jid)
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );

    ensureColumn($pdo, 'account_profiles', 'subscription_plan', 'subscription_plan VARCHAR(32) NOT NULL DEFAULT "free"');
    ensureColumn($pdo, 'account_profiles', 'account_status', 'account_status VARCHAR(32) NOT NULL DEFAULT "active"');
    ensureColumn($pdo, 'account_profiles', 'subscription_expires_at', 'subscription_expires_at DATE NULL');
    ensureColumn($pdo, 'account_profiles', 'admin_note', 'admin_note TEXT NULL');
    ensureColumn($pdo, 'account_profiles', 'display_name', 'display_name VARCHAR(120) NOT NULL DEFAULT ""');
    ensureColumn($pdo, 'account_profiles', 'provider_id', 'provider_id VARCHAR(96) NOT NULL DEFAULT "local"');
    ensureColumn($pdo, 'account_profiles', 'phone_number', 'phone_number VARCHAR(64) NOT NULL DEFAULT ""');
    ensureColumn($pdo, 'account_profiles', 'preferred_language', 'preferred_language VARCHAR(16) NOT NULL DEFAULT "nl"');
    ensureColumn($pdo, 'account_profiles', 'created_at', 'created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP');
    ensureColumn($pdo, 'account_profiles', 'updated_at', 'updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS admin_users (
            admin_id VARCHAR(96) NOT NULL PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            display_name VARCHAR(120) NOT NULL DEFAULT "",
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(32) NOT NULL DEFAULT "owner",
            enabled TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_login_at DATETIME NULL,
            UNIQUE KEY uq_admin_users_email (email(190))
        ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );

    ensureColumn($pdo, 'admin_users', 'can_review_intake', 'can_review_intake TINYINT NOT NULL DEFAULT 0');
    ensureColumn($pdo, 'admin_users', 'session_version', 'session_version INT NOT NULL DEFAULT 1');
    $pdo->exec('CREATE TABLE IF NOT EXISTS admin_audit_log (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        actor_id VARCHAR(96) NOT NULL,
        action VARCHAR(40) NOT NULL,
        target_account_id VARCHAR(96) NOT NULL DEFAULT "",
        created_at DATETIME NOT NULL,
        KEY idx_admin_audit_target (target_account_id, created_at)
    ) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
}

function adminUserToClient(array $row): array
{
    return [
        'adminId' => $row['admin_id'],
        'email' => $row['email'],
        'displayName' => $row['display_name'],
        'role' => $row['role'],
        'canReviewIntake' => IntakeManager::reviewer($row),
    ];
}

function ensureColumn(PDO $pdo, string $table, string $column, string $definition): void
{
    if (columnExists($pdo, $table, $column)) {
        return;
    }
    $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN {$definition}");
}

function columnExists(PDO $pdo, string $table, string $column): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name
           AND COLUMN_NAME = :column_name'
    );
    $statement->execute(['table_name' => $table, 'column_name' => $column]);
    return (int)$statement->fetchColumn() > 0;
}

function tableExists(PDO $pdo, string $table): bool
{
    $statement = $pdo->prepare(
        'SELECT COUNT(*)
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table_name'
    );
    $statement->execute(['table_name' => $table]);
    return (int)$statement->fetchColumn() > 0;
}

function scalarInt(PDO $pdo, string $sql): int
{
    return (int)$pdo->query($sql)->fetchColumn();
}

function normalizeAccountStatus(mixed $value): string
{
    $value = cleanAdminText($value, 32);
    return in_array($value, ['active', 'trial', 'suspended', 'closed'], true) ? $value : 'active';
}

function cleanAdminText(mixed $value, int $maxLength): string
{
    $text = trim((string)$value);
    $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $text) ?? '';
    return substr($text, 0, $maxLength);
}

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
}
