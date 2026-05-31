# XMPP Protocol Notes

## Basic XMPP RFCs

| Protocol | Purpose |
| --- | --- |
| RFC 6120 | Extensible Messaging and Presence Protocol (XMPP): Core. |
| RFC 6121 | Extensible Messaging and Presence Protocol (XMPP): Instant Messaging and Presence. |
| RFC 7395 | An Extensible Messaging and Presence Protocol (XMPP) Subprotocol for WebSocket. |
| RFC 7590 | Use of Transport Layer Security (TLS) in the Extensible Messaging and Presence Protocol (XMPP). |
| RFC 7622 | Extensible Messaging and Presence Protocol (XMPP): Address Format. |

## Further XMPP RFCs

| Protocol | Purpose |
| --- | --- |
| RFC 3920 | Historic XMPP Core predecessor, obsoleted by RFC 6120. |
| RFC 3921 | Historic IM and presence predecessor, obsoleted by RFC 6121. |
| RFC 6122 | Historic XMPP address format, obsoleted by RFC 7622. |
| RFC 6123 | End-to-end signing and object encryption for XMPP, historic and not the modern OMEMO path. |
| RFC 3922 | Mapping XMPP to Common Presence and Instant Messaging, historic interoperability reference. |
| RFC 3923 | End-to-end signing and object encryption predecessor, obsoleted by RFC 6123. |

Initial implementation status:

- `XmppAddress` parses bare and full JIDs.
- `XmppConnectionSettings` keeps account, host, port and TLS requirements.
- `XmppStreamOptions` keeps client resource, language and timing defaults.
- `XmppStreamHeader`, `XmppStreamFeatureSet`, `XmppStartTls`,
  `XmppSaslPlain`, `XmppResourceBinding` and `XmppStreamNegotiationPlan`
  now cover the first RFC 6120 stream negotiation building blocks.
- `XmppFeatureSet` models support for roster, presence, stream management and
  real-time text.
- `XmppChatMessage`, `XmppPresence` and `XmppIq` serialize the first
  RFC 6120/6121 stanzas used by Alpha 1.
- The same stanza models parse incoming chat messages, presence updates and
  roster IQ results back into typed objects.

Detailed status: [RFC6120_IMPLEMENTATION.md](RFC6120_IMPLEMENTATION.md).

Related app landscape: [XMPP_APP_STUDY.md](XMPP_APP_STUDY.md).

Library architecture: [ARCHITECTURE.md](ARCHITECTURE.md).

XEP roadmap: [XEP_ROADMAP.md](XEP_ROADMAP.md).

Implementation checklist: [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).

Official compliance suites mapping:
[XMPP_COMPLIANCE_SUITES.md](XMPP_COMPLIANCE_SUITES.md).

TLS policy:
[TLS_POLICY.md](TLS_POLICY.md).

Accessibility and intelligent agent direction:
[ACCESSIBILITY_AGENT_VISION.md](ACCESSIBILITY_AGENT_VISION.md).

Public API overview:
[PUBLIC_API.md](PUBLIC_API.md).

Real-server setup guide:
[REAL_SERVER_SETUP.md](REAL_SERVER_SETUP.md).

Server response flow:
[SERVER_RESPONSE_FLOW.svg](SERVER_RESPONSE_FLOW.svg).

## Chat

