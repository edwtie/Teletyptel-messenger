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
- XEP-0301 RTT message payload is sent with body fallback.
- XEP-0030 disco#info returns feature list.
- XEP-0115 capabilities presence is accepted.
- RFC 7395 WebSocket transport connects when the server exposes WebSocket.

## Automated Smoke Tool

Use the real-server smoke tool when a Prosody/Openfire profile and two accounts
are available:

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

Temporary accounts can be created on servers that allow XEP-0077 in-band
registration by adding `--register`. Public servers can rate-limit or reject
registration attempts; that is expected behavior and should not be bypassed.

## Openfire Direction

Openfire can be used as a second smoke target after Prosody:

- create two local users;
- enable TLS;
- enable WebSocket if installed/available;
- enable monitoring/archive plugins only when testing XEP-0313 behavior.

## Current Status

The repository has fake-server tests for stream negotiation, SASL, bind, roster,
presence, normal chat, stream management and RTT. The remaining real-server
items now have an automated smoke tool, but still need an installed server
profile and credentials before they can be checked as complete.
