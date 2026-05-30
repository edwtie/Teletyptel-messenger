# Public API Overview

The current public API is intentionally protocol-first. UI projects should use
typed XMPP objects and keep raw XML at the edge for diagnostics only.

The public API is built on Tiedragon's own XMPP core. It may use normal runtime
networking, TLS, XML and WebSocket primitives, but it must not expose a
third-party XMPP client library as the foundation of Teletyptel behavior.

## Connection

| Type | Purpose |
| --- | --- |
| `XmppConnectionSettings` | Account, host, port, STARTTLS/direct-TLS mode and TLS server name. |
| `XmppStreamOptions` | Resource, language and stream timing defaults. |
| `XmppStreamClient` | TCP stream client for connect, login, send and receive helpers. |
| `XmppLoginResult` | Bound JID and negotiated feature summary after login. |
| `XmppProtocolException` | Typed protocol failure with error category. |
| `XmppDirectTls` | XEP-0368 SRV endpoint discovery and direct TLS endpoint helpers. |
| `XmppDnsSrvResolver` | DNS SRV resolver used by XEP-0368 endpoint discovery. |

Normal app flow:

1. Create `XmppConnectionSettings`.
2. Call `XmppStreamClient.LoginAsync`.
3. Send initial presence.
4. Request roster.
5. Send and receive typed stanzas.

## Core Stanzas

| Type | Purpose |
| --- | --- |
| `XmppAddress` | Bare/full JID parser and formatter. |
| `XmppChatMessage` | Normal chat message serialization and parsing. |
| `XmppPresence` | Presence, subscription and capability presence. |
| `XmppIq` | IQ get/set/result/error base model. |
| `XmppIncomingStanza` | Classifies incoming message, presence and IQ elements. |
| `XmppIqTracker` | Correlates IQ requests with result/error responses. |

## Discovery And Capabilities

| Type | Purpose |
| --- | --- |
| `XmppServiceDiscovery` | XEP-0030 disco#info request/result support plus feature checks such as RTT and XEP-0049 private XML storage. |
| `XmppInBandRegistration` | XEP-0077 registration info, submit, password-change and remove IQ helpers. |
| `XmppBosh` | XEP-0124/XEP-0206 BOSH body/session/restart/terminate wire helpers. |
| `XmppBoshClient` | HTTP long-polling BOSH client for login, stream restart, stanza polling, IQ matching and termination. |
| `XmppClientStateIndication` | XEP-0352 active/inactive stream-level state elements for web/mobile clients. |
| `XmppEntityCapabilities` | XEP-0115 capability verification and presence payloads. |
| `XmppAlternativeConnectionDiscovery` | XEP-0156 host-meta parsing for WebSocket/BOSH endpoints. |
| `XmppDirectTls` | XEP-0368 `_xmpps-client._tcp` / `_xmpp-client._tcp` SRV discovery and endpoint ordering. |
| `XmppServiceContactAddresses` | XEP-0157 server contact URI parsing and server-info data form creation. |
| `XmppExternalServiceDiscovery` | XEP-0215 STUN/TURN/external service list, credentials and push helpers. |

## Messaging Extensions