| XEP | Purpose |
| --- | --- |
| XEP-0030 | Service discovery. |
| XEP-0050 | Ad-hoc command discovery and execution. |
| XEP-0133 | Service administration commands for server-side status and maintenance. |
| XEP-0077 | In-band account registration, password change and account removal. |
| XEP-0124 | BOSH HTTP binding body format. |
| XEP-0206 | XMPP over BOSH profile and stream restart. |
| XEP-0157 | Contact addresses for XMPP services. |
| XEP-0115 | Entity capabilities in presence broadcasts. |
| XEP-0045 | Multi-user chat. |
| XEP-0048 | Legacy bookmark storage for MUC room bookmarks. |
| XEP-0049 | Private XML storage for namespaced account data and legacy bookmark compatibility. |
| XEP-0060 | Publish-Subscribe for generic nodes, announcements, service news and the foundation used by PEP. |
| XEP-0153 | vCard-based avatar update hash in presence. |
| XEP-0163 | Personal Eventing Protocol for publish/retrieve/retract on personal PubSub nodes. |
| XEP-0080 | User location through permission-gated PEP/PubSub events. |
| XEP-0084 | User avatars via PEP/PubSub. |
| XEP-0398 | PEP-vCard avatar conversion support discovery. |
| XEP-0085 | Chat state notifications such as typing. |
| XEP-0184 | Message delivery receipts. |
| XEP-0191 | Blocking command. |
| XEP-0198 | Stream management and reconnect support. |
| XEP-0223 | Persistent private data via PubSub/PEP. |
| XEP-0280 | Message carbons for multi-device sync. |
| XEP-0308 | Last message correction. |
| XEP-0313 | Message archive management. |
| XEP-0352 | Client state indication. |
| XEP-0363 | HTTP file upload. |
| XEP-0402 | PEP-native MUC room bookmarks. |
| XEP-0410 | MUC self-ping. |

## XEP-0060 Publish-Subscribe

XEP-0060 is the general PubSub foundation. XEP-0163 PEP is the personal-eventing
profile built on top of PubSub, but Teletyptel should also track XEP-0060
explicitly because provider/server announcements are not always personal events.

Planned Teletyptel announcement model:

- server or provider publishes items to a well-known node such as
  `urn:tiedragon:teletyptel:announcements`;
- items contain Atom-like title, summary, link, language, category and priority
  metadata;
- clients can retrieve recent items and subscribe when the server allows it;
- UI presents them as news/mededelingen, status notices or provider service
  updates, not as unsolicited chat spam.

Current implementation status: `XmppPubSub` adds explicit XEP-0060 subscribe,
unsubscribe, create-node, delete-node and subscription-result helpers.
`XmppPubSubAnnouncements` defines the Teletyptel announcement node
`urn:tiedragon:teletyptel:announcements`, serializes Atom entries and parses
items or pushed PubSub event notifications. The web provider manifest can seed
a News tab with provider announcements. A live public-server subscription smoke
remains release validation because PubSub service names and access policies vary
by deployment.

## XEP-0050 And XEP-0133 Server Administration

XEP-0133 defines service administration as XEP-0050 ad-hoc commands. The local
server now exposes the XEP-0050 command list through XEP-0030 `disco#items` and
implements a safe read-only XEP-0133 subset:

- number and list of registered users;
- number and list of online users;
- number and list of active users;
- number and list of idle users.

The intentionally removed password retrieval command is not implemented. The
mutating administration commands, production authorization policy and audit logs
belong to the real server hardening track, not to the localhost smoke server.

## XEP-0308 Last Message Correction

Message correction is a normal message stanza with a corrected `<body/>` and
`<replace xmlns="urn:xmpp:message-correct:0" id="original-message-id"/>`.
Teletyptel now keeps that payload protocol-native:

1. `XmppMessageCorrection` serializes and parses the `replace` element.
2. `XmppChatMessage` carries `ReplaceId` for one-to-one messages.
3. `XmppMultiUserChat` carries `ReplaceId` for `groupchat` messages.
4. `XmppStreamClient` exposes `SendMessageCorrectionAsync` and
   `SendMultiUserChatCorrectionAsync`.
5. The web client edit flow sends the same XEP-0308 payload instead of a local
   demo command.
6. `RealServerSmoke --correction-smoke` verifies that a public server delivers
   both the original message and the later correction with the original id.

The UI should treat correction as a replacement of a previously sent message,
not as a new visible chat line. If the original id is unknown, clients may show
the correction as a normal received message with an edited marker.

## XEP-0313 Message Archive Management

The core serializes MAM queries with data-form filters and RSM paging, parses
forwarded archived messages and reads `fin` result-set metadata. The
real-server smoke tool can now run `--mam-smoke`: it logs in with two accounts,
sends a unique one-to-one seed message, verifies delivery, queries the account
archive and confirms the same body returns from the server archive. A separate
`--muc-mam-smoke` path is available for archive-enabled MUC rooms.

## XEP-0045 Multi-User Chat

Teletyptel implements the MUC client helper layer in separable pieces:

