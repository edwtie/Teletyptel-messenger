# XMPP Compliance Suites

Official reference:

- https://xmpp.org/extensions/xep-0479.html

Target document:

- XEP-0479: XMPP Compliance Suites 2023.
- Version 0.1.0, published 2023-05-04.
- Status: Experimental.

The XSF compliance suite is an external checklist. Teletyptel should not claim
XEP-0479 compliance until the relevant items are implemented, tested against at
least one real server or client where practical, documented and shipped in a
usable release.

## Claim Boundary

This document is a self-assessment list, not a public compliance certificate.
Evidence can come from unit tests, local server smoke tests and real-server
smoke tests, but the public claim should wait until the feature is also
available in a tagged release with user-facing setup instructions.

`Tiedragon.XmppMessenger.LocalServer` counts as local protocol evidence only.
It is useful because it exercises the real client stack against a real
STARTTLS/SASL/bind C2S flow, but it is intentionally scoped to localhost or a
protected lab network. Production server compliance must be validated against a
hardened deployment. ejabberd is the preferred provider/lab target when SIP
gateway work matters; Prosody and Openfire remain useful interoperability
targets. The chosen server still needs the required modules for upload, MAM,
PubSub/PEP, STUN/TURN discovery and BOSH/WebSocket where used.

Status key:

- `Done`: implemented, tested and documented in this repository.
- `Partial`: protocol or UI support exists, but live interop, mobile/provider
  work or release documentation is still missing.
- `Open`: not implemented yet.
- `N/A`: not applicable to this client.

## Current Real-Server Evidence

Public-server smoke evidence is currently recorded against `conversations.im`
with two Teletyptel test accounts loaded from local secret scripts. This is not
a public compliance claim, but it is valid implementation evidence for the
repository:

- XEP-0368 direct TLS and hostname-negative TLS passed against
  `xmpps.conversations.im:443`.
- RFC 6120/6121 login, bind, roster and one-to-one chat passed.
- XEP-0157 service contact discovery returned abuse, admin and support URIs.
- XEP-0045 MUC discovery, room configuration, join and groupchat passed.
- XEP-0363 upload discovery, `max-file-size`, slot request, HTTP PUT and
  XEP-0066 attachment fallback passed.
- XEP-0065 hosted SOCKS5 bytestream proxy discovery, target and initiator
  SOCKS5 CONNECT, proxy activation and byte transfer passed.
- XEP-0047 IBB fallback `disco#info`, `open`, ordered IQ `data`, `close` and
  byte verification passed.
- XEP-0124/XEP-0206 BOSH discovery, login, disco and long-poll chat passed.
- XEP-0215 STUN discovery returned unrestricted STUN services.
- XEP-0308 last-message correction delivered a corrected one-to-one message
  with the original `replace` id intact.

## Core Compliance Suite

XEP-0479 Core Client requires the client-side items below. Advanced Client adds
direct TLS discovery and generic event publishing.

| XEP-0479 feature | Provider | Client level | Advanced client level | Teletyptel status | Next action |
| --- | --- | --- | --- | --- | --- |
| Core features | RFC 6120 | Required | Required | Done | Keep real-server login/chat smoke in release checklist. |
| TLS | RFC 7590 | Required | Required | Done | Keep hostname validation and TLS policy docs current. |
| Direct TLS | XEP-0368 | Not required | Required | Done | SRV lookup for `_xmpps-client._tcp`, endpoint planning, direct TLS connect, SNI and ALPN are implemented; public real-server smoke passed on `conversations.im`. |
| Feature discovery | XEP-0030 | Required | Required | Done | Continue using discovery before optional features. |
| Feature broadcasts | XEP-0115 | Required | Required | Done | Advertise stable capability sets per client profile. |
| Server extensibility | XEP-0114 | N/A | N/A | N/A | Only relevant when shipping server components. |
| Event publishing | XEP-0163 | Not required | Required | Done | Generic PEP/PubSub discovery, publish, retrieve, retract, delete, notification parsing and stream-client helpers are implemented; keep public-server PEP smoke in release validation. |

Core Client technical coverage is close. The public product claim should still
wait for a tagged release, user-facing setup guide and repeatable real-server
smoke result.

## Web Compliance Suite

Web compliance builds on Core.

