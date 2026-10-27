<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/SubscriptionManager.php';

$checks = 0;
function verifySubscription(bool $condition, string $message): void
{
    global $checks;
    if (!$condition) {
        throw new RuntimeException($message);
    }
    $checks++;
}

function rejectSubscription(callable $operation, string $exception = InvalidArgumentException::class): void
{
    try {
        $operation();
    } catch (Throwable $error) {
        verifySubscription($error instanceof $exception, 'Expected ' . $exception . ', got ' . get_class($error));
        return;
    }
    throw new RuntimeException('Expected operation to be rejected.');
}

$pdo = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec("CREATE TABLE account_profiles (
    account_id TEXT PRIMARY KEY, display_name TEXT, jid TEXT, subscription_plan TEXT, subscription_expires_at TEXT,
    account_status TEXT DEFAULT 'active', admin_note TEXT DEFAULT 'Preserve me'
)");
$pdo->exec("INSERT INTO account_profiles (account_id, display_name, jid, subscription_plan) VALUES
    ('alice', 'Alice', 'alice@example.test', 'free'), ('bob', 'Bob', 'bob@example.test', 'legacy-plan')");
$pdo->exec('CREATE TABLE subscription_plans (
    plan_id TEXT PRIMARY KEY, name TEXT, description TEXT, price_cents INTEGER, billing_period TEXT,
    enabled INTEGER, version INTEGER, created_at TEXT, updated_at TEXT
)');
$pdo->exec('CREATE TABLE subscription_history (
    id INTEGER PRIMARY KEY, account_id TEXT, from_plan TEXT, to_plan TEXT, from_plan_name TEXT, to_plan_name TEXT,
    from_expires_at TEXT, to_expires_at TEXT, actor_id TEXT, note TEXT, created_at TEXT
)');
$auditSchema = 'CREATE TABLE admin_audit_log (
    id INTEGER PRIMARY KEY, actor_id TEXT, action TEXT, target_account_id TEXT, created_at TEXT
)';
$pdo->exec($auditSchema);
$pdo->exec("CREATE TABLE subscription_schedules (
    id INTEGER PRIMARY KEY, account_id TEXT, expected_plan TEXT, expected_expires_at TEXT, to_plan TEXT,
    to_expires_at TEXT, effective_on TEXT, status TEXT DEFAULT 'pending', actor_id TEXT, note TEXT,
    error_code TEXT DEFAULT '', created_at TEXT, completed_at TEXT
)");
$subscriptions = new SubscriptionManager($pdo);
$subscriptions->seedPlans();
verifySubscription(count($subscriptions->plans()) === 6, 'Defaults plus preserved legacy plan');
verifySubscription($subscriptions->account('bob')['subscription_plan'] === 'legacy-plan', 'Legacy assignment unchanged');
$subscriptions->seedPlans();
verifySubscription(count($subscriptions->plans()) === 6, 'Seeding is idempotent');
$planInput = ['planId' => 'team-plus', 'name' => 'Team Plus', 'description' => 'For teams', 'price' => '12,50',
    'billingPeriod' => 'month', 'enabled' => true];
$plan = $subscriptions->savePlan($planInput, 'owner', true);
verifySubscription((int)$plan['price_cents'] === 1250 && (int)$plan['version'] === 1, 'Plan created with integer cents');
rejectSubscription(fn() => $subscriptions->savePlan($planInput, 'owner', true), SubscriptionConflict::class);
$edited = $subscriptions->savePlan(array_merge($planInput, ['name' => 'Team Updated', 'price' => '7.5', 'version' => 1]), 'owner', false);
verifySubscription($edited['name'] === 'Team Updated' && (int)$edited['price_cents'] === 750 && (int)$edited['version'] === 2, 'Plan updated');
rejectSubscription(fn() => $subscriptions->savePlan($planInput + ['version' => 1], 'owner', false), SubscriptionConflict::class);
rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['planId' => 'missing', 'version' => 1]), 'owner', false));
foreach (['-1', '0.001', '1e2', 'Infinity', '1000000', '1,234.56'] as $invalidPrice) {
    rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['price' => $invalidPrice]), 'owner', true));
}
foreach (['', 'Upper', 'has space', "' OR 1=1", str_repeat('a', 33)] as $invalidCode) {
    rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['planId' => $invalidCode]), 'owner', true));
}
rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['name' => '']), 'owner', true));
rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['description' => str_repeat('x', 1001)]), 'owner', true));
rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['billingPeriod' => 'invalid']), 'owner', true));
rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['enabled' => 'false']), 'owner', true));
rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['billingPeriod' => 'none']), 'owner', true));
rejectSubscription(fn() => $subscriptions->savePlan(array_merge($planInput, ['planId' => 'free', 'enabled' => false]), 'owner', false));
$unknownPrice = $subscriptions->savePlan(array_merge($planInput, ['planId' => 'contact-us', 'price' => '']), 'owner', true);
verifySubscription($unknownPrice['price_cents'] === null, 'Unset price stays unknown, not zero');
$change = ['accountId' => 'alice', 'planId' => 'team-plus', 'expectedPlan' => 'free', 'expectedExpiresAt' => null,
    'expiresAt' => '2999-12-31', 'note' => 'Customer requested upgrade'];
