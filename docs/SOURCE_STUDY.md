# Source Study

This document lists open-source XMPP projects worth studying before implementing TeleTypTel Messenger.

The goal is not to copy code. The goal is to understand architecture, protocol flow, edge cases and user experience decisions.

## Best Source Repositories To Study

| Project | Source | Stack | Study value |
| --- | --- | --- | --- |
| Gajim | https://dev.gajim.org/gajim/gajim and mirror https://github.com/gajim/gajim | Python, GTK, nbxmpp | Best desktop reference for broad XMPP feature coverage, Windows/Linux/macOS packaging and account/session architecture. |
| python-nbxmpp | https://dev.gajim.org/gajim/python-nbxmpp | Python | XMPP protocol library used by Gajim; useful to understand stanza handling, stream management, MAM, MUC and discovery. |
| Conversations | https://codeberg.org/iNPUTmice/Conversations and GitHub mirrors | Android, Java/Kotlin | Strong reference for mobile XMPP, OMEMO, message carbons, file upload and practical Jingle/audio-video behavior. |
| Dino | https://github.com/dino/dino | Vala, GTK | Modern desktop UX, OMEMO, MUC, file upload and Jingle direction. Useful for UI/product decisions. |
| Monal | https://github.com/monal-im/Monal | Objective-C/Swift, iOS/macOS | Good Apple-platform reference for mobile behavior, push expectations, calls and account UX. |
| Converse.js | https://github.com/conversejs/converse.js | JavaScript | Browser/web XMPP, WebSocket/BOSH, plugin architecture and embeddable chat UI. |
| Movim | https://github.com/movim/movim | PHP/Web | Self-hosted web XMPP/social client, useful for deployment and server-side web integration ideas. |
| xmpp.js | https://github.com/xmppjs/xmpp.js | JavaScript | Lightweight XMPP client/library architecture. Useful if we later test WebView or TypeScript prototypes. |
| Smack | https://github.com/igniterealtime/Smack | Java | Mature XMPP library with many XEP implementations; useful for understanding protocol APIs and test patterns. |
| Strophe.js | https://github.com/strophe/strophejs | JavaScript | Classic browser XMPP library for BOSH/WebSocket. Useful for web transport ideas. |

## First Things To Inspect

### Connection And Session

- account model
- TLS/SASL login
- resource binding
- reconnect behavior
- XEP-0198 stream management
- error states shown to the user

Best references:

- Gajim
- python-nbxmpp
- Conversations
- Smack

### Chat And History

- message object model
- local message database
- delivery receipts
- message carbons
- MAM synchronization
- duplicate message prevention

Best references:

- Gajim
- Conversations
- Dino
- Converse.js

### Real-Time Text

- XEP-0301 support status
- how live edits are represented in the UI
- fallback when the other client does not support RTT
- interaction with normal message send

Best references:

- XMPP XEP-0301 specification first
- then search client sources for `urn:xmpp:rtt:0`, `rtt`, `t`, `e`, `w`, `p`, `c`

### Audio And Video

- Jingle invite/accept/reject/hangup flow
- ICE candidate exchange
- STUN/TURN configuration
- WebRTC integration boundary
- call state UI

Best references:

- Conversations
- Dino
- Monal
- XEP-0166, XEP-0167 and XEP-0176

### Security

- credential storage
- OMEMO device list handling
- trust/fingerprint UI
- encrypted file sharing

Best references:

- Conversations
- Gajim
- Dino
- Monal

## Recommended Study Order

1. Gajim and python-nbxmpp for desktop XMPP architecture.
2. Conversations for practical modern XMPP features and call behavior.
3. Dino for modern desktop UI choices.
4. Converse.js for web/XMPP-over-WebSocket patterns.
5. Monal for mobile/call edge cases.

## Early Technical Direction For Our Project

For a Windows-first .NET app, avoid copying another client's full stack. Instead:

- use a clean internal domain model for accounts, conversations, messages and calls
- put XMPP protocol handling behind an `IXmppClient` boundary
- keep RTT as a first-class message stream, not a small typing-indicator add-on
- prototype calls separately because Jingle/WebRTC is complex
- choose a mature .NET XMPP library only after checking XEP coverage and maintenance state

## Search Terms

Use these when inspecting source:

```text
urn:xmpp:rtt:0
XEP-0301
urn:xmpp:jingle:1
urn:xmpp:jingle:apps:rtp
urn:xmpp:jingle:transports:ice-udp
urn:xmpp:mam
urn:xmpp:carbons
urn:xmpp:receipts
urn:xmpp:omemo
```
