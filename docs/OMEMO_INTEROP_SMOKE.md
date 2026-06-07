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
- command: `dotnet run --project tests/Tiedragon.XmppMessenger.Tests/Tiedragon.XmppMessenger.Tests.csproj`

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
- opaque Double Ratchet session store contract for a future audited backend
- local device key-material model for device-list publication, bundle
  publication, one-time pre-key consumption and replenishment
- encrypted local device file using PBKDF2-SHA256 and AES-GCM, so private key
  material is not written as plain text
- secret-vault contract and Windows DPAPI current-user provider for key-store
  passphrases
- Linux Secret Service provider via `secret-tool`, with the passphrase passed
  through standard input instead of command-line arguments
- macOS Keychain provider for generic password storage
- explicit Signal Protocol backend boundary and production guard
- X3DH bundle validation, associated data, DH1-DH4 planning and HKDF boundary
- X25519 X3DH initiator/responder agreement where Alice and Bob derive the same
  shared secret with and without DH4
- signed pre-key verification gate, so initiator setup can require an audited
  verifier before accepting a remote bundle

## Security Boundary

The project does not pretend to have production OMEMO until an audited Signal
Protocol implementation is integrated. The current work deliberately stops at
the XMPP wire model, payload envelope helper, trust metadata model, local
device key-material model, encrypted local device file, native passphrase
vault providers, opaque session store contract, signed pre-key verification
contract and backend interface. `XmppOmemoProductionGuard` rejects OMEMO
production mode unless a backend explicitly reports X3DH, Double Ratchet,
persistent session storage, signed pre-key verification and one-time pre-key
consumption.

The X3DH helper now performs X25519 agreement for DH1-DH4 using Bouncy Castle
cryptographic primitives. Initiator setup can now require signed pre-key
verification, but the built-in verifier is only a guard. Real XEdDSA signed
pre-key verification still belongs inside the audited backend before production
OMEMO can be enabled.

## Backend Decision

The production backend direction is now fixed in
`docs/OMEMO_BACKEND_DECISION.md`: use Signal's maintained `libsignal` family
behind the existing `IXmppOmemoSessionBackend` boundary. TeleTypTel keeps the
XMPP/XEP-0384 adapter, trust UI, local storage and PEP publication logic. PHP
keeps OMEMO wire helpers only and must not own browser users' long-term OMEMO
private keys.

Still required for production end-to-end encryption:

- X3DH session setup
- Double Ratchet send/receive session state
- signed pre-key verification
- one-time pre-key consumption and replenishment policy
- persistent secure storage for identity keys, sessions and trust decisions
- live Linux Secret Service and macOS Keychain passphrase vault smoke
- live interoperability test with at least Conversations, Gajim or Dino

## Manual Live Smoke Route

Use this when an audited Signal Protocol backend is connected.

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
