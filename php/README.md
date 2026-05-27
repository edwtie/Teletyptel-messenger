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
php/public/index.html
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

The fuller web chat client lives at:

```text
php/public/chat.html
```

It uses the same relay for RTT chat, includes RFC 7395 test controls and is the
preferred UI direction for later Android/iOS WebView packaging.

The web client also loads its local platform configuration from:

```text
php/public/config/account-profile.json
php/public/config/providers/example-provider.json
```

`account-profile.json` fills the local display name, JID, peer and provider id.
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

## MySQL Account Storage

The web client can save the local account profile to MySQL through:

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

The browser still keeps a local fallback profile. If MySQL is unavailable, the
client continues to work locally and logs the database error in the debug panel.
Passwords are only stored when the user enables "Remember password locally".

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

## Limits

- local demo relay only
- no TLS
- no authentication
- no full XMPP server semantics
- text frames only
- payload limit: 65535 bytes

The production path remains XMPP/XEP-0301. This relay is a practical bridge for
early UI and protocol experiments.

## Validate

Before release, run:

```powershell
.\php\validate-rtt-relay.ps1
.\php\smoke-rfc7395-relay.ps1
```

This checks the PHP syntax and verifies RFC 7395 `xmpp` subprotocol negotiation
with an `<open/>` response.
