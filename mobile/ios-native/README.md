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
or continuously connected.** After a successful probe, the native UI now offers
an explicit account/password login using the connection foundation below. It
never logs in automatically or treats a successful probe as a logged-in session.
The configured domain is the XMPP virtual host, not necessarily the HTTPS host.
For local testing it may still be `localhost`. The placeholder public hostname is
not evidence of a deployed service. This initial UI is Dutch; other languages are
part of migration parity, not implemented here.

## Authenticated XMPP foundation

Added and published after the first-stage validation:

- `NativeAccountClient` performs a bounded HTTPS POST to the configured origin's
  existing `/api/account.php` login action, using normal system TLS and refusing
  redirects. It does not contact a production endpoint automatically.
- Only a successful account response with credentials for the configured XMPP
  domain produces the account value used by `NativeXMPPConnection`. An account
  rejection or `twoFactorRequired` never falls through to direct XMPP login.
  **The 2FA entry/verification flow is still pending**; accounts requiring it
  currently stop with a typed error. Google/Facebook/Apple login is also pending.
- Native RFC 7395 WebSocket framing, TLS-only SASL PLAIN (matching the current web
  client), stream restart and RFC 6120 resource binding. No custom cryptography,
  unencrypted fallback or implicit SASL mechanism downgrade. Servers without
  PLAIN stop with `unsupportedAuthentication`; SCRAM support is not implemented.
- The session reports connected only after a matching bind response, validation
  of the returned full JID and successful sending of initial presence. A reachable
  endpoint or HTTP login alone is never reported as an authenticated XMPP session.
- Foreground XEP-0199 heartbeat every 25 seconds with a ten-second response
  deadline. Matching IQ results or errors from the server count as responses;
  unrelated traffic and responses from other contacts do not keep it alive.
- Serialized connection state, bounded XML/messages, ten-second handshake
  deadline, cancellation and terminal cleanup. No credential persistence or
  authentication-frame logging; account debug descriptions are redacted.
- Account HTTP requests deliberately retain no cookies. This is not persistent
  backend session support and does not enable authenticated profile/history APIs.
  Backend login can create its usual expiring server session; this target does not
  retain that session cookie. Persistent backend sessions and explicit server
  logout remain pending, without bypassing 2FA. The preview button deliberately
  says "Verbinding verbreken": it closes native XMPP, not other backend sessions.

The connection currently supplies readiness/loss detection only, not a chat API.
Roster, message handling, receipts, MUC, XEP-0198 resume, automatic reconnection,
background operation are **not delivered by this stage**. No existing TestFlight
screen or server has been changed. The native UI adapter added next cancels old
tasks and rejects old-generation callbacks before starting a new connection.

New Swift fixtures cover authentication order/encoding, failed authentication,
binding identity/correlation, ping correlation/spoofed responses, XML bounds,
2FA fail-closed behavior and pre-start cancellation. These are protocol fixtures,
not live ejabberd evidence. This stage was validated on 2026-11-06 at revision
`ca4c250517c52c7796ef27b2be9b19420ff6ee51` in
[unsigned native run 42291914885](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42291914885):

- Four Node source/project guardrails passed locally and on macOS.
- All 23 Swift unit tests passed, including the 11 new account/session fixtures.
- Unsigned iOS device Release compilation passed with Xcode 26.3.
- Two startup UI tests passed on iPhone 16 Pro simulator and two on iPad Pro
  11-inch (M4), covering portrait and landscapeLeft. These tests exercise the
  existing startup form, not authenticated login UI or a real ejabberd session.
- Evidence reports `unsigned: true`, `uploaded: false`; no TestFlight upload,
  signing keys or server changes were involved.

Local evidence:
`artifacts/ios-native-evidence-42291914885/ios-native-check-1793998355272/reports/`.
Real-server login/TLS/heartbeat interoperability and 2FA completion remain
unverified or unimplemented as described above. This run predates the UI adapter.

## Native login UI adapter (local, pending new macOS validation)

- After checking the entered HTTPS origin/domain, the form offers an explicitly
  labelled XMPP account field and a native `SecureField`. No autofocus, credential
  persistence, automatic login or production server defaults are introduced.
- Pressing login clears the password field, rechecks server availability, invokes
  the account API and only then starts XMPP. The existing single status panel
  distinguishes checking, account verification, XMPP negotiation and connected.
- The API account must match the requested JID and configuration; the connected
  callback must match that same account. Cancellation, account/server edits and
  connection loss invalidate the generation so stale callbacks cannot restore
  an online status or start the next step of an obsolete login.
- The connection can be explicitly cancelled or disconnected. Backgrounding the
  preview clears the password and stops the connection, with a clear explanation
  and manual re-login on return. This is **not** background-call support.
- A 2FA challenge remains fail-closed and explains how to use the existing app;
  it never suggests disabling 2FA. Contacts/chat/calls remain explicitly pending.
- Nine new model tests use injected probe/account/connection actors. Three new
  UI scenarios cover simulated login/disconnect across rotation, a 2FA challenge
  and connection loss, in addition to the two original startup UI tests.
- UI simulations require an explicit Debug-only launch environment and show
  `TESTSCENARIO — geen echte serververbinding`. They use only `.invalid` and
  fictitious credentials, never a network service. Release compilation excludes
  the fixture implementation; the check script also rejects its environment
  marker or fixture password in the Release executable.

Five local Node source/project checks passed. Swift/model tests, the changed UI
and the Release fixture-exclusion assertion require a **new** macOS/Xcode run;
the earlier successful run is not evidence for these changes. No real account
has been used. An authorized manual test against trusted ejabberd is still needed.

References: [RFC 7395](https://www.rfc-editor.org/rfc/rfc7395),
[RFC 6120](https://www.rfc-editor.org/rfc/rfc6120),
[SASL PLAIN / RFC 4616](https://www.rfc-editor.org/rfc/rfc4616),
[XEP-0199](https://xmpp.org/extensions/xep-0199.html).

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
for both device families. UI tests use invalid configuration and Debug-only
injected fixtures, never real accounts or a server. Test results are written under the generated `reports`
directory; missing device families fail instead of being silently skipped.
The separate `ios-native-preview.yml` workflow runs on scoped native changes on
the development branch, or by manual dispatch. It has no secrets, signing,
TestFlight job or production deployment. Publishing/running it needs permission.

Verified on 2026-11-06 for code revision
`12358ea96ed7c363f6425f057be77c2016ed92db` in
[unsigned native run 42287643817](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42287643817):

- Three Node project/source guardrails passed, locally and on macOS.
- Twelve Swift unit tests passed on macOS, with zero failures.
- Standalone native iOS device Release compilation passed without signing.
- Two UI tests passed on iPhone 16 Pro simulator and the same two passed on
  iPad Pro 11-inch (M4) simulator, with zero failures. They cover initial keyboard
  absence, configuration retained through portrait/landscape rotation and an
  inline invalid-address error rather than a separate alert.
- Report explicitly records `unsigned: true` and `uploaded: false`.

Evidence was downloaded to
`artifacts/ios-native-evidence-42287643817/ios-native-check-1793996530363/reports/`.
**Live TLS/XMPP probe interoperability, physical-device accessibility and the
remaining native app features are not yet verified.** Unit/source checks are not
proof of complete protocol interoperability or accessibility conformance.

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
