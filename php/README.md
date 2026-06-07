# PHP WebSocket RTT/RFC7395 Relay

This is a small dependency-free PHP relay for local XEP-0301 real-time text and
RFC 7395 WebSocket experiments.

It is not the final XMPP server layer. It exists so the RTT engine and WebSocket
transport can be tested before the messenger connects to a real XMPP server.

Protocol and safety notes: [../docs/RTT_RELAY.md](../docs/RTT_RELAY.md).

## Start

Install PHP 8.1 or newer and run:

```bash
php php/rtt-websocket-server.php
```

Then open:

```text
php/public/chat.html
```

Open the page in two browser windows, connect both to:

```text
ws://127.0.0.1:8787
```

Typing in one window broadcasts RTT JSON to the other window.

## WAMP Layout

For WAMP, place the browser/PHP files under Apache and keep .NET binaries
outside the web root:

```text
C:\wamp64\www\teletyptel\        PHP project root
C:\wamp64\www\teletyptel\public\ browser files
C:\wamp64\www\teletyptel\lib\    PHP server library files
C:\wamp64\bin\teletyptel\        published .NET test tools
```

Copy these files into `C:\wamp64\www\teletyptel`:

```text
php/public
php/rtt-websocket-server.php
php/schema.sql
php/config.example.php as config.php
php/lib
```

Open:

```text
http://localhost/teletyptel/public/chat.html
```

Start the WebSocket relay separately from a terminal:

```powershell
$php = (Get-ChildItem C:\wamp64\bin\php\php*\php.exe | Sort-Object FullName -Descending | Select-Object -First 1).FullName
& $php C:\wamp64\www\teletyptel\rtt-websocket-server.php
```

Apache serves the page, but the relay is a long-running CLI process listening
on `ws://127.0.0.1:8787`.

The release zip is generated from the repository root with:

```powershell
.\scripts\package-alpha1.ps1
```

That script name is historical; it currently packages the Alpha 2 web client
and server test tools until the release recipe is renamed. It needs PowerShell
and the .NET 10 SDK on the build machine. It includes `public`, `lib`,
`schema.sql`, `config.example.php`, the relay server and the published .NET test
tools under a WAMP-style folder layout. The target machine needs WAMP or another
Apache/PHP/MySQL stack, PHP 8.1 or newer for the relay and .NET runtime 10 for
the published smoke tools.

The fuller web chat client must be opened through localhost, not directly from
`C:\...` or `file:///...`, because login uses the PHP account API:

```text
http://localhost/teletyptel/public/chat.html
```

It uses the same relay for RTT chat, includes RFC 7395 test controls and is the
preferred UI direction for later Android/iOS WebView packaging.

The Alpha web client can upload local files through:

```text
php/public/api/upload.php
```

Uploaded files are stored under:

```text
php/public/uploads
```

The chat then sends a normal relay message with attachment metadata. This is a
local Alpha upload path for UI testing. XEP-0363 production upload is exercised
through the .NET core helpers and `Tiedragon.XmppMessenger.RealServerSmoke`
using a real upload service slot and HTTP PUT.

The web client also loads its local platform configuration from:

```text
php/public/config/account-profile.json
php/public/config/providers/example-provider.json
```

`account-profile.json` fills first-run defaults such as display name, JID,
XMPP server, peer and provider id.
Provider manifests define tabs and capabilities such as `phone:sms`,
`caption:local`, `chat:none` and `profile:read`. These files are demo
configuration only; secrets and production provider credentials must stay out
of public web assets.

UI text is loaded from web `.lng` files:

```text
php/public/lang/eng.lng
php/public/lang/ned.lng
```

The language selector writes `preferredLanguage` into the account profile, so a
saved MySQL account can restore the UI language on the next load.

These loose `.lng` files are intentionally simple, but they are not signed
LngPdk packages. Treat them as a web-demo and fallback layer until LngPdk
packages are served and verified by the web/mobile clients.

Critical notes: [../docs/LOCALIZATION_CRITICAL_NOTES.md](../docs/LOCALIZATION_CRITICAL_NOTES.md).

## PHP XMPP Library

The PHP tree now also contains a first standalone XMPP wire-model library:

```text
php/lib/Xmpp
```

It mirrors the C# XMPP core where practical, starting with stream open/close,
RFC 7395 open/close, stream feature parsing, SASL PLAIN/OAUTHBEARER XML,
resource binding, SCRAM-SHA-1/SCRAM-SHA-256, JID parsing, XML escaping/parsing, message/presence/IQ
builders, XEP-0030 service discovery, roster, XEP-0301 RTT, PubSub/PEP,
XEP-0080 geolocation, XEP-0363 HTTP upload, XEP-0313 MAM, delivery receipts,
chat states, correction/retraction, MUC, blocking and Jingle session-info
helpers. This is not yet the complete TCP/TLS/WebSocket network transport or
WebSocket/BOSH transport stack; it is the PHP protocol layer that those
transports will use.

Run the smoke test with:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tests\xmpp-library-smoke.php
```

Run a real XMPP login smoke with:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-login-smoke.php --jid user@localhost --password secret --host localhost --resource php
```

