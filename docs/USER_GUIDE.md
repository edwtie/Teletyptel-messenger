# User Guide

Teletyptel 2.0 Alpha 1 is a local evaluation build for accessible real-time
text chat. It is intended for testers and developers, not for production use.

## Opening The Client

Open:

```text
php/public/chat.html
```

Use two browser windows to test a conversation. Both windows can connect to the
same local relay.

## Connecting

1. Start `php php/rtt-websocket-server.php`.
2. Leave the relay URL as `ws://127.0.0.1:8787`.
3. Choose a display name.
4. Press **Connect**.

The status in the title bar changes when the relay is connected.

## Sending Messages

- Type in the message box.
- With **Live RTT** enabled, the other side sees your text while you type.
- Press Enter to send a final message.
- Use Shift+Enter to insert a line break.

## Modes

- **Relay**: local PHP relay mode for Alpha 1 chat testing.
- **RFC 7395**: WebSocket framing test mode for XMPP-over-WebSocket experiments.

Relay mode is the normal Alpha 1 demo path.

## Mobile Lifecycle

The browser client sends XEP-0352 active/inactive state automatically when the
page becomes visible, hidden, focused, blurred, frozen or resumed. In relay mode
this is visible as `client-state` traffic; in RFC 7395 mode it is sent as
`<active/>` or `<inactive/>` with `urn:xmpp:csi:0`.

Future Android, iOS and WebView2 shells can drive the same logic by calling
`window.TeletyptelLifecycle.setActive()` and
`window.TeletyptelLifecycle.setInactive()`.

## Light And Dark Mode

Use the theme button in the top bar. The selected mode is saved in browser
storage.

## Languages

The web client currently includes English and Dutch UI language files:

```text
php/public/lang/eng.lng
php/public/lang/ned.lng
```

These are development language files. Signed LngPdk packages are the stricter
production direction.

## Smilies

The smiley toggle converts supported legacy text codes, such as `:)` and `:D`,
to local SVG/GIF smiley assets.

## Account Profile

The account panel lets you set:

- display name
- JID
- peer/contact
- phone field
- provider id
- language
- optional password memory setting

The profile is stored through `php/public/api/account.php` when MySQL/MariaDB
is configured. The browser keeps only a temporary browser-session account
reference when that option is enabled.

## Privacy Notes

Alpha builds are for evaluation. The account API stores password hashes on the
server, but do not use production passwords on a local WAMP/development install.
Use dedicated test accounts for LocalServer, Prosody, ejabberd, Openfire or
other XMPP smoke targets.

## Current Scope

- No hosted public service yet.
- The PHP relay is a web edge for local UI, RTT, RFC 7395 and WebRTC/Jingle demo
  testing; it is not the authoritative XMPP server.
- LocalServer covers STARTTLS, SASL, bind, session, roster, presence, MUC,
  XEP-0363 slot/PUT, vCard, blocking, stream management and client-state
  smoke paths.
- OMEMO protocol/key-storage helpers exist, but production end-to-end encryption
  still needs an audited Signal Protocol backend and live interoperability
  validation.
- Group chat, file upload and calls have local/demo and smoke paths; public
  release validation still needs hosted server accounts and interoperability
  runs against existing clients.
- No packaged Android/iOS app yet.
