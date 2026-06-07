# PHP XMPP Library

TeleTypTel heeft een zelfstandige PHP XMPP-library. De reden is praktisch: de
webversie draait op Apache/WAMP of Linux-hosting, terwijl niet elke omgeving een
.NET-proces mag of kan starten. De PHP library mag daarom geen brug naar de C#
core zijn. Zij moet op Linux zelfstandig kunnen draaien met PHP, sodium, openssl
en een echte XMPP-server.

## Standalone PHP-Lijn En C#-Lijn

TeleTypTel heeft bewust twee gescheiden XMPP-lijnen:

| Library | Locatie | Runtime | Rol |
| --- | --- | --- | --- |
| C# XMPP library | `src/Tiedragon.XmppMessenger.Core` | .NET 10 | Desktop, Windows tooling, LocalServer, RealServerSmoke en C# protocoltesten. |
| PHP XMPP library | `php/lib/Xmpp` | PHP 8.1+ | Standalone webserverlaag voor Apache/WAMP/Linux-hosting, account/API-flows en PHP-only XMPP-smokes. |

De PHP XMPP-library heeft **geen .NET 10 nodig**. Een webserver die alleen de
TeleTypTel webclient, PHP API's, PHP relay en `php/lib/Xmpp` gebruikt, heeft PHP
en de normale PHP-extensies nodig, maar geen draaiend .NET-proces.

.NET 10 is alleen nodig wanneer je de C# onderdelen gebruikt:

- `Tiedragon.XmppMessenger.Core` tests;
- LocalServer;
- RealServerSmoke;
- Windows/WinForms demo;
- console tools en package-builds die C# projecten publiceren.

De twee lijnen mogen dezelfde protocolkeuzes volgen, maar de PHP library mag
niet afhankelijk zijn van C# assemblies, `dotnet`, LocalServer of WebView2. Een
Linux-installatie kan dus alleen met PHP worden uitgerold.

## Doel

- PHP kan XMPP-stanza's veilig bouwen en parsen.
- PHP heeft eigen JID-, message-, presence-, IQ- en XEP-modellen.
- De webserver kan zonder C# tussenlaag met een echte XMPP-server praten.
- UI-code blijft dun: chat.html roept API's aan, de protocolkennis zit in
  `php/lib/Xmpp`.

## Protocoldekking

