<?php
declare(strict_types=1);

final class Database
{
    public static function connect(): PDO
    {
        return self::connectNamed('mysql');
    }

    public static function connectXmpp(): PDO
    {
        return self::connectNamed('xmpp_mysql');
    }

    private static function connectNamed(string $name): PDO
    {
        $config = self::loadConfig()['mysql'] ?? [];
        if ($name !== 'mysql') {
            $config = self::loadConfig()[$name] ?? $config;
        }

        $prefix = $name === 'mysql' ? 'TELETYPTEL_DB' : 'TELETYPTEL_XMPP_DB';
        $fallbackDatabase = $name === 'mysql' ? 'teletyptel' : 'ejabberd';
        $fallbackUsername = $name === 'mysql' ? 'teletyptel' : 'ejabberd';
        $host = self::env($prefix . '_HOST', (string)($config['host'] ?? '127.0.0.1'));
        $port = (int)self::env($prefix . '_PORT', (string)($config['port'] ?? '3306'));
        $database = self::env($prefix . '_NAME', (string)($config['database'] ?? $fallbackDatabase));
        $username = self::env($prefix . '_USER', (string)($config['username'] ?? $fallbackUsername));
        $password = self::env($prefix . '_PASSWORD', (string)($config['password'] ?? ''));
        $charset = (string)($config['charset'] ?? 'utf8mb4');

        $dsn = "mysql:host={$host};port={$port};dbname={$database};charset={$charset}";
        return new PDO($dsn, $username, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }

    private static function loadConfig(): array
    {
        $path = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'config.php';
        if (!is_file($path)) {
            return [];
        }

        $config = require $path;
        return is_array($config) ? $config : [];
    }

    private static function env(string $key, string $fallback): string
    {
        $value = getenv($key);
        return $value === false || $value === '' ? $fallback : $value;
    }
}
