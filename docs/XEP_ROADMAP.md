# XEP Roadmap

This roadmap groups XMPP Extension Protocols by product value and dependency
order. RFC 6120 and RFC 6121 remain the foundation; XEPs should layer on top of
that core.

## Alpha Core Extensions

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0030 | Service Discovery | Discover server/client features. | Started |
| XEP-0198 | Stream Management | Acknowledgements, resume and reconnect. | Planned |
| XEP-0301 | In-Band Real Time Text | Live character-by-character text. | Started |
| XEP-0085 | Chat State Notifications | active, composing, paused, inactive, gone. | Planned |
| XEP-0184 | Message Delivery Receipts | Delivered receipts. | Planned |

## Sync And History

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0280 | Message Carbons | Sync messages across multiple resources/devices. | Planned |
| XEP-0313 | Message Archive Management | Retrieve server-side message archive. | Planned |
| XEP-0352 | Client State Indication | Let mobile clients tell server active/inactive state. | Later |

## Security

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0384 | OMEMO Encryption | Modern end-to-end encryption. | Later |
| XEP-0454 | OMEMO Media Sharing | Encrypted media sharing. | Later |

## Group Chat And Files

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0045 | Multi-User Chat | Group chat rooms. | Later |
| XEP-0363 | HTTP File Upload | Upload files through server-advertised HTTP slots. | Later |

## Calls And Media

| XEP | Name | Purpose | Status |
| --- | --- | --- | --- |
| XEP-0166 | Jingle | Session signaling. | Future |
| XEP-0167 | Jingle RTP Sessions | Audio/video RTP session descriptions. | Future |
| XEP-0176 | Jingle ICE-UDP Transport | ICE candidates for NAT traversal. | Future |
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

## Accessibility Dependencies

The accessibility agent depends on the same XMPP building blocks:

- XEP-0301 for live captions and character-by-character text;
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
6. XEP-0280 message carbons.
7. XEP-0313 archive.
8. OMEMO only after the message lifecycle is stable.

## Testing Rule

Every XEP implementation needs:

- serializer/parser tests;
- fake-server/client tests;
- at least one interoperability note against existing clients where practical.
