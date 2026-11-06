<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/lib/CallPushTransport.php';

putenv('TELETYPTEL_CALL_PUSH_WORKER=0');
if (CallPushTransport::send(str_repeat('a', 64), [])['accepted'] !== false) throw new RuntimeException('Disabled transport sent');
putenv('TELETYPTEL_CALL_PUSH_WORKER=1');
putenv('TELETYPTEL_CALL_PUSH_NODE=' . ($argv[1] ?? ''));
putenv('TELETYPTEL_APNS_KEY_FILE=invalid-relative-test-key');
putenv('TELETYPTEL_APNS_KEY_ID=ABCDEFGHIJ');
putenv('TELETYPTEL_APNS_TEAM_ID=KLMNOPQRST');
putenv('TELETYPTEL_CALL_PUSH_ENVIRONMENT=production');
if (!is_file($argv[1] ?? '')) throw new RuntimeException('Pass absolute Node executable path');
$start = microtime(true);
$result = CallPushTransport::send(str_repeat('a', 64), ['callId' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'sid' => 'test', 'hasVideo' => true, 'expiresAt' => time() + 30]);
if ($result['accepted'] !== false || $result['reason'] !== 'TransportUnavailable' || microtime(true) - $start > 5) {
    throw new RuntimeException('Subprocess did not fail safely');
}
echo "Call push PHP/Node transport: disabled and invalid-key subprocess paths passed; no network request.\n";
