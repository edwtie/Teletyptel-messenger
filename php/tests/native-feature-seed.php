<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli' || getenv('GITHUB_ACTIONS') !== 'true' || getenv('RUNNER_ENVIRONMENT') !== 'github-hosted'
    || getenv('TELETYPTEL_DB_NAME') !== 'native_feature_test' || getenv('TELETYPTEL_DB_HOST') !== '127.0.0.1') {
    throw new RuntimeException('Disposable hosted test database required');
}
require_once dirname(__DIR__) . '/lib/Database.php';
$pdo = Database::connect();
$pdo->exec('CREATE TABLE account_profiles (account_id VARCHAR(96) PRIMARY KEY, jid VARCHAR(255), display_name VARCHAR(120), phone_number VARCHAR(64), preferred_language VARCHAR(16), avatar_color VARCHAR(7), password_hash VARCHAR(255), xmpp_host VARCHAR(255))');
$pdo->exec("INSERT INTO account_profiles VALUES ('fiction-one','one@localhost','One','','nl','#2563eb','unchanged-password','unchanged-host'), ('fiction-two','two@localhost','Two','','en','#2563eb','other-password','other-host')");
AccountAccess::ensureSchema($pdo);
$pdo->exec("INSERT INTO account_access_controls (account_id,web_blocked,version,updated_at) VALUES ('fiction-one',0,1,NOW()),('fiction-two',0,1,NOW())");
echo "Disposable fictional account schema ready\n";
