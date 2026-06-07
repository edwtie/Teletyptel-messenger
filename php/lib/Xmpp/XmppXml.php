<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

use DOMDocument;
use DOMElement;
use DOMNode;
use DOMXPath;
use InvalidArgumentException;
use RuntimeException;

final class XmppXml
{
    public const CLIENT_NS = 'jabber:client';
    public const STREAM_NS = 'http://etherx.jabber.org/streams';
    public const STREAM_ERROR_NS = 'urn:ietf:params:xml:ns:xmpp-streams';
    public const STANZA_ERROR_NS = 'urn:ietf:params:xml:ns:xmpp-stanzas';
    public const SASL_NS = 'urn:ietf:params:xml:ns:xmpp-sasl';
    public const BIND_NS = 'urn:ietf:params:xml:ns:xmpp-bind';
    public const ROSTER_NS = 'jabber:iq:roster';
    public const REGISTER_NS = 'jabber:iq:register';
    public const REGISTER_FEATURE_NS = 'http://jabber.org/features/iq-register';
    public const SESSION_NS = 'urn:ietf:params:xml:ns:xmpp-session';
    public const SM_NS = 'urn:xmpp:sm:3';
    public const DISCO_INFO_NS = 'http://jabber.org/protocol/disco#info';
    public const DISCO_ITEMS_NS = 'http://jabber.org/protocol/disco#items';
    public const DATA_FORM_NS = 'jabber:x:data';
    public const RSM_NS = 'http://jabber.org/protocol/rsm';
    public const COMMANDS_NS = 'http://jabber.org/protocol/commands';
    public const SERVERINFO_NS = 'http://jabber.org/network/serverinfo';
    public const IBB_NS = 'http://jabber.org/protocol/ibb';
    public const S5B_NS = 'http://jabber.org/protocol/bytestreams';
    public const RTT_NS = 'urn:xmpp:rtt:0';
    public const PUBSUB_NS = 'http://jabber.org/protocol/pubsub';
    public const PUBSUB_EVENT_NS = 'http://jabber.org/protocol/pubsub#event';
    public const PUBSUB_OWNER_NS = 'http://jabber.org/protocol/pubsub#owner';
    public const PUBSUB_NODE_CONFIG_NS = 'http://jabber.org/protocol/pubsub#node_config';
    public const PUBSUB_SUBSCRIBE_OPTIONS_NS = 'http://jabber.org/protocol/pubsub#subscribe_options';
    public const MAM_NS = 'urn:xmpp:mam:2';
    public const HTTP_UPLOAD_NS = 'urn:xmpp:http:upload:0';
    public const GEOLOC_NS = 'http://jabber.org/protocol/geoloc';
    public const JINGLE_NS = 'urn:xmpp:jingle:1';
    public const JINGLE_RTP_NS = 'urn:xmpp:jingle:apps:rtp:1';
    public const JINGLE_ICE_UDP_NS = 'urn:xmpp:jingle:transports:ice-udp:1';
    public const JINGLE_S5B_NS = 'urn:xmpp:jingle:transports:s5b:1';
    public const JINGLE_IBB_NS = 'urn:xmpp:jingle:transports:ibb:1';
    public const JINGLE_RTT_SYNC_NS = 'urn:xmpp:jingle:apps:rtt-sync:0';
    public const JINGLE_GEOLOC_NS = 'urn:xmpp:jingle:apps:geoloc:0';
    public const RECEIPTS_NS = 'urn:xmpp:receipts';
    public const CHAT_STATES_NS = 'http://jabber.org/protocol/chatstates';
    public const MESSAGE_CORRECT_NS = 'urn:xmpp:message-correct:0';
    public const MESSAGE_RETRACT_NS = 'urn:xmpp:message-retract:1';
    public const CARBONS_NS = 'urn:xmpp:carbons:2';
    public const FORWARD_NS = 'urn:xmpp:forward:0';
    public const DELAY_NS = 'urn:xmpp:delay';
    public const STANZA_IDS_NS = 'urn:xmpp:sid:0';
    public const HINTS_NS = 'urn:xmpp:hints';
    public const ME_COMMAND_NS = 'urn:xmpp:me:0';
    public const BOSH_NS = 'http://jabber.org/protocol/httpbind';
    public const XBOSH_NS = 'urn:xmpp:xbosh';
    public const CAPS_NS = 'http://jabber.org/protocol/caps';
    public const VCARD_TEMP_NS = 'vcard-temp';
    public const PRIVATE_NS = 'jabber:iq:private';
    public const BOOKMARKS_NS = 'storage:bookmarks';
    public const BOOKMARKS2_NS = 'urn:xmpp:bookmarks:1';
    public const AVATAR_DATA_NS = 'urn:xmpp:avatar:data';
    public const AVATAR_METADATA_NS = 'urn:xmpp:avatar:metadata';
    public const VCARD_TEMP_UPDATE_NS = 'vcard-temp:x:update';
    public const EXTERNAL_SERVICE_NS = 'urn:xmpp:extdisco:2';
    public const CSI_NS = 'urn:xmpp:csi:0';
    public const PUSH_NS = 'urn:xmpp:push:0';
    public const CLIENT_ACCESS_MANAGEMENT_NS = 'urn:xmpp:cam:0';
    public const ALT_CONNECTIONS_NS = 'urn:xmpp:alt-connections:xbosh';
    public const REFERENCE_NS = 'urn:xmpp:reference:0';
    public const SIMS_NS = 'urn:xmpp:sims:1';
    public const FILE_TRANSFER_NS = 'urn:xmpp:jingle:apps:file-transfer:5';
    public const HASHES_NS = 'urn:xmpp:hashes:2';
    public const MARKUP_NS = 'urn:xmpp:markup:0';
    public const EMOJI_MARKUP_NS = 'urn:xmpp:markup:emoji:0';
    public const STYLING_NS = 'urn:xmpp:styling:0';
    public const MODERATION_NS = 'urn:xmpp:message-moderate:1';
    public const CHANNEL_SEARCH_NS = 'urn:xmpp:channel-search:0:search';
    public const CHANNEL_SEARCH_PARAMS_NS = 'urn:xmpp:channel-search:0:search-params';
    public const OMEMO_NS = 'urn:xmpp:omemo:2';

