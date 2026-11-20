<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/lib/PasswordLoginAlias.php';

$pdo = new PDO('sqlite::memory:');
$pdo->exec('CREATE TABLE account_profiles(account_id TEXT PRIMARY KEY)');
$pdo->exec('CREATE TABLE account_identities(account_id TEXT, provider TEXT, email TEXT, email_verified INTEGER)');
$pdo->exec("INSERT INTO account_profiles VALUES ('one'), ('two')");
$add = $pdo->prepare('INSERT INTO account_identities VALUES (?, ?, ?, ?)');
$email = 'contact@example.invalid';
$expect = static function (?string $expected) use ($pdo, $email): void {
    if ((PasswordLoginAlias::resolve($pdo, strtoupper($email))['account_id'] ?? null) !== $expected) {
        throw new RuntimeException('Unexpected alias resolution');
    }
};
$expect(null);
$add->execute(['one', 'google', $email, 0]);
$add->execute(['one', 'email', $email, 1]);
$expect(null);
$add->execute(['one', 'facebook', $email, 1]);
$add->execute(['one', 'google', $email, 1]);
$expect('one');
$add->execute(['two', 'apple', $email, 1]);
$expect(null);
echo "Verified alias cases passed.\n";
