<?php
declare(strict_types=1);

require_once __DIR__ . '/AccountAccess.php';
require_once __DIR__ . '/NativeProfileService.php';
if (!defined('TELETYPTEL_HISTORY_LIBRARY_ONLY')) {
    define('TELETYPTEL_HISTORY_LIBRARY_ONLY', true);
}
require_once dirname(__DIR__) . '/public/api/history.php';

final class NativeCloudHistoryFailure extends RuntimeException
{
    public function __construct(string $code, public readonly int $status)
    {
        parent::__construct($code);
    }
}

final class NativeCloudHistory
{
    public const MAX_REQUEST_BYTES = 32768;
    public const MAX_RECORD_BYTES = 32768;
    public const MAX_TEXT_BYTES = 8192;
    public const MAX_PAGE_BYTES = 1048576;
    private const JSON_FLAGS = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR;
    private const FIELDS = ['conversationPeer', 'conversationName', 'conversationKind', 'messageId', 'direction',
        'from', 'text', 'status', 'attachment', 'location', 'callInfo', 'jingleHistory', 'stylingDisabled',
        'edited', 'retracted', 'retraction', 'reactions', 'deliveryStatus', 'timestamp', 'version'];

    public static function identity(PDO $pdo, array &$session, mixed $requestedAccount): array
    {
        AccountAccess::guardSession($pdo, $session);
        $accountId = $session['teletyptel_account_id'] ?? '';
        if (!is_string($accountId) || $accountId === '') {
            throw new NativeCloudHistoryFailure('not_authenticated', 401);
        }
        self::text($requestedAccount, 96, true);
        if (!hash_equals($accountId, $requestedAccount)) {
            throw new NativeCloudHistoryFailure('account_access_denied', 403);
        }
        $statement = $pdo->prepare('SELECT * FROM account_profiles WHERE account_id = ?');
        $statement->execute([$accountId]);
        $profile = $statement->fetch(PDO::FETCH_ASSOC);
        if (!$profile || (string)$profile['account_id'] !== $accountId) {
            throw new NativeCloudHistoryFailure('cloud_history_unavailable', 503);
        }
        $owner = historyBareJid((string)($profile['jid'] ?? ''));
        if ($owner === '') {
            throw new NativeCloudHistoryFailure('cloud_history_unavailable', 503);
        }
        return ['accountId' => $accountId, 'owner' => $owner,
            'saveChat' => !array_key_exists('save_chat_history', $profile) || in_array($profile['save_chat_history'], [true, 1, '1'], true)];
    }

    public static function read(PDO $pdo, array &$session, array $query): array
    {
        self::keys($query, ['accountId', 'peer', 'kind', 'limit', 'before']);
        $identity = self::identity($pdo, $session, $query['accountId'] ?? null);
        if (($query['kind'] ?? '') === 'conversations') {
            return self::conversations($pdo, $identity, $query);
        }
        $peer = self::peer($query['peer'] ?? null);
        $kind = self::choice($query['kind'] ?? 'contact', ['contact', 'group']);
        $limit = $query['limit'] ?? '50';
        if ((!is_int($limit) && !is_string($limit)) || !preg_match('/^[1-9][0-9]{0,3}$/D', (string)$limit)) {
            self::invalid();
        }
        $limit = min(50, (int)$limit);
        $params = [$identity['accountId'], $peer, $kind];
        $where = 'account_id = ? AND conversation_peer = ? AND conversation_kind = ?';
        if (array_key_exists('before', $query)) {
            $cursor = self::cursor($query['before'], $identity['accountId'], $peer, $kind);
            $where .= ' AND (message_timestamp < ? OR (message_timestamp = ? AND id < ?))';
            array_push($params, $cursor[4], $cursor[4], $cursor[5]);
        }
        $statement = $pdo->prepare('SELECT * FROM message_history WHERE ' . $where
            . ' ORDER BY message_timestamp DESC, id DESC LIMIT ' . ($limit + 1));
        $statement->execute($params);
        $rows = $statement->fetchAll(PDO::FETCH_ASSOC);
        $messages = [];
        $bytes = 4096;
        $last = null;
        foreach ($rows as $row) {
            if (count($messages) === $limit) break;
            if ($row['account_id'] !== $identity['accountId'] || $row['conversation_peer'] !== $peer
                || $row['conversation_kind'] !== $kind) {
                throw new NativeCloudHistoryFailure('cloud_history_unavailable', 503);
            }
            $message = self::record($row);
            $size = strlen(json_encode($message, self::JSON_FLAGS)) + 1;
            if ($bytes + $size >= self::MAX_PAGE_BYTES) break;
            $messages[] = $message;
            $bytes += $size;
            $last = $row;
        }
        $next = null;
        if (count($messages) < count($rows) && $last !== null) {
            $next = self::encodeCursor([1, $identity['accountId'], $peer, $kind,
                $last['message_timestamp'], (string)$last['id']]);
        }
        return ['ok' => true] + $identity + ['messages' => array_reverse($messages), 'nextCursor' => $next];
    }

