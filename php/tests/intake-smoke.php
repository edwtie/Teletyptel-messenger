<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Database.php';
require_once dirname(__DIR__) . '/lib/IntakeAdmin.php';
require_once dirname(__DIR__) . '/lib/AdminSession.php';
require_once dirname(__DIR__) . '/lib/AdminPlanConfiguration.php';

$checks = 0;
function verifyIntake(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}
function rejectIntake(callable $operation, string $exception = InvalidArgumentException::class): void
{
    try {
        $operation();
    } catch (Throwable $error) {
        verifyIntake($error instanceof $exception, 'Expected ' . $exception . ', got ' . get_class($error) . ': ' . $error->getMessage());
        return;
    }
    throw new RuntimeException('Operation should have failed: ' . $exception);
}
function currentAdminUser(PDO $pdo): ?array { return $GLOBALS['fixtureAdmin']; }
function adminCsrfToken(): string { return 'fixture-csrf'; }
function adminQuery(string $key, string $default = ''): string { return $_GET[$key] ?? $default; }
function jsonResponse(array $data, int $status = 200): void { $GLOBALS['fixtureResponse'] = $data; }

$mysql = in_array('--temporary-tables', $argv, true);
$pdo = $mysql ? Database::connect() : new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$tables = ['account_profiles', 'subscription_plans', 'admin_users', 'admin_audit_log',
    'intake_plan_rules', 'intake_applications', 'intake_documents', 'intake_audit'];
