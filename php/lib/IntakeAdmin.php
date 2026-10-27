<?php
declare(strict_types=1);

require_once __DIR__ . '/IntakeHttp.php';

function handleIntakeAdmin(PDO $pdo, string $action, ?array $input): void
{
    IntakeHttp::headers();
    IntakeHttp::https();
    $admin = currentAdminUser($pdo);
    $ownerAction = in_array($action, ['intake_config', 'intake_rule'], true);
    $teamAction = in_array($action, ['intake_members', 'intake_team', 'intake_staff', 'intake_staff_status'], true);
    if ($admin === null || (int)($admin['enabled'] ?? 0) !== 1
        || ($ownerAction && $admin['role'] !== 'owner')
        || ($teamAction && !in_array($admin['role'], ['owner', 'admin'], true))
        || (!$ownerAction && !$teamAction && !IntakeManager::reviewer($admin))) {
        throw new IntakeDenied('Geen bevoegdheid voor deze actie. Staff heeft apart toegekende inzagerechten nodig.');
    }
    $intake = new IntakeManager($pdo);
    $actor = $admin['admin_id'];
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        if ($action === 'intake_config') {
            jsonResponse(['ok' => true, 'plans' => $intake->plans(true), 'readiness' => $intake->readiness()]);
        } elseif ($action === 'intake_members') {
            $team = $pdo->query('SELECT admin_id, email, display_name, role, enabled, can_review_intake, session_version FROM admin_users'
                . ($admin['role'] === 'owner' ? '' : " WHERE role = 'staff'") . ' ORDER BY display_name, email')->fetchAll(PDO::FETCH_ASSOC);
            $team = array_map(fn(array $member): array => $member + ['canReviewIntake' => IntakeManager::reviewer($member)], $team);
            jsonResponse(['ok' => true, 'team' => $team]);
        } elseif ($action === 'intake_list') {
            $intake->audit($actor, 'list_applications');
            jsonResponse(['ok' => true, 'applications' => $intake->listing((int)adminQuery('page', '1'))]);
        } elseif ($action === 'intake_view') {
            $identifier = AdminSettings::text(adminQuery('id'), 32);
            $application = $intake->view($identifier, null, $actor);
            $statement = $pdo->prepare('SELECT actor_id, action, created_at FROM intake_audit WHERE application_id = ? ORDER BY id DESC LIMIT 100');
            $statement->execute([$identifier]);
            jsonResponse(['ok' => true, 'application' => $application, 'audit' => $statement->fetchAll(PDO::FETCH_ASSOC)]);
        } else {
            throw new InvalidArgumentException('Onbekende actie.');
        }
        return;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || $input === null) {
        throw new InvalidArgumentException('Gebruik POST.');
    }
    IntakeHttp::csrf(adminCsrfToken());
    if (in_array($action, ['intake_team', 'intake_staff', 'intake_staff_status', 'intake_bsn', 'intake_document'], true)) {
        intakeConfirmPassword($admin, $input);
    }
    if ($action === 'intake_rule') {
        $intake->saveRule($input, $actor);
        jsonResponse(['ok' => true]);
    } elseif ($action === 'intake_team') {
        foreach (['canReview', 'expected'] as $flag) {
            if (!is_bool($input[$flag] ?? null)) {
                throw new InvalidArgumentException('Ongeldige bevoegdheid.');
            }
        }
        $target = AdminSettings::text($input['adminId'] ?? '', 96);
        $expectedVersion = AdminSettings::integer($input['expectedVersion'] ?? 0, 1, PHP_INT_MAX);
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare("UPDATE admin_users SET can_review_intake = ? WHERE admin_id = ? AND can_review_intake = ? AND enabled = 1 AND role = 'staff' AND session_version = ?");
            $statement->execute([(int)$input['canReview'], $target, (int)$input['expected'], $expectedVersion]);
            if ($statement->rowCount() !== 1) {
                throw new SubscriptionConflict('Account of bevoegdheid gewijzigd. Ververs eerst.');
            }
            (new AdminUserDirectory($pdo))->recordAccess($actor, $input['canReview'] ? 'grant_intake_access' : 'revoke_intake_access', $target);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
        jsonResponse(['ok' => true]);
    } elseif ($action === 'intake_staff_status') {
        if (($input['confirmed'] ?? false) !== true || !is_bool($input['enabled'] ?? null)
            || !is_bool($input['expectedEnabled'] ?? null) || $input['enabled'] === $input['expectedEnabled']) {
            throw new InvalidArgumentException('Bevestig het blokkeren of deblokkeren van het staffaccount.');
        }
        $target = AdminSettings::text($input['adminId'] ?? '', 96);
        $expectedVersion = AdminSettings::integer($input['expectedVersion'] ?? 0, 1, PHP_INT_MAX);
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare("UPDATE admin_users SET enabled = ?, can_review_intake = 0, session_version = session_version + 1
                WHERE admin_id = ? AND role = 'staff' AND enabled = ? AND session_version = ?");
            $statement->execute([(int)$input['enabled'], $target, (int)$input['expectedEnabled'], $expectedVersion]);
            if ($statement->rowCount() !== 1) {
                throw new SubscriptionConflict('Staffaccount gewijzigd of niet beschikbaar. Ververs eerst.');
            }
            (new AdminUserDirectory($pdo))->recordAccess($actor, $input['enabled'] ? 'unblock_staff' : 'block_staff', $target);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            throw $error;
        }
        jsonResponse(['ok' => true]);
    } elseif ($action === 'intake_staff') {
        $email = strtolower(AdminSettings::text($input['email'] ?? '', 255));
        $password = $input['staffPassword'] ?? '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !is_string($password) || strlen($password) < 12 || strlen($password) > 72) {
            throw new InvalidArgumentException('Geldig e-mailadres en staffwachtwoord van 12 tot 72 bytes vereist.');
        }
        $identifier = 'staff-' . bin2hex(random_bytes(16));
        $pdo->beginTransaction();
        try {
            $pdo->prepare("INSERT INTO admin_users (admin_id, email, display_name, password_hash, role, can_review_intake) VALUES (?, ?, ?, ?, 'staff', 0)")
                ->execute([$identifier, $email, AdminSettings::text($input['displayName'] ?? '', 120), password_hash($password, PASSWORD_DEFAULT)]);
            (new AdminUserDirectory($pdo))->recordAccess($actor, 'create_intake_staff', $identifier);
            $pdo->commit();
        } catch (Throwable $error) {
            $pdo->rollBack();
            if ($error instanceof PDOException && $error->getCode() === '23000') {
                throw new InvalidArgumentException('Dit beheeraccount bestaat al.');
            }
            throw $error;
        }
        jsonResponse(['ok' => true]);
    } elseif ($action === 'intake_review') {
        jsonResponse(['ok' => true, 'application' => $intake->review($input, $actor)]);
    } elseif ($action === 'intake_bsn') {
        jsonResponse(['ok' => true, 'bsn' => $intake->revealBsn(AdminSettings::text($input['id'] ?? '', 32), null, $actor)]);
    } elseif ($action === 'intake_document') {
        IntakeHttp::download($intake->document(AdminSettings::text($input['id'] ?? '', 32),
            AdminSettings::text($input['documentId'] ?? '', 32), null, $actor));
    } else {
        throw new InvalidArgumentException('Onbekende actie.');
    }
}

function intakeConfirmPassword(array $admin, array $input): void
{
    $attempts = $_SESSION['intake_password_attempts'] ?? ['since' => time(), 'count' => 0];
    if ($attempts['since'] < time() - 900) {
        $attempts = ['since' => time(), 'count' => 0];
    }
    if ($attempts['count'] >= 5) {
        throw new IntakeDenied('Te veel pogingen. Probeer over 15 minuten opnieuw.');
    }
    $password = $input['reviewPassword'] ?? '';
    if (!is_string($password) || !password_verify($password, $admin['password_hash'])) {
        $attempts['count']++;
        $_SESSION['intake_password_attempts'] = $attempts;
        throw new IntakeDenied('Bevestig met je eigen beheerwachtwoord.');
    }
    unset($_SESSION['intake_password_attempts']);
}