    private static function conversations(PDO $pdo, array $identity, array $query): array
    {
        self::keys($query, ['accountId', 'kind', 'limit']);
        $limit = $query['limit'] ?? '32';
        if ((!is_int($limit) && !is_string($limit)) || !preg_match('/^[1-9][0-9]{0,3}$/D', (string)$limit)) self::invalid();
        $limit = min(32, (int)$limit);
        $statement = $pdo->prepare('SELECT history.account_id, history.conversation_peer, history.conversation_kind, history.conversation_name
            FROM message_history history
            WHERE history.account_id = ? AND history.conversation_kind IN (\'contact\', \'group\')
                AND NOT EXISTS (
                    SELECT 1 FROM message_history newer
                    WHERE newer.account_id = history.account_id AND newer.conversation_peer = history.conversation_peer
                        AND newer.conversation_kind = history.conversation_kind
                        AND (newer.message_timestamp > history.message_timestamp
                            OR (newer.message_timestamp = history.message_timestamp AND newer.id > history.id))
                )
            ORDER BY history.message_timestamp DESC, history.id DESC LIMIT ' . $limit);
        $statement->execute([$identity['accountId']]);
        $conversations = [];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if ($row['account_id'] !== $identity['accountId']) {
                throw new NativeCloudHistoryFailure('cloud_history_unavailable', 503);
            }
            $conversations[] = ['peer' => self::peer($row['conversation_peer']),
                'kind' => $row['conversation_kind'], 'name' => self::text($row['conversation_name'], 255)];
        }
        return ['ok' => true] + $identity + ['conversations' => $conversations];
    }

    public static function save(PDO $pdo, array &$session, array $input): array
    {
        self::keys($input, ['accountId', 'message', 'expectedVersion']);
        $identity = self::identity($pdo, $session, $input['accountId'] ?? null);
        if (!$identity['saveChat']) {
            throw new NativeCloudHistoryFailure('cloud_history_disabled', 403);
        }
        if (strlen(json_encode($input, self::JSON_FLAGS)) > self::MAX_REQUEST_BYTES) self::tooLarge();
        if (!array_key_exists('expectedVersion', $input) || !is_array($input['message'] ?? null)) self::invalid();
        $version = $input['expectedVersion'];
        if ($version !== null && (!is_string($version) || !preg_match('/^[a-f0-9]{64}$/D', $version))) self::invalid();
        $message = $input['message'];
        self::keys($message, self::FIELDS);
        if (strlen(json_encode($message, self::JSON_FLAGS)) > self::MAX_RECORD_BYTES) self::tooLarge();
        $messageId = self::text($message['messageId'] ?? null, 150, true);
        $peer = self::peer($message['conversationPeer'] ?? null);
        $kind = self::choice($message['conversationKind'] ?? null, ['contact', 'group']);
        $direction = self::choice($message['direction'] ?? null, ['self', 'peer']);
        $from = self::text($message['from'] ?? null, 255);
        if ($from === '' && ($version === null || $direction !== 'self')) self::invalid();
        if (isset($message['version']) && $message['version'] !== $version) self::conflict();
        if ($pdo->inTransaction()) throw new LogicException('History requires its own transaction');
        self::requireTransactionalStorage($pdo);
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare('SELECT * FROM message_history WHERE account_id = ? AND message_id = ?'
                . ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : ''));
            $statement->execute([$identity['accountId'], $messageId]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
            if ($row) {
                if ($version === null || !hash_equals(self::version($row), $version)
                    || $row['account_id'] !== $identity['accountId'] || $row['message_id'] !== $messageId
                    || $row['conversation_peer'] !== $peer || $row['conversation_kind'] !== $kind
                    || $row['direction'] !== $direction || $row['sender_jid'] !== $from) self::conflict();
                $changes = self::changes($message, $row);
                if ($changes) {
                    $assignments = array_map(static fn(string $column): string => $column . ' = ?', array_keys($changes));
                    $statement = $pdo->prepare('UPDATE message_history SET ' . implode(', ', $assignments)
                        . ' WHERE id = ? AND account_id = ? AND message_id = ? AND conversation_peer = ?'
                        . ' AND conversation_kind = ? AND direction = ? AND sender_jid = ?');
                    $statement->execute([...array_values($changes), $row['id'], $identity['accountId'], $messageId,
                        $peer, $kind, $direction, $from]);
                }
            } else {
                if ($version !== null) self::conflict();
                $values = self::newRow($identity['accountId'], $message);
                $statement = $pdo->prepare('INSERT INTO message_history (' . implode(', ', array_keys($values))
                    . ') VALUES (' . implode(', ', array_fill(0, count($values), '?')) . ')');
                $statement->execute(array_values($values));
            }
            $statement = $pdo->prepare('SELECT * FROM message_history WHERE account_id = ? AND message_id = ?');
            $statement->execute([$identity['accountId'], $messageId]);
            $result = self::record($statement->fetch(PDO::FETCH_ASSOC));
            $pdo->commit();
            return ['ok' => true, 'accountId' => $identity['accountId'], 'owner' => $identity['owner'], 'message' => $result];
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ($error instanceof PDOException && (in_array((string)$error->getCode(), ['23000', '23505', '40001'], true)
                || in_array($error->errorInfo[1] ?? null, [5, 6, 19, 1205, 1213], true))) self::conflict();
            throw $error;
        }
    }