1. Discover available rooms from a conference service with XEP-0030 `disco#items`.
2. Discover room occupants/items with `disco#items` on the room JID.
3. Join and leave rooms with MUC presence.
4. Send and parse `groupchat` messages.
5. Request, parse, submit or cancel owner room-configuration data forms.
6. Request or set admin items for affiliation and role flows such as member lists, bans and kicks.

The local XMPP server returns sample room discovery, room items, configuration form and admin list responses for smoke testing. Real Prosody/ejabberd interoperability is tracked separately because permission models and enabled modules differ per deployment.

## Advanced Group Chat

Teletyptel now has the client-side advanced group building blocks around MUC:

1. `XmppBookmarks` publishes, retracts and parses XEP-0402 PEP-native room
   bookmarks on `urn:xmpp:bookmarks:1`.
2. The same helper reads and writes XEP-0048 legacy bookmark storage through
   the generic XEP-0049 private XML layer for older servers and clients.
3. Bookmark notifications are parsed from PEP events so a client can update its
   local room list when another device changes bookmarks.
4. `XmppMucSelfPing` sends XEP-0410 pings to the user's own room occupant JID
   and classifies result/error replies as joined, not joined, nick changed or
   temporary failure.
5. `XmppStreamClient` exposes bookmark publish/retrieve/retract, legacy
   bookmark compatibility and MUC self-ping helpers.

XEP-0313 MUC archive queries are wired through the archive helper and
`RealServerSmoke --muc-mam-smoke`. The smoke configures newly created rooms as
persistent and enables archive/logging fields when the server offers them. It
also parses forwarded MUC `groupchat` archive results, including public-server
rooms whose forwarded group messages do not include a `to` attribute.

## XEP-0049 Private XML Storage

`XmppPrivateXmlStorage` creates the protocol-native
`<query xmlns="jabber:iq:private">` get/set IQ payloads for any namespaced XML
root element and parses result payloads back as cloned `XElement` values.
`XmppServiceDiscovery.SupportsPrivateXmlStorage` checks whether the server
advertises the private-data namespace. `XmppStreamClient` exposes
`RequestPrivateXmlAsync` and `SetPrivateXmlAsync` for server-backed account
data. `XmppBookmarks` uses the same helper for XEP-0048 legacy bookmark
compatibility, so bookmark support no longer owns a private-data one-off
implementation.

## XEP-0223 Persistent Private Data

`XmppPersistentPrivateData` stores namespaced private account data through PEP
instead of legacy `jabber:iq:private`. It publishes items with
`pubsub#persist_items=true` and `pubsub#access_model=whitelist`, retrieves
items through normal PubSub item queries and parses PEP notifications. The
helper also enforces the XEP-0223 trust rule for notifications: an event is
accepted only when `from` is absent or belongs to the same bare account JID.
`XmppStreamClient` exposes `StorePersistentPrivateDataAsync` and
`RequestPersistentPrivateDataAsync` for higher-level clients.

## XEP-0124/XEP-0206 BOSH

`XmppBosh` implements the protocol body foundation for BOSH:

1. Create session-start `<body/>` requests with `rid`, `to`, `wait`, `hold`,
   BOSH version and XMPP-over-BOSH `xmpp:version`.
2. Wrap normal XMPP payload elements in session requests with `sid` and `rid`.
3. Create XMPP stream restart bodies with `xmpp:restart="true"`.
4. Create terminate bodies and parse terminate conditions.
5. Parse session responses, including `sid`, `authid`, request/window hints,
   inactivity/polling hints and embedded stream features.

`XmppBoshClient` adds the HTTP long-polling client loop on top of that model:
session open, empty long-poll requests, stanza sends, SASL PLAIN/SCRAM,
stream restart, resource binding, IQ request/response matching and clean
termination. `RealServerSmoke` can run the BOSH path with `--bosh-url` or
discover it through XEP-0156 with `--discover-bosh`; `--bosh-only` is available
for deployments where the web binding is reachable but the normal TCP client
port is not.

The current browser product path still prefers RFC 7395 WebSocket. BOSH is now
available as an optional fallback transport and needs hosted execution results
before it is claimed in release notes.

