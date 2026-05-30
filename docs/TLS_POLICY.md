# TLS Policy

`Tiedragon.XmppMessenger` treats TLS as required for normal client-to-server
XMPP connections.

## Defaults

- `XmppConnectionSettings.RequireTls` defaults to `true`.
- If TLS is required and the server does not offer STARTTLS, negotiation fails.
- `XmppConnectionSettings.DirectTls` starts TLS immediately after TCP connect
  for XEP-0368 endpoints and skips STARTTLS.
- The client must not send credentials before the required TLS step completes.
- The production upgrader uses `SslStream.AuthenticateAsClientAsync`.

## Certificate Validation

The default .NET certificate validation path should be used for normal
connections:

- validate the certificate chain;
- validate the target hostname;
- reject expired, self-signed or mismatched certificates unless a developer test
  harness explicitly supplies a custom TLS upgrader.

For SRV-based hosting, the TCP host can differ from the XMPP domain. The TLS
target name is therefore `XmppConnectionSettings.TlsServerName`, which defaults
to the account JID domain. Direct TLS also requests ALPN `xmpp-client`.

`IXmppTlsStreamUpgrader` exists so tests can verify STARTTLS and direct TLS flow
without disabling production certificate validation.

## Minimum TLS Version

The intended policy is:

- prefer the operating system/.NET default TLS policy;
- do not force legacy TLS versions from application code;
- document any future compatibility override explicitly before adding it.

This keeps the client aligned with platform security updates instead of freezing
an old protocol version in code.

## Smoke Tests Still Needed

Real-server smoke coverage should verify:

- STARTTLS with a valid public certificate;
- direct TLS via XEP-0368 SRV discovery and ALPN `xmpp-client`;
- hostname mismatch rejection;
- expired/self-signed certificate rejection in production mode;
- successful login after TLS with SCRAM.

Until those tests exist, certificate validation is documented but not marked as
fully smoke-tested.
