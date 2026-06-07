# Implementation Checklist

This checklist tracks protocol and product progress. Use `[x]` only when the
item is implemented, tested and documented.

## Scope And Claim Boundaries

- [x] README explains the current Alpha 2 evaluation scope.
- [x] README separates working protocol/client pieces from production hosting
  and public-service claims.
- [x] `Tiedragon.XmppMessenger.LocalServer` is documented as a real local C2S
  test server for localhost/protected lab use, not internet-facing production
  hosting.
- [x] Production server direction is documented as ejabberd plus coturn, HTTP
  upload, MAM and PubSub/PEP modules when SIP/provider gateway work matters;
  Prosody/Openfire remain secondary interoperability targets.
- [x] XSF software-directory notes say not to resubmit until a usable release,
  user-facing docs and public evaluation path are complete.
- [x] XEP-0479 compliance notes separate repository evidence from formal
  compliance claims.
- [ ] Public hosted Teletyptel service is live with production account,
  abuse/rate-limit, moderation and backup policies.

## Alpha 2 - Web, Accounts And Localization

- [x] Teletyptel architecture diagram linked from the README.
- [x] XMPP core, RFC 7395 and XEP extensions shown as separate architecture layers.
- [x] Web client light/dark theme switch.
- [x] Web client local file upload endpoint and attachment rendering.
- [x] Web client account profile controls for JID, display name, peer, password option and language.
- [x] Local browser profile fallback for account settings.
- [x] PHP account API for loading and saving account profiles.
- [x] MySQL/MariaDB schema for account profiles.
- [x] WAMP/MySQL local setup documented.
- [x] PHP XMPP wire-model library built from the C# core: JID, XML, stanza,
  disco, roster, RTT, PubSub/PEP, geoloc, upload, MAM and Jingle helpers.
- [x] PHP stream/auth layer added: stream open/close, RFC 7395 open/close,
  stream feature parser, SASL PLAIN/OAUTHBEARER and resource binding helpers.
- [x] PHP TCP/STARTTLS/SASL PLAIN/bind stream client added with CLI login smoke tool.
- [x] PHP SCRAM-SHA-1/SCRAM-SHA-256 helper implemented and checked against a
  known SCRAM-SHA-1 proof/server-signature vector.
- [x] PHP stream client selects SCRAM-SHA-256, SCRAM-SHA-1, then PLAIN.
- [x] PHP stream client can send chat, RTT, presence, roster, disco and upload
  slot requests and read incoming message/presence/IQ stanzas.
- [x] PHP stream/stanza error parser added and wired into stream-client IQ and
  stream read paths.
- [x] PHP presence parser and subscription helpers added, including caps and
  vCard avatar update hints.
- [x] PHP roster result and disco#items result parsers added with stream-client
  convenience methods.
- [x] PHP PubSub/PEP items-result and event-message parsers added with
  stream-client publish/items/retract convenience methods.
- [x] PHP XEP-0060 PubSub service-node targeting, node create/configure/delete/purge,
  subscribe/unsubscribe, subscriptions and affiliations helpers added.
- [x] PHP XEP-0163 Personal Eventing wrapper added for PEP publish/items/retract/delete
  and notification parsing.
- [x] PHP XEP-0223 Persistent Private Data wrapper added with whitelist
  publish-options and trusted notification parsing.
- [x] PHP XEP-0060 provider announcement/news helper added with Atom entry
  publish/items/notification parsing.
- [x] PHP XEP-0047 In-Band Bytestreams helpers added for IQ/message data
  transfer fallback.
- [x] PHP XEP-0065 SOCKS5 Bytestreams helpers added for proxy discovery,
  streamhost selection, activation and destination-address hashing.
- [x] PHP XEP-0234/XEP-0260/XEP-0261 Jingle file-transfer helpers added for
  metadata, S5B transport and IBB transport negotiation.
- [x] PHP fuller client smoke tool added for login plus roster/disco/message.
- [x] PHP RFC 7395 WebSocket frame codec and `xmpp` subprotocol handshake
  transport added.
