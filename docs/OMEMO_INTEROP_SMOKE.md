# OMEMO Interop Smoke

This document records the current XEP-0384 work.

## Current Automated Smoke

The automated test suite now covers these OMEMO wire-shape and crypto boundary
checks:

- test: `XmppOmemoSerializesEncryptedMessageAndParsesDevices`
- test: `XmppOmemoParsesBundleAndCurrentWireMessage`
- test: `XmppOmemoEncryptsAndDecryptsPayload`
- test: `XmppOmemoTrustStoreTracksFingerprints`
- test: `XmppOmemoSessionStoreKeepsOpaqueRatchetState`
- test: `XmppOmemoLocalDevicePublishesBundleAndConsumesPreKeys`
- test: `XmppOmemoEncryptedLocalDeviceFileProtectsPrivateKeys`
- test: `XmppOmemoWindowsSecretVaultProtectsKeyStorePassphrase`
- test: `XmppOmemoLinuxSecretServiceVaultKeepsSecretsOutOfArguments`
- test: `XmppOmemoSecretVaultFactorySelectsNativeProvider`
- test: `XmppOmemoRequiresProductionSignalProtocolBackend`
- test: `XmppOmemoX3DhValidatesKeysAndDerivesSecret`
- test: `XmppOmemoX3DhAgreementMatchesInitiatorAndResponder`
- test: `XmppOmemoX3DhGatesSignedPreKeyVerification`
- test: `XmppOmemoDoubleRatchetEncryptsBidirectionalMessages`
- test: `XmppOmemoDoubleRatchetHandlesSkippedMessageKeys`
- test: `XmppOmemoDoubleRatchetExportsOpaqueSessionState`
- command: `dotnet run --project tests/Tiedragon.XmppMessenger.Tests/Tiedragon.XmppMessenger.Tests.csproj`
- command: `& 'C:\wamp64\bin\php\php8.4.15\php.exe' php\tests\xmpp-library-smoke.php`

Covered behavior:

- current `urn:xmpp:omemo:2` namespace
- device list request and parser
- bundle request on node `urn:xmpp:omemo:2:bundles` with item id equal to the
  device id
- bundle publish and parser for signed pre-key, identity key and one-time
  pre-keys
- current encrypted message shape with `<keys jid="...">` groups
- backward-compatible parsing of older direct `<key>` elements under `<header>`
- payload encryption/decryption helper for the message payload secret boundary
- fingerprint and trust-state model for UI/account storage
- opaque Double Ratchet session store contract for persistent ratchet state
- local device key-material model for device-list publication, bundle
  publication, one-time pre-key consumption and replenishment
- encrypted local device file using PBKDF2-SHA256 and AES-GCM, so private key
  material is not written as plain text
- secret-vault contract and Windows DPAPI current-user provider for key-store
  passphrases
- Linux Secret Service provider via `secret-tool`, with the passphrase passed
  through standard input instead of command-line arguments
- macOS Keychain provider for generic password storage
- explicit OMEMO session backend boundary and production guard
- X3DH bundle validation, associated data, DH1-DH4 planning and HKDF boundary
- X25519 X3DH initiator/responder agreement where Alice and Bob derive the same
  shared secret with and without DH4
- signed pre-key verification gate, so initiator setup can require an audited
  verifier before accepting a remote bundle
- in-tree Double Ratchet root key, sending chain, receiving chain, DH ratchet,
  skipped message-key storage, AES-GCM message encryption and opaque session
  state export/import
- Double Ratchet message envelope mapping to and from OMEMO key transports
- standalone PHP Double Ratchet helper smoke for Linux/web runtime experiments,
  without C# or .NET dependency

## Security Boundary

The project does not pretend to have production OMEMO until the in-tree
Double Ratchet engine has independent review, external test-vector coverage and
live interoperability evidence. The current work covers the XMPP wire model,
payload envelope helper, trust metadata model, local device key-material model,
encrypted local device file, native passphrase vault providers, opaque session
store contract, signed pre-key verification contract, backend interface and
experimental Double Ratchet engine. `XmppOmemoProductionGuard` rejects OMEMO
production mode unless a backend explicitly reports X3DH, Double Ratchet,
persistent session storage, signed pre-key verification and one-time pre-key
consumption.

The X3DH helper now performs X25519 agreement for DH1-DH4 using Bouncy Castle
cryptographic primitives. Initiator setup can now require signed pre-key
verification, but the built-in verifier is only a guard. Real XEdDSA signed
pre-key verification and broader Double Ratchet review are still required
before production OMEMO can be enabled.

## Backend Decision

The production backend direction is now recorded in
`docs/OMEMO_BACKEND_DECISION.md`: TeleTypTel keeps separate experimental C# and
standalone PHP Double Ratchet paths. The PHP path is for Linux/web runtime
experiments and must not depend on C# or .NET. The PHP server still must not own
browser users' long-term OMEMO private keys.

Still required for production end-to-end encryption:

- signed pre-key verification
- independent Double Ratchet review and test vectors
- audit follow-up from `docs/OMEMO_DOUBLE_RATCHET_AUDIT.md`
- backend adapter that maps the in-tree ratchet state to OMEMO key transports
- one-time pre-key consumption and replenishment policy
- persistent secure storage for identity keys, sessions and trust decisions
- live Linux Secret Service and macOS Keychain passphrase vault smoke
- live interoperability test with at least Conversations, Gajim or Dino

## Manual Live Smoke Route

Use this when the reviewed OMEMO session backend is connected to the UI.

Requirements:

- real XMPP server with PEP/PubSub support
- two accounts
- one Teletyptel client
- one existing OMEMO client such as Conversations, Gajim, Dino, Monal or
  Profanity

Pass criteria:

- both clients publish and fetch device lists
- both clients fetch bundles from `urn:xmpp:omemo:2:bundles`
- fingerprints are shown before trust is granted
- first encrypted message uses a pre-key transport
- later encrypted messages reuse the established Double Ratchet session
- message carbons do not expose plaintext
- receiving client can decrypt after restart from persisted session state
- distrusted devices are not used for new outgoing messages
