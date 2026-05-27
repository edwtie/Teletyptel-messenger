# Public API Overview

The current public API is intentionally protocol-first. UI projects should use
typed XMPP objects and keep raw XML at the edge for diagnostics only.

The public API is built on Tiedragon's own XMPP core. It may use normal runtime
networking, TLS, XML and WebSocket primitives, but it must not expose a
third-party XMPP client library as the foundation of Teletyptel behavior.

## Connection

| Type | Purpose |
| --- | --- |
| `XmppConnectionSettings` | Account, host, port and TLS requirements. |
| `XmppStreamOptions` | Resource, language and stream timing defaults. |
| `XmppStreamClient` | TCP stream client for connect, login, send and receive helpers. |
| `XmppLoginResult` | Bound JID and negotiated feature summary after login. |
| `XmppProtocolException` | Typed protocol failure with error category. |

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
| `XmppServiceDiscovery` | XEP-0030 disco#info request/result support. |
| `XmppEntityCapabilities` | XEP-0115 capability verification and presence payloads. |
| `XmppAlternativeConnectionDiscovery` | XEP-0156 host-meta parsing for WebSocket/BOSH endpoints. |

## Messaging Extensions

| Type | Purpose |
| --- | --- |
| `LegacySmileyCatalog` | Recognizes classic forum smiley codes and returns typed tokens. |
| `XmppChatStateNotifications` | XEP-0085 chat state payloads. |
| `XmppDeliveryReceipt` | XEP-0184 receipt request and received payloads. |
| `XmppMessageCarbons` | XEP-0280 enable and forwarded message parsing. |
| `XmppMessageArchive` | XEP-0313 archive query/result parsing. |
| `XmppMeCommand` | XEP-0245 `/me ` body detection and display helper. |
| `XmppVCardTemp` | XEP-0054 vcard-temp get/set/result helpers. |
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
