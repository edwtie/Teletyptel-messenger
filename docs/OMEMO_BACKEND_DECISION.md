# OMEMO Backend Decision

TeleTypTel implements XEP-0384 with standalone client-side OMEMO building
blocks. The repository contains an experimental Double Ratchet engine in C# for
desktop/tooling and an experimental standalone PHP helper for Linux/web runtime.
Neither path is a production encryption claim until it has independent review,
test-vector coverage and live OMEMO interoperability.

## Decision

Build and maintain TeleTypTel Double Ratchet implementations for the runtimes we
ship, with PHP able to run without C# or .NET. TeleTypTel is responsible for:

- XEP-0384 device list and bundle publication through XEP-0060/XEP-0163;
- XEP-0384 encrypted-message XML wire format;
- XEP-0420 Stanza Content Encryption envelope construction;
- local trust/fingerprint UI;
- local device storage and platform secret vaults;
- X3DH shared-secret setup;
- Double Ratchet root, sending and receiving chains;
- skipped message-key storage for out-of-order delivery;
- mapping ratchet message keys to OMEMO key transports.

PHP is no longer only an XML helper: it also has an experimental standalone
Double Ratchet helper using sodium X25519 and openssl AES-256-GCM. That does not
mean the PHP server should own user secrets. Browser, mobile and desktop clients
must keep private key material at the edge device; a PHP deployment may support
account/API flows and PHP-only protocol smokes without a C# runtime.

## Platform Choice

| Platform | Crypto route | Status |
| --- | --- | --- |
| Android | TeleTypTel ratchet engine through a native/Capacitor bridge or audited shared edge binding | Planned |
| iOS | TeleTypTel ratchet engine through Swift/native bridge or audited shared edge binding | Planned |
| Windows desktop/WebView2 | C# in-tree Double Ratchet engine plus platform secret vault | Implemented as experimental |
| Linux/macOS desktop | Same C# engine plus platform native secret vault provider | Experimental, vault smoke still needed |
| Pure browser/PWA | Disabled until a reviewed WebAssembly route exists | Guarded |
| PHP/Linux web runtime | Standalone PHP Double Ratchet helper for tests/edge runtime experiments; no C# dependency | Implemented as experimental |
| PHP server | Account/API/protocol layer; must not become the owner of browser users' long-term OMEMO private keys | Chosen |

## Why

OMEMO uses X3DH and Double Ratchet sessions for each recipient device. The XEP
also relies on open PEP nodes for device lists and bundles, and on encrypted
XEP-0420 envelopes for message contents. This is protocol glue around a real
crypto session engine, not ordinary XML work.

The repository already has:

- XEP-0384 wire helpers;
- bundle/device parsers;
- local device material model;
- payload encryption boundary helper;
- trust/fingerprint model;
- platform secret-vault abstraction;
- `IXmppOmemoSessionBackend`;
- `XmppOmemoProductionGuard`;
- in-tree Double Ratchet state, DH ratchet, root/chain/message KDFs, skipped
  message keys, AES-GCM message encryption and opaque state export/import.
- standalone PHP Double Ratchet state, X25519 DH ratchet, root/chain/message
  KDFs, skipped message keys, AES-256-GCM message encryption and opaque state
  export/import.

That is the right boundary. The missing production piece is not "more XML"; it
is cryptographic assurance: XEdDSA signed pre-key verification, independent
review, external test vectors, persistent-device recovery testing and live
interop with existing OMEMO clients.

## Rules

- Do not make the PHP webserver the production owner of browser users' Double
  Ratchet private state.
- Do not store browser users' OMEMO private keys on the PHP server.
- Do not claim production OMEMO until `XmppOmemoProductionGuard` accepts the
  backend and live interop passes with existing OMEMO clients.
- Do not treat the current PHP `XmppOmemoDoubleRatchet` helper as audited
  production encryption; it is an experimental standalone implementation.
- Keep OMEMO optional until trust UI, backup/recovery and device revocation are
  understandable for normal users.

## Integration Steps

1. Wrap `XmppOmemoDoubleRatchet` behind `IXmppOmemoSessionBackend`.
2. Map XEP-0384 bundles to the backend's identity key, signed pre-key and
   one-time pre-key types.
3. Persist opaque ratchet sessions in `XmppOmemoSessionStore`.
4. Keep PHP deployment independent from C# for Linux installs.
5. Use existing platform vault providers for local key-store passphrases.
6. Add XEdDSA signed pre-key verification before production use.
7. Add Android/iOS native bridges before enabling OMEMO in mobile WebViews.
8. Keep pure browser OMEMO unavailable until a reviewed WASM route exists.
9. Run live interop with Conversations, Gajim or Dino before any public E2EE
   claim.

## References

- XEP-0384: OMEMO Encryption, version 0.9.1.
- XEP-0420: Stanza Content Encryption.
- Signal Double Ratchet specification.
- Signal X3DH specification.
