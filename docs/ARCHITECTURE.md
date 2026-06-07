# TeleTypTel Architecture

The project should grow as a protocol library first and an app second.

## Layer Model

| Layer | Purpose | Current location | Rule |
| --- | --- | --- | --- |
| Core protocol | RFC 6120 stream, TLS, SASL, bind, stanzas | `src/Tiedragon.XmppMessenger.Core` | No WinForms, no UI text, no app-specific state. |
| IM layer | RFC 6121 chat, presence, roster | `src/Tiedragon.XmppMessenger.Core/Xmpp` for now | Can move to a separate package when larger. |
| Extension layer | XEP helpers such as RTT, receipts, chat states | `src/Tiedragon.XmppMessenger.Core/Rtt` and XMPP helpers | Keep each XEP isolated and testable. |
| PHP XMPP layer | Standalone PHP protocol helpers and Linux/web runtime path | `php/lib/Xmpp` | Must not require .NET, C# assemblies or LocalServer at runtime. |
| Localization | LngPdk package reading/building | `src/Tiedragon.LngPdk` | Independent from XMPP protocol. |
| Web localization fallback | Loose `.lng` files for the web demo | `php/public/lang` | Development/fallback only; not a verified package boundary. |
| Accessibility agent | Speech, captions, translation, voice relay and later sign-language experiments | Future accessibility/agent packages | Must stay outside RFC 6120 core. |
| Samples | WinForms demo, console clients, browser relay | `samples`, `php` | May use core, never define protocol behavior. |
| Tools | Package/build helper tools | `tools` | No runtime dependency from core to tools. |

## Desired Package Shape

Near term:

- `Tiedragon.XmppMessenger.Core`
  - RFC 6120
  - RFC 6121 basics
  - XEP-0301 model support
- `Tiedragon.LngPdk`
  - package loading/compiling
- samples and tools remain outside library API.

Later split candidates:

- `Tiedragon.XmppMessenger.Extensions.Rtt`
- `Tiedragon.XmppMessenger.Extensions.Receipts`
- `Tiedragon.XmppMessenger.Extensions.StreamManagement`
- `Tiedragon.XmppMessenger.WinForms`
- `Tiedragon.XmppMessenger.Accessibility`
- `Tiedragon.XmppMessenger.Agent`
- `Tiedragon.XmppMessenger.Speech`
- `Tiedragon.XmppMessenger.SignLanguage`

Do not split early unless the public API becomes hard to navigate.

## Core Namespace Direction

Current:

- `Tiedragon.XmppMessenger.Core.Xmpp`
- `Tiedragon.XmppMessenger.Core.Rtt`
- `Tiedragon.XmppMessenger.Core.Messaging`

Target:

- `Core.Xmpp.Streams`
- `Core.Xmpp.Sasl`
- `Core.Xmpp.Stanzas`
- `Core.Xmpp.Roster`
- `Core.Xep.Rtt`
- `Core.Xep.Receipts`
- `Core.Xep.ChatStates`

This can be introduced gradually. Avoid namespace churn until the protocol
surface stabilizes.

## Public API Principles

- Public APIs should use typed protocol objects, not raw XML strings.
- Raw XML hooks are allowed for diagnostics.
- Protocol failures should use typed exceptions and error categories.
- Async APIs must accept `CancellationToken`.
- Library code must not show message boxes or write directly to WinForms UI.
- Tests should cover both pure model behavior and local server network behavior.

## Localization Boundary

Loose `.lng` files are useful for the web demo, but they are not equivalent to
signed LngPdk packages. They have no manifest, signature, version channel or
asset relationship model.

Production language resources should move toward LngPdk packages. Until then,
the web client must treat `php/public/lang/*.lng` as development/fallback input
only.

Critical notes:
[LOCALIZATION_CRITICAL_NOTES.md](LOCALIZATION_CRITICAL_NOTES.md).

## XMPP Core Ownership

Teletyptel 2.0 uses open XMPP standards, but the project owns its XMPP client
core. The runtime should not depend on a third-party XMPP client library for
stream negotiation, TLS, SASL, stanza parsing or XEP-0301 behavior.

