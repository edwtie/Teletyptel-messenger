<?php
declare(strict_types=1);

final class CallPushPolicy
{
    public static function load(PDO $pdo): Closure
    {
        $file = realpath((string)getenv('TELETYPTEL_CALL_PUSH_POLICY_FILE'));
        $normalize = static fn(string $path): string => PHP_OS_FAMILY === 'Windows'
            ? strtolower(str_replace('\\', '/', $path)) : $path;
        if ($file === false || !is_file($file)) throw new RuntimeException('Verified signaling policy required');
        foreach ([dirname(__DIR__, 2), $_SERVER['DOCUMENT_ROOT'] ?? ''] as $directory) {
            if ($directory === '') continue;
            $root = realpath($directory);
            if ($root !== false && str_starts_with($normalize($file), rtrim($normalize($root), '/') . '/')) {
                throw new RuntimeException('Signaling policy must be outside repository and web root');
            }
        }
        $factory = require $file;
        $policy = $factory instanceof Closure ? $factory($pdo) : null;
        if (!$policy instanceof Closure) throw new RuntimeException('Verified signaling policy required');
        return $policy;
    }
}
