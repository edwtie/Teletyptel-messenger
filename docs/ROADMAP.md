# Roadmap

Teletyptel phases are now gated by XEP-0479: XMPP Compliance Suites 2023.
Product names such as Alpha, Beta and Release may still be used for packaging,
but protocol scope follows the official compliance categories.

Reference: https://xmpp.org/extensions/xep-0479.html

## Claim Rule

Do not claim XEP-0479 compliance only because protocol helpers exist. A phase is
claimable only when the relevant items are implemented, tested, documented and
available in a usable tagged release.

Evidence levels:

- `Protocol`: serializers, parsers, stream-client methods and unit tests exist.
- `Local smoke`: the local server or local relay exercised the real code path.
- `Public smoke`: two real accounts or a real public server exercised the path.
- `Interop smoke`: another installed XMPP client or server exercised the path.
- `Release`: user-facing setup, binaries/package and repeatable instructions
  exist.

## Phase 1 - XEP-0479 Core Client

Goal: a standards-shaped XMPP client foundation.

Required for Client:

- RFC 6120 - XMPP Core
- RFC 7590 - TLS for XMPP
- XEP-0030 - Service Discovery
- XEP-0115 - Entity Capabilities

Required for Advanced Client:

- XEP-0368 - SRV records for XMPP over TLS
- XEP-0163 - Personal Eventing Protocol

Not applicable for a normal client:

- XEP-0114 - Jabber Component Protocol

Exit criteria:

- login, TLS, SASL, bind, roster, presence and stanza send/receive pass against
  local and public servers;
- capability discovery and advertised client capabilities are stable;
- direct TLS and PEP/PubSub helpers pass public-server smoke where supported.

## Phase 2 - XEP-0479 Web Client

Goal: browser/mobile-WebView connection paths that are real XMPP, not only the
demo relay.

Required for Client and Advanced Client:

- RFC 7395 - XMPP over WebSocket, or XEP-0206/XEP-0124 - BOSH
- XEP-0156 - Alternative Connection Method discovery

Exit criteria:

- browser client can use a production WebSocket or BOSH XMPP endpoint;
- host-meta discovery is documented for Windows/WAMP and Linux hosting;
- local PHP relay remains a development bridge and is not used as a compliance
  substitute.

## Phase 3 - XEP-0479 IM Client

Goal: complete normal messenger behavior before advanced polish.

Required for Client:

- RFC 6121 - Instant Messaging and Presence
- XEP-0245 - The `/me` Command
- XEP-0054 - vcard-temp
- XEP-0280 - Message Carbons
- XEP-0045 - Multi-User Chat
- XEP-0249 - Direct MUC Invitations
- XEP-0363 - HTTP File Upload

Required for Advanced Client:

- XEP-0084 - User Avatar
- XEP-0398 and XEP-0153 - vCard avatar compatibility
- XEP-0191 - Blocking Command
- XEP-0048 - Bookmark Storage
- XEP-0313 - Message Archive Management
- XEP-0402 - PEP Native Bookmarks
- XEP-0410 - MUC Self-Ping
- XEP-0223 - Persistent private data via PubSub
- XEP-0049 - Private XML Storage
- XEP-0198 - Stream Management
- XEP-0184 - Message Delivery Receipts
- XEP-0085 - Chat State Notifications
- XEP-0308 - Last Message Correction
- XEP-0234 and XEP-0261 - Jingle file transfer and IBB fallback

Supporting direct-transfer pieces used by the implementation:

- XEP-0047 - In-Band Bytestreams
- XEP-0065 - SOCKS5 Bytestreams
- XEP-0260 - Jingle SOCKS5 Bytestreams

Exit criteria:

- one-to-one chat, roster, presence, corrections, receipts, avatars, blocking,
  MUC, upload and archive flows pass public-server smoke;
- direct file transfer has both server-smoke evidence and at least one
  installed-client interop result before it is marketed.

## Phase 4 - XEP-0479 Mobile Client

Goal: WebView/native mobile behavior that survives real mobile networks.

Required for Client:

- XEP-0198 - Stream Management
- XEP-0352 - Client State Indication

Required for Advanced Client:

- XEP-0357 - Push Notifications

Exit criteria:

- Android and iOS lifecycle tests cover foreground, background, resume and
  network changes;
- push-provider integration is live before any Advanced Mobile claim.

## Phase 5 - XEP-0479 A/V Calling Client

Goal: real Jingle call setup and WebRTC media with another capable client.

Required for Client:

- XEP-0167 - Jingle RTP Sessions
- XEP-0353 - Jingle Message Initiation
- XEP-0176 - Jingle ICE-UDP Transport
- XEP-0320 - DTLS-SRTP in Jingle
- XEP-0215 - External Service Discovery for STUN/TURN

Required for Advanced Client:

- XEP-0293 - Jingle RTP Feedback Negotiation
- XEP-0294 - Jingle RTP Header Extensions Negotiation
- XEP-0338 - Jingle Grouping Framework
- XEP-0339 - Source-Specific Media Attributes in Jingle

Exit criteria:

- call proposal, ringing, proceed/reject, Jingle session setup, ICE, DTLS and
  hangup pass protocol tests;
- hosted STUN/TURN discovery works against the production relay;
- a live call with an installed Jingle-capable client is recorded.

## Teletyptel Product Additions Outside XEP-0479

These features stay important, but they are not allowed to distort the
XEP-0479 phase gates:

- XEP-0301 real-time text as the core accessibility differentiator.
- XEP-0080 user location for accessibility and emergency-readiness flows.
- PIDF-LO/RFC 6442 export for future NG112 gateway experiments.
- Accessibility agent adapters for captions, speech and sign-language research.
- LngPdk localization packaging and signed language resources.
- Account/profile UX, provider tabs and public hosted service operations.

## Release 1.0 Gate

Release 1.0 should claim only the XEP-0479 categories that are truly finished.
The safe target order is:

1. Core Client.
2. Web Client.
3. IM Client.
4. Mobile Client.
5. A/V Calling Client.

Advanced claims are separate. For example, Teletyptel may ship an IM Client
release before it claims Advanced IM, and it may ship video-call experiments
before it claims A/V Calling compliance.

## Total Conversation Track

The [Total Conversation Profile](protoxeps/total-conversation-profile.md) is the
integrated Teletyptel profile that sits on top of XEP-0479. It combines the
normal Core/Web/IM/Mobile/A/V suites with XEP-0301 real-time text and the two
Jingle ProtoXEPs.

Current implementation level:

| Level | Meaning | Teletyptel status |
| --- | --- | --- |
| TC-0 | Core conversation | Done as XMPP core foundation. |
| TC-1 | Live text conversation | Done with XEP-0301 and message fallback. |
| TC-2 | Audio/video conversation | Working now through Jingle-shaped call setup and browser WebRTC media. |
| TC-3 | Synchronized Total Conversation | Prototype through Jingle synchronized RTT and `rtt` datachannel tests. |
| TC-4 | Assistive context | Draft/prototype through XEP-0080 and Jingle user location. |

TC-2 is a product/protocol implementation milestone. It is not the same as a
formal XEP-0479 A/V Calling Client claim, which still needs release packaging,
hosted deployment and installed-client interop evidence.

Submission timing: the Total Conversation Profile should stay as an internal
review draft until the two Jingle ProtoXEPs have received initial XSF feedback.
After that, convert the profile to XSF XML and submit it as the umbrella profile
that combines XEP-0479, XEP-0301, Jingle synchronized RTT and Jingle user
location.
