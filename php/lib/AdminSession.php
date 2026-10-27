<?php
declare(strict_types=1);

final class AdminSession
{
    public static function current(PDO $pdo, array &$session): ?array
    {
        $identifier = $session['teletyptel_admin_id'] ?? '';
        $row = null;
        if (is_string($identifier) && $identifier !== '' && strlen($identifier) <= 96
            && (int)($session['teletyptel_admin_last_activity'] ?? 0) >= time() - 1800) {
            $statement = $pdo->prepare('SELECT * FROM admin_users WHERE admin_id = ? AND enabled = 1 LIMIT 1');
            $statement->execute([$identifier]);
            $candidate = $statement->fetch(PDO::FETCH_ASSOC);
            $statement->closeCursor();
            if ($candidate && (int)($session['teletyptel_admin_session_version'] ?? 1) === (int)$candidate['session_version']) {
                $row = $candidate;
            }
        }
        if ($row === null) {
            unset($session['teletyptel_admin_id'], $session['teletyptel_admin_session_version'],
                $session['teletyptel_admin_last_activity'], $session['teletyptel_admin_csrf'], $session['intake_password_attempts']);
            return null;
        }
        $session['teletyptel_admin_last_activity'] = time();
        return $row;
    }
}
