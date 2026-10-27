<?php
declare(strict_types=1);
if (PHP_SAPI !== 'cli') exit(1);
$path = dirname(__DIR__) . '/storage/translation-xmpp.json';
if (is_file($path)) {
    $config = json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR);
    if (in_array('--enable', $argv, true)) {
        $config['enabled'] = true;
        file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX);
        fwrite(STDOUT, "XEP-0171 routing enabled for authenticated clients.\n");
    }
    if (in_array('--disable', $argv, true)) {
        $config['enabled'] = false;
        file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX);
        fwrite(STDOUT, "XEP-0171 routing disabled; existing HTTP translation retained.\n");
    }
    if (!isset($config['caFile'])) {
        $config['caFile'] = realpath(dirname(__DIR__) . '/public/ejabberd-localhost-dev.crt');
        file_put_contents($path, json_encode($config, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), LOCK_EX);
    }
    fwrite(STDOUT, "Translation service configuration already exists; credentials unchanged.\n");
    exit(0);
}
$password = bin2hex(random_bytes(32));
$process = proc_open(['docker', 'exec', '-i', 'teletyptel-ejabberd', 'sh', '-c', 'read -r PASSWORD; exec /home/ejabberd/bin/ejabberdctl register translation localhost "$PASSWORD"'],
    [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
if (!is_resource($process)) exit(1);
fwrite($pipes[0], $password . "\n");
fclose($pipes[0]);
stream_get_contents($pipes[1]);
stream_get_contents($pipes[2]);
fclose($pipes[1]);
fclose($pipes[2]);
if (proc_close($process) !== 0) {
    fwrite(STDERR, "Service account could not be created; no existing account or password was changed.\n");
    exit(1);
}
$config = ['enabled' => false, 'jid' => 'translation@localhost/teletyptel-translation', 'host' => 'localhost', 'port' => 5222, 'password' => $password,
    'caFile' => realpath(dirname(__DIR__) . '/public/ejabberd-localhost-dev.crt')];
$handle = fopen($path, 'x');
if (!$handle) throw new RuntimeException('Cannot save private service configuration.');
fwrite($handle, json_encode($config, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
fclose($handle);
chmod($path, 0600);
fwrite(STDOUT, "Technical XMPP account created. Translation routing stays disabled until verified.\n");
