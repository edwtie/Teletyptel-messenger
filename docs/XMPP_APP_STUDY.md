# XMPP App Study

This document compares existing XMPP apps with the direction of
TeleTypTel.

Sources:

- XMPP Software Comparison: https://xmpp.org/software/software-comparison/
- XMPP Getting Started client list: https://xmpp.org/getting-started
- Gajim: https://gajim.org/
- Conversations: https://conversations.im/ and Google Play listing

## Existing App Landscape

| App | Main platform | Character | Notes |
| --- | --- | --- | --- |
| Gajim | Windows, Linux, macOS | Full desktop client | Mature, feature-rich, power-user friendly. Good reference for desktop XMPP workflows. |
| Dino | Linux / GNOME | Modern desktop chat | Cleaner chat-app experience; useful UI reference for a focused messenger. |
| Conversations | Android | Strong mobile XMPP client | Important reference for modern XEP coverage, OMEMO, message carbons and mobile behavior. |
| Monal | iOS, macOS | Apple client | Important for iOS/macOS interoperability. |
| Siskin IM | iOS | Mobile client | Useful iOS reference. |
| Converse.js | Browser | Web client | Useful reference for XMPP over web/browser constraints. |
| Movim | Browser/social | Web social client | Shows XMPP can support social/network style UX, not only chat windows. |
| Swift.IM | Desktop | Cross-platform desktop | Relevant as a mature desktop XMPP client/library ecosystem. |

## What These Apps Usually Optimize For

- Normal one-to-one chat.
- Multi-user chat.
- Presence and roster.
- OMEMO encryption.
- Message carbons and archive sync.
- Mobile push or mobile-friendly reconnect behavior.
- General interoperability with common XMPP servers.

## Gap For This Project

TeleTypTel should not try to be another generic XMPP client first.
There are already mature clients for that. The stronger position is:

- a clean C#/.NET XMPP core library;
- Windows-first developer tooling;
- real-time text as a first-class feature;
- accessibility-friendly live text experiments;
- AI/chatbot test clients;
- language-package based UI text through LngPdk;
- protocol tests and local server tests from the start.

## Architecture Lesson

Existing apps show that a usable messenger eventually needs many XEPs, but the
core must stay separate:

- RFC 6120 stream/auth/bind layer
- RFC 6121 chat/presence/roster layer
- XEP extension layer
- UI/application layer

This matches the current project direction. The WinForms demo should remain a
consumer of the core library, not the place where protocol logic lives.

## Useful Reference Targets

Gajim:

- desktop account management;
- roster/contact workflow;
- plugin/extension idea;
- power-user diagnostics.

Conversations:

- mobile-ready XEP selection;
- OMEMO expectations;
- message carbons;
- archive and reconnect behavior.

Dino:

- focused modern conversation UI;
- readable chat layout;
- audio/video direction.

Converse.js:

- browser constraints;
- web socket and BOSH/XMPP-over-WebSocket thinking.

## Proposed Product Position

Name direction:

- `Tiedragon.XmppMessenger.Core`: reusable protocol library.
- `Tiedragon.XmppMessenger.WinForms`: Windows reference client.
- `Tiedragon.XmppMessenger.Rtt`: real-time text helpers and UI components.
- `Tiedragon.XmppMessenger.Ai`: optional bot/test tooling.

Primary goal:

Build a protocol-correct XMPP library and a focused Windows RTT messenger, not a
generic clone of Gajim or Conversations.

## Feature Priority

Near term:

- RFC 6120 completion: stream, TLS, SASL, bind, typed errors.
- RFC 6121 basics: chat, presence, roster.
- XEP-0085 chat state notifications.
- XEP-0184 delivery receipts.
- XEP-0198 stream management.
- XEP-0301 RTT.

Later:

- XEP-0166/Jingle only after the messaging core is stable.
- XEP-0280 message carbons.
- XEP-0313 message archive management.
- XEP-0384 OMEMO.

## Conclusion

Comparable XMPP apps exist, but this project can be different by treating
real-time text, protocol testing, C# library design and language-packaged UI as
core design goals instead of afterthoughts.
