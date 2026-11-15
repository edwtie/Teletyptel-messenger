<?php
declare(strict_types=1);

require_once __DIR__ . '/CallPushSignaling.php';

final class CallPushSpool
{
    public function __construct(private string $directory)
    {
        $resolved = realpath($directory);
        if ($resolved === false || !is_dir($resolved) || is_link($directory)) throw new CallPushFailure('Signaleringswachtrij ontbreekt.', 503);
        $normalize = static fn(string $path): string => PHP_OS_FAMILY === 'Windows' ? strtolower(str_replace('\\', '/', $path)) : $path;
        foreach ([dirname(__DIR__, 2), $_SERVER['DOCUMENT_ROOT'] ?? ''] as $root) {
            if ($root === '' || ($root = realpath($root)) === false) continue;
            if ($normalize($resolved) === $normalize($root)
                || str_starts_with($normalize($resolved), rtrim($normalize($root), '/') . '/')) {
                throw new CallPushFailure('Signaleringswachtrij moet buiten de website staan.', 503);
            }
        }
        if (PHP_OS_FAMILY !== 'Windows' && (fileperms($resolved) & 0077) !== 0) throw new CallPushFailure('Onveilige wachtrijrechten.', 503);
        $this->directory = $resolved;
    }

    public function drain(CallPushSignaling $signaling, int $limit = 128): array
    {
        if ($limit < 1 || $limit > 128) throw new CallPushFailure('Ongeldige werkbatch.');
        $lockPath = $this->directory . DIRECTORY_SEPARATOR . '.consumer';
        if (is_link($lockPath)) throw new CallPushFailure('Onveilige wachtrijvergrendeling.', 503);
        $lock = fopen($lockPath, 'c');
        if ($lock === false) throw new CallPushFailure('Wachtrij niet beschikbaar.', 503);
        if (PHP_OS_FAMILY !== 'Windows') chmod($lockPath, 0600);
        try {
            if (!flock($lock, LOCK_EX | LOCK_NB)) return ['processed' => 0, 'rejected' => 0, 'busy' => true];
            $names = scandir($this->directory);
            if ($names === false || count($names) > 8192) throw new CallPushFailure('Wachtrij niet beschikbaar.', 503);
            $processed = 0; $rejected = 0;
            foreach ($names as $name) {
                if (!preg_match('/\A[0-9]{20}_[0-9a-f]{32}\.json\z/', $name)) continue;
                if ($processed + $rejected >= $limit) break;
                $path = $this->directory . DIRECTORY_SEPARATOR . $name;
                $stat = lstat($path);
                if ($stat === false || ($stat['mode'] & 0170000) !== 0100000
                    || $stat['size'] > 16384 || PHP_OS_FAMILY !== 'Windows' && ($stat['mode'] & 0077) !== 0) {
                    $rejected++;
                    if (!is_dir($path)) unlink($path);
                    continue;
                }
                $raw = file_get_contents($path, false, null, 0, 16385);
                if (!is_string($raw)) throw new CallPushFailure('Wachtrij niet beschikbaar.', 503);
                try { $signaling->ingest($raw); $processed++; }
                catch (CallPushFailure $error) {
                    if ($error->status >= 500 || $error->status === 429) throw $error;
                    $rejected++;
                }
                if (!unlink($path)) throw new CallPushFailure('Wachtrij niet beschikbaar.', 503);
            }
            return ['processed' => $processed, 'rejected' => $rejected, 'busy' => false];
        } finally { flock($lock, LOCK_UN); fclose($lock); }
    }
}