| XEP-0479 feature | Provider | Client level | Advanced client level | Teletyptel status | Next action |
| --- | --- | --- | --- | --- | --- |
| Web connection mechanisms | RFC 7395 or XEP-0206/XEP-0124 | Required | Required | Done for RFC 7395 path; BOSH fallback client implemented and real-server BOSH smoke passed | Ship a production WSS endpoint for the browser client; BOSH has public-server evidence. |
| Connection mechanism discovery | XEP-0156 | Required | Required | Done | Document host-meta setup for Windows/WAMP and Linux hosting. |

The PHP relay can exercise RFC 7395, but production Web compliance needs a real
XMPP WebSocket service path, not only the local demo relay.

## IM Compliance Suite

IM compliance builds on Core.

| XEP-0479 feature | Provider | Client level | Advanced client level | Teletyptel status | Next action |
| --- | --- | --- | --- | --- | --- |
| Core IM and presence | RFC 6121 | Required | Required | Done | Keep two-account real-server chat smoke in release checklist. |
| The `/me` command | XEP-0245 | Required | Required | Done | Keep body-compatible display behavior. |
| User avatars | XEP-0084 | Not required | Required | Done | Wire helpers, metadata notifications, stream-client methods, browser avatar UI/cache and vCard compatibility are implemented; keep public-server PEP smoke as release validation. |
| User avatar compatibility | XEP-0398 and XEP-0153 | Not required | Required | Done | Keep vCard PHOTO conversion and presence hash tests with avatar changes. |
| vcard-temp | XEP-0054 | Required | Required | Done | Connect profile UI to real vCard get/set. |
| Outbound message synchronization | XEP-0280 | Required | Required | Done | Add real multi-resource interop smoke. |
| User blocking | XEP-0191 | Not required | Required | Done | Blocklist, block/unblock, unblock-all, push parsing, local server behavior, web contact context menu, hidden blocked contacts and real-server smoke path are implemented. |
| Group chat | XEP-0045 and XEP-0249 | Required | Required | Done | Keep Prosody/ejabberd MUC smoke and direct invitation tests. |
| Advanced group chat | XEP-0048, XEP-0313, XEP-0402, XEP-0410 and XEP-0486 | Not required | Required | Done | Bookmarks, self-ping, MUC archive query, public MUC archive smoke and MUC avatar helpers/UI are implemented. |
| Persistent private data via PubSub | XEP-0223 | Not required | Required | Done | Generic PEP/PubSub private-data store/retrieve helpers, stream-client methods, publish-options and notification trust checks are implemented. |
| Private XML storage | XEP-0049 | Not required | Required | Done | Generic private XML get/set helper, parser and stream-client methods are implemented; legacy XEP-0048 bookmarks now use that layer. |
| Stream management | XEP-0198 | Not required | Required | Done | Keep reconnect/resume tests on real unstable transport. |
| Message acknowledgements | XEP-0184 | Not required | Required | Done | Wire receipts through the UI. |
| History storage/retrieval | XEP-0313 | Not required | Required | Done | Protocol query/result parsing, one-to-one MAM smoke and MUC archive smoke are implemented against a public server. |
| Chat states | XEP-0085 | Not required | Required | Done | Wire active/composing/paused through all clients. |
| Message correction | XEP-0308 | Not required | Required | Done for one-to-one and MUC protocol; web edit flow has initial support | Serializer/parser, stream-client helpers, MUC helper, web edit flow and public two-account correction smoke are implemented; keep cross-client UI interop as release validation. |
| File upload | XEP-0363 | Required | Required | Done | Protocol helpers, max-size discovery, slot parsing, HTTP PUT, OOB fallback, local UI upload and public-server slot/PUT smoke are implemented. |
| Direct file transfer | XEP-0047, XEP-0065, XEP-0234, XEP-0260 and XEP-0261 | Not required | Required | Done for protocol and two-account server smoke | XEP-0065 IQ helpers, local SOCKS5 streamhost handshake/data smoke, public hosted S5B proxy discovery/activation byte-transfer smoke, XEP-0234 metadata, XEP-0260 S5B candidates and XEP-0047/XEP-0261 IBB fallback transfer smoke are implemented; keep installed-client interop as release validation. |

For a practical public client, the base IM Client target is more important than
Advanced IM. XEP-0363 has public-server evidence. XEP-0191 is implemented, but
server-blocking smoke remains release validation because deployment policy and
module support vary per provider.

## Mobile Compliance Suite

Mobile compliance builds on Core.