| PHP class | Protocol / equivalent | Functie |
| --- | --- | --- |
| `XmppJid` | `XmppAddress` | Bare/full JID parsing en domeinnormalisatie. |
| `XmppXml` | `XmppXmlNames`, `XmppXmlValue` | Namespace-constanten, escaping, DOM parsing en XPath. |
| `XmppStanza` | `XmppChatMessage`, `XmppPresence`, `XmppIq` | Message, presence en IQ builders/parsers. |
| `XmppError` | RFC 6120/6121 error model | Stream-error en stanza-error parser met conditie, tekst en applicatieconditie. |
| `XmppPresence` | RFC 6121 presence model | Presence parser plus subscribe/subscribed/unsubscribe/unsubscribed helpers. |
| `XmppDataForm` | `XmppDataForm` | XEP-0004 data-form builder/parser voor MAM, commands, registratie en disco forms. |
| `XmppDisco` | `XmppServiceDiscovery` | XEP-0030 info/items requests en info/items result parsers. |
| `XmppEntityCapabilities` | `XmppEntityCapabilities` | XEP-0115 capability hash, presence element and parser. |
| `XmppRoster` | `XmppRosterItem`, `XmppIq` | Roster get/set/remove en result parser. |
| `XmppResultSetManagement` | `XmppResultSetManagement` | XEP-0059 paging request/result helper. |
| `XmppRtt` | `XmppRealTimeTextMessage` | XEP-0301 message wrapper met fallback body. |
| `XmppPubSub` | `XmppPubSub`, `XmppPersonalEventing` | XEP-0060 publish/items/retract, service-node targeting, subscribe/unsubscribe, create/configure/delete/purge, subscriptions/affiliations and event-message parser. |
| `XmppPersonalEventing` | `XmppPersonalEventing` | XEP-0163 PEP publish/items/retract/delete and notification parsing on top of PubSub. |
| `XmppPersistentPrivateData` | `XmppPersistentPrivateData` | XEP-0223 private persistent PEP data with whitelist publish-options and trusted notification parsing. |
| `XmppPubSubAnnouncements` | `XmppPubSubAnnouncements` | Provider/news announcements as Atom entries on a PubSub node. |
| `XmppGeoloc` | `XmppUserLocation` | XEP-0080 payload en PEP publish. |
| `XmppAvatar` | `XmppUserAvatar` | XEP-0084 avatar id, data, metadata and vCard update helpers. |
| `XmppMucAvatar` | `XmppMucAvatar` | XEP-0486 MUC avatar discovery, `muc#roominfo_avatarhash` parsing and room vCard get/set/remove helpers. |
| `XmppHttpUpload` | `XmppHttpFileUpload` | XEP-0363 slot request en slot result parser. |
| `XmppMam` | `XmppMessageArchive` | XEP-0313 query form. |
| `XmppJingle` | `XmppJingle`, protoXEP RTT/geoloc | Jingle session-initiate/session-info helpers. |
| `XmppInBandBytestreams` | `XmppInBandBytestreams` | XEP-0047 open/data/close IQ and message helpers with base64 block handling. |
| `XmppSocks5Bytestreams` | `XmppSocks5Bytestreams` | XEP-0065 bytestream proxy discovery, streamhost selection, activation and destination-address hash. |
| `XmppJingleFileTransfer` | `XmppJingleFileTransfer` | XEP-0234 file metadata, checksum/received info and Jingle file-transfer content helpers. |
| `XmppJingleSocks5Bytestreams` | `XmppJingleSocks5Bytestreams` | XEP-0260 S5B Jingle transport wrapper and parser. |
| `XmppJingleInBandBytestreams` | `XmppJingleInBandBytestreams` | XEP-0261 IBB Jingle transport wrapper plus matching XEP-0047 open request helper. |
| `XmppFeatures` | `XmppFeatureSet`, XEP roadmap | Ordered feature namespace list for docs/dev screens. |
| `XmppStream` | `XmppStreamHeader`, STARTTLS | Stream open/close and STARTTLS command XML. |
| `XmppStreamFeatures` | `XmppStreamFeatureSet` | Parse TLS, SASL, bind, stream management, IBR and CSI offers. |
| `XmppSasl` | `XmppSaslPlain`, OAuth helper | SASL mechanism selection plus PLAIN and OAUTHBEARER auth elements. |
| `XmppSaslScram` | `XmppSaslScram` | SCRAM-SHA-1/SCRAM-SHA-256 nonce, proof and server verifier logic. |
| `XmppBind` | `XmppResourceBinding` | Resource bind request and bound JID parser. |
| `XmppSession` | XMPP session compatibility | Optional legacy session IQ helper for old servers. |
| `XmppStreamManagement` | `XmppStreamManagement` | XEP-0198 enable, ack, request and resume wire helpers. |
| `XmppInBandRegistration` | `XmppInBandRegistration` | XEP-0077 info, submit, password change and remove helpers. |
| `XmppAdHocCommands` | `XmppAdHocCommands` | XEP-0050 command discovery, execute and result parser with data forms. |
| `XmppVCardTemp` | `XmppVCardTemp` | XEP-0054 vcard-temp get/set/parser including PHOTO. |
| `XmppServiceContactAddresses` | `XmppServiceContactAddresses` | XEP-0157 server-info contact data-form builder/parser. |
| `XmppMessageCarbons` | `XmppMessageCarbons` | XEP-0280 enable/disable/private and forwarded message parser. |
| `XmppMeCommand` | `/me Command` | XEP-0245 `/me` message marker helper. |
| `XmppClientAccessManagement` | `XmppClientAccessManagement` | XEP-0494 client list and revoke helpers. |
| `XmppPublicChannelSearch` | `XmppPublicChannelSearch` | XEP-0433 search form/query/result parser with RSM paging. |
| `XmppMessageLifecycle` | Receipts, chat states, correction, retraction | Message receipt, typing state, edit and delete helpers. |
| `XmppMessageMetadata` | Delay, stanza ids and message hints | XEP-0203 delay, XEP-0334 processing hints and XEP-0359 origin/stanza-id helpers and parser. |
| `XmppMediaSharing` | XEP-0385 SIMS, XEP-0300 hashes, XEP-0372 references | File metadata, media references, hashes and upload message helpers. |
| `XmppEmojiMarkup` | XEP-0514 Emoji Markup | Custom emoji markup spans with matching XEP-0300 hashes. |
| `XmppMessageStyling` | XEP-0393 Message Styling | Unstyled marker and lightweight style-span parser. |
| `XmppMessageModeration` | XEP-0425 Message Moderation | Moderated retraction request and moderated marker parser. |
| `XmppWebSocket` | RFC 7395 transport layer | `<open/>` and `<close/>` framing for XMPP-over-WebSocket. |
| `XmppOmemo` | XEP-0384 | Device lists, bundles and encrypted-message wrappers. |
| `XmppOmemoDoubleRatchet` | Signal Double Ratchet / XEP-0384 session payload helper | Experimental standalone PHP Double Ratchet helper using sodium X25519 and openssl AES-256-GCM; no C# or .NET dependency. |
| `XmppWebSocketFrame` | `XmppWebSocketFrame` | RFC 6455 text/close/ping/pong frame codec with client masking. |
| `XmppWebSocketTransport` | `XmppClientWebSocketTransport` | HTTP Upgrade handshake and `xmpp` subprotocol transport. |
| `XmppBosh` | XEP-0124/XEP-0206 BOSH | BOSH session, restart, payload, polling and terminate body helpers. |
| `XmppBoshTransport` | `XmppBoshClientTransport` | HTTP POST transport for BOSH session, restart, payload, polling and terminate. |
| `XmppMuc` | `XmppMultiUserChat` | Room discovery, join/leave, group message and direct invite helpers. |
| `XmppPrivateStorage` | XEP-0049 Private XML Storage | Generic private get/set and payload parser. |
| `XmppBookmarks` | XEP-0048/XEP-0402 bookmarks | Private-storage bookmarks and PEP bookmark publish helpers. |
| `XmppBlocking` | `XmppBlockingCommand` | Blocklist, block, unblock and blocklist parser. |
| `XmppExternalServices` | XEP-0215 External Service Discovery | STUN/TURN service request and parser. |
| `XmppClientState` | XEP-0352 Client State Indication | Active/inactive stream elements for mobile/browser lifecycle. |
| `XmppPush` | XEP-0357 Push Notifications | Enable/disable push requests with publish-options. |
| `XmppAlternateConnection` | XEP-0156 Alternate Connection Methods | host-meta XML/JSON link parser for WebSocket/BOSH discovery. |
| `XmppConnectionSettings` | `XmppConnectionSettings` | Account, host, port and TLS policy for PHP transport. |
| `XmppStreamBuffer` | `XmppStreamReader` | Incremental XMPP stream element reader. |
| `XmppStreamClient` | `XmppStreamClient` | TCP/TLS/SASL/bind login plus convenience methods for chat, RTT, presence subscriptions, parsed roster/disco, upload, PubSub/PEP, bookmarks, avatars, CSI, push, external services, stream management, registration, vCard, service contacts, carbons, commands, client-access management and public channel search. |