$temporary = [];
$before = $mysql ? hash('sha256', json_encode($pdo->query('SELECT * FROM account_profiles ORDER BY account_id')->fetchAll())) : '';
try {
    if ($mysql) {
        foreach ($tables as $table) {
            $schema = $pdo->query("SHOW CREATE TABLE $table")->fetch(PDO::FETCH_NUM)[1];
            if (str_contains($schema, 'FOREIGN KEY')) {
                throw new RuntimeException('Fixture must not reference live tables.');
            }
            $pdo->exec(preg_replace('/^CREATE TABLE /', 'CREATE TEMPORARY TABLE ', $schema, 1));
            $temporary[] = $table;
        }
    } else {
        $pdo->exec("CREATE TABLE account_profiles (account_id TEXT PRIMARY KEY, jid TEXT, display_name TEXT, account_status TEXT DEFAULT 'active', subscription_plan TEXT DEFAULT 'free')");
        $pdo->exec('CREATE TABLE subscription_plans (plan_id TEXT PRIMARY KEY, name TEXT, description TEXT, price_cents INTEGER,
            billing_period TEXT, enabled INTEGER, version INTEGER, created_at TEXT, updated_at TEXT)');
        $pdo->exec('CREATE TABLE admin_users (admin_id TEXT PRIMARY KEY, email TEXT UNIQUE, display_name TEXT, password_hash TEXT,
            role TEXT, enabled INTEGER DEFAULT 1, can_review_intake INTEGER DEFAULT 0, session_version INTEGER DEFAULT 1)');
        $pdo->exec('CREATE TABLE admin_audit_log (id INTEGER PRIMARY KEY, actor_id TEXT, action TEXT, target_account_id TEXT, created_at TEXT)');
        $schema = file_get_contents(dirname(__DIR__) . '/intake-schema.sql');
        $schema = preg_replace('/BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY/', 'INTEGER PRIMARY KEY', $schema);
        $schema = preg_replace('/^  KEY[^\r\n]*[\r\n]+/m', '', $schema);
        $schema = preg_replace('/,\s*\)/', "\n)", $schema);
        $schema = str_replace('UNIQUE KEY uq_intake_document_kind', 'UNIQUE', $schema);
        $schema = preg_replace('/ ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci/', '', $schema);
        $pdo->exec($schema);
    }
    $pdo->exec("INSERT INTO account_profiles (account_id, jid, display_name) VALUES
        ('alice', 'alice@example.invalid', 'Fixture Alice'), ('bob', 'bob@example.invalid', 'Fixture Bob')");
    $insert = $pdo->prepare('INSERT INTO subscription_plans (plan_id, name, description, price_cents, billing_period, enabled, version, created_at, updated_at) VALUES (?, ?, ?, 0, ?, 1, 1, ?, ?)');
    foreach (['general', 'medical', 'bsn-only'] as $plan) {
        $insert->execute([$plan, 'Fixture ' . $plan, 'Fixture only', 'none', gmdate('Y-m-d H:i:s'), gmdate('Y-m-d H:i:s')]);
    }
    $key = random_bytes(32);
    $configuration = ['enabled' => true, 'privacy_url' => 'https://example.invalid/privacy', 'privacy_version' => 'fixture-1',
        'retention_days' => 30, 'medical_processing_approved' => true, 'medical_basis' => 'Fixture only',
        'bsn_processing_approved' => true, 'bsn_legal_basis' => 'Fixture only', 'scanner_path' => PHP_BINARY];
    $intake = new IntakeManager($pdo, $configuration, $key);
    $disabled = new IntakeManager($pdo, [], $key);
    verifyIntake(!$disabled->readiness()['medicalReady'] && !$disabled->readiness()['bsnReady'], 'Disabled by default');
    verifyIntake(count($intake->plans()) === 0, 'No automatic publication');
    verifyIntake(count($intake->insurers()['items']) >= 30, 'Public insurer registry provided');
    foreach (['general', 'medical', 'bsn-only'] as $plan) {
        $intake->saveRule(['planId' => $plan, 'published' => true, 'requiresDocuments' => $plan === 'medical',
            'requiresBsn' => $plan !== 'general', 'version' => 0], 'fixture-owner');
    }
    verifyIntake(count($intake->plans()) === 3, 'Owner can publish rules');
    rejectIntake(fn() => $intake->saveRule(['planId' => 'medical', 'published' => true, 'requiresDocuments' => true, 'requiresBsn' => true, 'version' => 0], 'fixture-owner'), SubscriptionConflict::class);
    rejectIntake(fn() => $intake->saveRule(['planId' => 'missing', 'published' => true, 'requiresDocuments' => false, 'requiresBsn' => false, 'version' => 0], 'fixture-owner'));
    $start = ['planId' => 'medical', 'planVersion' => 1, 'ruleVersion' => 1];
    rejectIntake(fn() => $disabled->start('alice', $start), IntakeUnavailable::class);
    foreach (['medical_processing_approved', 'bsn_processing_approved'] as $flag) {
        $blocked = new IntakeManager($pdo, array_replace($configuration, [$flag => false]), $key);
        rejectIntake(fn() => $blocked->start('alice', $start), IntakeUnavailable::class);
    }
    foreach (['scanner_path' => '', 'privacy_url' => 'http://example.invalid', 'retention_days' => 0, 'bsn_legal_basis' => ''] as $field => $value) {
        $blocked = new IntakeManager($pdo, array_replace($configuration, [$field => $value]), $key);
        rejectIntake(fn() => $blocked->start('alice', $start), IntakeUnavailable::class);
    }
    rejectIntake(fn() => $intake->start('unknown', $start), IntakeDenied::class);
    rejectIntake(fn() => $intake->start('alice', array_replace($start, ['ruleVersion' => 2])), SubscriptionConflict::class);
    $application = $intake->start('alice', $start);
    $identifier = $application['id'];
    $version = function () use ($pdo, &$identifier): int { return (int)$pdo->query("SELECT version FROM intake_applications WHERE id = '$identifier'")->fetchColumn(); };
    $input = function () use (&$identifier, $version): array { return ['id' => $identifier, 'version' => $version()]; };
    verifyIntake($application['status'] === 'draft', 'Starts as draft, never auto-approved');
    rejectIntake(fn() => $intake->start('alice', $start), SubscriptionConflict::class);
    rejectIntake(fn() => $intake->view($identifier, 'bob', 'user:bob'), IntakeDenied::class);
    rejectIntake(fn() => $intake->saveDetails('bob', $input()), IntakeDenied::class);
    rejectIntake(fn() => $intake->withdraw('bob', $input() + ['confirmed' => true]), IntakeDenied::class);
    rejectIntake(fn() => $intake->revealBsn($identifier, 'bob', 'user:bob'), IntakeDenied::class);
    rejectIntake(fn() => $intake->submit('alice', $input() + ['confirmed' => true, 'privacyVersion' => 'fixture-1']));
    $bsn = '999999990';
    verifyIntake(IntakeManager::bsn($bsn) === $bsn, 'Synthetic checksum fixture accepted without identity assertion');
    verifyIntake(strlen(IntakeManager::bsn('99999997')) === 9, 'Eight-digit BSN is padded');
    foreach (['000000000', '123456789', 'abc', '', '1234567', '1234567890', 999999990, '99999999x'] as $invalid) {
        rejectIntake(fn() => IntakeManager::bsn($invalid));
    }
    $insurer = $intake->insurers()['items'][0];
    rejectIntake(fn() => $intake->saveDetails('alice', $input() + ['bsn' => $bsn, 'insurerId' => 'invented']));
    rejectIntake(fn() => $intake->saveDetails('alice', $input() + ['bsn' => '', 'insurerId' => $insurer['id']]));
    $application = $intake->saveDetails('alice', $input() + ['bsn' => $bsn, 'insurerId' => $insurer['id']]);
    verifyIntake($application['bsnMasked'] === '*****9990' && !isset($application['payload']), 'View never returns plaintext payload');
    verifyIntake($intake->revealBsn($identifier, 'alice', 'user:alice') === $bsn, 'Explicit reveal');
    $cipher = $pdo->query("SELECT payload FROM intake_applications WHERE id = '$identifier'")->fetchColumn();
    verifyIntake(!str_contains($cipher, $bsn) && !str_contains($cipher, $insurer['name']), 'BSN and insurer encrypted at rest');
    $intake->saveDetails('alice', $input() + ['bsn' => '', 'insurerId' => $insurer['id']]);
    verifyIntake($intake->revealBsn($identifier, 'alice', 'user:alice') === $bsn, 'Blank edit retains existing required BSN');
    rejectIntake(fn() => $intake->saveDetails('alice', ['id' => $identifier, 'version' => 1, 'bsn' => $bsn, 'insurerId' => $insurer['id']]), SubscriptionConflict::class);
    $submit = fn() => $input() + ['confirmed' => true, 'privacyVersion' => 'fixture-1'];
    rejectIntake(fn() => $intake->submit('alice', $submit()));
    $pdf = "%PDF-1.4\nFixture document, not medical data\n%%EOF";
    verifyIntake(IntakeManager::documentExtension($pdf) === 'pdf', 'PDF MIME accepted');
    rejectIntake(fn() => IntakeManager::documentExtension('<?php echo "fixture";'));
    rejectIntake(fn() => IntakeManager::documentExtension('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    rejectIntake(fn() => IntakeManager::documentExtension(str_repeat('a', IntakeManager::MAX_FILE_BYTES + 1)));
    rejectIntake(fn() => $intake->upload('alice', $input() + ['kind' => 'audiogram'], ['tmp_name' => __FILE__, 'error' => UPLOAD_ERR_OK]));
    $scanner = new ReflectionMethod(IntakeManager::class, 'scan');
    $scanner->setAccessible(true);
    rejectIntake(fn() => $scanner->invoke($intake, __FILE__));
    $store = new ReflectionMethod(IntakeManager::class, 'storeDocument');
    $store->setAccessible(true);
    $application = $store->invoke($intake, 'alice', $input(), 'audiogram', $pdf, 'pdf');
    rejectIntake(fn() => $intake->submit('alice', $submit()));
    $application = $store->invoke($intake, 'alice', $input(), 'prescription', $pdf, 'pdf');
    verifyIntake(count($application['documents']) === 2, 'Two distinct documents stored');
    $fileId = $application['documents'][0]['id'];
    verifyIntake($intake->document($identifier, $fileId, 'alice', 'user:alice')['content'] === $pdf, 'Authenticated own document decrypts');
    rejectIntake(fn() => $intake->document($identifier, $fileId, 'bob', 'user:bob'), IntakeDenied::class);
    rejectIntake(fn() => $intake->document($identifier, str_repeat('0', 32), 'alice', 'user:alice'), IntakeDenied::class);
    $documentCipher = $pdo->query("SELECT encrypted_content FROM intake_documents WHERE id = '$fileId'")->fetchColumn();
    verifyIntake(!str_contains($documentCipher, '%PDF'), 'Document stored encrypted');
    $wrongKey = new IntakeManager($pdo, $configuration, random_bytes(32));
    rejectIntake(fn() => $wrongKey->view($identifier, 'alice', 'user:alice'), IntakeUnavailable::class);
    $pdo->prepare('UPDATE intake_applications SET payload = ? WHERE id = ?')->execute(['corrupt', $identifier]);
    rejectIntake(fn() => $intake->view($identifier, 'alice', 'user:alice'), IntakeUnavailable::class);
    $pdo->prepare('UPDATE intake_applications SET payload = ? WHERE id = ?')->execute([$cipher, $identifier]);
    rejectIntake(fn() => $intake->submit('alice', array_replace($submit(), ['privacyVersion' => 'old'])), SubscriptionConflict::class);
    $application = $intake->submit('alice', $submit());
    verifyIntake($application['status'] === 'submitted', 'Complete intake submitted');
    verifyIntake($pdo->query("SELECT subscription_plan FROM account_profiles WHERE account_id = 'alice'")->fetchColumn() === 'free', 'Submission cannot activate plan or bill');
    rejectIntake(fn() => $intake->submit('alice', $submit()), SubscriptionConflict::class);
    rejectIntake(fn() => $intake->review($input() + ['status' => 'needs_info', 'feedback' => ''], 'fixture-reviewer'));
    $application = $intake->review($input() + ['status' => 'needs_info', 'feedback' => 'replace_audiogram'], 'fixture-reviewer');
    verifyIntake($application['feedback_code'] === 'replace_audiogram', 'Human reviewer requests structured feedback');
    $application = $store->invoke($intake, 'alice', $input(), 'audiogram', $pdf . ' updated', 'pdf');
    verifyIntake(count($application['documents']) === 2, 'Replacement does not retain old medical file');
    $intake->submit('alice', $submit());
    $application = $intake->review($input() + ['status' => 'reviewed', 'feedback' => 'complete'], 'fixture-reviewer');
    verifyIntake($application['status'] === 'reviewed', 'Review is not insurance approval');
    $audit = json_encode($pdo->query('SELECT * FROM intake_audit')->fetchAll());
    verifyIntake(!str_contains($audit, $bsn) && !str_contains($audit, $pdf), 'Audit contains metadata only');
    $intake->withdraw('alice', $input() + ['confirmed' => true]);
    verifyIntake((int)$pdo->query('SELECT COUNT(*) FROM intake_documents')->fetchColumn() === 0, 'Withdrawal deletes encrypted files');
    verifyIntake($intake->revealBsn($identifier, 'alice', 'user:alice') === '', 'Withdrawal removes BSN');
    $general = $disabled->start('bob', ['planId' => 'general', 'planVersion' => 1, 'ruleVersion' => 1]);
    $generalInput = ['id' => $general['id'], 'version' => 1];
    rejectIntake(fn() => $disabled->saveDetails('bob', $generalInput + ['bsn' => $bsn]));
    rejectIntake(fn() => $disabled->saveDetails('bob', $generalInput + ['insurerId' => $insurer['id']]));
    $general = $disabled->submit('bob', $generalInput + ['confirmed' => true]);
    verifyIntake($general['status'] === 'submitted', 'General plans need no BSN or medical configuration');
    $application = $intake->start('alice', ['planId' => 'bsn-only', 'planVersion' => 1, 'ruleVersion' => 1]);
    $identifier = $application['id'];
    $intake->saveDetails('alice', $input() + ['bsn' => $bsn, 'insurerId' => $insurer['id']]);
    $pdo->prepare('UPDATE intake_applications SET payload = ? WHERE id = ?')->execute([$cipher, $identifier]);
    rejectIntake(fn() => $intake->view($identifier, 'alice', 'user:alice'), IntakeUnavailable::class);
    $pdo->prepare('UPDATE intake_applications SET payload = NULL WHERE id = ?')->execute([$identifier]);
    $intake->saveDetails('alice', $input() + ['bsn' => $bsn, 'insurerId' => $insurer['id']]);
    $application = $intake->submit('alice', $submit());
    verifyIntake($application['status'] === 'submitted' && count($application['documents']) === 0, 'BSN-only plan does not require documents');
    $pdo->prepare('UPDATE intake_applications SET expires_at = ? WHERE id = ?')->execute(['2000-01-01 00:00:00', $identifier]);
    rejectIntake(fn() => $intake->view($identifier, 'alice', 'user:alice'), IntakeDenied::class);
    verifyIntake($intake->purgeExpired() === 1 && $intake->purgeExpired() === 0, 'Retention worker idempotent');
    verifyIntake($intake->current('alice') === null, 'No old purged application is reopened');
    $application = $intake->start('alice', $start);
    $identifier = $application['id'];
    $intake->saveRule(['planId' => 'medical', 'published' => false, 'requiresDocuments' => true, 'requiresBsn' => true, 'version' => 1], 'fixture-owner');
    rejectIntake(fn() => $intake->submit('alice', $submit()));
    verifyIntake(count($intake->plans()) === 2, 'Unpublished plan hidden from signup');
    foreach ([null, ['enabled' => 0, 'role' => 'owner'], ['enabled' => 0, 'role' => 'admin', 'can_review_intake' => 1],
        ['enabled' => 1, 'role' => 'staff'], ['enabled' => 0, 'role' => 'staff', 'can_review_intake' => 1],
        ['enabled' => 1, 'role' => 'user', 'can_review_intake' => 1]] as $unauthorized) {
        verifyIntake(!IntakeManager::reviewer($unauthorized), 'Explicit enabled reviewer role required');
    }
    foreach (['owner', 'admin', 'staff'] as $role) {
        verifyIntake(IntakeManager::reviewer(['enabled' => 1, 'role' => $role, 'can_review_intake' => 1]), 'Authorized reviewer ' . $role);
    }
    foreach (['owner', 'admin'] as $role) {
        verifyIntake(IntakeManager::reviewer(['enabled' => 1, 'role' => $role, 'can_review_intake' => 0]), 'Role-based review without staff flag: ' . $role);
        verifyIntake(IntakeManager::reviewer(['enabled' => 1, 'role' => $role]), 'Legacy admin row retains role-based access: ' . $role);
    }
    verifyIntake(!IntakeHttp::fresh([], 'alice'), 'Old sessions require actual new authentication');
    verifyIntake(!IntakeHttp::fresh(['teletyptel_authenticated_at' => time(), 'teletyptel_intake_authenticated_id' => 'bob'], 'alice'), 'Fresh login bound to account');
    verifyIntake(!IntakeHttp::fresh(['teletyptel_authenticated_at' => time() - 901, 'teletyptel_intake_authenticated_id' => 'alice'], 'alice'), 'Fresh login expires');
    verifyIntake(IntakeHttp::fresh(['teletyptel_authenticated_at' => time(), 'teletyptel_intake_authenticated_id' => 'alice'], 'alice'), 'Fresh login accepted');
    $_SERVER['HTTPS'] = 'on';
    $_SERVER['REQUEST_METHOD'] = 'GET';
    $_SESSION = [];
    $fixtureAdmin = null;
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_list', null), IntakeDenied::class);
    $fixtureHash = password_hash('fixture-password-123', PASSWORD_DEFAULT);
    foreach (['owner', 'admin', 'staff'] as $role) {
        $pdo->prepare('INSERT INTO admin_users (admin_id, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)')
            ->execute(['fixture-' . $role, $role . '@example.invalid', 'Fixture ' . $role, $fixtureHash, $role]);
    }
    $_GET['id'] = $general['id'];
    $fixtureAdmin = ['enabled' => 1, 'role' => 'owner', 'admin_id' => 'fixture-owner', 'can_review_intake' => 0, 'password_hash' => $fixtureHash];
    handleIntakeAdmin($pdo, 'intake_view', null);
    verifyIntake(isset($fixtureResponse['application'], $fixtureResponse['audit']), 'Owner has role-based dossier and audit access');
    handleIntakeAdmin($pdo, 'intake_config', null);
    verifyIntake(isset($fixtureResponse['plans']) && !isset($fixtureResponse['applications']), 'Configuration remains separate from dossier content');
    handleIntakeAdmin($pdo, 'intake_members', null);
    foreach ($fixtureResponse['team'] as $member) {
        verifyIntake($member['canReviewIntake'] === ($member['role'] !== 'staff'), 'Team reports effective rights: ' . $member['role']);
        verifyIntake(!isset($member['password_hash']), 'Team does not expose credentials');
    }
    $_SERVER['REQUEST_METHOD'] = 'POST';
    $_SERVER['HTTP_X_CSRF_TOKEN'] = 'fixture-csrf';
    foreach (['owner', 'admin'] as $role) {
        rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_team', ['adminId' => 'fixture-' . $role,
            'expected' => false, 'canReview' => true, 'expectedVersion' => 1, 'reviewPassword' => 'fixture-password-123']), SubscriptionConflict::class);
    }
    handleIntakeAdmin($pdo, 'intake_team', ['adminId' => 'fixture-staff', 'expected' => false, 'canReview' => true, 'expectedVersion' => 1, 'reviewPassword' => 'fixture-password-123']);
    verifyIntake((int)$pdo->query("SELECT can_review_intake FROM admin_users WHERE admin_id = 'fixture-staff'")->fetchColumn() === 1, 'Owner can grant staff rights');
    handleIntakeAdmin($pdo, 'intake_team', ['adminId' => 'fixture-staff', 'expected' => true, 'canReview' => false, 'expectedVersion' => 1, 'reviewPassword' => 'fixture-password-123']);
    verifyIntake((int)$pdo->query("SELECT can_review_intake FROM admin_users WHERE admin_id = 'fixture-staff'")->fetchColumn() === 0, 'Owner can revoke staff rights');
    $fixtureAdmin = ['enabled' => 1, 'role' => 'admin', 'admin_id' => 'fixture-admin', 'password_hash' => $fixtureHash];
    $staffInput = ['email' => 'new-staff@example.invalid', 'displayName' => 'Temporary staff fixture', 'staffPassword' => 'fixture-staff-password-123',
        'reviewPassword' => 'fixture-password-123', 'role' => 'owner', 'canReview' => true];
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff', array_replace($staffInput, ['reviewPassword' => 'wrong'])), IntakeDenied::class);
    handleIntakeAdmin($pdo, 'intake_staff', $staffInput);
    $createdStaff = $pdo->query("SELECT * FROM admin_users WHERE email = 'new-staff@example.invalid'")->fetch(PDO::FETCH_ASSOC);
    verifyIntake($createdStaff['role'] === 'staff' && (int)$createdStaff['enabled'] === 1 && (int)$createdStaff['can_review_intake'] === 0, 'Admin creates staff only, without automatic review access');
    verifyIntake(password_verify($staffInput['staffPassword'], $createdStaff['password_hash']), 'Staff password hashed');
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff', $staffInput));
    $legacySession = ['teletyptel_admin_id' => 'fixture-owner', 'teletyptel_admin_last_activity' => time()];
    verifyIntake(AdminSession::current($pdo, $legacySession) !== null, 'Migration preserves existing unrevoked admin sessions');
    $staffSession = ['teletyptel_admin_id' => 'fixture-staff', 'teletyptel_admin_last_activity' => time(), 'teletyptel_admin_session_version' => 1];
    verifyIntake(AdminSession::current($pdo, $staffSession) !== null, 'Active staff session accepted');
    $savedSession = $staffSession;
    handleIntakeAdmin($pdo, 'intake_team', ['adminId' => 'fixture-staff', 'expected' => false, 'canReview' => true, 'expectedVersion' => 1, 'reviewPassword' => 'fixture-password-123']);
    $block = ['adminId' => 'fixture-staff', 'enabled' => false, 'expectedEnabled' => true, 'expectedVersion' => 1,
        'confirmed' => true, 'reviewPassword' => 'fixture-password-123'];
    foreach (['fixture-owner', 'fixture-admin', 'missing-staff'] as $protected) {
        rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff_status', array_replace($block, ['adminId' => $protected])), SubscriptionConflict::class);
    }
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff_status', array_replace($block, ['confirmed' => false])));
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff_status', array_replace($block, ['enabled' => 0])));
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff_status', array_replace($block, ['expectedVersion' => 99])), SubscriptionConflict::class);
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff_status', array_replace($block, ['reviewPassword' => 'wrong'])), IntakeDenied::class);
    $_SERVER['HTTP_X_CSRF_TOKEN'] = 'wrong';
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff_status', $block), IntakeDenied::class);
    $_SERVER['HTTP_X_CSRF_TOKEN'] = 'fixture-csrf';
    handleIntakeAdmin($pdo, 'intake_staff_status', $block);
    $blockedStaff = $pdo->query("SELECT * FROM admin_users WHERE admin_id = 'fixture-staff'")->fetch(PDO::FETCH_ASSOC);
    verifyIntake((int)$blockedStaff['enabled'] === 0 && (int)$blockedStaff['can_review_intake'] === 0 && (int)$blockedStaff['session_version'] === 2, 'Block clears rights and revokes every old session');
    verifyIntake(AdminSession::current($pdo, $staffSession) === null && !isset($staffSession['teletyptel_admin_id']), 'Existing staff session rejected immediately');
    verifyIntake((int)$pdo->query("SELECT COUNT(*) FROM admin_users WHERE admin_id = 'fixture-staff' AND enabled = 1")->fetchColumn() === 0, 'Blocked staff excluded from login lookup');
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_staff_status', $block), SubscriptionConflict::class);
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_team', ['adminId' => 'fixture-staff', 'expected' => false, 'canReview' => true, 'expectedVersion' => 2, 'reviewPassword' => 'fixture-password-123']), SubscriptionConflict::class);
    handleIntakeAdmin($pdo, 'intake_staff_status', array_replace($block, ['enabled' => true, 'expectedEnabled' => false, 'expectedVersion' => 2]));
    $unblockedStaff = $pdo->query("SELECT * FROM admin_users WHERE admin_id = 'fixture-staff'")->fetch(PDO::FETCH_ASSOC);
    verifyIntake((int)$unblockedStaff['enabled'] === 1 && (int)$unblockedStaff['can_review_intake'] === 0 && (int)$unblockedStaff['session_version'] === 3, 'Unblock never restores medical access');
    verifyIntake(AdminSession::current($pdo, $savedSession) === null, 'Unblock cannot resurrect an old session');
    $legacyStaffSession = ['teletyptel_admin_id' => 'fixture-staff', 'teletyptel_admin_last_activity' => time()];
    verifyIntake(AdminSession::current($pdo, $legacyStaffSession) === null, 'Legacy cookie cannot bypass revocation');
    $newSession = ['teletyptel_admin_id' => 'fixture-staff', 'teletyptel_admin_last_activity' => time(), 'teletyptel_admin_session_version' => 3];
    verifyIntake(AdminSession::current($pdo, $newSession) !== null, 'New login accepted after unblock');
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_team', ['adminId' => 'fixture-staff', 'expected' => false, 'canReview' => true, 'expectedVersion' => 1, 'reviewPassword' => 'fixture-password-123']), SubscriptionConflict::class);
    verifyIntake((int)$pdo->query("SELECT COUNT(*) FROM admin_audit_log WHERE target_account_id = 'fixture-staff' AND action IN ('block_staff', 'unblock_staff')")->fetchColumn() === 2, 'Block and unblock each audited once');
    $expiredSession = ['teletyptel_admin_id' => 'fixture-owner', 'teletyptel_admin_last_activity' => time() - 1801];
    verifyIntake(AdminSession::current($pdo, $expiredSession) === null, 'General admin idle timeout unchanged');
    $_SERVER['REQUEST_METHOD'] = 'GET';
    handleIntakeAdmin($pdo, 'intake_members', null);
    verifyIntake(count($fixtureResponse['team']) === 2 && count(array_filter($fixtureResponse['team'], fn(array $member): bool => $member['role'] !== 'staff')) === 0, 'Admin team endpoint exposes staff only');
    foreach (['owner', 'admin'] as $role) {
        $fixtureAdmin = ['enabled' => 1, 'role' => $role, 'admin_id' => 'fixture-' . $role, 'can_review_intake' => 0, 'password_hash' => $fixtureHash];
        handleIntakeAdmin($pdo, 'intake_list', null);
        verifyIntake(isset($fixtureResponse['applications']), 'Role-based list access: ' . $role);
        handleIntakeAdmin($pdo, 'intake_view', null);
        verifyIntake($fixtureResponse['application']['id'] === $general['id'], 'Role-based dossier access: ' . $role);
        if ($role === 'admin') rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_config', null), IntakeDenied::class);
        $_SERVER['REQUEST_METHOD'] = 'POST';
        rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_bsn', ['id' => $general['id'], 'reviewPassword' => 'wrong']), IntakeDenied::class);
        $_SERVER['REQUEST_METHOD'] = 'GET';
        $fixtureAdmin['enabled'] = 0;
        rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_list', null), IntakeDenied::class);
        rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_config', null), IntakeDenied::class);
    }
    $fixtureAdmin = ['enabled' => 1, 'role' => 'staff', 'admin_id' => 'fixture-staff', 'can_review_intake' => 0, 'password_hash' => $fixtureHash];
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_list', null), IntakeDenied::class);
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_view', null), IntakeDenied::class);
    $fixtureAdmin['can_review_intake'] = 1;
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_config', null), IntakeDenied::class);
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_members', null), IntakeDenied::class);
    handleIntakeAdmin($pdo, 'intake_list', null);
    verifyIntake(isset($fixtureResponse['applications']), 'Explicitly authorized staff can list');
    $_GET['id'] = $general['id'];
    handleIntakeAdmin($pdo, 'intake_view', null);
    verifyIntake(isset($fixtureResponse['audit']), 'Staff views include audit metadata');
    $_SERVER['REQUEST_METHOD'] = 'POST';
    foreach (['intake_staff', 'intake_staff_status', 'intake_team'] as $teamAction) {
        rejectIntake(fn() => handleIntakeAdmin($pdo, $teamAction, $block), IntakeDenied::class);
    }
    $_SERVER['HTTP_X_CSRF_TOKEN'] = 'invalid';
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_review', []), IntakeDenied::class);
    $_SERVER['HTTP_X_CSRF_TOKEN'] = 'fixture-csrf';
    rejectIntake(fn() => handleIntakeAdmin($pdo, 'intake_bsn', ['id' => $general['id'], 'reviewPassword' => 'wrong']), IntakeDenied::class);
    handleIntakeAdmin($pdo, 'intake_bsn', ['id' => $general['id'], 'reviewPassword' => 'fixture-password-123']);
    verifyIntake($fixtureResponse['bsn'] === '', 'Reauthenticated explicit reveal only');
    for ($attempt = 0; $attempt < 5; $attempt++) {
        rejectIntake(fn() => intakeConfirmPassword($fixtureAdmin, []), IntakeDenied::class);
    }
    rejectIntake(fn() => intakeConfirmPassword($fixtureAdmin, ['reviewPassword' => 'fixture-password-123']), IntakeDenied::class);
    $planConfiguration = new AdminPlanConfiguration($pdo);
    $planOwner = ['admin_id' => 'fixture-owner', 'role' => 'owner', 'enabled' => 1];
    $combined = ['planId' => 'combined-fixture', 'name' => 'Combined fixture', 'description' => '', 'price' => '12.50',
        'billingPeriod' => 'month', 'enabled' => true,
        'intake' => ['version' => 0, 'published' => false, 'requiresDocuments' => true, 'requiresBsn' => true]];
    $savedPlan = $planConfiguration->save($combined, $planOwner, true);
    verifyIntake((int)$savedPlan['price_cents'] === 1250, 'Combined save creates plan');
    $savedRule = $pdo->query("SELECT * FROM intake_plan_rules WHERE plan_id = 'combined-fixture'")->fetch(PDO::FETCH_ASSOC);
    verifyIntake((int)$savedRule['requires_documents'] === 1 && (int)$savedRule['requires_bsn'] === 1 && (int)$savedRule['published'] === 0, 'Combined save stores requirements without publication');
    $auditBefore = (int)$pdo->query('SELECT COUNT(*) FROM admin_audit_log')->fetchColumn();
    $combined['version'] = 1;
    $combined['price'] = '20';
    rejectIntake(fn() => $planConfiguration->save($combined, $planOwner, false), SubscriptionConflict::class);
    $unchanged = $pdo->query("SELECT * FROM subscription_plans WHERE plan_id = 'combined-fixture'")->fetch(PDO::FETCH_ASSOC);
    verifyIntake((int)$unchanged['price_cents'] === 1250 && (int)$unchanged['version'] === 1, 'Stale requirements roll back price and plan version');
    verifyIntake((int)$pdo->query('SELECT COUNT(*) FROM admin_audit_log')->fetchColumn() === $auditBefore, 'Failed combined save rolls back plan audit');
    $combined['intake']['version'] = 1;
    $combined['intake']['requiresBsn'] = false;
    $savedPlan = $planConfiguration->save($combined, $planOwner, false);
    verifyIntake((int)$savedPlan['version'] === 2 && (int)$savedPlan['price_cents'] === 2000, 'Combined update commits price and version');
    $savedRule = $pdo->query("SELECT * FROM intake_plan_rules WHERE plan_id = 'combined-fixture'")->fetch(PDO::FETCH_ASSOC);
    verifyIntake((int)$savedRule['version'] === 2 && (int)$savedRule['requires_bsn'] === 0, 'Combined update commits new requirements');
    foreach ([null, ['admin_id' => 'fixture-admin', 'role' => 'admin', 'enabled' => 1],
        ['admin_id' => 'fixture-staff', 'role' => 'staff', 'enabled' => 1], array_replace($planOwner, ['enabled' => 0])] as $candidate) {
        rejectIntake(fn() => $planConfiguration->save($combined, $candidate, false), IntakeDenied::class);
    }
    $combined['planId'] = 'rollback-fixture';
    $combined['intake']['requiresDocuments'] = 'invalid';
    rejectIntake(fn() => $planConfiguration->save($combined, $planOwner, true));
    verifyIntake((int)$pdo->query("SELECT COUNT(*) FROM subscription_plans WHERE plan_id = 'rollback-fixture'")->fetchColumn() === 0, 'Invalid requirements roll back new plan');
    $_SERVER['HTTPS'] = 'off';
    rejectIntake(fn() => IntakeHttp::https(), IntakeDenied::class);
} finally {
    if ($pdo->inTransaction()) $pdo->rollBack();
    foreach (array_reverse($temporary) as $table) $pdo->exec("DROP TEMPORARY TABLE $table");
}
if ($mysql) {
    $after = hash('sha256', json_encode($pdo->query('SELECT * FROM account_profiles ORDER BY account_id')->fetchAll()));
    verifyIntake(hash_equals($before, $after), 'Live accounts untouched');
}
echo ($mysql ? 'MySQL isolated temporary-table' : 'SQLite isolated') . " intake smoke: $checks checks passed.\n";
