# TeleTypTel native iOS migration

Status: first isolated implementation, not a replacement for the working TestFlight app.
Requested scope: the complete iPhone and iPad application, including native UI,
authentication, messaging and Total Conversation. This is a staged rewrite, not a
claim that those features already work in this target.

## Implemented in this first stage

- Independent SwiftUI entry point; no HTML, JavaScript, Capacitor or WKWebView.
- Native scrollable startup form, bounded width on iPad, portrait/landscape support,
  system fonts, native keyboard dismissal and no automatic text-field focus.
- One status area for checking, reachable, certificate/TLS failure, timeout,
  protocol failure, redirect rejection and cancellation. No separate error page.
- A real unauthenticated XMPP WebSocket reachability check on the configured
  origin's `/xmpp-websocket` route. It checks the `xmpp` subprotocol, server stream
  opening and SASL mechanisms, rather than treating an HTTP response as online.
- WSS only, normal system certificate verification, no cross-server redirects,
  no cookies/credentials/cache, eight-second deadline, bounded XML parsing.
- Cancelling, editing settings or backgrounding cancels the probe. Attempt IDs
  prevent old responses from overwriting newer startup state.
- Separate `com.tiedragon.teletyptel.nativepreview` bundle identity and unsigned
  build only. No credentials, account data, push configuration or production
  endpoints are embedded. No server is contacted automatically.

The probe closes its connection after checking. **Reachable is not authenticated
or continuously connected.** It is not a native XMPP session implementation.
The configured domain is the XMPP virtual host, not necessarily the HTTPS host.
For local testing it may still be `localhost`. The placeholder public hostname is
not evidence of a deployed service. This initial UI is Dutch; other languages are
part of migration parity, not implemented here.

## Build and tests

Windows can prepare and inspect the independent project:

```powershell
node --test tests/ios-native-foundation.test.js
node scripts/prepare-ios-native.js ios-native-manual-1
```

The generator writes only a new directory under `artifacts/ios-native-*`, refuses
overwrites and copies an explicit source/resource allowlist. It does not modify
`ios/App`, TestFlight staging, existing release workflows or server settings.
Open the generated `TeleTypTelNative.xcodeproj` on a Mac. The preview minimum is
iOS/iPadOS 16; the existing app's deployment target is unchanged.

On macOS with Xcode and available iPhone and iPad simulators:

```sh
node scripts/check-ios-native.js
```

This runs Swift unit tests, unsigned iOS device compilation and simulator UI tests
for both device families. UI tests use invalid configuration only, never real
accounts or a server. Test results are written under the generated `reports`
directory; missing device families fail instead of being silently skipped.
The separate `ios-native-preview.yml` workflow runs on scoped native changes on
the development branch, or by manual dispatch. It has no secrets, signing,
TestFlight job or production deployment. Publishing/running it needs permission.

Local validation on Windows: three Node checks passed; Swift runtime check skipped
because Swift/Xcode is unavailable. **Swift compilation, UI tests, live TLS/XMPP
probe behavior and physical-device accessibility are not yet verified.** Source
checks are guardrails, not proof of runtime correctness.

## Migration inventory and acceptance gates

| Stage | Existing behavior/source to preserve | Native work and acceptance gate |
| --- | --- | --- |
| 1. Startup | `scripts/ios-testflight/LanViewController.swift`, `ServerBridge.swift`, `php/public/xmpp-availability.js` | This isolated foundation; pass Swift and iPhone/iPad UI tests, verify real trusted/untrusted TLS and offline cancellation. |
| 2. Account/session | `php/public/api/account.php`, native Google/Facebook plugins, `BiometricSession.swift` | Extract SDK integration from Capacitor; native login, 2FA, opt-in Keychain/Face ID, account recovery and logout. Never equate HTTP login with XMPP readiness. Cancellation and account switching must invalidate pending callbacks and old credentials. |
| 3. Messaging | `php/public/chat-client.js`, history/group APIs, current XMPP tests | Authenticated native XMPP session, roster/presence, reconnect/resume, receipts, MAM/history and MUC. Per-conversation drafts, no duplicate sends on reconnect; two independent real accounts tested. |
| 4. Native interface | `chat.html`, `mobile-navigation.js`, `chat-tablet.css`, dialer | Native contact/chat split navigation on iPad and navigation stack on iPhone, optional sidebar, symbols with accessible labels, normal number pad, safe-area/rotation/keyboard regression tests. Preserve drafts and scroll position. |
| 5. Total Conversation | `CallMediaProfile.swift`, `NativeT140Session.swift`, `NativeWebRTCChannel.swift`, `NativeJingleRtt.swift`, JS Jingle session/media code | Reuse audited logic without duplicating the protocol implementation. Add authenticated Jingle session adapter, native audio/video capture/rendering and TC RTT views. Bind every event to account, peer and call SID; no silent media downgrade or previous-call text leakage. Test audio, video, audio+RTT and TC independently. |
| 6. Background incoming calls | `VoipCallPlugin.swift`, `NativeCallControl.swift`, push endpoints | Extract CallKit/PushKit engine from plugin, integrate audio activation, cancellation and actual media-ready completion. APNs and locked-screen calls require authorized server work and physical iPhone tests; not solved by this startup target. |
| 7. Remaining parity | translation, interpreter, uploads, contacts, settings | Private opt-in translation of own/remote chat and RTT; no same-language translation or translation after opt-out. Consent-based address book, file/photo sending, staff/interpreter permissions and actual three-party media. External SIP/interpreter/112 connections remain separately gated. |
| 8. Release migration | current TestFlight workflow and production bundle | Only replace existing app after feature parity, migration/rollback tests and physical iPhone/iPad approval. Existing identities/sessions must not be copied into this unsigned preview. Separate permission for signing and TestFlight. |

## Required evidence before replacing the existing app

- iPhone and iPad, portrait and landscape, Dynamic Type, VoiceOver, hardware
  keyboard, safe areas and no unwanted focus/keyboard at startup or after login.
- Real account authentication, logout/relogin, account switching, token expiry,
  disabled accounts and trustworthy certificate failures without bypasses.
- Two-device messaging, delivery vs read receipts, group chat, disconnect/recovery,
  upload failure and drafts preserved across navigation/rotation.
- TC simultaneous audio/video/RTT, camera switch, mute states, separate local and
  remote text, Unicode edits, translation consent, call replacement and third party.
- Background/locked-screen APNs/CallKit and network changes on actual hardware.
- Security and accessibility re-audit; no blanket standards/compliance claim.

## Primary references

- [RFC 7395: XMPP over WebSocket](https://www.rfc-editor.org/rfc/rfc7395.html):
  subprotocol and framed XML stream. This probe implements only pre-authentication
  availability, not the full protocol.
- [Apple: URLSessionWebSocketTask maximumMessageSize](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask/maximummessagesize):
  per-message buffer limit; this probe also limits cumulative XML bytes.
- [Apple: Adopting SwiftUI navigation split view](https://developer.apple.com/documentation/technotes/tn3154-adopting-swiftui-navigation-split-view):
  reference for the upcoming adaptive contact/chat navigation, not yet built here.