## Status En Grenzen

De PHP XMPP-library is nu de primaire server-side protocolbouwlaag voor
TeleTypTel. De classes hierboven bouwen en parsen de stanza's voor core XMPP,
transporten, IM, PubSub/PEP, upload, Jingle, RTT, locatie, avatars,
moderatie, media en de belangrijkste compliance-XEPs.

Op Linux of gedeelde hosting betekent dit: de browser/PHP-app kan zonder .NET 10
worden uitgerold zolang je geen C# tools op die server start. Voor productie is
nog steeds een echte, geharde XMPP-server nodig; de PHP library vervangt niet
het serverbeheer, maar voorkomt dat PHP losse XML-stringen of een C# tussenlaag
nodig heeft.

De resterende punten zijn geen open bouwlijst voor deze library,
maar release- en veiligheidsgrenzen:

- OMEMO heeft device-list, bundle, encrypted-message wrappers en een
  experimentele standalone PHP Double Ratchet helper. Productie-encryptie
  blijft pas claimbaar na onafhankelijke review, testvectors, XEdDSA signed
  pre-key verificatie en live interop met bestaande OMEMO-clients.
- WebSocket, BOSH, TCP/TLS en SASL zijn als PHP-clientlaag aanwezig. Een
  publieke productieclaim vereist nog deployment met echte serverconfiguratie,
  certificaten, abusebeleid en herhaalbare live-smokes.
- Mobiele push, TURN, publieke PubSub/PEP-smokes en cross-client Jingle
  interoperabiliteit horen bij releasevalidatie en niet bij de XML-helperlaag
  zelf.

## Test

Run:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tests\xmpp-library-smoke.php
```

The smoke test validates the standalone PHP XMPP library. It does not require
.NET and does not connect to a real XMPP server.

For a real PHP login smoke against a local or public XMPP server, using the best
advertised mechanism in this order: SCRAM-SHA-256, SCRAM-SHA-1, PLAIN:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-login-smoke.php --jid user@localhost --password secret --host localhost --resource php
```

For a fuller client smoke:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-client-smoke.php --jid user@localhost --password secret --host localhost --roster --disco localhost --to tester@localhost --message "Hallo vanaf PHP"
```

For an RFC 7395 WebSocket endpoint smoke:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-websocket-smoke.php --url ws://localhost:5280/xmpp-websocket --domain localhost
```

For a BOSH endpoint smoke:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-bosh-smoke.php --url http://localhost:5280/http-bind --domain localhost
```

Use `--direct-tls` for port 5223 style connections or `--no-tls` only for a
protected local lab server.

To force a mechanism during debugging:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-login-smoke.php --jid user@localhost --password secret --mechanism SCRAM-SHA-256
```