- [x] PHP RFC 7395 WebSocket endpoint smoke tool added.
- [x] PHP XEP-0004 data-form builder/parser added for shared XEP form handling.
- [x] PHP XEP-0048/XEP-0049 bookmark/private-storage helpers added.
- [x] PHP XEP-0050 ad-hoc command discovery, execute and result parser added.
- [x] PHP XEP-0054 vcard-temp get/set/parser added, including PHOTO payloads.
- [x] PHP XEP-0059 result-set-management helper added for MAM and paged queries.
- [x] PHP XEP-0077 in-band registration info/submit/password/remove helpers added.
- [x] PHP XEP-0084 avatar data/metadata helpers added.
- [x] PHP XEP-0115 entity capabilities helper added.
- [x] PHP XEP-0124/XEP-0206 BOSH body helpers added for Web Client fallback.
- [x] PHP XEP-0124/XEP-0206 BOSH HTTP transport and endpoint smoke tool added.
- [x] PHP XEP-0156 alternate connection discovery parser added.
- [x] PHP XEP-0157 service contact address data-form builder/parser added.
- [x] PHP XEP-0198 stream-management enable, ack, request and resume wire helpers added.
- [x] PHP XEP-0203 delayed delivery helper/parser added.
- [x] PHP XEP-0215 external service discovery helper added.
- [x] PHP XEP-0245 `/me` command message marker helper added.
- [x] PHP XEP-0280 message carbons enable/disable/private and forwarded-message parser added.
- [x] PHP XEP-0334 message processing hints helper/parser added.
- [x] PHP XEP-0352 client state indication helper added.
- [x] PHP XEP-0357 push notification helper added.
- [x] PHP XEP-0359 origin-id/stanza-id helper/parser added.
- [x] PHP XEP-0384 OMEMO wire helpers added for device lists, bundles and
  encrypted-message wrappers; production encryption remains gated.
- [x] PHP XEP-0385 SIMS/media sharing helper added.
- [x] PHP XEP-0393 message styling helper added.
- [x] PHP XEP-0425 message moderation helper added.
- [x] PHP XEP-0433 public channel search form/query/result helper added.
- [x] PHP XEP-0494 client access management list/revoke helper added.
- [x] PHP XEP-0514 custom emoji markup helper added.
- [x] PHP stream client convenience methods added for bookmarks, avatars,
  external services, push and mobile active/inactive state.
- [x] PHP stream client convenience methods added for XEP-0198 stream management,
  XEP-0077 registration, XEP-0054 vCard, XEP-0280 carbons and XEP-0050 commands.
- [x] PHP stream client convenience methods added for XEP-0157 service contacts,
  XEP-0433 channel search and XEP-0494 client access management.
- [x] PHP IM extension layer added: delivery receipts, chat states, message
  correction, message retraction, MUC join/group message and blocking helpers.
- [x] PHP XMPP library smoke test.
- [x] Account API smoke-tested against local MariaDB.
- [x] Web `.lng` loader with English and Dutch language files.
- [x] `preferredLanguage` saved through the account profile API.
- [x] Legacy smiley catalog and web rendering support.
- [x] AI bot console demo for live RTT testing.
- [x] Critical `.lng` versus LngPdk risk notes documented.
- [x] LngPdk production direction documented separately from loose `.lng` fallback.
- [ ] LngPdk package serving and verification in the web/mobile clients.
- [ ] Language key completeness validator for web `.lng` and packaged LngPdk resources.
- [ ] Account authentication/session model; current Alpha 2 profile API is not login security.
- [ ] Password handling hardening; current local profile password option is a prototype setting.
- [x] Account identity model separates login identity from XMPP JID/server identity.
- [x] Social login provider setup documented for Google, Facebook and Apple.
- [x] XEP-0493 OAuth Client Login researched and mapped to SASL `OAUTHBEARER`.
- [x] Core SASL `OAUTHBEARER` auth element helper implemented and tested.
- [x] XEP-0494 Client Access Management list/revoke wire helpers implemented and tested.
- [x] Backend Authorization Code + PKCE flow for Google login.
- [x] Backend Authorization Code + PKCE flow for Facebook login.
- [x] Backend Authorization Code + PKCE flow for Apple login.
- [ ] Live social-login smoke with real Google/Facebook/Apple provider configuration.
- [x] Database schema and compatibility migration for `accounts`, `account_identities`, `account_credentials` and `account_xmpp`.
- [ ] Security UI for active clients/grants and revoke access.
- [ ] XMPP server OAuth discovery and OAUTHBEARER live-server smoke.
- [x] Real XMPP server two-account chat smoke test.
- [x] Location and NG112 protocol direction recorded: XEP-0080 for XMPP user
  location and PIDF-LO/RFC 6442 for future emergency gateway interop.
