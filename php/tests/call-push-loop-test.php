<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushLoop.php';
$checks = 0;
$check = function (bool $value, string $label) use (&$checks): void { if (!$value) throw new RuntimeException($label); $checks++; };
$ticks = 0; $now = 0.0; $waits = [];
CallPushLoop::run(function () use (&$ticks, &$now): void { $ticks++; $now += 0.25; },
    static function () use (&$ticks): bool { return $ticks === 3; },
    function (int $delay) use (&$waits, &$now): void { $waits[] = $delay; $now += $delay / 1_000_000; },
    static function () use (&$now): float { return $now; });
$check($ticks === 3, 'Stops without another iteration');
$check($waits === [750000, 750000], 'One-second cadence accounts for elapsed work');
$check($now === 2.25, 'No sleep after stop');
$ticks = 0; $now = 0.0; $waits = [];
CallPushLoop::run(function () use (&$ticks, &$now): void { $ticks++; $now += 2; },
    static function () use (&$ticks): bool { return $ticks === 2; },
    function (int $delay) use (&$waits): void { $waits[] = $delay; },
    static function () use (&$now): float { return $now; });
$check($ticks === 2 && !$waits, 'Slow work cannot produce a negative sleep or overlap');
$ticks = 0;
try {
    CallPushLoop::run(function () use (&$ticks): void { $ticks++; throw new RuntimeException('fixture'); }, static fn(): bool => false);
    throw new LogicException('Failure hidden');
} catch (RuntimeException $error) { $check($error->getMessage() === 'fixture' && $ticks === 1, 'Fails closed instead of retrying an unknown dispatch'); }
CallPushLoop::run(function () use (&$ticks): void { $ticks++; }, static fn(): bool => true);
$check($ticks === 1, 'Already-stopped worker performs no work');
foreach (['--migrate', '--once', '--run', '--monitor'] as $mode) {
    $pipes = [];
    $process = proc_open([PHP_BINARY, dirname(__DIR__, 2) . '/services/call-push/worker.php', $mode],
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, null,
        array_merge(getenv(), ['TELETYPTEL_CALL_PUSH_WORKER' => '0']), ['bypass_shell' => true]);
    if (!is_resource($process)) throw new RuntimeException('Cannot start isolated disabled CLI');
    fclose($pipes[0]); $stdout = stream_get_contents($pipes[1]); $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[1]); fclose($pipes[2]);
    $check(proc_close($process) === 1 && $stdout === '' && str_contains($stderr, 'worker unavailable')
        && !preg_match('/SQLSTATE|password|mysql:/i', $stderr), 'Disabled CLI fails before database/network access');
}
echo "Call push loop: {$checks} checks passed; fake clock and disabled subprocesses, no APNs.\n";
