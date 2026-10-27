<?php
declare(strict_types=1);

require_once __DIR__ . '/IntakeManager.php';

final class IntakeHttp
{
    public static function headers(): void
    {
        header('Cache-Control: no-store, private');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: no-referrer');
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    }

    public static function https(): void
    {
        if (empty($_SERVER['HTTPS']) || $_SERVER['HTTPS'] === 'off') {
            throw new IntakeDenied('Gebruik de beveiligde HTTPS-website.');
        }
    }

    public static function csrf(string $expected): void
    {
        $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if (!is_string($provided) || $expected === '' || !hash_equals($expected, $provided)) {
            throw new IntakeDenied('Ververs deze pagina en probeer opnieuw.');
        }
    }

    public static function fresh(array $session, string $accountId): bool
    {
        return ($session['teletyptel_intake_authenticated_id'] ?? '') === $accountId
            && (int)($session['teletyptel_authenticated_at'] ?? 0) > time() - 900;
    }

    public static function json(array $data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
    }

    public static function download(array $file): void
    {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $file['name'] . '"');
        header('Content-Length: ' . strlen($file['content']));
        echo $file['content'];
    }
}