    public static function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    /**
     * @param array<string, string|int|float|bool|null> $attributes
     */
    public static function attributes(array $attributes): string
    {
        $xml = '';
        foreach ($attributes as $name => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            if (!preg_match('/^[A-Za-z_][A-Za-z0-9_.:-]*$/', $name)) {
                throw new InvalidArgumentException("Invalid XML attribute name '{$name}'.");
            }

            $xml .= ' ' . $name . '="' . self::escape((string)$value) . '"';
        }

        return $xml;
    }

    /**
     * @param array<string, string|int|float|bool|null> $attributes
     */
    public static function element(string $name, string $namespace, array $attributes = [], ?string $content = null): string
    {
        if (!preg_match('/^[A-Za-z_][A-Za-z0-9_.:-]*$/', $name)) {
            throw new InvalidArgumentException("Invalid XML element name '{$name}'.");
        }

        $attrs = $attributes;
        $attrs = ['xmlns' => $namespace] + $attrs;
        if ($content === null) {
            return '<' . $name . self::attributes($attrs) . '/>';
        }

        return '<' . $name . self::attributes($attrs) . '>' . $content . '</' . $name . '>';
    }

    public static function textElement(string $name, string $namespace, string $value): string
    {
        return self::element($name, $namespace, [], self::escape($value));
    }

    public static function document(string $xml): DOMDocument
    {
        $previous = libxml_use_internal_errors(true);
        $document = new DOMDocument('1.0', 'UTF-8');
        $document->preserveWhiteSpace = true;
        $loaded = $document->loadXML($xml, LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING);
        $errors = libxml_get_errors();
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        if (!$loaded || $document->documentElement === null) {
            $message = $errors[0]->message ?? 'Invalid XML.';
            throw new RuntimeException(trim($message));
        }

        return $document;
    }

