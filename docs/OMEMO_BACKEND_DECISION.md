# OMEMO Backend Decision

TeleTypTel implements XEP-0384 as an XMPP/OMEMO adapter around a Signal
Protocol engine. The project must not write its own production Double Ratchet.

## Decision

Use Signal's maintained `libsignal` family as the production crypto direction,
with TeleTypTel responsible for:

- XEP-0384 device list and bundle publication through XEP-0060/XEP-0163;
- XEP-0384 encrypted-message XML wire format;
- XEP-0420 Stanza Content Encryption envelope construction;
- local trust/fingerprint UI;
- local device storage and platform secret vaults;
- mapping the crypto backend results to XMPP messages.

PHP remains a wire/protocol layer only. It may build and parse OMEMO device
lists, bundles and encrypted message wrappers, but it must not hold long-term
user OMEMO private keys for browser clients. Browser, mobile and desktop
clients must keep the private key material at the edge device.

## Platform Choice

| Platform | Crypto route | Status |
| --- | --- | --- |
| Android | Signal `libsignal-android` plus `libsignal-client` through a native/Capacitor bridge | Chosen |
| iOS | Signal `libsignal-client` through Swift/native bridge | Chosen |
| Windows desktop/WebView2 | `libsignal-client` native library behind the C# `IXmppOmemoSessionBackend` adapter | Chosen |
| Linux/macOS desktop | Same backend adapter with platform native library and secret vault provider | Chosen |
| Pure browser/PWA | Disabled until a reviewed WebAssembly binding for the same backend is available | Guarded |
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

That is the right boundary. The missing production piece is the audited Signal
Protocol session backend that performs signed pre-key verification, X3DH
session setup, Double Ratchet send/receive and persistent ratchet state.

## Rules

- Do not implement a custom production Double Ratchet in PHP or JavaScript.
- Do not store browser users' OMEMO private keys on the PHP server.
- Do not claim production OMEMO until `XmppOmemoProductionGuard` accepts the
  backend and live interop passes with existing OMEMO clients.
- Do not treat the current PHP `XmppOmemo` helper as encryption; it is XML
  protocol support.
- Keep OMEMO optional until trust UI, backup/recovery and device revocation are
  understandable for normal users.

## Integration Steps

1. Build `XmppOmemoLibsignalBackend` for C# behind
   `IXmppOmemoSessionBackend`.
2. Map XEP-0384 bundles to the backend's identity key, signed pre-key and
   one-time pre-key types.
3. Persist opaque ratchet sessions in `XmppOmemoSessionStore`.
4. Use existing platform vault providers for local key-store passphrases.
5. Add Android/iOS native bridges before enabling OMEMO in mobile WebViews.
6. Keep pure browser OMEMO unavailable until a reviewed WASM route exists.
7. Run live interop with Conversations, Gajim or Dino before any public E2EE
   claim.

## References

- XEP-0384: OMEMO Encryption, version 0.9.1.
- XEP-0420: Stanza Content Encryption.
- Signal `libsignal` repository and published library packages.
