# Tiedragon XMPP Messenger

Tiedragon XMPP Messenger is a planned chat application based on open XMPP standards.

The repository now starts with a small buildable C# core for XEP-0301 real-time text.
This keeps the first implementation independent from any specific XMPP server,
desktop UI or mobile framework.

The XMPP client core is built in this repository rather than delegated to a
third-party XMPP library. Teletyptel 2.0 should own its RFC 6120 stream flow,
TLS/SASL negotiation, stanza models and XEP-0301 real-time text behavior while
still using normal platform primitives such as TLS, XML and WebSocket APIs.

## Architecture

![Tiedragon Teletyptel 2.0 architecture](docs/TELETYPTEL_ARCHITECTURE.svg)

Localization note: the current web `.lng` files are a development/fallback
layer. They are not the same trust boundary as signed LngPdk packages. See
[Localization Critical Notes](docs/LOCALIZATION_CRITICAL_NOTES.md).

The project goal is a modern messenger with:

- one-to-one chat
- contact list / roster
- presence status
- message history
- delivery receipts
- real-time text
- group chat
- file and image sharing
- audio calling
- video calling

## Protocol Direction

Core protocols:

- RFC 6120 - XMPP Core
- RFC 6121 - Instant Messaging and Presence
- RFC 7622 - XMPP Address Format
- RFC 7590 - TLS for XMPP

Important XMPP extensions:

- XEP-0030 - Service Discovery
- XEP-0045 - Multi-User Chat
- XEP-0085 - Chat State Notifications
- XEP-0184 - Message Delivery Receipts
- XEP-0198 - Stream Management
- XEP-0280 - Message Carbons
- XEP-0301 - In-Band Real Time Text
- XEP-0313 - Message Archive Management
- XEP-0363 - HTTP File Upload
- XEP-0384 - OMEMO Encryption
- XEP-0166 - Jingle
- XEP-0167 - Jingle RTP Sessions
- XEP-0176 - Jingle ICE-UDP Transport

Audio and video will use XMPP/Jingle for signaling and WebRTC for media transport.

## Server Direction

Candidate server stack:

- Prosody or ejabberd for XMPP
- coturn for STUN/TURN
- HTTP upload module for files
- MAM support for history
- PubSub/PEP support for OMEMO

## Release Lines

- Alpha: basic XMPP login and text chat
- Beta: tester-ready messenger with RTT, group chat and file sharing
- Release: stable messenger

Calling and video are planned after the core messenger is stable.

## Current Code

```text
src/Tiedragon.XmppMessenger.Core
tests/Tiedragon.XmppMessenger.Tests
samples/Tiedragon.XmppMessenger.WebSocketConsole
samples/Tiedragon.XmppMessenger.WinFormsDemo
samples/Tiedragon.XmppMessenger.AiBotConsole
php/rtt-websocket-server.php
php/public/index.html
```

The first implemented layer is `Tiedragon.XmppMessenger.Core.Rtt`:

- parse and serialize XEP-0301 `<rtt/>` XML
- model `new`, `reset`, `edit`, `init` and `cancel`
- apply insert, erase and wait actions to a live text buffer
- validate `seq` ordering and ignore out-of-sync edits until reset
- count positions as Unicode code points, not UTF-16 units
- wrap RTT XML or normal message snapshots in the demo JSON envelope used by
  PHP/WebSocket experiments

The first XMPP model layer is `Tiedragon.XmppMessenger.Core.Xmpp`:

- parse and normalize XMPP addresses/JIDs
- keep account, host, port and TLS requirements in connection settings
- keep stream defaults such as resource, language, timeout and keep-alive
- model feature flags such as roster, presence, stream management and RTT
- serialize first RFC 6120/6121 stanzas: chat messages, presence and roster IQ
- parse first incoming RFC 6120/6121 stanzas back into typed models

The localization layer is the independent `Tiedragon.LngPdk` library:

- load simple `.lng` key-value files
- compile and load LngPdk `.lngpdk` language packages with
  `Tiedragon.LngPdk.Tool`
- keep the XMPP core independent from package storage and UI translation logic
- use fallback keys when a translation is missing
- keep WinForms demo labels, buttons, placeholders and status text out of code

The web client also has loose `.lng` files under `php/public/lang` for fast
iteration. Those files should not be treated as verified production packages.

## Build

```bash
dotnet build Tiedragon.XmppMessenger.slnx
```

## Test

```bash
dotnet run --project tests/Tiedragon.XmppMessenger.Tests/Tiedragon.XmppMessenger.Tests.csproj
```

Expected result:

```text
All RTT tests passed.
```

## PHP WebSocket Demo

The repository also contains a small PHP WebSocket relay for browser RTT
experiments. This is not the final XMPP server layer; it is a local test bridge.

```bash
php php/rtt-websocket-server.php
```

Then open `php/public/index.html` in two browser windows and connect both to:

```text
ws://127.0.0.1:8787
```

PHP is not bundled with this repository.

## C# WebSocket Console Demo

After starting the PHP relay, run:

```bash
dotnet run --project samples/Tiedragon.XmppMessenger.WebSocketConsole/Tiedragon.XmppMessenger.WebSocketConsole.csproj
```

Optional custom WebSocket URL:

```bash
dotnet run --project samples/Tiedragon.XmppMessenger.WebSocketConsole/Tiedragon.XmppMessenger.WebSocketConsole.csproj -- ws://127.0.0.1:8787
```

Send once and exit:

```bash
dotnet run --project samples/Tiedragon.XmppMessenger.WebSocketConsole/Tiedragon.XmppMessenger.WebSocketConsole.csproj -- --send "Hello RTT"
```

This console client uses the same `RttPacket`, `RttComposer`,
`RttMessageState` and JSON envelope as the browser demo.

## WinForms RTT Demo

After starting the PHP relay, run:

```bash
dotnet run --project samples/Tiedragon.XmppMessenger.WinFormsDemo/Tiedragon.XmppMessenger.WinFormsDemo.csproj
```

Open two instances to test live RTT text between windows.

The `RTT live` checkbox controls the first compatibility mode:

- enabled: every edit is sent as RTT delta text
- disabled: no live typing is sent; the current message snapshot is sent after
  Enter

This mirrors the later XMPP direction: contacts or clients can support RTT, or
fall back to ordinary message bodies.

## AI Bot Console Demo

After starting the PHP relay and one WinForms demo, run:

```bash
dotnet run --project samples/Tiedragon.XmppMessenger.AiBotConsole/Tiedragon.XmppMessenger.AiBotConsole.csproj
```

The bot listens to live RTT text, but it does not join the conversation by
itself. It only replies to completed lines that start with `ai:` or `@ai`, for
example `ai: hallo`. Bot answers also end with Enter so the next message starts
on a new line. This first bot is local/rule-based; it proves the participant
model before connecting a real AI service.

Options:

```bash
dotnet run --project samples/Tiedragon.XmppMessenger.AiBotConsole/Tiedragon.XmppMessenger.AiBotConsole.csproj -- --quiet 1200 --typing-delay 35
```