- [x] ProtoXEP Jingle synchronized RTT implemented in the web client as a
  co-session WebRTC datachannel with XEP-0301 relay fallback.
- [x] `rtt` datachannel listens for raw UTF-8 T.140 payloads and applies
  backspace/delete plus CR/LF as live call text.
- [x] Browser sends linear live edits as raw T.140 over the negotiated `rtt`
  datachannel and keeps the JSON wrapper for reset/final/non-linear metadata.
- [x] Core RFC 4103 helper layer added: T.140 codec, RTP v2 packet parser,
  `text/t140` packetizer and RFC 2198 `text/red` redundant payload helper.
- [x] ProtoXEP Jingle location/GPS core helper added so call sessions can carry
  explicit XEP-0080 location updates without relying only on PEP presence.
- [x] ProtoXEP Jingle synchronized RTT Playwright retest passed with two fresh
  browser profiles: video call connected, `rtt` datachannel opened,
  `jingle-rtt-out`/`jingle-rtt-in` logged, live draft displayed and final
  `jingle-rtt` message delivered.
- [ ] Roster/contact model backed by XMPP instead of local demo state.
- [ ] Replace demo relay semantics with standards-based XMPP production routing.
- [ ] Mobile WebView packaging smoke test for Android and iOS.

## Public Server Release Validation

- [x] Public provider candidates probed with
  `scripts\probe-public-xmpp-providers.ps1`.
- [x] Public provider registration form probed with
  `RealServerSmoke --registration-info`.
- [x] C# account registration app can keep an XEP-0077 CAPTCHA challenge on one
  live stream instead of relying on a PowerShell helper.
- [x] Two real test accounts created on one public XMPP server.
- [x] TLS/XEP-0368 discovery and hostname-negative smoke passed.
- [x] Login, bind, initial presence and roster smoke passed.
- [x] One-to-one chat smoke passed between the two accounts.
- [x] XEP-0045 MUC discovery, room join and groupchat smoke passed.
- [x] XEP-0047 IBB fallback open/data/close byte-transfer smoke passed.
- [x] XEP-0065 hosted SOCKS5 bytestream proxy discovery, activation and byte-transfer smoke passed.
- [x] XEP-0124/XEP-0206 BOSH smoke passed when advertised by the server.
- [x] XEP-0157 server contact discovery checked.
- [x] XEP-0215 STUN/TURN discovery checked when advertised by the server.
- [x] XEP-0308 Last Message Correction smoke passed between two public accounts.
- [x] XEP-0363 file upload discovery, slot, PUT and attachment smoke passed.
- [ ] Web client RTT, presence and normal chat passed with the two real accounts.
- [ ] Browser audio/video call passed between the two real accounts.
- [ ] Existing Jingle-capable client interop smoke completed or explicitly
  recorded as unavailable for this release.
- [x] Server domain, test date, feature list and smoke output recorded in the
  real-server setup notes and changelog.

## RFC 6120 - XMPP Core

- [x] JID/address parsing.
- [x] Connection settings with TLS default.
- [x] Stream open XML.
- [x] Stream close XML.
- [x] Stream feature parsing.
- [x] Open-ended stream reader.
- [x] Stream writer with flush.
- [x] TCP client skeleton.
- [x] STARTTLS command.
- [x] STARTTLS proceed/failure handling.
- [x] TLS stream upgrade hook.
- [x] Real `SslStream` upgrader.
- [x] Stream restart after STARTTLS.
- [x] Required TLS downgrade protection.
- [x] SASL PLAIN.
- [x] SCRAM-SHA-1.
- [x] SCRAM-SHA-256.
- [x] SASL mechanism selection.
- [x] Stream restart after SASL success.
- [x] Resource binding request.
- [x] Bound JID storage.
- [x] Typed protocol exceptions.
- [x] Full stream error parser.
- [x] Full stanza error parser.
- [x] Real server TLS certificate smoke test with `Tiedragon.XmppMessenger.RealServerSmoke`.
- [x] Local server enforces TLS -> SASL -> bind ordering before normal stanzas.

## RFC 6121 - IM And Presence

