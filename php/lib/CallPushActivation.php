<?php
declare(strict_types=1);
require_once __DIR__ . '/CallPushRecovery.php';
require_once __DIR__ . '/CallPushTransport.php';

final class CallPushActivation
{
    public static function ensureSchema(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS call_push_worker_health (environment VARCHAR(16) PRIMARY KEY, checked BIGINT NOT NULL)'
            . ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_bin' : ''));
    }

    public static function refresh(PDO $pdo): void
    {
        if (getenv('TELETYPTEL_CALL_BACKGROUND_PILOT') !== '1') return;
        if ($pdo->inTransaction()) throw new CallPushFailure('Oproepcontrole vereist een vrije verbinding.', 503);
        $environment = (string)getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT');
        try {
            if ($environment !== 'production' || !CallPushTransport::configurationReady()
                || !CallScopeRevocation::configured($pdo)->probe()) throw new CallPushFailure('Oproepketen niet gereed.', 503);
            CallPushRecovery::configured($pdo);
            $pdo->query('SELECT nonce FROM call_bootstrap_issues WHERE 1 = 0');
            $pdo->query('SELECT nonce FROM call_bootstrap_leases WHERE 1 = 0');
            $pdo->query('SELECT call_id FROM call_signaling_active WHERE 1 = 0');
        } catch (Throwable $error) {
            $pdo->prepare('DELETE FROM call_push_worker_health WHERE environment = ?')->execute([$environment]);
            throw $error;
        }
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM call_push_worker_health WHERE environment = ?')->execute([$environment]);
            $pdo->prepare('INSERT INTO call_push_worker_health VALUES (?, ?)')->execute([$environment, time()]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public static function ready(PDO $pdo, string $account, ?int $now = null): bool
    {
        if (getenv('TELETYPTEL_CALL_BACKGROUND_PILOT') !== '1' || getenv('TELETYPTEL_CALL_PUSH_WORKER') !== '1'
            || getenv('TELETYPTEL_CALL_PUSH_REGISTRY') !== '1' || getenv('TELETYPTEL_CALL_SCOPE_REVOCATION') !== '1'
            || getenv('TELETYPTEL_CALL_RECOVERY_LAB') !== '1' || getenv('TELETYPTEL_CALL_SIGNALING') !== '1'
            || getenv('TELETYPTEL_CALL_PUSH_POLICY') !== 'signaling-v1' || getenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT') !== 'production') return false;
        $raw = (string)getenv('TELETYPTEL_CALL_BACKGROUND_PILOT_ACCOUNTS');
        $accounts = strlen($raw) <= 1024 ? json_decode($raw, true) : null;
        if (!is_array($accounts) || !array_is_list($accounts) || !$accounts || count($accounts) > 8
            || !in_array($account, $accounts, true)) return false;
        foreach ($accounts as $value) if (!is_string($value) || strlen($value) > 96 || $value === '') return false;
        try {
            if (!AccountAccess::allowed($pdo, $account)) return false;
            $query = $pdo->prepare('SELECT checked FROM call_push_worker_health WHERE environment = ?');
            $query->execute(['production']); $checked = $query->fetchColumn(); $now ??= time();
            return $checked !== false && (int)$checked <= $now && (int)$checked >= $now - 5;
        } catch (Throwable $error) { return false; }
    }
}
