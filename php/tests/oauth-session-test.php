<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/public/api/auth/bootstrap.php';

final class SessionFixtureStatement extends PDOStatement
{
    public function __construct(private array $row) {}
    public function execute(?array $params = null): bool { return true; }
    public function fetchColumn(int $column = 0): mixed { return 1; }
    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed { return $this->row; }
}
final class SessionFixtureDatabase extends PDO
{
    public function __construct(public bool $twoFactor, public bool $blocked = false) {}
    public function query(string $query, ?int $fetchMode = null, mixed ...$fetchModeArgs): PDOStatement|false { return new SessionFixtureStatement([]); }
    public function prepare(string $query, array $options = []): PDOStatement|false
    {
        return new SessionFixtureStatement(str_contains($query, 'account_access_controls')
            ? ['web_blocked' => $this->blocked ? 1 : 0, 'trashed_at' => null, 'version' => 3]
            : ['two_factor_enabled' => $this->twoFactor ? 1 : 0, 'two_factor_method' => 'authenticator']);
    }
}
function verifySession(bool $condition): void
{
    if (!$condition) throw new RuntimeException('OAuth session regression');
}

session_start();
$account = ['account_id' => 'fictitious-account'];
$_SESSION = ['teletyptel_2fa_pending_account_id' => 'old-account', 'teletyptel_2fa_pending_password' => 'fixture'];
$oldSession = session_id();
$result = ttAuthBindProviderSession(new SessionFixtureDatabase(false), $account);
verifySession($oldSession !== session_id());
verifySession($result === ['ok' => true, 'accountId' => 'fictitious-account']);
verifySession($_SESSION['teletyptel_account_id'] === 'fictitious-account');
verifySession($_SESSION['teletyptel_access_version'] === 3);
verifySession(isset($_SESSION['teletyptel_authenticated_at']));
verifySession(!array_intersect(['teletyptel_2fa_pending_account_id', 'teletyptel_2fa_pending_password'], array_keys($_SESSION)));
$oldSession = session_id();
$result = ttAuthBindProviderSession(new SessionFixtureDatabase(true), $account);
verifySession($oldSession !== session_id());
verifySession($result['twoFactorRequired'] === true && $result['method'] === 'authenticator');
verifySession($_SESSION['teletyptel_2fa_pending_account_id'] === 'fictitious-account');
verifySession(!array_intersect(['teletyptel_account_id', 'teletyptel_authenticated_at', 'teletyptel_intake_authenticated_id'], array_keys($_SESSION)));
$_SESSION = [];
$denied = false;
try { ttAuthBindProviderSession(new SessionFixtureDatabase(false, true), $account); }
catch (AccountAccessDenied $error) { $denied = true; }
verifySession($denied && $_SESSION === []);
session_destroy();
echo "OAuth session: rotation, 2FA and account blocking verified with an offline database fixture.\n";