- [x] Chat message model.
- [x] Presence model.
- [x] Roster item model.
- [x] Roster get IQ.
- [x] Roster result parsing.
- [x] Initial presence helper.
- [x] Incoming stanza classification.
- [x] Presence subscription workflow.
- [x] Roster set/remove workflow.
- [x] Normal chat send/receive local server scenario.
- [x] Real server two-account chat smoke test with `Tiedragon.XmppMessenger.RealServerSmoke`.

## RFC 7395 - XMPP Over WebSocket

- [x] Decide whether core library should implement RFC 7395 directly.
- [x] Separate current demo relay from standards-based WebSocket XMPP.
- [x] WebSocket stream transport abstraction.
- [x] RFC 7395 framing/open test.
- [x] PHP relay accepts `xmpp` WebSocket subprotocol.
- [x] PHP relay handles RFC 7395 open/close frames.
- [x] PHP relay RFC 7395 smoke test.

## RFC 7590 - TLS For XMPP

- [x] TLS required by default.
- [x] STARTTLS downgrade protection.
- [x] `SslStream` client authentication path.
- [x] Certificate validation policy documentation.
- [x] Hostname validation smoke test with `Tiedragon.XmppMessenger.RealServerSmoke --bad-host`.
- [x] Minimum TLS version policy.

## RFC 7622 - XMPP Address Format

- [x] Bare JID parsing.
- [x] Full JID parsing.
- [x] Domain normalization.
- [x] Invalid JID rejection.
- [x] More RFC 7622 edge-case tests.

## XEP-0030 - Service Discovery

- [x] disco#info request.
- [x] disco#info result parsing.
- [x] Identity parsing.
- [x] Feature parsing.
- [x] Client helper to request server discovery.
- [x] Contact/client capability discovery.

## XEP-0045 - Multi-User Chat

- [x] Join room presence serializer.
- [x] Leave room presence serializer.
- [x] Groupchat message serializer.
- [x] Groupchat message parser.
- [x] Direct invitation serializer.
- [x] `XmppStreamClient` join helper.
- [x] Room discovery/items helper.
- [x] Room configuration forms.
- [x] Moderation/admin flows.
- [x] XEP-0048/XEP-0402 bookmark serializers/parsers and `XmppStreamClient` helpers.
- [x] XEP-0049 generic Private XML Storage helper and `XmppStreamClient` methods.
- [x] XEP-0410 MUC self-ping serializer/result classifier and `XmppStreamClient` helper.
- [x] Interoperability smoke path for Prosody/ejabberd MUC through `RealServerSmoke --muc-service --muc-room`.
- [x] Interoperability smoke executed against a real Prosody MUC service.

## XEP-0047/XEP-0065/XEP-0234/XEP-0260/XEP-0261 - Direct File Transfer

- [x] XEP-0047 IBB open/data/close stanza helpers.
- [x] XEP-0047 IQ and message data chunk helpers with base64 encode/decode.
- [x] XEP-0065 disco support and bytestream proxy identity checks.
- [x] XEP-0065 proxy address query/result parser.
- [x] XEP-0065 bytestream request with streamhost list.
- [x] XEP-0065 streamhost-used response parser.
- [x] XEP-0065 proxy activation request.
- [x] XEP-0065/XEP-0260 SOCKS5 destination-address hash calculation.
- [x] XEP-0234 file description with name, media type, size, date, description, range and XEP-0300 hashes.
- [x] XEP-0234 received/checksum session-info helpers.
- [x] XEP-0260 Jingle S5B transport candidates.
- [x] XEP-0260 candidate-used, candidate-error, activated and proxy-error states.
- [x] XEP-0261 Jingle IBB transport negotiation with block-size, sid and stanza mode.
- [x] XEP-0261 helper to create the matching XEP-0047 open request after Jingle negotiation.
- [x] Local SOCKS5 streamhost handshake and data-pump smoke.
- [x] Real-server S5B proxy discovery smoke path through
  `RealServerSmoke --socks5-smoke` or explicit `--socks5-proxy`.
- [x] Real-server S5B proxy activation and byte-transfer smoke path.
- [x] Real-server IBB fallback open/data/close byte-transfer smoke path through
  `RealServerSmoke --ibb-smoke`.

## XEP-0050 - Ad-Hoc Commands

- [x] Command execute IQ serialization.
- [x] Completed command result parsing.
- [x] Data-form result parsing for command payloads.
- [x] Local server advertises the ad-hoc command discovery node.