## XEP-0352 Client State Indication

`XmppClientStateIndication` implements the mobile/web client state markers:

1. Parse stream feature advertisement through `<csi xmlns="urn:xmpp:csi:0"/>`.
2. Serialize `<active/>` when the conversation view is foregrounded or the user
   is interacting.
3. Serialize `<inactive/>` when the app is minimized, backgrounded or the screen
   is not actively showing the conversation.

`XmppStreamClient` and `XmppBoshClient` expose `SendActiveClientStateAsync`,
`SendInactiveClientStateAsync` and `SendClientStateAsync`. These are stream-level
elements, not normal message/presence/IQ stanzas, so they do not affect stream
management stanza counters.

The web client now wires browser and future app lifecycle events into the same
state model. It sends active/inactive on `visibilitychange`, focus/blur,
`pagehide`/`pageshow`, Chromium page `freeze`/`resume`, and app-style
`pause`/`resume` events. For WebView hosts, native code can call
`window.TeletyptelLifecycle.setActive()`, `setInactive()` or dispatch a
`teletyptel:lifecycle` event. WebView2 hosts can also send a message to the page
with `{ state: "active" }` or `{ state: "inactive" }`.

In RFC 7395 mode the browser sends the XEP-0352 XML element directly. In local
relay mode it sends a `client-state` JSON envelope that carries the same XML so
the demo contact list can show "online - inactive" without inventing a separate
protocol concept.

## XEP-0191 Blocking Command

`XmppBlockingCommand` implements the XEP-0191 IQ layer:

1. Request the current `<blocklist/>`.
2. Block one or more bare or full JIDs with `<block><item jid="..."/></block>`.
3. Unblock one or more JIDs, or unblock all with an empty `<unblock/>`.
4. Parse server pushes for block/unblock changes and create the required IQ result acknowledgement.
5. Detect support through XEP-0030 feature `urn:xmpp:blocking`.

`XmppStreamClient` exposes `RequestBlockedUsersAsync`, `BlockUserAsync`,
`BlockUsersAsync`, `UnblockUserAsync`, `UnblockUsersAsync` and
`UnblockAllUsersAsync`. The local XMPP server stores per-account blocklists and
suppresses direct messages when either side blocks the other. `RealServerSmoke`
can exercise the full server roundtrip with `--block-jid`.

## XEP-0363 HTTP File Upload

Teletyptel implements the client side in the same sequence as the standard:

1. Discover an upload service through XEP-0030.
2. Read an optional XEP-0128 data form with `FORM_TYPE=urn:xmpp:http:upload:0` and `max-file-size` in bytes.
3. Send an IQ-get slot request with `filename`, `size` and optional `content-type`.
4. Parse an HTTPS PUT URL and HTTPS GET URL from the slot result.
5. Upload bytes through HTTP PUT with exact `Content-Length`, `Content-Type` and only the allowed headers `Authorization`, `Cookie` and `Expires`.
6. Send the GET URL to the recipient as a normal message body plus a `jabber:x:oob` URL payload for clients that understand out-of-band links.

Purpose hints are supported through `urn:xmpp:http:upload:purpose:0`; ephemeral uploads require an `expire-before` timestamp. The client also parses `file-too-large` responses with `max-file-size` and `retry` responses with an optional retry timestamp.

The local XMPP server advertises `urn:xmpp:http:upload:0`, reports `max-file-size` through the discovery data form and can run a loopback HTTP endpoint for slot, PUT and attachment-message smoke testing. The real-server smoke tool can discover or target a hosted upload service, request a slot, perform the HTTP PUT and optionally send the resulting URL to another account. The local PHP upload endpoint remains a browser demo path; real XMPP file upload should use the XEP-0363 slot and PUT flow.

## XEP-0047/XEP-0261 IBB Fallback

IBB is the slow but important fallback when direct SOCKS5 transfer cannot cross
NAT, firewalls or provider policy. The core now models the XEP-0261 Jingle
transport with `block-size`, `sid` and `stanza`, then creates the matching
XEP-0047 `open` request required after the Jingle negotiation. XEP-0047
`data` chunks can be serialized through IQ or message stanzas and parsed back
from base64, and `close` tears down the bytestream.

