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

## Chat

| XEP | Purpose |
| --- | --- |
| XEP-0030 | Service discovery. |
| XEP-0115 | Entity capabilities in presence broadcasts. |
| XEP-0045 | Multi-user chat. |
| XEP-0085 | Chat state notifications such as typing. |
| XEP-0184 | Message delivery receipts. |
| XEP-0198 | Stream management and reconnect support. |
| XEP-0280 | Message carbons for multi-device sync. |
| XEP-0313 | Message archive management. |
| XEP-0352 | Client state indication. |
| XEP-0363 | HTTP file upload. |

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

## XEP-0357 Push Notifications

`XmppPushNotifications` creates the XMPP enable/disable IQ payloads for push
services, including optional publish-options data forms. Mobile platform
registration and real provider integration remain app-layer work.

## Real-Time Text

| XEP | Purpose |
| --- | --- |
| XEP-0301 | In-band real-time text. |

Real-time text is different from typing notifications. XEP-0085 says that someone is typing. XEP-0301 sends live text edits while the message is being written.

Initial implementation status:

- `RttPacket` parses and serializes `<rtt/>` packets.
- `RttMessageState` applies insert/erase actions to the visible live text buffer.
- `seq` is treated as synchronization protection; out-of-order edits are ignored until a new/reset packet arrives.
- Unicode positions are handled as code points, matching the XEP wording.
- `RttJsonEnvelope` wraps RTT XML for local WebSocket demos without replacing the XMPP payload.

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

## Audio And Video

| XEP | Purpose |
| --- | --- |
| XEP-0166 | Jingle session signaling. |
| XEP-0167 | Jingle RTP sessions for audio/video. |
| XEP-0176 | Jingle ICE-UDP transport. |
| XEP-0177 | Jingle raw UDP transport. |
| XEP-0343 | WebRTC data channels in Jingle. |

XMPP/Jingle handles signaling. WebRTC handles audio/video media transport.
