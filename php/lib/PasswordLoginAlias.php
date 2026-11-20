<?php
declare(strict_types=1);

final class PasswordLoginAlias
{
    public static function resolve(PDO $pdo, string $email): ?array
    {
        $statement = $pdo->prepare(
            "SELECT p.* FROM account_profiles p WHERE EXISTS (
                SELECT 1 FROM account_identities i WHERE i.account_id = p.account_id
                AND LOWER(i.email) = :email AND i.email_verified = 1
                AND i.provider IN ('google', 'facebook', 'apple')
            ) LIMIT 2"
        );
        $statement->execute(['email' => strtolower($email)]);
        $matches = $statement->fetchAll(PDO::FETCH_ASSOC);
        return count($matches) === 1 ? $matches[0] : null;
    }
}
