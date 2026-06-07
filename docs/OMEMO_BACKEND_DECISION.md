# OMEMO Backend Decision

TeleTypTel implements XEP-0384 as an XMPP/OMEMO adapter with an in-tree
Double Ratchet engine in the C# core. The engine follows the published
Double Ratchet design, but it is not a production encryption claim until it has
independent review, test-vector coverage and live OMEMO interoperability.

## Decision

Build and maintain a TeleTypTel Double Ratchet implementation in C#, with
TeleTypTel responsible for:

- XEP-0384 device list and bundle publication through XEP-0060/XEP-0163;
- XEP-0384 encrypted-message XML wire format;
- XEP-0420 Stanza Content Encryption envelope construction;
- local trust/fingerprint UI;
- local device storage and platform secret vaults;
- X3DH shared-secret setup;
- Double Ratchet root, sending and receiving chains;
- skipped message-key storage for out-of-order delivery;
- mapping ratchet message keys to OMEMO key transports.

PHP remains a wire/protocol layer only. It may build and parse OMEMO device
lists, bundles and encrypted message wrappers, but it must not hold long-term
user OMEMO private keys for browser clients. Browser, mobile and desktop
clients must keep the private key material at the edge device.

## Platform Choice

| Platform | Crypto route | Status |
| --- | --- | --- |
| Android | TeleTypTel ratchet engine through a native/Capacitor bridge or audited shared core binding | Planned |
| iOS | TeleTypTel ratchet engine through Swift/native bridge or audited shared core binding | Planned |
| Windows desktop/WebView2 | C# in-tree Double Ratchet engine plus platform secret vault | Implemented as experimental |
| Linux/macOS desktop | Same C# engine plus platform native secret vault provider | Experimental, vault smoke still needed |
| Pure browser/PWA | Disabled until a reviewed WebAssembly route exists | Guarded |
| PHP server | XMPP/OMEMO wire helpers only; no production E2EE private-key ownership | Chosen |

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
- `XmppOmemoProductionGuard`.
- in-tree Double Ratchet state, DH ratchet, root/chain/message KDFs, skipped
  message keys, AES-GCM message encryption and opaque state export/import.

That is the right boundary. The missing production piece is not "more XML"; it
is cryptographic assurance: XEdDSA signed pre-key verification, independent
review, external test vectors, persistent-device recovery testing and live
interop with existing OMEMO clients.

## Rules

- Do not move production Double Ratchet state into PHP or server-side storage.
- Do not store browser users' OMEMO private keys on the PHP server.
- Do not claim production OMEMO until `XmppOmemoProductionGuard` accepts the
  backend and live interop passes with existing OMEMO clients.
- Do not treat the current PHP `XmppOmemo` helper as encryption; it is XML
  protocol support.
- Keep OMEMO optional until trust UI, backup/recovery and device revocation are
  understandable for normal users.

## Integration Steps

1. Wrap `XmppOmemoDoubleRatchet` behind `IXmppOmemoSessionBackend`.
2. Map XEP-0384 bundles to the backend's identity key, signed pre-key and
   one-time pre-key types.
3. Persist opaque ratchet sessions in `XmppOmemoSessionStore`.
4. Use existing platform vault providers for local key-store passphrases.
5. Add XEdDSA signed pre-key verification before production use.
6. Add Android/iOS native bridges before enabling OMEMO in mobile WebViews.
7. Keep pure browser OMEMO unavailable until a reviewed WASM route exists.
8. Run live interop with Conversations, Gajim or Dino before any public E2EE
   claim.

## References

- XEP-0384: OMEMO Encryption, version 0.9.1.
- XEP-0420: Stanza Content Encryption.
- Signal Double Ratchet specification.
- Signal X3DH specification.