Run a fuller PHP client smoke with roster/disco/message:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-client-smoke.php --jid user@localhost --password secret --host localhost --roster --disco localhost --to tester@localhost --message "Hallo vanaf PHP"
```

Run an RFC 7395 WebSocket endpoint smoke with:

```powershell
& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tools\xmpp-websocket-smoke.php --url ws://localhost:5280/xmpp-websocket --domain localhost
```

Design notes: [../docs/PHP_XMPP_LIBRARY.md](../docs/PHP_XMPP_LIBRARY.md).

## Server Account Storage

The web client stores account profiles on the PHP/MySQL server through:

```text
php/public/api/account.php
```

Create the database tables with:

```sql
SOURCE php/schema.sql;
```

Then create a local config file from the example:

```text
php/config.example.php -> php/config.php
```

`php/config.php` is ignored by Git. You can also use environment variables:

```text
TELETYPTEL_DB_HOST
TELETYPTEL_DB_PORT
TELETYPTEL_DB_NAME
TELETYPTEL_DB_USER
TELETYPTEL_DB_PASSWORD
```

The browser does not keep the account profile in `localStorage`. It keeps only a
temporary browser-session account id when the user enables "Keep account for this
browser session". The PHP API owns the account profile and stores only a password
hash, not the plaintext password. If MySQL is unavailable, the first-run account
gate remains open and the client will not enter the messenger.

The account popup stores real server settings with the profile:

```text
XMPP domain
XMPP host
XMPP port
TLS mode
Relay WebSocket
XMPP WebSocket
```

For RFC 7395 tests, connect with the `xmpp` WebSocket subprotocol. The relay
responds with the same subprotocol, accepts RFC 7395 `<open/>` and `<close/>`
frames and relays `<message/>`, `<presence/>` and `<iq/>` frames to other
clients connected in RFC 7395 mode.

## Message Shape

The relay accepts JSON messages like:

```json
{
  "type": "rtt",
  "text": "Hello",
  "xml": "<rtt xmlns=\"urn:xmpp:rtt:0\" event=\"reset\" seq=\"0\"><t p=\"0\">Hello</t></rtt>"
}
```

The `xml` field is the XEP-0301-style payload. The `text` field is included only
for the browser demo.

Normal chat messages use `type: "message"` with `messageId`, `from`, `to`, and
optional `attachment` or `location` metadata. Forwarded messages set
`forwarded: true`; the relay normalizes them with `serverAction: "forward"` and
keeps `originalFrom` so clients can show where the forwarded item came from.

Message deletion uses a server-side event:

```json
{
  "type": "message-delete",
  "from": "edward@localhost/web",
  "to": "tester@localhost",
  "targetMessageId": "msg-labc123"
}
```

The relay validates the event, adds server metadata and routes it to the target
peer when that peer is known. If the target is not known yet it falls back to the
old broadcast behavior so local demos keep working.

## Message History

When a browser session is signed in through the PHP account API, the web client
also uses `public/api/history.php` to persist completed chat messages in
MySQL/MariaDB. The history layer stores text, attachments, shared locations,
corrections and retractions in the `message_history` table. RTT draft updates are
not stored; only completed messages are saved.

The API is session-bound to the active account profile. A client can only read or
write history for the `account_id` stored in `$_SESSION['teletyptel_account_id']`.
On startup the client loads the latest messages and reconstructs local
conversations from `conversation_peer`, `conversation_name` and
`conversation_kind`.

## Current Boundaries

The browser client now expects a server-side account profile. The PHP account
API stores the profile in MySQL/MariaDB, keeps a password hash on the server and
stores only a temporary session reference in the browser. Real XMPP server
settings are part of that profile: domain, host, port, TLS mode, XMPP WebSocket
and relay WebSocket.

The PHP relay is a web edge for development and local browser demos. It is no
longer documented as the XMPP server. Server semantics are handled by
`Tiedragon.XmppMessenger.LocalServer` for local STARTTLS smoke tests or by a
real XMPP server such as Prosody, ejabberd or Openfire.

- local RTT/RFC 7395 relay for browser UI and WebRTC/Jingle-shaped tests
- binds to localhost by default
- routes JSON envelopes with `to` to known local peers and supports
  server-side message delete/forward events for the browser client
- persists completed chat messages, attachments, locations and retractions
  through `public/api/history.php` and the `message_history` table
- use Apache/Nginx/WAMP reverse proxy TLS before exposing any WebSocket endpoint
- account profile login is handled by the PHP account API and MySQL/MariaDB
- XMPP account login, roster, presence, MUC, upload slots and discovery belong
  to LocalServer or the configured real XMPP server
- WebSocket payload limit: 1048576 bytes per frame

For real server work, use the account dialog to point the client at a real XMPP
server and use the .NET smoke tools for STARTTLS, direct TLS, BOSH, file upload,
service discovery, Jingle and OMEMO protocol checks. The production path remains
XMPP/XEP-0301; the relay exists only to keep early UI and protocol experiments
fast during development.

## Validate

Before release, run:

```powershell
.\php\validate-rtt-relay.ps1
.\php\smoke-rfc7395-relay.ps1
```

This checks the PHP syntax and verifies RFC 7395 `xmpp` subprotocol negotiation
with an `<open/>` response.
