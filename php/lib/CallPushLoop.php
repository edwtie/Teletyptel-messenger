<?php
declare(strict_types=1);

final class CallPushLoop
{
    public static function run(Closure $iteration, Closure $stopping, ?Closure $sleep = null, ?Closure $clock = null): void
    {
        $sleep ??= static fn(int $microseconds) => usleep($microseconds);
        $clock ??= static fn(): float => hrtime(true) / 1_000_000_000;
        while (!$stopping()) {
            $started = $clock();
            $iteration();
            if ($stopping()) return;
            $remaining = max(0, (int)((1 - max(0, $clock() - $started)) * 1_000_000));
            if ($remaining > 0) $sleep($remaining);
        }
    }
}