$result = $subscriptions->change($change, 'owner');
verifySubscription($result['changed'] && $result['account']['subscription_plan'] === 'team-plus', 'Immediate transition applied');
verifySubscription($result['account']['subscription_expires_at'] === '2999-12-31', 'Expiry applied');
verifySubscription($pdo->query("SELECT admin_note FROM account_profiles WHERE account_id = 'alice'")->fetchColumn() === 'Preserve me', 'Unrelated fields preserved');
$history = $subscriptions->history('alice');
verifySubscription($history['total'] === 1 && $history['items'][0]['from_plan'] === 'free', 'Transition history created');
verifySubscription($history['items'][0]['to_plan_name'] === 'Team Updated' && $history['items'][0]['actor_id'] === 'owner', 'Plan name snapshot and actor');
verifySubscription($pdo->query('SELECT action FROM admin_audit_log ORDER BY id DESC LIMIT 1')->fetchColumn() === 'change_subscription', 'Transition audited');
rejectSubscription(fn() => $subscriptions->change($change, 'owner'), SubscriptionConflict::class);
verifySubscription($subscriptions->history('alice')['total'] === 1, 'Stale retry does not duplicate history');
$current = array_merge($change, ['expectedPlan' => 'team-plus', 'expectedExpiresAt' => '2999-12-31']);
verifySubscription(!$subscriptions->change($current, 'owner')['changed'], 'No-op makes no change');
verifySubscription($subscriptions->history('alice')['total'] === 1, 'No-op creates no history');
rejectSubscription(fn() => $subscriptions->change(array_merge($current, ['expectedExpiresAt' => null]), 'owner'), SubscriptionConflict::class);
foreach (['2026-02-30', 'invalid', "2999-12-31\0", '0000-01-01', '2000-01-01'] as $invalidDate) {
    rejectSubscription(fn() => $subscriptions->change(array_merge($current, ['expiresAt' => $invalidDate]), 'owner'));
}
rejectSubscription(fn() => $subscriptions->change(array_merge($current, ['planId' => 'unknown']), 'owner'));
rejectSubscription(fn() => $subscriptions->change(array_merge($current, ['accountId' => 'missing']), 'owner'));
rejectSubscription(fn() => $subscriptions->account("' OR 1=1 --"));
$incomplete = $current;
unset($incomplete['expectedExpiresAt']);
rejectSubscription(fn() => $subscriptions->change($incomplete, 'owner'));
$archived = $subscriptions->savePlan(array_merge($planInput, ['enabled' => false, 'version' => 2]), 'owner', false);
$subscriptions->seedPlans();
verifySubscription((int)$subscriptions->plans()[count($subscriptions->plans()) - 1]['enabled'] === 0, 'Seeding does not re-enable archived plans');
verifySubscription($subscriptions->account('alice')['subscription_plan'] === 'team-plus', 'Archive preserves existing subscription');
$bobChange = ['accountId' => 'bob', 'planId' => 'team-plus', 'expectedPlan' => 'legacy-plan', 'expectedExpiresAt' => null, 'expiresAt' => ''];
rejectSubscription(fn() => $subscriptions->change($bobChange, 'owner'));
$cleared = $subscriptions->change(array_merge($current, ['expiresAt' => '']), 'owner');
verifySubscription($cleared['account']['subscription_expires_at'] === null, 'Expiry can be cleared on a retained archived plan');
verifySubscription($subscriptions->history('bob')['total'] === 0, 'Per-account history is isolated');
verifySubscription($subscriptions->history('missing')['total'] === 0, 'Unknown account has no history');
verifySubscription($subscriptions->history('alice')['items'][1]['to_plan_name'] === 'Team Updated', 'Plan edits do not rewrite historical labels');
$current = array_merge($current, ['expectedExpiresAt' => null, 'expiresAt' => '', 'planId' => 'free']);
$beforeHistory = $subscriptions->history()['total'];
$pdo->exec('DROP TABLE admin_audit_log');
rejectSubscription(fn() => $subscriptions->change($current, 'owner'), PDOException::class);
verifySubscription($subscriptions->account('alice')['subscription_plan'] === 'team-plus', 'Failed audit rolls back profile change');
verifySubscription($subscriptions->history()['total'] === $beforeHistory, 'Failed audit rolls back history');
$pdo->exec($auditSchema);
$pdo->beginTransaction();
$subscriptions->change($current, 'owner');
$pdo->rollBack();
verifySubscription($subscriptions->account('alice')['subscription_plan'] === 'team-plus', 'Nested transaction does not commit caller transaction');
$subscriptions->change($current, 'owner');
for ($index = 0; $index < 30; $index++) {
    $account = $subscriptions->account('bob');
    $subscriptions->change(['accountId' => 'bob', 'expectedPlan' => $account['subscription_plan'],
        'expectedExpiresAt' => null, 'planId' => $account['subscription_plan'] === 'free' ? 'pro' : 'free', 'expiresAt' => ''], 'owner');
}
$first = $subscriptions->history('', 1);
$second = $subscriptions->history('', 2);
verifySubscription(count($first['items']) === 25 && count($second['items']) === 8, 'Transition history paginated');
verifySubscription(array_intersect(array_column($first['items'], 'id'), array_column($second['items'], 'id')) === [], 'History pages do not overlap');
verifySubscription($subscriptions->history('', 999)['page'] === 2, 'History page clamped');
verifySubscription($subscriptions->history('bob')['total'] === 30, 'Correct per-account history total');
echo "Subscription smoke: $checks checks passed (in-memory fixtures only).\n";
