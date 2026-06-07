# OMEMO Double Ratchet Internal Audit

This is an internal engineering audit note, not an independent cryptographic
audit. It records what has been checked for the experimental TeleTypTel OMEMO
Double Ratchet work and what still blocks a production E2EE claim.

## Scope

Audited in this note:

- C# experimental Double Ratchet engine in
  `src/Tiedragon.XmppMessenger.Core/Xmpp/XmppOmemoDoubleRatchet.cs`.
- PHP experimental standalone Double Ratchet helper in
  `php/lib/Xmpp/XmppOmemoDoubleRatchet.php`.
- OMEMO key-transport envelope mapping for ratchet messages.
- Automated tests for first message, bidirectional replies, out-of-order
  skipped message keys and opaque state export/import.

Out of scope:

- Independent external crypto review.
- External OMEMO test vectors.
- Live interoperability with Conversations, Gajim, Dino, Monal or Profanity.
- Production trust UX, device recovery and backup UX.
- XEdDSA signed pre-key verification.

## Runtime Boundary

PHP is standalone. The PHP implementation does not call C#, does not load .NET
assemblies and does not require `dotnet` on Linux. Required PHP extensions:

- `sodium` for X25519 scalar multiplication and keypair generation;
- `openssl` with `aes-256-gcm` support for message encryption.

The C# implementation remains useful for Windows desktop, tooling and separate
protocol tests. It is not a runtime dependency of the PHP web/Linux path.

## Positive Checks

- X25519 is used for DH ratchet agreement.
- HKDF/HMAC-SHA256 separates root-key steps from message-key material.
- Sending and receiving chain keys advance after every message.
- Message keys are one-time values derived from chain keys.
- AES-256-GCM authenticates ciphertext and tag.
- The ratchet header is included in authenticated associated data.
- Out-of-order message support stores skipped message keys with a bounded
  `maxSkip` limit.
- Key transport envelopes include version, ratchet public key, previous sending
  chain length, message number and ciphertext.
- State export/import is opaque JSON intended for encrypted local storage.
- PHP throws if required crypto extensions are missing.
- PHP tests run without C# or .NET.

## Risks And Required Fixes Before Production

- No independent cryptographic audit has happened.
- No external Double Ratchet or OMEMO test-vector suite is wired in yet.
- XEdDSA signed pre-key verification is still not production-complete.
- Browser/PHP server deployment must not store users' long-term OMEMO private
  keys on the server.
- Session persistence must be encrypted at rest before real users rely on it.
- Key backup, device removal, trust reset and account recovery flows are not
  production UX yet.
- Live OMEMO interop with at least one established client is still required.

## Current Verdict

The implementation is suitable for alpha/beta engineering tests and protocol
experiments. It is not yet suitable for a public production claim such as
"audited OMEMO end-to-end encryption".

The strict release rule remains:

1. PHP Linux path may run without C#.
2. OMEMO may stay experimental.
3. Production E2EE waits for independent review, test vectors, signed pre-key
   verification and live interop evidence.
