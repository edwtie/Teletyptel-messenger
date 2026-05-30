# XEP Roadmap

This roadmap groups XMPP Extension Protocols by product value and dependency
order. RFC 6120 and RFC 6121 remain the foundation; XEPs should layer on top of
that core.

## Alpha Core Extensions

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0030 | Service Discovery | Discover server/client features. | Done; LocalServer and RealServerSmoke cover the main path |
| XEP-0077 | In-Band Registration | Account registration, password change and account removal. | Done; real-server smoke supports `--register` |
| XEP-0124 | BOSH | HTTP binding session and request body model. | Client done; hosted smoke is release validation |
| XEP-0206 | XMPP over BOSH | XMPP profile for BOSH including stream restart. | Client done; hosted smoke is release validation |
| XEP-0157 | Contact Addresses for XMPP Services | Discover abuse, admin, security, status and support contact URIs. | Done; LocalServer advertises server-info and smoke prints contacts |
| XEP-0163 | Personal Eventing Protocol | Generic PEP/PubSub publish, retrieve, retract and notifications. | Done; public-server smoke is release validation |
| XEP-0080 | User Location | Publish explicit, permission-gated location such as GPS coordinates and accuracy. | Protocol done; UI consent/provider flow and real-server PEP smoke remain |
| XEP-0084 | User Avatar | Publish and retrieve contact avatars via PEP/PubSub. | Done; public-server smoke is release validation |
| XEP-0153 | vCard-Based Avatars | Presence hash for legacy avatar clients. | Done |
| XEP-0398 | User Avatar to vCard-Based Avatars Conversion | Discover and bridge PEP-vCard avatar conversion. | Done |
| XEP-0198 | Stream Management | Acknowledgements, resume and reconnect. | Done; LocalServer supports enable/ack |
| XEP-0352 | Client State Indication | Let web/mobile clients tell the server active/inactive state. | Done |
| XEP-0301 | In-Band Real Time Text | Live character-by-character text. | Done; RTT core, relay and XMPP message fallback covered |
| XEP-0308 | Last Message Correction | Replace a previously sent message with a corrected body. | Done; protocol helpers, web edit flow and public-server smoke covered |
| XEP-0085 | Chat State Notifications | active, composing, paused, inactive, gone. | Done; protocol helpers tested |
| XEP-0184 | Message Delivery Receipts | Delivered receipts. | Done; protocol helpers tested |
| XEP-0191 | Blocking Command | Block abusive or unwanted contacts through the server. | Done |

## Sync And History

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0280 | Message Carbons | Sync messages across multiple resources/devices. | Done; protocol helpers tested |
| XEP-0313 | Message Archive Management | Retrieve server-side message archive. | Done; query/result helpers tested |
| XEP-0223 | Persistent Storage of Private Data via PubSub | Store private account data through PEP with persistent whitelist publish-options. | Done |

## Security

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0384 | OMEMO Encryption | Modern end-to-end encryption. | Wire/key-storage helpers done; audited Signal backend is release validation |
| XEP-0454 | OMEMO Media Sharing | Encrypted media sharing. | Later |

## Group Chat And Files

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0045 | Multi-User Chat | Group chat rooms. | Done; local and real-server smoke paths exist |
| XEP-0048 | Bookmarks | Legacy room bookmarks. | Done for MUC bookmark compatibility |
| XEP-0049 | Private XML Storage | Generic private namespaced XML storage, also used by legacy bookmarks. | Done |
| XEP-0313 | Message Archive Management | Room history lookup. | Done for helper/smoke path; public MUC archive evidence pending |
| XEP-0363 | HTTP File Upload | Upload files through server-advertised HTTP slots. | Done; hosted execution is release validation |
| XEP-0402 | PEP Native Bookmarks | Modern synced room bookmarks. | Done |
| XEP-0410 | MUC Self-Ping | Detect stale room occupant sessions. | Done |