| Type | Purpose |
| --- | --- |
| `LegacySmileyCatalog` | Recognizes classic forum smiley codes and returns typed tokens. |
| `XmppChatStateNotifications` | XEP-0085 chat state payloads. |
| `XmppDeliveryReceipt` | XEP-0184 receipt request and received payloads. |
| `XmppBlockingCommand` | XEP-0191 blocklist, block/unblock, unblock-all and push acknowledgement helpers. |
| `XmppMessageCarbons` | XEP-0280 enable and forwarded message parsing. |
| `XmppMessageCorrection` | XEP-0308 `replace` payload helper for corrected messages. |
| `XmppMessageArchive` | XEP-0313 archive query/result parsing. |
| `XmppMultiUserChat` | XEP-0045 MUC room discovery, room items, join/leave, config forms, admin helpers and groupchat correction payloads. |
| `XmppPrivateXmlStorage` | XEP-0049 generic private XML storage get/set/result helpers for namespaced account data. |
| `XmppPersistentPrivateData` | XEP-0223 PEP/PubSub private-data storage with persistent whitelist publish-options and notification trust checks. |
| `XmppBookmarks` | XEP-0402 PEP-native bookmarks plus XEP-0048/XEP-0049 legacy bookmark compatibility. |
| `XmppMucSelfPing` | XEP-0410 ping helper for confirming whether the current MUC occupant session is still joined. |
| `XmppPubSub` | XEP-0060 generic PubSub subscribe, unsubscribe, create/delete node and subscription-result helpers. |
| `XmppPubSubAnnouncements` | Teletyptel provider announcement model on XEP-0060 with Atom entry publish, retrieve and event parsing. |
| `XmppJingle` | XEP-0166/0167/0176/0320 call signaling, RTP payloads, ICE candidates, DTLS fingerprints and session-info states. Use `XmppExternalServiceDiscovery` for XEP-0215 STUN/TURN discovery before production calls. |
| `XmppJingleMessageInitiation` | XEP-0353 message-based call setup helpers for `propose`, `ringing`, `proceed`, `reject`, `retract` and `finish`. |
| `XmppSocks5Bytestreams` | XEP-0065 SOCKS5 Bytestreams disco checks, proxy address query, streamhost negotiation, activation and destination-address hashing. |
| `XmppSocks5BytestreamSocket` | XEP-0065 SOCKS5 no-auth CONNECT stream opener for destination-address based streamhost transfer tests and data pumps. |
| `XmppJingleSocks5Bytestreams` | XEP-0260 Jingle S5B transport candidates, candidate-used, candidate-error, activated and proxy-error helpers. |
| `XmppJingleFileTransfer` | XEP-0234 Jingle File Transfer metadata, ranges, XEP-0300 hashes, received and checksum session-info helpers. |
| `XmppInBandBytestreams` | XEP-0047 IBB open/data/close helpers for IQ or message stanza fallback transfer chunks. |
| `XmppJingleInBandBytestreams` | XEP-0261 Jingle IBB transport negotiation and matching XEP-0047 open request helper. |
| `XmppPersonalEventing` | XEP-0163 PEP/PubSub publish, retrieve, retract, delete and event-notification parser. |
| `XmppMeCommand` | XEP-0245 `/me ` body detection and display helper. |
| `XmppVCardTemp` | XEP-0054 vcard-temp get/set/result helpers. |
| `XmppUserAvatar` | XEP-0084 avatar data/metadata publish, retrieve and notification helpers. |
| `XmppVCardAvatar` | XEP-0153 vCard avatar presence update and XEP-0398 PEP-vCard conversion helpers. |
| `XmppPushNotifications` | XEP-0357 enable/disable push IQ payloads. |

## Real-Time Text

| Type | Purpose |
| --- | --- |
| `RttPacket` | XEP-0301 packet parse/serialize. |
| `RttComposer` | Converts text changes into RTT edit packets. |
| `RttMessageState` | Applies incoming RTT edits to visible live text. |
| `RttConversationStateManager` | Keeps RTT state per contact. |
| `RttJsonEnvelope` | Demo relay JSON wrapper around RTT XML. |
| `XmppRealTimeTextMessage` | XMPP message body fallback plus RTT payload. |

## WebSocket

| Type | Purpose |
| --- | --- |
| `IXmppWebSocketTransport` | Transport boundary for RFC 7395. |
| `XmppClientWebSocketTransport` | `ClientWebSocket` implementation requesting subprotocol `xmpp`. |
| `XmppWebSocketFrame` | RFC 7395 open/close frame helpers. |
| `XmppWebSocketStream` | Sends open, stanza and close XML over WebSocket. |

## Localization

| Type | Purpose |
| --- | --- |
| `LanguageCatalog` | Loads `.lng` and `.lngpdk` text catalogs. |
| `LanguagePackageReader` | Reads LngPdk packages. |
| `LanguagePackageCompiler` | Compiles package manifests and language files. |

## Accessibility

| Type | Purpose |
| --- | --- |
| `AccessibilityInputEvent` | Typed source event from caption/speech/video input. |
| `LiveCaption` | Local or shared caption item. |
| `CaptionToRttBridge` | Converts captions to local captions, RTT edits and final messages. |
| `PrivacySettings` | Controls transcript retention and remote sharing defaults. |

## Stability Notes

The API is still Alpha-level. Prefer adding new types over changing existing
method meanings. Breaking namespace cleanup can wait until the protocol surface
stabilizes.