`RealServerSmoke --ibb-smoke` now runs the fallback path with two logged-in
accounts. The target smoke client answers `disco#info` with XEP-0047 support,
accepts `open`, acknowledges each IQ `data` chunk in order, accepts `close` and
verifies that the received bytes match the sent payload.

This is intentionally still a fallback path, not the primary fast file-transfer
path. Production transfer code must throttle chunks, respect negotiated
block-size, handle sequence rollover and close on stanza errors.

## XEP-0245 `/me` Command

`XmppMeCommand` keeps the XEP-0245 behavior intentionally simple: `/me ` is
sent unchanged in the normal message body, and receiving clients detect that
prefix for action-style presentation.

## Legacy Smiley Codes

`LegacySmileyCatalog` recognizes classic forum smiley text codes such as `:)`,
`:P`, `8)7` and `_o_`. It returns typed text/smiley tokens with the legacy GIF
file name, so clients can render compatible images or fallback text without
changing the message body.

## XEP-0054 vcard-temp

`XmppVCardTemp` supports the vcard-temp profile fields most useful for contact
identity in early clients: formatted name, nickname, URL, birthday and photo.
It can create IQ get/set payloads and parse IQ result payloads.

## XEP-0084 User Avatar

`XmppUserAvatar` implements the protocol wire layer for avatar data and
metadata. It creates PEP/PubSub publish and retrieve IQs for
`urn:xmpp:avatar:data` and `urn:xmpp:avatar:metadata`, computes the required
SHA-1 avatar id from the image bytes, parses metadata notifications and models
the empty metadata case used to temporarily disable an avatar.

Product support includes a browser account avatar editor, contact-list cache and
relay presence hints for the local demo. `XmppVCardAvatar` adds XEP-0153
`vcard-temp:x:update` presence hash support, vCard `PHOTO` conversion helpers
and XEP-0398 `urn:xmpp:pep-vcard-conversion:0` discovery. Public-server PEP
smoke remains a release validation item, not an implementation gap.

## XEP-0163 Personal Eventing Protocol

`XmppPersonalEventing` implements the generic PEP/PubSub layer used by avatar,
OMEMO-style device data and later personal events such as mood, activity or
nickname:

1. Detect a PEP service from XEP-0030 identity `category=pubsub` and `type=pep`.
2. Create publish IQs addressed to the user's own PEP service.
3. Create item retrieval IQs for own or contact nodes.
4. Create retract and owner delete IQs for cleanup flows.
5. Parse `pubsub#event` message notifications, including published items,
   retractions, purges and node deletions.

`XmppStreamClient` exposes `RequestPersonalEventingInfoAsync`,
`PublishPersonalEventAsync`, `RequestPersonalEventItemsAsync`,
`RetractPersonalEventAsync` and `DeletePersonalEventNodeAsync`. Incoming
`XmppIncomingStanza` values expose parsed PEP events through `PersonalEvent`.
Public-server PEP smoke remains release validation because server modules and
node access policies vary by deployment.

## XEP-0080 User Location

XEP-0080 is the XMPP-side protocol for user location. In Teletyptel it belongs
to accessibility and emergency-readiness flows, not background tracking.

Implemented protocol and product shape:

1. Model latitude, longitude, accuracy, altitude, timestamp, human-readable text
   and local source metadata.
2. Serialize and parse the XEP-0080 payload.
3. Detect server support through service discovery before treating XEP-0080 as
   available. Some XMPP servers do not offer PEP/PubSub, auto-create or item
   retrieval, so location must degrade cleanly instead of failing silently.
4. Publish/retrieve location through XEP-0163 PEP when the server advertises the
   required capabilities.
5. Clear or retract the current location item when sharing stops.
6. Keep consent outside the wire helper: the protocol layer never publishes
   automatically.
7. Web client location tab requests browser permission only after a visible user
   action.
8. Web client supports share once, live sharing and stop sharing.
9. UI shows accuracy, timestamp, source, stale-location and XMPP-server-support
   warnings.
10. PIDF-LO export helper exists for simulator/gateway experiments.

Still to validate outside localhost:

- real-server PEP smoke with a non-emergency test account on both a supporting
  server and a server without XEP-0080/PEP support;