## XEP-0077 - In-Band Registration

- [x] Registration info request.
- [x] Registration info result parsing.
- [x] Registration submit request.
- [x] Password change request.
- [x] Remove registration request.
- [x] Stream feature detection.
- [x] `XmppStreamClient` helper methods.
- [x] Real-server smoke registration path through `RealServerSmoke --register`.
- [x] LocalServer can advertise an optional XEP-0077 CAPTCHA data form with
  `captcha-fallback-url`, hidden challenge key and required `ocr`, backed by a
  generated PNG image on the local HTTP endpoint.

## XEP-0080 - User Location

- [x] User-location payload model with latitude, longitude, accuracy,
  altitude, timestamp, text and source metadata.
- [x] XEP-0080 XML parse/serialize.
- [x] Capability model for servers without PEP/XEP-0080 support.
- [x] PEP publish/retrieve helpers through XEP-0163.
- [x] Location consent model: never publish automatically.
- [x] Browser/mobile location provider with permission handling.
- [x] UI shows accuracy, timestamp, source, stale-location and server-support warnings.
- [x] Emergency-mode export model for PIDF-LO/RFC 6442 gateway testing.
- [x] ProtoXEP Jingle location/GPS description and session-info helpers reuse
  the same XEP-0080 payload during an active call.
- [x] Local server smoke path for location PEP events.
- [ ] Real-server PEP smoke path with a non-emergency test account on supporting and non-supporting servers.

## XEP-0084 - User Avatars

- [x] Avatar SHA-1 id calculation over raw image bytes.
- [x] `urn:xmpp:avatar:data` publish and retrieve IQ helpers.
- [x] `urn:xmpp:avatar:metadata` publish, retrieve and empty-disable helpers.
- [x] Metadata parser for `info` elements, HTTP URLs and optional pointers.
- [x] PubSub event notification parser for `urn:xmpp:avatar:metadata+notify`.
- [x] `XmppStreamClient` helpers for request/publish/disable.
- [x] Local server stores and returns avatar data/metadata for smoke tests.
- [x] Contact-list avatar cache and account avatar UI.
- [x] Browser relay presence carries display name and compact avatar hints for demo contacts.
- [x] XEP-0153 `vcard-temp:x:update` presence hash parse/serialize.
- [x] XEP-0398 PEP-vCard conversion feature detection and vCard PHOTO conversion helpers.
- [x] `XmppStreamClient` vCard avatar publish helper with presence update.

## XEP-0085 - Chat State Notifications

- [x] Model states: active, composing, paused, inactive, gone.
- [x] Serialize chat state payload.
- [x] Parse chat state payload.
- [x] Send helper.
- [x] Receive helper.

## XEP-0133 - Service Administration

- [x] Safe read-only LocalServer commands for registered, online, active and idle user counts.
- [x] Safe read-only LocalServer commands for registered, online, active and idle user lists.
- [x] Command discovery through XEP-0030 `disco#items` on the XEP-0050 command node.
- [x] `XmppStreamClient` helper for executing supported read-only administration commands.
- [x] Retracted password retrieval is intentionally not implemented.
- [ ] Production admin authorization, audit logging and mutating commands are future server work.

## XEP-0157 - Contact Addresses For XMPP Services

- [x] Server-info `FORM_TYPE=http://jabber.org/network/serverinfo` parser.
- [x] Registered contact fields: abuse, admin, feedback, sales, security, status and support.
- [x] URI validation for advertised contact values.
- [x] Server-info data form creation helper.
- [x] Local server advertises XEP-0157 contact addresses in `disco#info`.
- [x] Real-server smoke output prints discovered contact addresses when available.

## XEP-0166/0167/0176/0320 - Jingle Calls

- [x] Jingle session-initiate serializer.
- [x] Jingle session-accept serializer.
- [x] Jingle session-terminate serializer.
- [x] RTP content/payload type serializer.
- [x] RTP audio/video discovery feature checks.
- [x] ICE-UDP transport element.
- [x] ICE candidate serialization and parser.
- [x] DTLS-SRTP fingerprint serialization and parser.
- [x] Jingle `transport-info` candidate update serializer.
- [x] Jingle RTP `session-info` states for ringing/hold/mute.
- [x] ProtoXEP Jingle location/GPS content and `session-info` updates for
  call-scoped explicit location sharing.
