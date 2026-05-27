# Real Server Setup Guide

This guide describes the manual smoke environment for testing the library
against a real XMPP server. Automated real-server tests remain unchecked until
credentials and a local server profile are available.

## Local Prosody Direction

Recommended local domain:

```text
localhost
```

Recommended accounts:

```text
edward@localhost
anna@localhost
```

Minimum modules:

```text
roster
tls
saslauth
disco
carbons
mam
smacks
websocket
muc
```

Useful optional modules:

```text
vcard
pep
cloud_notify
```

## Manual Smoke Checklist

- TLS certificate is accepted only when the configured host matches.
- Login negotiates STARTTLS, SASL and resource binding.
- Initial presence is sent.
- Roster request returns.
- Two accounts can exchange normal chat messages.
- Two accounts can discover a MUC service, join a room and exchange a
  groupchat message.
- XEP-0301 RTT message payload is sent with body fallback.
- XEP-0030 disco#info returns feature list.
- XEP-0115 capabilities presence is accepted.
- RFC 7395 WebSocket transport connects when the server exposes WebSocket.

## Automated Smoke Tool

Use the real-server smoke tool when a Prosody/Openfire profile and two accounts
are available:

`Tiedragon.XmppMessenger.RealServerSmoke` is intentionally built on top of the
same `Tiedragon.XmppMessenger.Core` library that applications use. A passing
smoke therefore validates the library behavior, not only the command-line tool.

TLS and hostname-only smoke:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host xmpp.example.org `
  --port 5222 `
  --account1 edward@example.org/desktop `
  --password1 secret `
  --bad-host wrong.example.org
```

Full TLS, hostname and two-account chat smoke:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host xmpp.example.org `
  --port 5222 `
  --account1 edward@example.org/desktop `
  --password1 secret `
  --account2 anna@example.org/desktop `
  --password2 secret `
  --bad-host wrong.example.org
```

The tool performs three checks:

- accepts the TLS certificate for the configured host;
- rejects the same endpoint when the certificate is validated with
  `--bad-host`;
- logs in with two accounts and waits for a normal chat message to arrive when
  `--account2` and `--password2` are supplied.

`--bad-host` must be a DNS name that is not present in the server certificate.
The tool still connects to `--host`; only the TLS validation target changes.
That makes the negative test deterministic: the same endpoint must pass for the
real host and fail for the wrong host.

For a local self-signed server, first install the test CA/certificate in the
current user's trust store. The smoke is meant to verify the normal .NET
certificate validation path, not bypass it.

## Hostname Validation

The TLS smoke test must prove that `SslStream` validates the certificate name
against the configured XMPP host. A certificate accepted for one host must not
silently pass for another host.

Verified public TLS smoke target:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host uuxo.net `
  --port 5222 `
  --account1 smoke@uuxo.net/teletyptel `
  --password1 dummy `
  --bad-host wrong.example.org `
  --timeout-seconds 20
```

Result on 2026-05-27:

- `PASS TLS certificate accepted for configured host.`
- `PASS Hostname mismatch rejected.`
- two-account chat skipped because no real accounts were supplied.

Verified public two-account smoke target:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host rans0m.net `
  --port 5222 `
  --account1 user-a@rans0m.net/desktop `
  --password1 secret `
  --account2 user-b@rans0m.net/desktop `
  --password2 secret `
  --bad-host wrong.example.org `
  --timeout-seconds 60
```

Result on 2026-05-27:

- `PASS TLS certificate accepted for configured host.`
- `PASS Hostname mismatch rejected.`
- `PASS Two-account chat message delivered.`

Full TLS, hostname, two-account chat and MUC smoke:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host xmpp.example.org `
  --port 5222 `
  --account1 user-a@example.org/desktop `
  --password1 secret `
  --account2 user-b@example.org/desktop `
  --password2 secret `
  --bad-host wrong.example.org `
  --muc-service conference.example.org `
  --muc-room team@conference.example.org `
  --muc-nick1 EdwardSmoke `
  --muc-nick2 AnnaSmoke `
  --timeout-seconds 60
```

The MUC smoke performs these extra checks:

- `disco#info` verifies the conference service advertises
  `http://jabber.org/protocol/muc`;
- `disco#items` reads available rooms from the service;
- `disco#items` reads room occupants/items when `--muc-room` is supplied;
- both accounts join the room with `history maxchars=0`;
- account 1 sends a `groupchat` message and account 2 must receive it.

Add `--muc-admin` only when account 1 is room owner or admin. That also requests
the owner configuration form and the admin member list. Public rooms often reject
those privileged IQs for normal occupants, which is correct server behavior.

Temporary accounts can be created on servers that allow XEP-0077 in-band
registration by adding `--register`. Public servers can rate-limit or reject
registration attempts; that is expected behavior and should not be bypassed.

## Openfire Direction

Openfire can be used as a second smoke target after Prosody:

- create two local users;
- enable TLS;
- enable WebSocket if installed/available;
- enable monitoring/archive plugins only when testing XEP-0313 behavior.

## Local Fake Server

`Tiedragon.XmppMessenger.FakeServer` is a local STARTTLS protocol harness built
from the fake-server test flow. It is not a production XMPP server and must not
be exposed to a network. Use it for fast repeatable client tests without
creating public server accounts. TLS is mandatory; the server advertises
`<starttls><required/></starttls>` before SASL.

Start it with two preloaded accounts:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.FakeServer -- `
  --listen 127.0.0.1 `
  --port 55222 `
  --domain localhost `
  --account edward:secret `
  --account anna:secret
```

Run the TLS smoke against it:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host 127.0.0.1 `
  --port 55222 `
  --account1 edward@localhost/desktop `
  --password1 secret `
  --account2 anna@localhost/desktop `
  --password2 secret `
  --timeout-seconds 20 `
  --cert-sha256 <fingerprint printed by the fake server>
```

Add `--register` to the smoke command when you want the tool to create the
temporary accounts through XEP-0077 instead of preloading them with `--account`.

Implemented fake-server behavior:

- XEP-0077 account registration IQs;
- SASL PLAIN authentication;
- resource binding;
- empty roster result;
- basic disco#info result;
- direct one-to-one chat relay to an online local session.
- MUC conference discovery, room discovery/items, join self-presence, groupchat
  room broadcast, owner configuration form and admin item query.

Local fake-server MUC smoke:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host 127.0.0.1 `
  --port 55222 `
  --account1 edward@localhost/desktop `
  --password1 secret `
  --account2 anna@localhost/desktop `
  --password2 secret `
  --bad-host wrong.example.org `
  --cert-sha256 <fingerprint printed by the fake server> `
  --muc-service conference.localhost `
  --muc-room team@conference.localhost `
  --muc-admin `
  --timeout-seconds 40
```

## Current Status

The repository has fake-server tests for stream negotiation, SASL, bind, roster,
presence, normal chat, stream management, RTT and MUC. The real-server smoke
tool can now exercise the same MUC discovery/join/groupchat path against
Prosody, ejabberd, Openfire or another standards-compliant server when test
accounts and a conference service are available. The final interoperability
checkbox remains open until that command has been run against a real Prosody or
ejabberd instance and its output has been recorded here.