- hosted mobile WebView permission smoke;
- NG112 simulator-only PIDF-LO gateway test plan.

For NG112 interop, XEP-0080 is not enough by itself. A future emergency gateway
must translate the trusted Teletyptel location state into emergency-service
formats such as PIDF-LO/RFC 6442 and must be tested against simulators before
any live public-safety use.

## XEP-0077 In-Band Registration

`XmppInBandRegistration` creates registration info, submit, password-change and
remove IQ payloads for the `jabber:iq:register` namespace. It also parses the
legacy field-based info result used by many servers.

`XmppStreamFeatureSet.InBandRegistrationOffered` detects the optional
`http://jabber.org/features/iq-register` stream feature. `XmppStreamClient`
exposes helpers for authenticated password changes/removal and for registration
info/submit flows when the caller has opened the appropriate stream.

Public servers often rate-limit or reject automated registration. The project
treats that as correct server behavior, not a failure to bypass.

## XEP-0157 Contact Addresses For XMPP Services

`XmppServiceContactAddresses` parses and creates the XEP-0157 server-info data
form used inside XEP-0030 `disco#info` results. It recognizes the registered
fields for abuse, admin, feedback, sales, security, status and support contact
URIs under `FORM_TYPE=http://jabber.org/network/serverinfo`.

This is useful for public-server readiness: a client can show where users should
report abuse, security issues, support questions or service status problems
without hardcoding provider-specific contact links.

## XEP-0357 Push Notifications

`XmppPushNotifications` creates the XMPP enable/disable IQ payloads for push
services, including optional publish-options data forms. Mobile platform
registration and real provider integration remain app-layer work.

## Real-Time Text

| XEP | Purpose |
| --- | --- |
| XEP-0301 | In-band real-time text. |
| ProtoXEP Jingle synchronized RTT | Real-time text synchronized with an active Jingle/WebRTC audio/video session. |

Real-time text is different from typing notifications. XEP-0085 says that someone is typing. XEP-0301 sends live text edits while the message is being written.

Initial implementation status:

- `RttPacket` parses and serializes `<rtt/>` packets.
- `RttMessageState` applies insert/erase actions to the visible live text buffer.
- `seq` is treated as synchronization protection; out-of-order edits are ignored until a new/reset packet arrives.
- Unicode positions are handled as code points, matching the XEP wording.
- `RttJsonEnvelope` wraps RTT XML for local WebSocket demos without replacing the XMPP payload.

The web client also implements the current ProtoXEP direction for Jingle
synchronized RTT. A Jingle call advertises an extra `text` content with
`urn:xmpp:jingle:apps:rtt-sync:0`, then opens a reliable WebRTC datachannel
named `rtt`. While that channel is open, live drafts and final chat text are
sent as `jingle-rtt` packets in the same call context. If the channel is not
available, the client falls back to normal XEP-0301 relay RTT.

The same `rtt` datachannel now also listens for raw T.140 text payloads. That
means a peer that sends plain UTF-8 T.140 characters, including backspace/delete
and CR/LF line breaks, is treated as live call text instead of being ignored.
The browser sender sends linear live edits as raw T.140 where possible and still
uses the JSON `jingle-rtt` wrapper for resets, final message metadata and
non-linear edits.

The core library also contains the first RFC 4103 direction: `T140Codec` handles
UTF-8 T.140 text blocks and erasures, `RtpPacket` serializes/parses RTP version
2 packets, `RtpT140Packetizer` creates `text/t140` RTP payloads, and
`RtpT140RedundantPayload` creates/parses RFC 2198-style redundant payloads used
with `text/red`. This is the path needed for SIP/IMS text conversation interop;
the browser datachannel path remains a WebRTC/Jingle profile.

Local verification: a Playwright smoke test with two fresh browser profiles
started a video call, opened the `rtt` datachannel, logged
`jingle-rtt-out`/`jingle-rtt-in`, showed the remote live draft and delivered the
final message as `jingle-rtt`.

## PHP WebSocket Transport

The `php/rtt-websocket-server.php` relay is a local experiment transport for RTT
messages. It sends JSON envelopes containing XEP-0301 XML between browser
windows:

```json
{
  "type": "rtt",
  "text": "Hello",
  "xml": "<rtt xmlns=\"urn:xmpp:rtt:0\" event=\"reset\" seq=\"0\"><t p=\"0\">Hello</t></rtt>"
}
```

This does not replace XMPP. It only gives the project a quick browser-visible
way to test live text behavior before a real XMPP connection is implemented.

For demo robustness the JSON envelope also carries `text` as a current snapshot.
If a demo client joins after the sender already started typing and therefore
misses the first RTT `reset`, it can show the snapshot and continue from the
next reset/edit sequence. Real XMPP clients should still follow XEP-0301 stream
synchronization rules.

The `AiBotConsole` sample is just another WebSocket client. It receives the same
JSON envelope as the WinForms demo, reconstructs live text with `RttMessageState`
and sends bot replies with `RttComposer`. This makes the bot a normal RTT
participant instead of a special server-side feature.

The same PHP relay also supports RFC 7395 test mode. When a client requests the
`xmpp` WebSocket subprotocol, the relay responds with that subprotocol, accepts
RFC 7395 `<open/>` and `<close/>` frames and relays `<message/>`, `<presence/>`
and `<iq/>` XML frames to other RFC 7395 clients.

Detailed PHP relay notes: [RTT_RELAY.md](RTT_RELAY.md).

## RFC 7395 WebSocket XMPP

RFC 7395 is separate from the demo relay. It transports normal XMPP stream XML
inside WebSocket text messages and uses the `xmpp` WebSocket subprotocol.

Current implementation status:

- `XmppWebSocketFrame` creates and parses RFC 7395 `<open/>` frames.
- `XmppWebSocketFrame.CreateClose()` creates the RFC 7395 `<close/>` frame.
- `IXmppWebSocketTransport` defines a transport boundary.
- `XmppClientWebSocketTransport` wraps `ClientWebSocket` and requests the
  `xmpp` subprotocol.
- `XmppWebSocketStream` sends open, stanza and close XML over the transport.

The PHP relay is a local RFC 7395 transport harness, not a full XMPP server. It
does not implement accounts, SASL, roster, presence storage, archive behavior or
federation.

## XEP-0156 Alternative Connection Discovery

`XmppAlternativeConnectionDiscovery` creates HTTPS host-meta URLs and parses
XML XRD and optional JSON JRD records for BOSH and RFC 7395 WebSocket endpoints.
This lets the client discover `wss://` XMPP WebSocket URLs without hardcoding
server paths.

## XEP-0368 Direct TLS

`XmppDirectTls` resolves and orders client connection endpoints from
`_xmpps-client._tcp` and `_xmpp-client._tcp` SRV records. Direct TLS endpoints
set `XmppConnectionSettings.DirectTls`, so `XmppStreamClient` upgrades the TCP
stream with `SslStream` before the initial `<stream:stream>` is sent. The TLS
server name remains the XMPP service domain from the JID, while the TCP host can
be the SRV target. Direct TLS also requests ALPN `xmpp-client`.

If no SRV endpoint is discovered, the helper can return the normal STARTTLS
fallback endpoint on port 5222.

## Localization

The WinForms demo loads UI text from `.lng` key-value files. This keeps labels,
buttons, placeholders and status messages independent from the application code
while the protocol and UI layers are still changing quickly.

The demo also supports LngPdk `.lngpdk` packages through the independent
`Tiedragon.LngPdk` library. A package contains `manifest.json` plus
`language/<code>.lng` and is compiled with `Tiedragon.LngPdk.Tool`. Loose
`.lng` files remain a development fallback.

## Encryption

| XEP | Purpose |
| --- | --- |
| XEP-0384 | OMEMO end-to-end encryption. |
| XEP-0454 | OMEMO media sharing. |

