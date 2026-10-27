<?php
declare(strict_types=1);

require_once __DIR__ . '/IntakeManager.php';

final class AdminPlanConfiguration
{
    private PDO $pdo;

    public function __construct(PDO $pdo)
    {
        $this->pdo = $pdo;
    }

    public function save(array $input, ?array $admin, bool $create): array
    {
        if ($admin === null || ($admin['role'] ?? '') !== 'owner' || (int)($admin['enabled'] ?? 0) !== 1) {
            throw new IntakeDenied('Alleen de eigenaar kan aanmeldvoorwaarden instellen.');
        }
        $rule = $input['intake'] ?? null;
        if (!is_array($rule)) throw new InvalidArgumentException('Ongeldige aanmeldvoorwaarden.');
        $intake = new IntakeManager($this->pdo);
        $subscriptions = new SubscriptionManager($this->pdo);
        return $subscriptions->savePlan($input, $admin['admin_id'], $create, function (string $planId) use ($intake, $rule, $admin): void {
            $intake->saveRule([
                'planId' => $planId, 'version' => $rule['version'] ?? null,
                'published' => $rule['published'] ?? null,
                'requiresDocuments' => $rule['requiresDocuments'] ?? null,
                'requiresBsn' => $rule['requiresBsn'] ?? null,
            ], $admin['admin_id']);
        });
    }
}
