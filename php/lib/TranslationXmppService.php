<?php
declare(strict_types=1);

require_once __DIR__ . '/TranslationService.php';

final class TranslationXmppService
{
    public const NS = 'urn:xmpp:langtrans';
    public const CONTEXT_NS = 'urn:teletyptel:translation:0';
    private PDO $pdo;
    private TranslationService $translator;
    private string $jid;

    public function __construct(PDO $pdo, TranslationService $translator, string $jid)
    {
        $this->pdo = $pdo;
        $this->translator = $translator;
        $this->jid = $jid;
    }

    public static function configuration(): array
    {
        $path = dirname(__DIR__) . '/storage/translation-xmpp.json';
        return is_file($path) ? (json_decode(file_get_contents($path), true, 16, JSON_THROW_ON_ERROR) ?: []) : [];
    }

    private static function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_XML1, 'UTF-8');
    }

    public function handle(string $xml): ?string
    {
        if (strlen($xml) > 32768 || stripos($xml, '<!DOCTYPE') !== false || stripos($xml, '<!ENTITY') !== false) return null;
        $document = new DOMDocument();
        $previous = libxml_use_internal_errors(true);
        try { $valid = $document->loadXML($xml, LIBXML_NONET); }
        finally { libxml_clear_errors(); libxml_use_internal_errors($previous); }
        $iq = $document->documentElement;
        if (!$valid || !$iq || $iq->localName !== 'iq' || $iq->namespaceURI !== 'jabber:client'
            || !in_array($iq->getAttribute('type'), ['get', 'set'], true)) return null;
        $from = $iq->getAttribute('from');
        $id = $iq->getAttribute('id');
        if ($from === '' || $id === '') return null;
        $reply = '<iq xmlns="jabber:client" from="' . self::escape($this->jid) . '" to="' . self::escape($from) . '" id="' . self::escape($id) . '"';
        try {
            if ($iq->getAttribute('type') !== 'get') throw new TranslationFailure('invalid_request', 400);
            $statement = $this->pdo->prepare('SELECT account_id FROM account_profiles WHERE LOWER(jid) = ?');
            $statement->execute([strtolower(explode('/', $from, 2)[0])]);
            $accountId = $statement->fetchColumn();
            if (!is_string($accountId) || !AccountAccess::allowed($this->pdo, $accountId)) throw new TranslationFailure('sign_in', 403);
            $children = array_values(array_filter(iterator_to_array($iq->childNodes), fn($child) => $child instanceof DOMElement));
            $payload = $children[0] ?? null;
            if (!$payload) throw new TranslationFailure('invalid_request', 400);
            if ($payload->localName === 'query' && $payload->namespaceURI === 'http://jabber.org/protocol/disco#info') {
                return $reply . ' type="result"><query xmlns="http://jabber.org/protocol/disco#info"><identity category="automation" type="translation" name="TeleTypTel Translation"/><feature var="urn:xmpp:langtrans"/><feature var="urn:xmpp:langtrans:items"/></query></iq>';
            }
            if ($payload->localName === 'query' && $payload->namespaceURI === 'urn:xmpp:langtrans:items') {
                $items = '';
                foreach (array_keys(TranslationService::LANGUAGES) as $source) {
                    foreach (array_keys(TranslationService::LANGUAGES) as $target) {
                        if ($source !== $target) $items .= '<item source_lang="' . self::escape($source) . '" destination_lang="' . self::escape($target) . '" jid="' . self::escape($this->jid) . '" engine="Google Cloud Translation"/>';
                    }
                }
                return $reply . ' type="result"><query xmlns="urn:xmpp:langtrans:items">' . $items . '</query></iq>';
            }
            if ($payload->localName !== 'x' || $payload->namespaceURI !== self::NS) throw new TranslationFailure('invalid_request', 400);
            $sources = [];
            $targets = [];
            foreach ($payload->childNodes as $child) {
                if (!$child instanceof DOMElement || $child->namespaceURI !== self::NS) continue;
                if ($child->localName === 'source') $sources[] = $child;
                if ($child->localName === 'translation') $targets[] = $child;
            }
            if (count($sources) !== 1 || count($targets) !== 1 || $targets[0]->hasAttribute('source_lang')
                || $targets[0]->hasAttribute('dictionary')) throw new TranslationFailure('invalid_request', 400);
            $context = null;
            foreach ($children as $child) {
                if ($child->localName === 'context' && $child->namespaceURI === self::CONTEXT_NS) $context = $child;
            }
            $input = ['text' => $sources[0]->textContent, 'targetLanguage' => $targets[0]->getAttribute('destination_lang'), 'consent' => true,
                'automatic' => $context && $context->getAttribute('automatic') === 'true',
                'liveRtt' => $context && $context->getAttribute('live') === 'true',
                'liveDirection' => $context && $context->getAttribute('direction') === 'self' ? 'self' : 'peer'];
            $translation = $this->translator->translate($accountId, $input);
            $source = $translation['sourceLanguage'] ?: ($sources[0]->getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') ?: 'und');
            return $reply . ' type="result"><x xmlns="' . self::NS . '"><source xml:lang="' . self::escape($source) . '">' . self::escape($input['text']) . '</source><translation source_lang="' . self::escape($source) . '" destination_lang="' . self::escape($translation['targetLanguage']) . '" engine="Google Cloud Translation">' . self::escape($translation['text']) . '</translation></x></iq>';
        } catch (TranslationFailure $error) {
            $condition = $error->status === 403 ? 'forbidden' : ($error->status === 429 ? 'resource-constraint' : ($error->status >= 500 ? 'service-unavailable' : 'bad-request'));
            return $reply . ' type="error"><error type="cancel"><' . $condition . ' xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/><failure xmlns="' . self::CONTEXT_NS . '" code="' . self::escape($error->errorCode) . '"/></error></iq>';
        } catch (Throwable $error) {
            return $reply . ' type="error"><error type="wait"><internal-server-error xmlns="urn:ietf:params:xml:ns:xmpp-stanzas"/></error></iq>';
        }
    }
}