| XEP-0479 feature | Provider | Client level | Advanced client level | Teletyptel status | Next action |
| --- | --- | --- | --- | --- | --- |
| Stream management | XEP-0198 | Required | Required | Done | Keep resume tests for unstable networks. |
| Client state indication | XEP-0352 | Required | Required | Done at core and web lifecycle level | Add Android/iOS WebView lifecycle smoke tests. |
| Third-party push notifications | XEP-0357 | Not required | Required | Partial | Helper exists; add real mobile provider integration later. |

Mobile Client still needs Android/iOS WebView packaging and device lifecycle
smoke tests before it can be claimed.

## A/V Calling Compliance Suite

The A/V suite is separate from normal chat and builds on the Jingle stack.

| XEP-0479 feature | Provider | Client level | Advanced client level | Teletyptel status | Next action |
| --- | --- | --- | --- | --- | --- |
| Call setup | XEP-0167 and XEP-0353 | Required | Required | Done for protocol helpers | Run installed-client call setup smoke before a release claim. |
| Transport | XEP-0176 | Required | Required | Done | Keep ICE candidate interop tests. |
| Encryption | XEP-0320 | Required | Required | Done | Keep DTLS-SRTP fingerprint tests. |
| STUN/TURN server discovery | XEP-0215 | Required | Required | Core and public STUN smoke path done | Run the RealServerSmoke `--external-services` command against the production TURN relay before production calls. |
| Quality/performance improvements | XEP-0293, XEP-0294, XEP-0338 and XEP-0339 | Not required | Required | Open | Add after basic calls are interoperable. |

The browser video demo proves the local WebRTC path, and the core now covers
XEP-0353 call setup plus XEP-0167 RTP descriptions. A hosted XEP-0215 TURN
credential run against the production relay service and an installed-client
call smoke remain before a full A/V Client compliance claim is honest.

## Specifications Of Note

XEP-0479 also calls out useful specifications that are not always direct
compliance requirements:

| Area | Provider | Teletyptel status |
| --- | --- | --- |
| File link fallback | XEP-0066 | Done as HTTP upload message fallback. |
| Public account registration | XEP-0077 | Done for helper and real-server smoke path. |
| User avatars | XEP-0084 | Done: protocol helper layer, browser UI/cache, local server storage and vCard compatibility are implemented; public-server PEP smoke remains release validation. |
| MUC avatars | XEP-0486 | Done for PHP/C# room avatar helpers, hash verification and web group avatar UI. |
| Service contact addresses | XEP-0157 | Done for server-info data form parsing/creation. |
| Delayed delivery | XEP-0203 | Done for PHP metadata helper/parser and incoming stanza exposure. |
| Message processing hints | XEP-0334 | Done for PHP helper/parser and incoming stanza exposure. |
| Stable and unique stanza IDs | XEP-0359 | Done for PHP origin-id/stanza-id helper/parser and incoming stanza exposure. |
| Stateless inline media sharing | XEP-0385 | Done for core serializer/parser, discovery, SHA-256 helper, incoming stanza detection and HTTP-upload message helper; web upload hash integration remains UI wiring. |
| Consistent user colors | XEP-0392 | Done in core and web avatar fallback using stable SHA-1/HSLuv-based colors. |
| Plaintext message styling | XEP-0393 | Done for core unstyled marker plus conservative web renderer for strong, emphasis, strike and code. |
| Message retraction | XEP-0424 | Done for core serializer/parser, incoming stanza detection and web retraction display; public-server interop remains release validation. |
| Message moderation | XEP-0425 | Done for MUC moderation IQ helper, moderated retraction parser and web display; public MUC moderation smoke remains release validation. |
| Public channel search | XEP-0433 | Done for protocol helper, search-form request, search request, RSM paging and result parser; XEP-0433 is Deferred, so live search-service interop remains release validation. |
| Custom emoji | XEP-0514 | Done for protocol helper, XEP-0394 markup spans, XEP-0300 hash links and SIMS/XEP-0385 media matching; XEP-0514 is Experimental, so UI and live-server interop remain release validation. |

## Release Validation Queue

1. Prepare a usable release with server setup, WAMP package notes and public
   demo instructions.
2. Run XEP-0352 visibility/background smoke tests inside Android and iOS WebView
   shells before any Mobile Client claim.
3. Ship or document a production WSS endpoint for RFC 7395 Web Client use.
4. Repeat direct file-transfer smoke with one installed XMPP client for
   cross-client S5B/IBB interop evidence.
5. Run hosted XEP-0215 TURN credential discovery against the production relay
   and repeat call setup with an installed Jingle client before any A/V Client
   claim.
6. Keep XEP-0301 RTT as a Teletyptel product feature even though it is outside
   the XEP-0479 baseline.