There are two owned XMPP libraries:

- the C# library in `src/Tiedragon.XmppMessenger.Core`, used by desktop apps,
  LocalServer, RealServerSmoke, test tools and the strict reference test suite;
- the PHP library in `php/lib/Xmpp`, used by Apache/WAMP/Linux hosting,
  server-side account/API flows and PHP-only smoke tools.

The PHP library does not require .NET 10. A PHP-hosted TeleTypTel web deployment
can run with PHP, the required PHP extensions and a real XMPP server. .NET 10 is
only required on machines that run the C# tools, LocalServer, desktop samples or
the .NET test suite.

Allowed dependencies:

- platform networking and TLS APIs such as `TcpClient`, `SslStream` and
  browser `WebSocket`;
- XML, JSON, cryptography and compression primitives from the runtime;
- UI, packaging, testing and diagnostics libraries that do not define protocol
  behavior.

Not allowed as core dependencies:

- full XMPP client libraries that hide RFC 6120 stream behavior;
- RTT or accessibility logic that can only run through one vendor SDK;
- provider SDKs inside the core protocol package.

This rule exists because real-time text, accessibility, provider adapters and
security validation are product-defining behavior. The implementation must stay
auditable, testable and portable across web, Android, iOS and server tools.

## Current Core Flow

The current RFC 6120 flow is:

1. `XmppStreamClient.ConnectAndPlanAsync`
2. open stream
3. read stream features
4. choose STARTTLS when required/offered
5. `BeginStartTlsAsync`
6. TLS upgrade
7. stream restart
8. `AuthenticateBestAsync`
9. SASL PLAIN/SCRAM
10. stream restart
11. `ReadFeaturesAsync`
12. `BindAfterAuthenticationAsync`
13. `BoundJid` set
14. send/receive stanzas

For application code, `XmppStreamClient.LoginAsync` wraps this sequence and
returns `XmppLoginResult`.

## Extension Strategy

Each XEP should have:

- model object
- serializer/parser
- tests with spec examples where possible
- optional client helper
- no UI assumptions

For example XEP-0301:

- `RttPacket`
- `RttMessageState`
- `RttComposer`
- `XmppRealTimeTextMessage`
- later: per-conversation RTT state manager

## Testing Strategy

Pure tests:

- XML serialization/parsing
- SCRAM vectors
- RTT edit application
- JID parsing

Local server tests:

- stream open/features
- STARTTLS proceed/failure
- SASL challenge/response
- stream restart after TLS/SASL
- bind
- message/presence/IQ dispatch

Real-server smoke tests:

- local Prosody/Openfire
- TLS
- SCRAM
- bind
- roster
- one-to-one message
- presence
- RTT message payload

## Product Direction

The first usable app should be a reference client, not the architecture owner.
It should prove:

- login works
- normal chat works
- live RTT works
- logs explain protocol state
- language packages work

The primary product UI direction is web-based. `php/public/chat.html` is the
first full client shell because the same surface can later be packaged for
Android and iOS through WebView/PWA-style hosting. WinForms remains useful for
desktop diagnostics, but it should not become the only product UI.

The core library must remain reusable for other clients, tools and bots.

Provider and tab direction:

- account identity starts with XMPP/JID;
- phone numbers, SMS, SIP/voice, captions and relay are adapters;
- provider tabs are manifest-driven and sandboxed;
- chat content is not shared with provider tabs by default;
- provider SDKs belong outside the XMPP core.

Accessibility direction:

- captions and RTT are product priorities;
- speech/video/agent modules must not pollute the protocol core;
- every accessibility input should first become typed events, so keyboard,
  microphone, external caption devices and later video can share one pipeline;
- speech-to-text can feed local captions, optional XEP-0301 RTT and final chat
  messages;
- sign-language work belongs to a research track until validated with users.

Detailed direction:
[ACCESSIBILITY_AGENT_VISION.md](ACCESSIBILITY_AGENT_VISION.md).

Provider/tab direction:
[ACCOUNT_PROVIDER_TAB_MODEL.md](ACCOUNT_PROVIDER_TAB_MODEL.md).
