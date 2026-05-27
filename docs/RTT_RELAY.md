# PHP RTT And RFC 7395 Relay

The PHP relay is a local development bridge for XEP-0301 real-time text and RFC
7395 WebSocket experiments. It exists so browser, WinForms and console clients
can test live text behavior before they connect to a real XMPP server.

This relay is not a full XMPP server. It has no accounts, roster, presence
store, SASL, STARTTLS or federation. It does support two local WebSocket modes:

- JSON RTT demo mode for simple browser testing.
- RFC 7395 test mode with the `xmpp` WebSocket subprotocol.

## Role

Use the relay for:

- local RTT UI testing
- two-window browser tests
- WinForms-to-browser live text tests
- AI bot console experiments
- quick debugging of RTT deltas and message snapshots
- RFC 7395 frame/open/close experiments

Do not use the relay for:

- production messaging
- account login
- roster, presence or archive behavior
- TLS or certificate testing
- federation or server-to-server XMPP

## JSON RTT Mode

When the client does not request a WebSocket subprotocol, the relay accepts
WebSocket text frames containing JSON. There are two message types.

RTT update:

```json
{
  "type": "rtt",
  "text": "Hello",
  "xml": "<rtt xmlns=\"urn:xmpp:rtt:0\" event=\"reset\" seq=\"0\"><t p=\"0\">Hello</t></rtt>"
}
```

Message snapshot:

```json
{
  "type": "message",
  "text": "Hello",
  "xml": ""
}
```

The `xml` value is the protocol payload that maps to XEP-0301. The `text`
value is a demo snapshot so clients can show a readable state even when they
join after the first RTT reset.

## RFC 7395 Mode

When the client requests:

```text
Sec-WebSocket-Protocol: xmpp
```

the relay responds with:

```text
Sec-WebSocket-Protocol: xmpp
```

and accepts RFC 7395-style WebSocket text messages:

```xml
<open xmlns="urn:ietf:params:xml:ns:xmpp-framing" to="localhost" version="1.0"/>
```

The relay answers with a server-side `<open/>` frame and accepts `<message/>`,
`<presence/>`, `<iq/>` and `<close/>` XML frames. Normal XML frames are relayed
only to other clients connected in `xmpp` mode.

This mode is for transport testing. It proves the WebSocket framing,
subprotocol negotiation and XML frame path. It does not provide XMPP
authentication or server semantics.

## Safety Boundary

The relay is intentionally dependency-free and local-only.

- It binds to `127.0.0.1:8787`.
- It has no authentication.
- It has no TLS.
- It accepts text WebSocket frames only.
- In JSON mode it rejects non-JSON payloads.
- In JSON mode it accepts only `rtt` and `message` envelope types.
- In RFC 7395 mode it accepts `<open/>`, `<close/>`, `<message/>`,
  `<presence/>` and `<iq/>` frames.
- It limits payloads to 65535 bytes.

Do not expose this relay to the internet. The production path is a real XMPP
server with TLS, authentication and XEP-0301 message payloads over normal XMPP
or RFC 7395.

## Validation

Run syntax validation before release:

```powershell
.\php\validate-rtt-relay.ps1
.\php\smoke-rfc7395-relay.ps1
```

The scripts use `php` from `PATH` when available, otherwise they try WAMP's
`C:\wamp64\bin\php`. The RFC 7395 smoke test starts the relay, connects with
the `xmpp` subprotocol and verifies the server `<open/>` response.

Run the relay locally:

```powershell
php .\php\rtt-websocket-server.php
```

For isolated smoke tests or parallel local runs, override the port:

```powershell
$env:RTT_RELAY_PORT = '18787'
php .\php\rtt-websocket-server.php
```

Then open `php/public/index.html` in two browser windows and connect both to:

```text
ws://127.0.0.1:8787
```