- [x] XEP-0353 Jingle Message Initiation call setup messages.
- [x] Jingle parser for action, sid and content.
- [x] `XmppStreamClient` Jingle send helper.
- [x] WebRTC peer connection bridge in the web client demo.
- [x] Basic audio/video permission UI.
- [x] Device picker and local media preview settings.
- [x] Per-call device switching after a call has already started.
- [x] Interoperability smoke with existing Jingle client wire shapes.

## XEP-0184 - Message Delivery Receipts

- [x] Receipt request payload.
- [x] Receipt received payload.
- [x] Message id correlation.
- [x] Send helper.
- [x] Receive helper.

## XEP-0191 - Blocking Command

- [x] Blocklist IQ request serializer.
- [x] Blocklist result parser.
- [x] Block one or more JIDs.
- [x] Unblock one or more JIDs.
- [x] Unblock all JIDs with empty `<unblock/>`.
- [x] Server push parser for `<block/>` and `<unblock/>`.
- [x] Push acknowledgement helper.
- [x] `XmppStreamClient` blocklist, block and unblock helpers.
- [x] Local server stores blocklists and suppresses blocked direct messages.
- [x] Web and Windows demo expose block/unblock for nuisance testers; web uses the contact right-click menu, hides blocked contacts from the main list and keeps unblock access in the Contacts tab.
- [x] Real-server smoke path through `RealServerSmoke --block-jid`.

## XEP-0198 - Stream Management

- [x] Enable stream management.
- [x] Track outbound stanza count.
- [x] Track inbound stanza count.
- [x] Ack request/response.
- [x] Resume support.
- [x] Reconnect local server test.

## XEP-0203 - Delayed Delivery

- [x] Delay element builder.
- [x] Delay stamp/from/reason parser.
- [x] Incoming message extension exposure.

## XEP-0280 - Message Carbons

- [x] Enable carbons.
- [x] Parse sent/received forwarded message.
- [x] Device sync tests.

## XEP-0301 - Real-Time Text

- [x] RTT packet model.
- [x] RTT insert/erase model.
- [x] RTT XML parse/serialize.
- [x] RTT state application.
- [x] Unicode code point positions.
- [x] RTT JSON envelope for demo relay.
- [x] RTT XMPP message payload with body fallback.
- [x] Per-contact RTT state manager.
- [x] RTT receive integration in `XmppStreamClient`.
- [x] RTT capability check through XEP-0030.

## XEP-0313 - Message Archive Management

- [x] Query archive.
- [x] Parse forwarded archived messages.
- [x] Paging/result-set management.
- [x] Real public-server one-to-one MAM smoke.
- [x] Real public-server MUC archive smoke.
- [x] LocalServer persists one-to-one and local MUC messages and serves
  XEP-0313 results from its portable data directory.

## XEP-0334 - Message Processing Hints

- [x] `store`, `no-store`, `no-copy` and `no-permanent-store` element builders.
- [x] Message hint parser.
- [x] Incoming message extension exposure.

## XEP-0359 - Stable And Unique Stanza IDs

- [x] `origin-id` builder.
- [x] `stanza-id` builder.
- [x] Origin and server stanza-id parser.
- [x] Incoming message extension exposure.

## XEP-0363 - HTTP File Upload

- [x] Slot request serializer.
- [x] Slot result parser.
- [x] Allowed PUT header filtering.
- [x] `XmppStreamClient` slot request helper.
- [x] Alpha web local upload endpoint and chat attachment message rendering.
- [x] HTTP PUT upload executor.
- [x] Send uploaded URL as message attachment with body fallback and XEP-0066 OOB payload.
- [x] Server max-file-size discovery from XEP-0128 data forms.
- [x] Local server upload service disco, slot, loopback HTTP PUT and attachment smoke path.
- [x] Purpose request elements including ephemeral `expire-before`.
- [x] `file-too-large` and `retry` error parsing.
- [x] Real-server smoke path for service discovery, slot request, HTTP PUT and optional attachment message.

## XEP-0384 - OMEMO Encryption

- [x] OMEMO namespace constants for current `urn:xmpp:omemo:2` wire format.
- [x] Device list request serializer.
- [x] Device list parser.
- [x] Bundle request serializer.
- [x] Bundle publish serializer/parser.
- [x] Encrypted message wrapper serializer/parser.
- [x] `XmppStreamClient` device list helper.
- [x] OMEMO session backend boundary and production guard.
- [x] OMEMO production backend decision documented: in-tree C# Double Ratchet
  behind `IXmppOmemoSessionBackend`, PHP wire helpers only.
