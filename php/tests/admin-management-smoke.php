<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/BillingManager.php';

$checks = 0;
function verifyManagement(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

function rejectManagement(callable $operation, string $exception = InvalidArgumentException::class): void
{
    try {
        $operation();
    } catch (Throwable $error) {
        verifyManagement($error instanceof $exception, 'Expected ' . $exception . ', got ' . get_class($error) . ': ' . $error->getMessage());
        return;
    }
    throw new RuntimeException('Expected operation to be rejected.');
}

$directory = sys_get_temp_dir() . '/teletyptel-admin-tests-' . bin2hex(random_bytes(8));
mkdir($directory, 0700);
$base = ['mysql' => ['password' => 'fixture-secret', 'private_key' => 'never-display'],
    'xmpp_mysql' => ['password' => 'fixture-xmpp-secret'], 'general' => ['secret' => 'never-display']];
$settings = new AdminSettings($directory . '/settings.json', $base);
try {
    verifyManagement(!str_contains(json_encode($settings->view()), 'secret'), 'No secrets in settings view');
    verifyManagement(!str_contains(json_encode($settings->view()), 'never-display'), 'Only allowlisted settings returned');
    $candidate = $settings->candidate([]);
    verifyManagement($candidate['billing']['companyName'] === '' && $candidate['billing']['defaultVat'] === '', 'Company and VAT remain blank');
    verifyManagement($candidate['billing']['agbCode'] === '', 'AGB not invented during setup');
    verifyManagement($settings->candidate(['billing' => ['agbCode' => '01234567']])['billing']['agbCode'] === '01234567', 'AGB leading zero preserved');
    foreach (['1234567', '123456789', '01.234567', '01 23456', 'abcdefgh', '1e234567', '00000000', '０１２３４５６７', 12345678, [], "0123456\0"] as $invalidAgb) {
        rejectManagement(fn() => $settings->candidate(['billing' => ['agbCode' => $invalidAgb]]));
    }
    verifyManagement($candidate['mysql']['password'] === 'fixture-secret', 'Blank password preserves previous secret');
    verifyManagement($settings->candidate(['mysql' => ['clearPassword' => true]])['mysql']['password'] === '', 'Explicit password clear');
    verifyManagement($settings->candidate(['mysql' => ['password' => ' new secret ']])['mysql']['password'] === ' new secret ', 'Passwords not trimmed');
    foreach (['localhost;dbname=other', '', 'host/invalid'] as $host) {
        rejectManagement(fn() => $settings->candidate(['mysql' => ['host' => $host]]));
    }
    foreach (['http://example.test', 'https://name@example.test', 'https://example.test/?token=secret'] as $url) {
        rejectManagement(fn() => $settings->candidate(['general' => ['publicUrl' => $url]]));
    }
    rejectManagement(fn() => $settings->candidate(['general' => 'invalid']));
    rejectManagement(fn() => $settings->candidate(['billing' => ['defaultVat' => '101']]));
    rejectManagement(fn() => $settings->candidate(['mysql' => ['port' => 0]]));
    $settings->save($candidate, '');
    $revision = $settings->view()['revision'];
    verifyManagement($revision !== '', 'Settings revision assigned');
    rejectManagement(fn() => $settings->save($candidate, ''));
    $settings->save($candidate, $revision);
    verifyManagement($settings->view()['revision'] !== $revision, 'Atomic settings replacement works');
    verifyManagement(AdminSettings::vat('21,00') === 2100 && AdminSettings::vat('0') === 0, 'Explicit VAT basis points');
    foreach (['', '-1', '1.234', 'nan', [], "21\0"] as $invalid) {
        rejectManagement(fn() => AdminSettings::vat($invalid));
    }
    $environment = getenv('TELETYPTEL_DB_HOST');
    try {
        putenv('TELETYPTEL_DB_HOST=env.example.test');
        verifyManagement($settings->view()['mysql']['environmentManaged'] === true, 'Environment managed group locked');
        verifyManagement($settings->view()['mysql']['host'] === 'env.example.test', 'Environment overrides displayed host');
        verifyManagement($settings->candidate(['mysql' => ['password' => 'must-ignore']])['mysql']['password'] === 'fixture-secret', 'Environment group not edited');
    } finally {
        putenv($environment === false ? 'TELETYPTEL_DB_HOST' : 'TELETYPTEL_DB_HOST=' . $environment);
    }

    $pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
    $pdo->exec("CREATE TABLE account_profiles (
        account_id TEXT PRIMARY KEY, display_name TEXT, jid TEXT, subscription_plan TEXT, subscription_expires_at TEXT,
        account_status TEXT DEFAULT 'active', admin_note TEXT DEFAULT ''
    );
    INSERT INTO account_profiles (account_id, display_name, jid, subscription_plan) VALUES
        ('alice', 'Alice', 'alice@example.test', 'free'), ('bob', 'Bob', 'bob@example.test', 'free');
    CREATE TABLE subscription_plans (plan_id TEXT PRIMARY KEY, name TEXT, description TEXT, price_cents INTEGER,
        billing_period TEXT, enabled INTEGER, version INTEGER, created_at TEXT, updated_at TEXT);
    CREATE TABLE subscription_history (id INTEGER PRIMARY KEY, account_id TEXT, from_plan TEXT, to_plan TEXT,
        from_plan_name TEXT, to_plan_name TEXT, from_expires_at TEXT, to_expires_at TEXT, actor_id TEXT, note TEXT, created_at TEXT);
    CREATE TABLE subscription_schedules (id INTEGER PRIMARY KEY, account_id TEXT, expected_plan TEXT, expected_expires_at TEXT,
        to_plan TEXT, to_expires_at TEXT, effective_on TEXT, status TEXT DEFAULT 'pending', actor_id TEXT,
        note TEXT, error_code TEXT DEFAULT '', created_at TEXT, completed_at TEXT);
    CREATE TABLE admin_audit_log (id INTEGER PRIMARY KEY, actor_id TEXT, action TEXT, target_account_id TEXT, created_at TEXT);
    CREATE TABLE billing_invoices (id TEXT PRIMARY KEY, request_key TEXT UNIQUE, account_id TEXT, recipient_type TEXT DEFAULT 'customer',
        status TEXT DEFAULT 'draft', invoice_number TEXT UNIQUE, customer_name TEXT, customer_address TEXT, customer_email TEXT,
        description TEXT, service_on TEXT, due_on TEXT, quantity INTEGER, unit_cents INTEGER, vat_basis_points INTEGER,
        subtotal_cents INTEGER, vat_cents INTEGER, total_cents INTEGER, currency TEXT DEFAULT 'EUR', supplier_json TEXT,
        issued_on TEXT, paid_on TEXT, payment_reference TEXT DEFAULT '', version INTEGER DEFAULT 1, actor_id TEXT, created_at TEXT);
    CREATE TABLE billing_sequences (sequence_year INTEGER PRIMARY KEY, last_number INTEGER);
    CREATE TABLE billing_recurring (id TEXT PRIMARY KEY, account_id TEXT UNIQUE, recipient_type TEXT DEFAULT 'customer',
        plan_id TEXT, plan_version INTEGER, unit_cents INTEGER, billing_period TEXT, anchor_day INTEGER,
        customer_name TEXT, customer_address TEXT, customer_email TEXT, vat_basis_points INTEGER, next_on TEXT,
        enabled INTEGER, auto_issue INTEGER DEFAULT 0, version INTEGER DEFAULT 1, last_error TEXT DEFAULT '', actor_id TEXT, updated_at TEXT)");
    $subscriptions = new SubscriptionManager($pdo);
    $subscriptions->seedPlans();
    $planInput = ['planId' => 'plus', 'name' => 'Plus', 'description' => '', 'price' => '12.50', 'billingPeriod' => 'month', 'enabled' => true];
    $subscriptions->savePlan($planInput, 'owner', true);
    $tomorrow = gmdate('Y-m-d', time() + 86400);
    $transition = ['accountId' => 'alice', 'expectedPlan' => 'free', 'expectedExpiresAt' => null,
        'planId' => 'plus', 'expiresAt' => '', 'effectiveOn' => $tomorrow, 'note' => 'Fixture'];
    foreach (['', gmdate('Y-m-d'), '2026-02-30', "2999-01-01\0"] as $date) {
        rejectManagement(fn() => $subscriptions->schedule(array_replace($transition, ['effectiveOn' => $date]), 'owner'));
    }
    rejectManagement(fn() => $subscriptions->schedule(array_replace($transition, ['expiresAt' => gmdate('Y-m-d')]), 'owner'));
    $schedule = $subscriptions->schedule($transition, 'owner');
    verifyManagement($subscriptions->account('alice')['subscription_plan'] === 'free', 'Scheduling never changes current plan');
    rejectManagement(fn() => $subscriptions->schedule($transition, 'owner'), SubscriptionConflict::class);
    rejectManagement(fn() => $subscriptions->change($transition, 'owner'), SubscriptionConflict::class);
    rejectManagement(fn() => $subscriptions->savePlan(array_replace($planInput, ['enabled' => false, 'version' => 1]), 'owner', false), SubscriptionConflict::class);
    verifyManagement($subscriptions->processDue()['applied'] === 0, 'Future transition not run early');
    $subscriptions->cancelSchedule($schedule['id'], 'owner');
    verifyManagement($subscriptions->schedules('alice')['items'][0]['status'] === 'cancelled', 'Cancellation retained for history');
    rejectManagement(fn() => $subscriptions->cancelSchedule($schedule['id'], 'owner'), SubscriptionConflict::class);
    $subscriptions->schedule($transition, 'owner');
    $pdo->beginTransaction();
    verifyManagement($subscriptions->processDue($tomorrow)['applied'] === 1, 'Due transition applied');
    verifyManagement($subscriptions->processDue($tomorrow)['applied'] === 0, 'Due transition applied only once');
    $pdo->rollBack();
    verifyManagement($subscriptions->account('alice')['subscription_plan'] === 'free', 'Outer rollback preserved across worker savepoints');
    $subscriptions->processDue($tomorrow);
    $subscriptions->schedule(array_replace($transition, ['accountId' => 'bob']), 'owner');
    $pdo->exec("UPDATE account_profiles SET subscription_plan = 'pro' WHERE account_id = 'bob'");
    verifyManagement($subscriptions->processDue($tomorrow)['failed'] === 1, 'Stale transition fails safely');
    verifyManagement($subscriptions->account('bob')['subscription_plan'] === 'pro', 'Stale schedule never overwrites newer assignment');
    verifyManagement($subscriptions->processDue($tomorrow)['failed'] === 0, 'Failure not retried blindly');

    $billing = new BillingManager($pdo, $settings);
    $draftInput = ['accountId' => 'alice', 'recipientType' => 'insurer', 'customerName' => 'Example insurer',
        'customerAddress' => 'Teststraat 1, 1234 AB Teststad', 'customerEmail' => 'test@example.test', 'description' => 'Abonnement',
        'serviceOn' => gmdate('Y-m-d'), 'dueOn' => $tomorrow, 'quantity' => 3, 'unitPrice' => '0.05', 'vat' => '21',
        'requestKey' => 'fixture-invoice-000001'];
    $draft = $billing->saveDraft($draftInput, 'owner');
    verifyManagement((int)$draft['subtotal_cents'] === 15 && (int)$draft['vat_cents'] === 3 && (int)$draft['total_cents'] === 18, 'Money uses integer cent rounding');
    verifyManagement($draft['recipient_type'] === 'insurer' && $draft['status'] === 'draft' && $draft['invoice_number'] === null, 'Insurer draft does not issue number');
    verifyManagement($billing->saveDraft($draftInput, 'owner')['id'] === $draft['id'], 'Idempotent draft request');
    verifyManagement($billing->listing()['total'] === 1, 'No duplicate invoice');
    rejectManagement(fn() => $billing->saveDraft(array_replace($draftInput, ['accountId' => 'bob']), 'owner'), SubscriptionConflict::class);
    foreach (['-1', '1.001', '1e2', '1000000', ''] as $price) {
        rejectManagement(fn() => $billing->saveDraft(array_replace($draftInput, ['unitPrice' => $price]), 'owner'));
    }
    rejectManagement(fn() => $billing->saveDraft(array_replace($draftInput, ['recipientType' => 'unknown']), 'owner'));
    rejectManagement(fn() => $billing->saveDraft(array_replace($draftInput, ['accountId' => 'missing']), 'owner'));
    rejectManagement(fn() => $billing->issue($draft['id'], 1, 'owner'));
    verifyManagement((int)$pdo->query('SELECT COUNT(*) FROM billing_sequences')->fetchColumn() === 0, 'Incomplete company does not consume sequence');
    rejectManagement(fn() => $billing->paid($draft['id'], gmdate('Y-m-d'), 'test', 'owner'));
    $draft = $billing->saveDraft(array_replace($draftInput, ['id' => $draft['id'], 'version' => 1, 'unitPrice' => '12.50']), 'owner');
    verifyManagement((int)$draft['version'] === 2, 'Draft version incremented');
    rejectManagement(fn() => $billing->saveDraft(array_replace($draftInput, ['id' => $draft['id'], 'version' => 1]), 'owner'), SubscriptionConflict::class);
    $complete = $settings->candidate(['billing' => ['companyName' => 'Fixture company', 'address' => 'Test address',
        'vatId' => 'Fixture VAT ID', 'companyNumber' => 'Fixture registry', 'defaultVat' => '21']]);
    $settings->save($complete, $settings->view()['revision']);
    rejectManagement(fn() => $billing->issue($draft['id'], 1, 'owner'), SubscriptionConflict::class);
    rejectManagement(fn() => $billing->issue($draft['id'], 2, 'owner'));
    verifyManagement($billing->invoice($draft['id'])['status'] === 'draft', 'Insurer invoice without AGB stays draft');
    verifyManagement((int)$pdo->query('SELECT COUNT(*) FROM billing_sequences')->fetchColumn() === 0, 'Missing AGB does not consume invoice number');
    foreach (['1234567', '00000000', '12AB5678', 12345678] as $invalidAgb) {
        $invalidSettings = new AdminSettings($directory . '/absent.json', ['billing' => array_replace($complete['billing'], ['agbCode' => $invalidAgb])]);
        rejectManagement(fn() => (new BillingManager($pdo, $invalidSettings))->issue($draft['id'], 2, 'owner'));
    }
    $pdo->beginTransaction();
    $customerDraft = $billing->saveDraft(array_replace($draftInput, ['recipientType' => 'customer', 'requestKey' => 'fixture-customer-without-agb']), 'owner');
    verifyManagement($billing->issue($customerDraft['id'], 1, 'owner')['status'] === 'issued', 'Ordinary customer invoice does not require AGB');
    $pdo->rollBack();
    $complete['billing']['agbCode'] = '01234567';
    $settings->save($complete, $settings->view()['revision']);
    verifyManagement($settings->view()['billing']['agbCode'] === '01234567', 'Settings expose stored AGB with leading zero');
    $issued = $billing->issue($draft['id'], 2, 'owner');
    verifyManagement($issued['invoice_number'] === 'TT-' . gmdate('Y') . '-000001', 'First unique yearly invoice number');
    verifyManagement($issued['supplier']['companyName'] === 'Fixture company', 'Immutable supplier snapshot');
    verifyManagement($issued['supplier']['agbCode'] === '01234567', 'Issued invoice snapshots AGB');
    verifyManagement(!str_contains(json_encode($issued), 'fixture-secret'), 'Invoice contains no database secret');
    verifyManagement($billing->issue($draft['id'], 2, 'owner')['invoice_number'] === $issued['invoice_number'], 'Issuing retry never duplicates number');
    rejectManagement(fn() => $billing->saveDraft(array_replace($draftInput, ['id' => $draft['id'], 'version' => 3]), 'owner'), SubscriptionConflict::class);
    $settings->save($candidate, $settings->view()['revision']);
    verifyManagement($billing->invoice($draft['id'])['supplier']['companyName'] === 'Fixture company', 'Settings change preserves issued supplier');
    verifyManagement($billing->invoice($draft['id'])['supplier']['agbCode'] === '01234567', 'Settings clearing AGB never rewrites issued invoice');
    rejectManagement(fn() => $billing->paid($draft['id'], $tomorrow, 'test', 'owner'));
    $paid = $billing->paid($draft['id'], gmdate('Y-m-d'), 'fixture-bank-reference', 'owner');
    verifyManagement($paid['status'] === 'paid', 'Payment is administrative state only');
    verifyManagement($billing->paid($draft['id'], gmdate('Y-m-d'), 'retry', 'owner')['payment_reference'] === 'fixture-bank-reference', 'Repeated payment does not overwrite reference');
    $ruleInput = ['accountId' => 'alice', 'recipientType' => 'insurer', 'customerName' => 'Insurer', 'customerAddress' => 'Test address',
        'customerEmail' => '', 'vat' => '21', 'nextOn' => gmdate('Y-m-d'), 'enabled' => true, 'autoIssue' => true,
        'confirmed' => true, 'expectedPlan' => 'plus', 'expectedPlanVersion' => 1];
    rejectManagement(fn() => $billing->saveRecurring(array_replace($ruleInput, ['confirmed' => false]), 'owner'), SubscriptionConflict::class);
    rejectManagement(fn() => $billing->saveRecurring(array_replace($ruleInput, ['expectedPlanVersion' => 9]), 'owner'), SubscriptionConflict::class);
    $rule = $billing->saveRecurring($ruleInput, 'owner');
    verifyManagement($rule['recipient_type'] === 'insurer', 'Insurer recipient retained for renewals');
    $withoutAgb = $complete;
    $withoutAgb['billing']['agbCode'] = '';
    $settings->save($withoutAgb, $settings->view()['revision']);
    verifyManagement($billing->processRecurring()['created'] === 1, 'Automatic insurer renewal stays draft when only AGB is missing');
    $cycleId = $pdo->query("SELECT id FROM billing_invoices WHERE request_key LIKE 'renewal-%'")->fetchColumn();
    verifyManagement($billing->invoice($cycleId)['status'] === 'draft' && $billing->invoice($cycleId)['invoice_number'] === null, 'Automatic issuance cannot bypass AGB requirement');
    $after = $billing->recurring('alice');
    verifyManagement(str_contains($after['last_error'], 'AGB-code'), 'Automatic processing explains missing AGB');
    verifyManagement($after['next_on'] > gmdate('Y-m-d') && $after['last_error'] !== '', 'Cycle advances with actionable incomplete-company message');
    verifyManagement($billing->processRecurring()['created'] === 0, 'Same renewal cycle not invoiced twice');
    verifyManagement($subscriptions->account('alice')['subscription_expires_at'] === null, 'Invoicing never mutates subscription expiry');
    $pdo->exec("UPDATE billing_recurring SET next_on = '" . gmdate('Y-m-d') . "' WHERE account_id = 'alice'");
    $settings->save($complete, $settings->view()['revision']);
    $billing->processRecurring();
    verifyManagement($billing->listing()['total'] === 2, 'Retry reuses existing cycle invoice');
    $cycleId = $pdo->query("SELECT id FROM billing_invoices WHERE request_key LIKE 'renewal-%'")->fetchColumn();
    verifyManagement($billing->invoice($cycleId)['status'] === 'issued', 'Complete settings allow automatic final issue');
    verifyManagement($billing->invoice($cycleId)['supplier']['agbCode'] === '01234567', 'Automatic final invoice snapshots AGB');
    verifyManagement($billing->invoice($cycleId)['invoice_number'] === 'TT-' . gmdate('Y') . '-000002', 'Renewal receives next unique number');
    $pdo->exec("UPDATE billing_recurring SET next_on = '" . gmdate('Y-m-d') . "' WHERE account_id = 'alice'");
    $subscriptions->savePlan(array_replace($planInput, ['price' => '19.95', 'version' => 1]), 'owner', false);
    verifyManagement($billing->processRecurring()['blocked'] === 1, 'Changed price requires agreement review');
    verifyManagement((int)$billing->recurring('alice')['enabled'] === 0, 'Blocked rules pause, do not starve later due rules');
    verifyManagement($billing->listing()['total'] === 2, 'No invoice after price conflict');
    rejectManagement(fn() => $billing->saveRecurring($ruleInput, 'owner'), SubscriptionConflict::class);
    $rule = $billing->saveRecurring(array_replace($ruleInput, ['version' => (int)$billing->recurring('alice')['version'], 'expectedPlanVersion' => 2]), 'owner');
    $pdo->exec("UPDATE account_profiles SET account_status = 'suspended' WHERE account_id = 'alice'");
    verifyManagement($billing->processRecurring()['blocked'] === 1, 'Suspended account not invoiced');
    $rule = $billing->saveRecurring(array_replace($ruleInput, ['version' => (int)$billing->recurring('alice')['version'], 'expectedPlanVersion' => 2]), 'owner');
    $billing->saveRecurring(['accountId' => 'alice', 'enabled' => false, 'autoIssue' => false, 'version' => (int)$rule['version']], 'owner');
    verifyManagement($billing->processRecurring()['created'] === 0, 'Paused rule never invoices');
    verifyManagement(BillingManager::nextPeriod('2028-01-31', 'month', 31) === '2028-02-29', 'Leap-year month-end');
    verifyManagement(BillingManager::nextPeriod('2028-02-29', 'month', 31) === '2028-03-31', 'Month anchor preserved');
    verifyManagement(BillingManager::nextPeriod('2028-02-29', 'year', 29) === '2029-02-28', 'Yearly leap-day clamp');
    verifyManagement(BillingManager::nextPeriod('2031-02-28', 'year', 29) === '2032-02-29', 'Yearly leap-day restored');
    verifyManagement($pdo->query('SELECT COUNT(*) FROM account_profiles')->fetchColumn() === 2, 'Only isolated fixture accounts exist');
    echo "Admin management smoke: $checks checks passed (isolated fixtures, no live accounts or invoices).\n";
} finally {
    foreach (['settings.json', 'settings.json.lock'] as $filename) {
        if (is_file($directory . '/' . $filename)) {
            unlink($directory . '/' . $filename);
        }
    }
    rmdir($directory);
}
