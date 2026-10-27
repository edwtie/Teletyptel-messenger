<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/Database.php';
require_once dirname(__DIR__) . '/lib/BillingManager.php';

if (!in_array('--temporary-tables', $argv, true)) {
    fwrite(STDERR, "Use --temporary-tables to test the configured MySQL/MariaDB connection with isolated temporary tables.\n");
    exit(2);
}

$pdo = Database::connect();
$tables = ['account_profiles', 'subscription_plans', 'subscription_history', 'subscription_schedules',
    'billing_invoices', 'billing_sequences', 'billing_recurring', 'admin_audit_log'];
$temporary = [];
$before = hash('sha256', json_encode($pdo->query('SELECT * FROM account_profiles ORDER BY account_id')->fetchAll()));
$checks = 0;
function verifyMysqlManagement(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

try {
    foreach ($tables as $table) {
        $schema = $pdo->query("SHOW CREATE TABLE $table")->fetch(PDO::FETCH_NUM)[1];
        if (str_contains($schema, 'FOREIGN KEY')) {
            throw new RuntimeException('Temporary fixture requires a schema without foreign keys: ' . $table);
        }
        $pdo->exec(preg_replace('/^CREATE TABLE /', 'CREATE TEMPORARY TABLE ', $schema, 1));
        $temporary[] = $table;
    }
    $pdo->exec("INSERT INTO account_profiles (account_id, jid, display_name) VALUES ('fixture-only', 'fixture@example.invalid', 'Isolated fixture')");
    $subscriptions = new SubscriptionManager($pdo);
    $subscriptions->seedPlans();
    $subscriptions->savePlan(['planId' => 'fixture-plus', 'name' => 'Fixture plus', 'description' => '', 'price' => '12.50',
        'billingPeriod' => 'month', 'enabled' => true], 'fixture-owner', true);
    $tomorrow = gmdate('Y-m-d', time() + 86400);
    $subscriptions->schedule(['accountId' => 'fixture-only', 'expectedPlan' => 'free', 'expectedExpiresAt' => null,
        'planId' => 'fixture-plus', 'expiresAt' => '', 'effectiveOn' => $tomorrow], 'fixture-owner');
    verifyMysqlManagement($subscriptions->processDue($tomorrow)['applied'] === 1, 'MySQL scheduled transition applies');
    verifyMysqlManagement($subscriptions->processDue($tomorrow)['applied'] === 0, 'MySQL scheduled transition idempotent');
    $settings = new AdminSettings(sys_get_temp_dir() . '/absent-' . bin2hex(random_bytes(16)) . '.json',
        ['billing' => ['companyName' => 'Fixture company', 'address' => 'Fixture address', 'vatId' => 'Fixture VAT',
            'companyNumber' => 'Fixture registry', 'agbCode' => '01234567', 'defaultVat' => '21', 'paymentDays' => 14]]);
    $billing = new BillingManager($pdo, $settings);
    $input = ['accountId' => 'fixture-only', 'recipientType' => 'insurer', 'customerName' => 'Fixture insurer',
        'customerAddress' => 'Fixture address', 'customerEmail' => '', 'description' => 'Fixture subscription',
        'serviceOn' => gmdate('Y-m-d'), 'dueOn' => $tomorrow, 'unitPrice' => '12.50', 'quantity' => 1,
        'vat' => '21', 'requestKey' => 'isolated-fixture-request-001'];
    $invoice = $billing->saveDraft($input, 'fixture-owner');
    verifyMysqlManagement((int)$invoice['total_cents'] === 1513, 'MySQL integer cent totals');
    verifyMysqlManagement($billing->saveDraft($input, 'fixture-owner')['id'] === $invoice['id'], 'MySQL idempotent draft');
    $issued = $billing->issue($invoice['id'], 1, 'fixture-owner');
    verifyMysqlManagement($issued['status'] === 'issued' && $issued['recipient_type'] === 'insurer', 'MySQL final insurer invoice');
    verifyMysqlManagement($issued['supplier']['agbCode'] === '01234567', 'MySQL AGB snapshot preserves leading zero');
    verifyMysqlManagement($issued['invoice_number'] === 'TT-' . gmdate('Y') . '-000001', 'MySQL unique invoice sequence');
    verifyMysqlManagement($billing->paid($invoice['id'], gmdate('Y-m-d'), 'fixture-reference', 'fixture-owner')['status'] === 'paid', 'MySQL payment registration');
    $billing->saveRecurring(['accountId' => 'fixture-only', 'recipientType' => 'customer', 'customerName' => 'Fixture customer',
        'customerAddress' => 'Fixture address', 'customerEmail' => '', 'vat' => '21', 'nextOn' => gmdate('Y-m-d'),
        'enabled' => true, 'autoIssue' => true, 'confirmed' => true, 'expectedPlan' => 'fixture-plus', 'expectedPlanVersion' => 1], 'fixture-owner');
    $pdo->beginTransaction();
    verifyMysqlManagement($billing->processRecurring()['created'] === 1, 'MySQL nested automatic issuance');
    $pdo->rollBack();
    verifyMysqlManagement($billing->listing()['total'] === 1, 'MySQL outer rollback preserves fixtures');
    verifyMysqlManagement($billing->processRecurring()['created'] === 1, 'MySQL recurring retry');
    verifyMysqlManagement($billing->processRecurring()['created'] === 0, 'MySQL repeated worker does not duplicate');
    verifyMysqlManagement($billing->listing()['total'] === 2, 'Exactly two temporary fixture invoices');
} finally {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    foreach (array_reverse($temporary) as $table) {
        $pdo->exec("DROP TEMPORARY TABLE $table");
    }
}
$after = hash('sha256', json_encode($pdo->query('SELECT * FROM account_profiles ORDER BY account_id')->fetchAll()));
verifyMysqlManagement(hash_equals($before, $after), 'Real profiles unchanged');
echo "MySQL/MariaDB management smoke: $checks checks passed; temporary tables only, real accounts unchanged.\n";
