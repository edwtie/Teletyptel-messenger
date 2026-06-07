<?php
declare(strict_types=1);

namespace Tiedragon\Xmpp;

final class XmppFeatures
{
    /**
     * Ordered roughly by XEP number so dev.html/docs can expose a stable support list.
     *
     * @return array<string,string>
     */
    public static function supportedNamespaces(): array
    {
        return [
            'XEP-0004 Data Forms' => XmppXml::DATA_FORM_NS,
            'XEP-0030 Service Discovery' => XmppXml::DISCO_INFO_NS,
            'XEP-0045 Multi-User Chat' => 'http://jabber.org/protocol/muc',
            'XEP-0047 In-Band Bytestreams' => XmppXml::IBB_NS,
            'XEP-0048 Bookmarks' => XmppXml::BOOKMARKS_NS,
            'XEP-0049 Private XML Storage' => XmppXml::PRIVATE_NS,
            'XEP-0050 Ad-Hoc Commands' => XmppXml::COMMANDS_NS,
            'XEP-0054 vcard-temp' => XmppXml::VCARD_TEMP_NS,
            'XEP-0059 Result Set Management' => XmppXml::RSM_NS,
            'XEP-0060 PubSub' => XmppXml::PUBSUB_NS,
            'XEP-0065 SOCKS5 Bytestreams' => XmppXml::S5B_NS,
            'XEP-0077 In-Band Registration' => XmppXml::REGISTER_NS,
            'XEP-0080 User Location' => XmppXml::GEOLOC_NS,
            'XEP-0084 User Avatar' => XmppXml::AVATAR_METADATA_NS,
            'XEP-0085 Chat State Notifications' => 'http://jabber.org/protocol/chatstates',
            'XEP-0115 Entity Capabilities' => XmppXml::CAPS_NS,
            'XEP-0156 Alternative Connection Methods' => XmppXml::ALT_CONNECTIONS_NS,
            'XEP-0157 Contact Addresses For XMPP Services' => XmppXml::SERVERINFO_NS,
            'XEP-0163 PEP' => XmppXml::PUBSUB_NS . '#publish',
            'XEP-0184 Delivery Receipts' => 'urn:xmpp:receipts',
            'XEP-0198 Stream Management' => XmppXml::SM_NS,
            'XEP-0203 Delayed Delivery' => XmppXml::DELAY_NS,
            'XEP-0215 External Service Discovery' => XmppXml::EXTERNAL_SERVICE_NS,
            'XEP-0223 Persistent Private Data via PubSub' => XmppPersistentPrivateData::PUBLISH_OPTIONS_NS,
            'XEP-0234 Jingle File Transfer' => XmppXml::FILE_TRANSFER_NS,
            'XEP-0245 The /me Command' => XmppXml::ME_COMMAND_NS,
            'XEP-0260 Jingle SOCKS5 Bytestreams' => XmppXml::JINGLE_S5B_NS,
            'XEP-0261 Jingle In-Band Bytestreams' => XmppXml::JINGLE_IBB_NS,
            'XEP-0280 Message Carbons' => XmppXml::CARBONS_NS,
            'XEP-0301 Real-Time Text' => XmppXml::RTT_NS,
            'XEP-0313 Message Archive Management' => XmppXml::MAM_NS,
            'XEP-0334 Message Processing Hints' => XmppXml::HINTS_NS,
            'XEP-0352 Client State Indication' => XmppXml::CSI_NS,
            'XEP-0357 Push Notifications' => XmppXml::PUSH_NS,
            'XEP-0359 Stable And Unique Stanza IDs' => XmppXml::STANZA_IDS_NS,
            'XEP-0363 HTTP File Upload' => XmppXml::HTTP_UPLOAD_NS,
            'XEP-0384 OMEMO Encryption Wire Format' => XmppXml::OMEMO_NS,
            'XEP-0385 Stateless Inline Media Sharing' => 'urn:xmpp:sims:1',
            'XEP-0393 Message Styling' => 'urn:xmpp:styling:0',
            'XEP-0394 Message Markup' => XmppXml::MARKUP_NS,
            'XEP-0424 Message Retraction' => 'urn:xmpp:message-retract:1',
            'XEP-0425 Message Moderation' => XmppXml::MODERATION_NS,
            'XEP-0433 Extended Channel Search' => XmppXml::CHANNEL_SEARCH_NS,
            'XEP-0486 MUC Avatars' => XmppXml::VCARD_TEMP_NS,
            'XEP-0494 Client Access Management' => XmppXml::CLIENT_ACCESS_MANAGEMENT_NS,
            'XEP-0514 Custom Emoji' => XmppXml::EMOJI_MARKUP_NS,
            'ProtoXEP Jingle RTT Sync' => XmppXml::JINGLE_RTT_SYNC_NS,
            'ProtoXEP Jingle User Location' => XmppXml::JINGLE_GEOLOC_NS,
        ];
    }
}
