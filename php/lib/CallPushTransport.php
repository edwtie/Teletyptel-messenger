<?php
declare(strict_types=1);

final class CallPushTransport
{
    public static function send(string $deviceToken, array $invitation): array
    {
        $unavailable = ['accepted' => false, 'reason' => 'TransportUnavailable', 'invalidateDevice' => false];
        if (getenv('TELETYPTEL_CALL_PUSH_WORKER') !== '1') return $unavailable;
        $node = (string)getenv('TELETYPTEL_CALL_PUSH_NODE');
        if (!is_file($node) || !preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $node)) return $unavailable;
        $command = [$node, dirname(__DIR__, 2) . '/services/call-push/send.js'];
        $pipes = [];
        $process = proc_open($command, [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['file', PHP_OS_FAMILY === 'Windows' ? 'NUL' : '/dev/null', 'a']],
            $pipes, null, null, ['bypass_shell' => true]);
        if (!is_resource($process)) return $unavailable;
        try {
            $request = json_encode(['deviceToken' => $deviceToken, 'invitation' => $invitation], JSON_THROW_ON_ERROR);
            if (strlen($request) > 4096 || fwrite($pipes[0], $request) !== strlen($request)) return $unavailable;
            fclose($pipes[0]);
            unset($pipes[0]);
            stream_set_blocking($pipes[1], false);
            $response = '';
            $deadline = microtime(true) + 16;
            do {
                $chunk = stream_get_contents($pipes[1]);
                if ($chunk === false) return $unavailable;
                $response .= $chunk;
                if (strlen($response) > 4096 || microtime(true) > $deadline) return $unavailable;
                $status = proc_get_status($process);
                if (!$status['running']) {
                    $response .= stream_get_contents($pipes[1]);
                    break;
                }
                usleep(10000);
            } while (true);
            if (strlen($response) > 4096 || $status['exitcode'] !== 0) return $unavailable;
            $result = json_decode($response, true);
            if (!is_array($result) || !is_bool($result['accepted'] ?? null)) return $unavailable;
            return $result;
        } finally {
            foreach ($pipes as $pipe) if (is_resource($pipe)) fclose($pipe);
            if (proc_get_status($process)['running']) proc_terminate($process);
            proc_close($process);
        }
    }
}