    public static function serve(?PDO $pdo = null): void
    {
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        header('Cross-Origin-Resource-Policy: same-origin');
        header('X-Content-Type-Options: nosniff');
        try {
            self::sameOrigin($_SERVER);
            $method = $_SERVER['REQUEST_METHOD'] ?? '';
            if (!in_array($method, ['GET', 'POST'], true)) {
                header('Allow: GET, POST');
                throw new NativeCloudHistoryFailure('method_not_allowed', 405);
            }
            if (session_status() !== PHP_SESSION_ACTIVE) session_start();
            $pdo ??= Database::connect();
            AccountAccess::guardSession($pdo, $_SESSION);
            if (empty($_SESSION['teletyptel_account_id'])) throw new NativeCloudHistoryFailure('not_authenticated', 401);
            if ($method === 'GET') {
                $result = self::read($pdo, $_SESSION, $_GET);
            } else {
                if ($_GET) self::invalid();
                if (!NativeProfileService::checkCsrf($_SESSION, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
                    throw new NativeCloudHistoryFailure('csrf_failed', 403);
                }
                if (strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0])) !== 'application/json') self::invalid();
                $body = file_get_contents('php://input', false, null, 0, self::MAX_REQUEST_BYTES + 1);
                if (strlen($body ?: '') > self::MAX_REQUEST_BYTES) self::tooLarge();
                $input = json_decode($body ?: '', true, 32, JSON_THROW_ON_ERROR);
                if (!is_array($input)) self::invalid();
                $result = self::save($pdo, $_SESSION, $input);
            }
            echo json_encode($result, self::JSON_FLAGS);
        } catch (NativeCloudHistoryFailure $error) {
            http_response_code($error->status);
            echo json_encode(['ok' => false, 'error' => $error->getMessage()]);
        } catch (AccountAccessDenied $error) {
            http_response_code(403);
            echo json_encode(['ok' => false, 'error' => 'account_access_denied']);
        } catch (InvalidArgumentException|JsonException $error) {
            http_response_code(400);
            echo json_encode(['ok' => false, 'error' => 'cloud_history_invalid_request']);
        } catch (Throwable $error) {
            http_response_code(503);
            echo json_encode(['ok' => false, 'error' => 'cloud_history_unavailable']);
        }
    }

    public static function sameOrigin(array $server): void
    {
        $origin = (!empty($server['HTTPS']) && $server['HTTPS'] !== 'off' ? 'https://' : 'http://') . ($server['HTTP_HOST'] ?? '');
        if ((isset($server['HTTP_ORIGIN']) && $server['HTTP_ORIGIN'] !== $origin)
            || (isset($server['HTTP_SEC_FETCH_SITE']) && !in_array($server['HTTP_SEC_FETCH_SITE'], ['same-origin', 'none'], true))) {
            throw new NativeCloudHistoryFailure('cloud_history_origin_denied', 403);
        }
    }

    public static function version(array $row): string
    {
        ksort($row, SORT_STRING);
        foreach ($row as &$value) $value = $value === null ? null : (string)$value;
        unset($value);
        return hash('sha256', json_encode($row, self::JSON_FLAGS));
    }

    private static function requireTransactionalStorage(PDO $pdo): void
    {
        $driver = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME);
        $indexes = [];
        if ($driver === 'mysql') {
            $statement = $pdo->query("SELECT ENGINE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'message_history'");
            if (strtolower((string)$statement->fetchColumn()) !== 'innodb') {
                throw new NativeCloudHistoryFailure('cloud_history_unavailable', 503);
            }
            foreach ($pdo->query('SHOW INDEX FROM message_history')->fetchAll(PDO::FETCH_ASSOC) as $row) {
                $name = (string)$row['Key_name'];
                $indexes[$name] ??= ['columns' => [], 'valid' => true];
                $indexes[$name]['columns'][] = $row['Column_name'] ?? null;
                $indexes[$name]['valid'] = $indexes[$name]['valid'] && (int)$row['Non_unique'] === 0
                    && array_key_exists('Sub_part', $row) && $row['Sub_part'] === null
                    && ($row['Expression'] ?? null) === null;
            }
        } elseif ($driver === 'sqlite') {
            foreach ($pdo->query('PRAGMA index_list("message_history")')->fetchAll(PDO::FETCH_ASSOC) as $index) {
                if ((int)$index['unique'] !== 1 || (int)$index['partial'] !== 0) continue;
                $columns = $pdo->query('PRAGMA index_info(' . $pdo->quote((string)$index['name']) . ')')->fetchAll(PDO::FETCH_ASSOC);
                $indexes[] = ['columns' => array_column($columns, 'name'),
                    'valid' => count(array_filter($columns, static fn(array $column): bool => (int)$column['cid'] < 0)) === 0];
            }
        }
        foreach ($indexes as $index) {
            sort($index['columns'], SORT_STRING);
            if ($index['valid'] && $index['columns'] === ['account_id', 'message_id']) return;
        }
        throw new NativeCloudHistoryFailure('cloud_history_unavailable', 503);
    }

    private static function record(array $row): array
    {
        $message = historyRowToClient($row) + ['version' => self::version($row)];
        if (strlen(json_encode($message, self::JSON_FLAGS)) > self::MAX_RECORD_BYTES) self::tooLarge();
        return $message;
    }

    private static function changes(array $message, array $row): array
    {
        $client = historyRowToClient($row);
        foreach (['conversationName', 'attachment', 'location', 'callInfo', 'jingleHistory', 'stylingDisabled'] as $field) {
            if (array_key_exists($field, $message) && self::canonical($message[$field]) !== self::canonical($client[$field])) self::invalid();
        }
        if (array_key_exists('timestamp', $message) && self::timestamp($message['timestamp']) !== self::timestamp($client['timestamp'])) self::invalid();
        $changes = [];
        foreach (['text' => 'text', 'status' => 'status', 'edited' => 'edited', 'retracted' => 'retracted',
            'retraction' => 'retraction_json', 'reactions' => 'reactions_json', 'deliveryStatus' => 'delivery_status'] as $field => $column) {
            if (!array_key_exists($field, $message)) continue;
            $value = $message[$field];
            if (self::canonical($value) === self::canonical($client[$field])) continue;
            if (in_array($field, ['edited', 'retracted'], true)) {
                if (!is_bool($value)) self::invalid();
                $value = (int)$value;
            } elseif ($field === 'text' || $field === 'status') {
                $value = self::text($value, $field === 'text' ? self::MAX_TEXT_BYTES : 64);
            } elseif ($field === 'deliveryStatus') {
                $value = self::choice($value, ['', 'sent', 'delivered', 'displayed']);
                $rank = ['' => 0, 'sent' => 1, 'delivered' => 2, 'displayed' => 3];
                if (!isset($rank[$client[$field]]) || $rank[$value] < $rank[$client[$field]]) self::conflict();
            } elseif ($field === 'reactions') {
                if (($row['reactions_json'] ?? '') !== '') {
                    self::reactions(json_decode($row['reactions_json'], true, 32, JSON_THROW_ON_ERROR));
                }
                $value = self::reactions($value);
            } else {
                if (($row['retraction_json'] ?? '') !== '') self::invalid();
                $value = self::metadata($value);
            }
            $changes[$column] = $value;
        }
        if ($client['retracted']) {
            foreach (['text', 'status', 'edited', 'retracted', 'retraction_json'] as $column) {
                if (array_key_exists($column, $changes)) self::conflict();
            }
        } elseif (($changes['retracted'] ?? 0) === 1) {
            $changes['edited'] = 0;
            $changes['status'] = 'retracted';
            $changes['text'] ??= 'Message retracted';
        } else {
            if ($client['edited'] && ($changes['edited'] ?? 1) === 0) self::conflict();
            if (isset($changes['text'])) $changes['edited'] = 1;
            if (($changes['status'] ?? '') === 'retracted') self::invalid();
        }
        return $changes;
    }

    private static function newRow(string $accountId, array $message): array
    {
        foreach (['stylingDisabled', 'edited', 'retracted'] as $field) {
            if (array_key_exists($field, $message) && !is_bool($message[$field])) self::invalid();
        }
        $row = ['account_id' => $accountId, 'conversation_peer' => self::peer($message['conversationPeer']),
            'conversation_name' => self::text($message['conversationName'] ?? '', 255), 'conversation_kind' => $message['conversationKind'],
            'message_id' => $message['messageId'], 'direction' => $message['direction'], 'sender_jid' => $message['from'],
            'text' => self::text($message['text'] ?? '', self::MAX_TEXT_BYTES), 'status' => self::text($message['status'] ?? '', 64),
            'styling_disabled' => (int)($message['stylingDisabled'] ?? false), 'edited' => (int)($message['edited'] ?? false),
            'retracted' => (int)($message['retracted'] ?? false),
            'delivery_status' => self::choice($message['deliveryStatus'] ?? '', ['', 'sent', 'delivered', 'displayed']),
            'message_timestamp' => self::timestamp($message['timestamp'] ?? null)];
        foreach (['attachment' => 'attachment_json', 'location' => 'location_json', 'callInfo' => 'call_info_json',
            'jingleHistory' => 'jingle_history_json', 'retraction' => 'retraction_json', 'reactions' => 'reactions_json'] as $field => $column) {
            $row[$column] = $field === 'reactions' ? self::reactions($message[$field] ?? []) : self::metadata($message[$field] ?? null);
        }
        if ($row['retracted']) {
            $row['edited'] = 0;
            $row['status'] = 'retracted';
            $row['text'] = 'Message retracted';
        } elseif ($row['status'] === 'retracted') self::invalid();
        return $row;
    }

    private static function canonical(mixed $value): string
    {
        if (is_array($value)) {
            if (!array_is_list($value)) ksort($value, SORT_STRING);
            foreach ($value as &$item) $item = self::canonical($item);
            unset($item);
        }
        return json_encode($value, self::JSON_FLAGS);
    }

    private static function metadata(mixed $value): ?string
    {
        if ($value === null) return null;
        if (!is_array($value)) self::invalid();
        $encoded = json_encode($value, self::JSON_FLAGS, 32);
        if (strlen($encoded) > self::MAX_RECORD_BYTES) self::tooLarge();
        return $encoded;
    }

    private static function reactions(mixed $value): ?string
    {
        if (!is_array($value) || count($value) > 64) self::invalid();
        foreach ($value as $actor => $items) {
            self::text($actor, 255, true);
            if (!is_array($items) || !array_is_list($items) || count($items) > 12) self::invalid();
            foreach ($items as $item) self::text($item, 128, true);
        }
        return self::metadata($value);
    }

    private static function text(mixed $value, int $max, bool $required = false): string
    {
        if (is_string($value) && strlen($value) > $max) self::tooLarge();
        if (!is_string($value) || !preg_match('//u', $value)
            || str_contains($value, "\0") || ($required && ($value === '' || trim($value) !== $value
                || preg_match('/[\x00-\x20\x7f]/', $value)))) self::invalid();
        return $value;
    }

    private static function peer(mixed $value): string
    {
        $peer = self::text($value, 255, true);
        if ($peer !== historyBareJid($peer) || substr_count($peer, '@') !== 1
            || str_starts_with($peer, '@') || str_ends_with($peer, '@')) self::invalid();
        return $peer;
    }

    private static function choice(mixed $value, array $choices): string
    {
        if (!is_string($value) || !in_array($value, $choices, true)) self::invalid();
        return $value;
    }

    private static function timestamp(mixed $value): string
    {
        if (!is_string($value) || strlen($value) > 40 || !preg_match('/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})?$/D', $value)) self::invalid();
        try {
            $date = new DateTimeImmutable($value, new DateTimeZone('UTC'));
            $errors = DateTimeImmutable::getLastErrors();
            if ($errors && ($errors['warning_count'] || $errors['error_count'])) self::invalid();
            if ((int)$date->format('Y') < 1000 || (int)$date->format('Y') > 9999) self::invalid();
            return $date->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d H:i:s.v');
        } catch (Exception $error) {
            self::invalid();
        }
    }

    private static function encodeCursor(array $cursor): string
    {
        return rtrim(strtr(base64_encode(json_encode($cursor, self::JSON_FLAGS)), '+/', '-_'), '=');
    }

    private static function cursor(mixed $value, string $accountId, string $peer, string $kind): array
    {
        if (!is_string($value) || strlen($value) > 2048 || !preg_match('/^[A-Za-z0-9_-]+$/D', $value)) self::invalid();
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if ($decoded === false) self::invalid();
        try {
            $cursor = json_decode($decoded, true, 8, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            self::invalid();
        }
        if (!is_array($cursor) || !array_is_list($cursor) || count($cursor) !== 6
            || array_slice($cursor, 0, 4) !== [1, $accountId, $peer, $kind]
            || !is_string($cursor[5]) || !preg_match('/^[1-9][0-9]{0,19}$/D', $cursor[5])
            || self::encodeCursor($cursor) !== $value) self::invalid();
        self::timestamp($cursor[4]);
        return $cursor;
    }

    private static function keys(array $input, array $allowed): void
    {
        if (array_diff(array_keys($input), $allowed)) self::invalid();
    }

    private static function invalid(): never
    {
        throw new NativeCloudHistoryFailure('cloud_history_invalid_request', 400);
    }

    private static function conflict(): never
    {
        throw new NativeCloudHistoryFailure('cloud_history_conflict', 409);
    }

    private static function tooLarge(): never
    {
        throw new NativeCloudHistoryFailure('cloud_history_too_large', 413);
    }
}