## Calls And Media

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0166 | Jingle | Session signaling. | Done for session signaling helpers and web demo bridge |
| XEP-0167 | Jingle RTP Sessions | Audio/video RTP session descriptions. | Done for RTP payload/session-info helpers and web call demo |
| XEP-0176 | Jingle ICE-UDP Transport | ICE candidates for NAT traversal. | Done for candidate helper, transport-info and web relay demo |
| XEP-0215 | External Service Discovery | Discover STUN/TURN services and short-lived credentials. | Core, local server and RealServerSmoke path done; production relay run is release validation |
| XEP-0320 | DTLS-SRTP in Jingle | WebRTC-style media security fingerprints. | Fingerprint model started; browser DTLS is WebRTC-managed |
| XEP-0353 | Jingle Message Initiation | Message-based call proposal, ringing, proceed/reject and finish flow. | Done for protocol helpers; installed-client call setup interop remains release validation |
| XEP-0065 | SOCKS5 Bytestreams | Direct/proxied binary streams, used by file transfer. | Core IQ helpers, S5B hash calculation, local SOCKS5 handshake/data smoke and real-server hosted proxy discovery/activation byte-transfer smoke path done |
| XEP-0234 | Jingle File Transfer | File metadata and transfer negotiation. | Core metadata, hash, range, received and checksum helpers done |
| XEP-0260 | Jingle SOCKS5 Bytestreams | S5B transport candidates in Jingle. | Core candidate/state helpers and real-server S5B proxy smoke path done |
| XEP-0047 | In-Band Bytestreams | Base64 byte chunks over IQ/message stanzas. | Core open/data/close helpers and two-account IBB byte-transfer smoke path done |
| XEP-0261 | Jingle In-Band Bytestreams | Slow fallback transport when S5B cannot connect. | Core Jingle transport helpers done; XEP-0047 fallback transfer smoke path done |
| XEP-0177 | Jingle Raw UDP Transport | Simple UDP transport. | Future |
| XEP-0343 | Signaling WebRTC DataChannels in Jingle | WebRTC data channels through Jingle. | Future |

## RTT Direction

XEP-0301 should stay a first-class extension. It is not just a typing indicator:

- XEP-0085 says someone is typing.
- XEP-0301 sends the actual live edits.

Project-specific RTT goals:

- per-contact RTT state;
- normal `<body>` fallback for non-RTT clients;
- sequence recovery;
- accessibility-friendly display;
- AI/bot clients that participate as normal RTT clients.

## Location And Emergency Direction

XEP-0080 is the XMPP-side location protocol for Teletyptel. It should be used
only when the user explicitly shares location, starts a trusted assistive flow
or enters a future emergency mode.

Important product rules:

- show coordinates only with accuracy, timestamp and source;
- warn when a location is stale or manually entered;
- keep "share once", "share live" and "stop sharing" separate;
- never treat XEP-0080 alone as an official 112/NG112 connection.

For NG112 interop, Teletyptel needs a gateway model that can convert the trusted
location state into emergency-service formats such as PIDF-LO/RFC 6442. That
gateway must stay simulator/test-only until legal, operational and certification
requirements are handled.

## Accessibility Dependencies

The accessibility agent depends on the same XMPP building blocks:

- XEP-0301 for live captions and character-by-character text;
- XEP-0080 for permission-gated location during assistive or emergency-oriented
  flows;
- XEP-0030 for discovering whether the remote side supports RTT/caption
  features;
- XEP-0198 for stable mobile and reconnect behavior;
- XEP-0313 only for opt-in transcript/archive retrieval;
- Jingle/WebRTC XEPs for future audio/video and sign-language experiments.

Speech-to-text and sign-language recognition are not XMPP protocols. They should
stay in provider modules and publish typed caption/agent events into the XMPP
layer.

## Suggested Implementation Order

1. XEP-0030 service discovery.
2. XEP-0198 stream management.
3. XEP-0301 real-time text over real XMPP message stanzas.
4. XEP-0085 chat states.
5. XEP-0184 delivery receipts.
6. XEP-0308 message correction.
7. XEP-0280 message carbons.
8. XEP-0313 archive.
9. XEP-0191 blocking command for safety controls.
10. XEP-0080 location only after consent, privacy and stale-data handling are designed.
11. OMEMO only after the message lifecycle is stable.
12. MUC, HTTP upload and Jingle UI flows after the protocol wire models are covered.

## Testing Rule

Every XEP implementation needs:

- serializer/parser tests;
- local server/client tests;
- at least one interoperability note against existing clients where practical.