Current core support covers the current `urn:xmpp:omemo:2` namespace, device
list requests/parsing, bundle requests on `urn:xmpp:omemo:2:bundles`, bundle
publish/parsing, encrypted message wrappers with grouped `<keys jid="...">`,
payload encryption/decryption at the payload-secret boundary and a
trust/fingerprint model. There is also an explicit Signal Protocol backend
boundary, production guard and X3DH helper for bundle validation, DH1-DH4
planning, associated data, HKDF, X25519 initiator/responder agreement and a
signed pre-key verification gate. It also has an opaque session store contract
for Double Ratchet backend state plus local device key-material helpers for
device-list publication, bundle publication, one-time pre-key consumption and
pre-key replenishment. This is still a protocol foundation: production OMEMO
requires an audited verifier/backend and real Double Ratchet engine.

## Audio And Video

| XEP | Purpose |
| --- | --- |
| XEP-0166 | Jingle session signaling. |
| XEP-0167 | Jingle RTP sessions for audio/video. |
| XEP-0176 | Jingle ICE-UDP transport. |
| XEP-0215 | External service discovery for STUN/TURN. |
| XEP-0320 | DTLS-SRTP fingerprints for secure media setup. |
| XEP-0353 | Jingle Message Initiation call proposal flow. |
| XEP-0047 | In-Band Bytestreams for slow fallback binary chunks over XMPP. |
| XEP-0065 | SOCKS5 Bytestreams for direct or proxied binary streams. |
| XEP-0234 | Jingle File Transfer metadata and negotiation. |
| XEP-0260 | Jingle SOCKS5 Bytestreams transport. |
| XEP-0261 | Jingle In-Band Bytestreams fallback transport. |
| XEP-0177 | Jingle raw UDP transport. |
| XEP-0343 | WebRTC data channels in Jingle. |

Current core support covers Jingle `session-initiate`, `session-accept`,
`session-terminate`, `transport-info`, RTP payload descriptions, ICE-UDP
candidates, DTLS-SRTP fingerprints and RTP `session-info` states such as
ringing, hold and mute. It also covers XEP-0234 Jingle file metadata, XEP-0260
S5B candidates, XEP-0065 proxy address discovery/bytestream setup/proxy
activation and XEP-0047/XEP-0261 IBB fallback negotiation with open/data/close
stanzas. `XmppJingleMessageInitiation` covers the XEP-0353 call proposal layer
before the IQ-based Jingle session starts, including `propose`, `ringing`,
`proceed`, `reject`, `retract`, `finish`, tie-break and migration metadata. The
SOCKS5 layer now has a local streamhost smoke that performs the
no-auth SOCKS5 CONNECT handshake, verifies the XEP-0065 destination-address
digest with DST.PORT 0 and exchanges file bytes over the opened stream.
`RealServerSmoke --socks5-smoke` adds the hosted-proxy path: discover or target
a bytestream proxy, request its streamhost address, have both accounts connect
to the proxy, send `streamhost-used`, activate the proxy and verify byte
delivery. The web client has a local relay call bridge that uses Jingle-shaped
envelopes for offer/answer/candidate exchange and WebRTC for browser
audio/video media. The test suite parses existing-client style Jingle RTP
fixtures and direct file-transfer S5B and IBB offers. A live federated call or
direct file transfer with an installed client still requires server-backed IQ
routing, real accounts and an installed peer smoke, but the command-line
S5B/IBB transfer paths are now implemented.

### XEP-0215 External Service Discovery

`XmppExternalServiceDiscovery` implements the XEP-0215 wire layer used by A/V
clients to discover STUN/TURN services through XMPP:

1. Send an IQ-get `<services xmlns="urn:xmpp:extdisco:2"/>` to request all
   external services or include `type="turn"`/`type="stun"` for a filtered list.
2. Parse returned `<service/>` entries with required `type` and `host`, optional
   `port`, `transport`, `username`, `password`, `restricted`, `expires`, `name`
   and `action`.
3. Send `<credentials/>` requests for restricted services when short-lived TURN
   credentials are needed.
4. Parse server push updates and create the matching IQ-result acknowledgement.
5. Preserve optional data forms under each service for provider-specific
   extended information.

`XmppStreamClient` and `XmppBoshClient` expose request helpers for services and
credentials. The implementation is covered by unit tests, a local TCP stream
roundtrip, LocalServer STUN/TURN service responses and a RealServerSmoke
`--external-services` path that validates advertised support, service lists and
restricted TURN credentials. A public hosted run still needs the deployment's
real relay service and account credentials.