    public static function xpath(DOMDocument $document): DOMXPath
    {
        $xpath = new DOMXPath($document);
        $xpath->registerNamespace('stream', self::STREAM_NS);
        $xpath->registerNamespace('streamError', self::STREAM_ERROR_NS);
        $xpath->registerNamespace('stanzaError', self::STANZA_ERROR_NS);
        $xpath->registerNamespace('c', self::CLIENT_NS);
        $xpath->registerNamespace('sasl', self::SASL_NS);
        $xpath->registerNamespace('bind', self::BIND_NS);
        $xpath->registerNamespace('r', self::ROSTER_NS);
        $xpath->registerNamespace('register', self::REGISTER_NS);
        $xpath->registerNamespace('registerFeature', self::REGISTER_FEATURE_NS);
        $xpath->registerNamespace('session', self::SESSION_NS);
        $xpath->registerNamespace('sm', self::SM_NS);
        $xpath->registerNamespace('di', self::DISCO_INFO_NS);
        $xpath->registerNamespace('ds', self::DISCO_ITEMS_NS);
        $xpath->registerNamespace('x', self::DATA_FORM_NS);
        $xpath->registerNamespace('rsm', self::RSM_NS);
        $xpath->registerNamespace('commands', self::COMMANDS_NS);
        $xpath->registerNamespace('serverinfo', self::SERVERINFO_NS);
        $xpath->registerNamespace('ibb', self::IBB_NS);
        $xpath->registerNamespace('s5b', self::S5B_NS);
        $xpath->registerNamespace('rtt', self::RTT_NS);
        $xpath->registerNamespace('ps', self::PUBSUB_NS);
        $xpath->registerNamespace('pse', self::PUBSUB_EVENT_NS);
        $xpath->registerNamespace('pso', self::PUBSUB_OWNER_NS);
        $xpath->registerNamespace('mam', self::MAM_NS);
        $xpath->registerNamespace('hu', self::HTTP_UPLOAD_NS);
        $xpath->registerNamespace('geo', self::GEOLOC_NS);
        $xpath->registerNamespace('j', self::JINGLE_NS);
        $xpath->registerNamespace('jingleS5b', self::JINGLE_S5B_NS);
        $xpath->registerNamespace('jingleIbb', self::JINGLE_IBB_NS);
        $xpath->registerNamespace('rec', self::RECEIPTS_NS);
        $xpath->registerNamespace('cs', self::CHAT_STATES_NS);
        $xpath->registerNamespace('corr', self::MESSAGE_CORRECT_NS);
        $xpath->registerNamespace('retract', self::MESSAGE_RETRACT_NS);
        $xpath->registerNamespace('carbons', self::CARBONS_NS);
        $xpath->registerNamespace('forward', self::FORWARD_NS);
        $xpath->registerNamespace('delay', self::DELAY_NS);
        $xpath->registerNamespace('sid', self::STANZA_IDS_NS);
        $xpath->registerNamespace('hints', self::HINTS_NS);
        $xpath->registerNamespace('me', self::ME_COMMAND_NS);
        $xpath->registerNamespace('bosh', self::BOSH_NS);
        $xpath->registerNamespace('xbosh', self::XBOSH_NS);
        $xpath->registerNamespace('caps', self::CAPS_NS);
        $xpath->registerNamespace('vcard', self::VCARD_TEMP_NS);
        $xpath->registerNamespace('priv', self::PRIVATE_NS);
        $xpath->registerNamespace('bookmarks', self::BOOKMARKS_NS);
        $xpath->registerNamespace('bookmarks2', self::BOOKMARKS2_NS);
        $xpath->registerNamespace('avatarData', self::AVATAR_DATA_NS);
        $xpath->registerNamespace('avatarMetadata', self::AVATAR_METADATA_NS);
        $xpath->registerNamespace('vcardUpdate', self::VCARD_TEMP_UPDATE_NS);
        $xpath->registerNamespace('extdisco', self::EXTERNAL_SERVICE_NS);
        $xpath->registerNamespace('csi', self::CSI_NS);
        $xpath->registerNamespace('push', self::PUSH_NS);
        $xpath->registerNamespace('cam', self::CLIENT_ACCESS_MANAGEMENT_NS);
        $xpath->registerNamespace('ref', self::REFERENCE_NS);
        $xpath->registerNamespace('sims', self::SIMS_NS);
        $xpath->registerNamespace('fileTransfer', self::FILE_TRANSFER_NS);
        $xpath->registerNamespace('hashes', self::HASHES_NS);
        $xpath->registerNamespace('markup', self::MARKUP_NS);
        $xpath->registerNamespace('emojiMarkup', self::EMOJI_MARKUP_NS);
        $xpath->registerNamespace('styling', self::STYLING_NS);
        $xpath->registerNamespace('moderation', self::MODERATION_NS);
        $xpath->registerNamespace('channelSearch', self::CHANNEL_SEARCH_NS);
        $xpath->registerNamespace('omemo', self::OMEMO_NS);
        return $xpath;
    }

    public static function firstElementText(DOMElement $parent, string $namespace, string $name): ?string
    {
        foreach ($parent->childNodes as $child) {
            if ($child instanceof DOMElement && $child->namespaceURI === $namespace && $child->localName === $name) {
                return $child->textContent;
            }
        }

        return null;
    }

    public static function childElementXml(DOMElement $parent): ?string
    {
        foreach ($parent->childNodes as $child) {
            if ($child instanceof DOMElement) {
                return self::nodeXml($child);
            }
        }

        return null;
    }

    public static function nodeXml(DOMNode $node): string
    {
        $document = $node instanceof DOMDocument ? $node : $node->ownerDocument;
        if ($document === null) {
            throw new RuntimeException('XML node has no owner document.');
        }

        $xml = $document->saveXML($node);
        if ($xml === false) {
            throw new RuntimeException('Could not serialize XML node.');
        }

        return $xml;
    }
}