- [x] X3DH key bundle validation, DH1-DH4 plan and HKDF boundary.
- [x] X3DH X25519 key agreement implementation for initiator/responder DH1-DH4.
- [x] Signed pre-key verification gate and verifier contract.
- [x] Opaque Double Ratchet session store contract.
- [x] Experimental in-tree Double Ratchet engine for X25519 DH ratchet,
  root/chain/message KDFs, skipped message keys, AES-GCM message encryption and
  opaque state export/import.
- [x] Double Ratchet message envelope mapping to and from OMEMO key transports.
- [x] Local OMEMO device key-material model.
- [x] Device-list and bundle publication plan from local key material.
- [x] One-time pre-key consumption and replenishment model.
- [x] Secure encrypted local key storage file.
- [x] Secret vault abstraction for OMEMO key-store passphrases.
- [x] Windows DPAPI current-user secret vault provider.
- [x] Linux Secret Service secret vault provider.
- [x] macOS Keychain secret vault provider.
- [ ] Live vault smoke on Linux and macOS.
- [ ] Production XEdDSA signed pre-key verification.
- [ ] Independent review, external test vectors and live interop evidence for
  the in-tree Double Ratchet engine.
- [ ] Backend adapter that maps the in-tree ratchet state to OMEMO key
  transports and persistent device sessions.
- [x] Payload encryption/decryption boundary helper.
- [x] Trust/fingerprint UI model.
- [x] Interoperability smoke with existing OMEMO client wire shapes.

## XMPP Compliance Suites

- [x] XEP-0047/XEP-0261 In-Band Bytestreams fallback helpers.
- [x] XEP-0048/XEP-0402 bookmarks and XEP-0410 MUC self-ping.
- [x] XEP-0049 generic Private XML Storage get/set helper, parser and stream-client methods.
- [x] XEP-0054 vcard-temp.
- [x] XEP-0060 general PubSub announcement/news node model and provider news UI seed.
- [x] XEP-0060 service/provider announcements separate from personal PEP nodes.
- [ ] Live server XEP-0060 announcement subscription smoke with the deployment PubSub service.
- [x] XEP-0065 SOCKS5 Bytestreams protocol helpers.
- [x] XEP-0080 User Location for accessibility and emergency-readiness flows.
- [x] XEP-0084 User Avatars protocol helpers.
- [x] XEP-0084 implementation complete; public-server PEP smoke is release validation.
- [x] XEP-0115 Entity Capabilities.
- [x] XEP-0124/XEP-0206 BOSH body/session/restart helpers for optional Web Client fallback.
- [x] XEP-0124/XEP-0206 full HTTP long-polling client and real-server BOSH smoke path.
- [x] XEP-0153/XEP-0398 vCard avatar compatibility.
- [x] XEP-0156 Alternative Connection Method discovery.
- [ ] Real hosted RFC 7395/WSS endpoint and XEP-0156 deployment guide for Web Client.
- [x] XEP-0157 Contact Addresses for XMPP Services.
- [x] XEP-0163 generic PEP/PubSub publishing for Advanced Core Client.
- [x] XEP-0163 protocol helper and stream-client methods complete; public-server PEP smoke is release validation.
- [x] XEP-0191 Blocking Command for Advanced IM Client.
- [x] XEP-0203 Delayed Delivery message metadata.
- [x] XEP-0215 External Service Discovery for STUN/TURN discovery; RealServerSmoke and LocalServer now cover service discovery and restricted TURN credentials.
- [x] XEP-0223 persistent private data via PubSub/PEP with whitelist publish-options and notification trust checks.
- [x] XEP-0334 Message Processing Hints.
- [x] XEP-0359 Stable And Unique Stanza IDs.
- [x] XEP-0234/XEP-0260 Jingle direct file transfer metadata and S5B transport helpers.
- [x] XEP-0245 `/me` command.
- [x] XEP-0280 Message Carbons.
- [x] XEP-0308 Last Message Correction for Advanced IM Client.
- [x] XEP-0352 Client State Indication for Mobile Client.
- [x] Browser/mobile lifecycle wiring for XEP-0352 active/inactive state.
- [x] XEP-0353 Jingle Message Initiation for A/V Client.
- [x] XEP-0357 Push Notifications helper.
- [x] XEP-0363 real-server upload-service smoke path for IM Client.
- [x] XEP-0368 direct TLS SRV discovery for Advanced Core Client.
- [x] XEP-0433 Extended Channel Search helper, RSM paging model, result parser and stream-client flow.
- [x] Active XEP-0479 reference documented instead of the old attic-only link.
- [x] XEP-0514 Custom Emoji protocol helper with XEP-0394 markup spans, XEP-0300 hash links and SIMS/XEP-0385 media matching.
- [x] Roadmap phases are broken down by XEP-0479 Core, Web, IM, Mobile and A/V
  Client gates instead of loose Alpha/Beta feature buckets.
- [x] XEP-0479 Core Client checklist and self-assessment.
- [x] XEP-0479 Web Client checklist and self-assessment.
- [x] XEP-0479 IM Client checklist and self-assessment.
- [x] XEP-0479 Mobile Client checklist and self-assessment.
- [x] XEP-0479 A/V Client checklist and self-assessment.
- [x] Total Conversation Profile linked to XEP-0479 Advanced Client baseline.
- [x] Teletyptel current Total Conversation level documented as TC-2 implementation status.
- [x] Total Conversation discovery model defined with base feature and XEP-0128 form fields.
- [x] Total Conversation submission timing documented as "wait for Jingle ProtoXEP feedback first".
- [ ] Public release and user-facing setup guide before any XEP-0479 compliance claim.
- [ ] Real mobile push-provider integration for Advanced Mobile Client.

## Tooling And Samples

- [x] WinForms RTT demo.
- [x] Legacy smiley code catalog.
- [x] Web chat client shell.
- [x] Web chat client RTT relay integration.
- [x] Web chat client RFC 7395 controls.
- [x] Browser/PHP RTT relay demo.
- [x] PHP RTT relay protocol boundary documented.
- [x] PHP RTT relay safety boundary documented.
- [x] PHP RTT relay syntax validation script.
- [x] AI bot console demo.
- [x] LngPdk package loading.
- [x] LngPdk package compilation.
- [x] WinForms login using `XmppStreamClient.LoginAsync`.
- [x] Debug console for raw XML trace.
- [x] Local Prosody/Openfire smoke setup notes.
- [x] Real-server smoke tool for TLS, hostname validation, two-account chat and MUC discovery/join/groupchat.
- [x] Real-server smoke tool can create temporary XEP-0077 in-band registration accounts with `--register`.
- [x] Local XMPP server tool for repeatable STARTTLS, chat, upload and MUC protocol smoke tests.
- [x] Local XMPP server has portable `--data-dir` storage for accounts, roster
  items and local message archive across Windows/Linux/macOS.
- [x] `scripts/local-xmpp-server-smoke.ps1` starts LocalServer and verifies it with the real client smoke stack.

## Accessibility Agent

- [x] Accessibility agent vision document.
- [x] Accessibility input/source architecture direction.
- [x] Speech-to-text provider abstraction.
- [x] Text-to-speech provider abstraction.
- [x] Live captions model.
- [x] Caption-to-RTT bridge.
- [x] Local-only versus remote-shared caption mode.
- [x] Speaker label model.
- [x] External microphone kit/provider adapter.
- [x] Transcript retention/privacy settings.
- [x] Agent message marking.
- [x] Translation provider abstraction.
- [x] Sign-language research notes.
- [x] Video/sign-language provider abstraction.
- [x] Accessibility user testing notes.

## Product Platform

- [x] Account/provider/tab model documented.
- [x] Provider manifest example documented.
- [x] Provider manifest loader.
- [x] Static provider tabs in web client.
- [x] Local account profile JSON.
- [x] Capability display in web client settings.

## Documentation

- [x] Protocol notes.
- [x] RFC 6120 implementation plan.
- [x] Architecture document.
- [x] Existing XMPP app study.
- [x] XEP roadmap.
- [x] Implementation checklist.
- [x] Accessibility agent vision.
- [x] Public API overview.
- [x] Real-server setup guide.
- [x] XSF software directory preparation notes.
- [x] Teletyptel 2.0 DOAP draft.
- [x] Own-XMPP-core dependency rule documented.
