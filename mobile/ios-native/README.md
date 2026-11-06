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
At that revision, real-server login/TLS/heartbeat interoperability and 2FA
completion remained unverified or unimplemented. This run predates the UI adapter
and the isolated transport evidence below.

## Native login UI adapter (published and unsigned-tested)

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

Verified on 2026-11-06 at revision
`972473ebf0a2a222abce11dc063577467ac1934d` in
[unsigned native run 42296708099](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42296708099):

- Five Node source/project checks passed locally and on macOS.
- All 32 Swift tests passed, including nine native login lifecycle tests.
- Unsigned iOS device Release compilation passed with Xcode 26.3. The Release
  binary check found neither the fixture launch marker nor the fixture password.
- All five UI tests passed on iPhone 16 Pro and all five passed on iPad Pro
  11-inch (M4), including login/disconnect with rotation, fail-closed 2FA and
  visible connection loss without automatic re-login. No failures were recorded.
- Report records `unsigned: true`, `uploaded: false` and
  `releaseFixtureExcluded: true`. No TestFlight or server changes were made.

Evidence is stored locally under
`artifacts/ios-native-evidence-42296708099/ios-native-check-1794000412641/reports/`.
These login UI tests use injected fixtures, not real accounts. The isolated
transport evidence below separately exercises ejabberd authentication. End-to-end
account API login, real-device accessibility checks and the remaining migration
stages still require verification.

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
That initial run did not verify live TLS/XMPP probe interoperability. See the
later isolated transport evidence below. Physical-device accessibility and the
remaining native app features are still unverified. Unit/source checks are not
proof of complete protocol interoperability or accessibility conformance.

## Migration inventory and acceptance gates

### Real-ejabberd transport tests (passed, including cleanup verification)

The next interoperability gate is now implemented separately in
`scripts/check-ios-native-ejabberd.js` and `NativeXMPPIntegrationTests`.
The ordinary Swift suite skips these seven network tests unless the isolated
fixture explicitly enables them. A skipped network test is not a passed network
test. No application or production TLS handling is changed by this addition.

The separate `ios-native-ejabberd.yml` workflow installs Homebrew ejabberd on an
ephemeral GitHub-hosted macOS runner. It starts its own named instance with a
temporary database, random fictional account, one loopback-only WSS listener,
and no federation, HTTP administration or public account registration. It records
the installed ejabberd version rather than claiming an exact match to the local
Docker server. Homebrew dependency versions are not pinned in this initial test.

Seven tests exercise the actual Apple networking implementation, not injected
XMPP responses: reachability; SASL/bind and a session surviving the heartbeat
deadline before cancellation; wrong-password rejection; untrusted TLS rejection
by the probe and authenticated transport; hostname mismatch; pre-start
cancellation. The harness also checks that ejabberd has no remaining connected
users after the tests. No test message is sent to an existing user.

Only on that disposable runner, a generated two-day test CA is temporarily
trusted by macOS. A separate loopback Node TLS listener uses a certificate that
is deliberately not trusted; it does not simulate XMPP or account acceptance.
Keeping this listener separate prevents ejabberd's global certificate selection
from sharing the trusted localhost certificate with the negative test.
Cleanup explicitly denies trust for this generated CA, removes its certificate,
and starts a fresh Swift process to verify that the formerly trusted WSS endpoint
now fails with a certificate error (not merely a stopped-server error). It then
stops the owned listeners and deletes the temporary database, credentials and
private keys. This replaces the hanging full administrator trust-settings import.
It does not change authorization policies or other certificates. A deny-only
record remains until disposal of the hosted VM; this is reported explicitly and
is not restoration of the original trust settings. This lifecycle is validated
by the successful hosted run below, not intended for persistent machines.
Cleanup errors fail the run. Forced runner termination relies on disposal of
the hosted VM. The harness refuses Windows, local Macs and self-hosted runners;
it must not be adapted to bypass application certificate checks.

Scoped publication starts this unsigned test workflow; manual dispatch is also
available. It has no deployment/signing secrets or upload-to-store step. Only
sanitized reports under `artifacts/ios-native-ejabberd-*/reports/` are collected;
the temporary server directory is never uploaded. The existing unsigned iOS
preview workflow separately compiles the new Swift test target and retains its
iPhone/iPad UI regression checks.

Published and executed with explicit permission on 2026-11-06:

- [Run 42304267061](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42304267061),
  revision `d2b50b5`, is **successful**. All seven transport tests passed against
  ejabberd 26.09, with zero failures and no skips. After CA trust was explicitly
  denied and its certificate removed, a fresh Swift process repeated the probe
  against the still-running endpoint and correctly rejected its certificate.
  The additional one-test revocation phase passed. The report records
  `passed`, `sessionsReleased`, `caTrustDenied`, `caCertificateRemoved`,
  `caTrustRevocationVerified` and `cleanupCompleted` as true. The residual deny
  record and reliance on disposable VM teardown remain explicitly reported.
  Downloaded evidence: `artifacts/ios-native-evidence-42304267061/`.
- [Unsigned preview run 42304266979](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42304266979)
  at the same revision `d2b50b5` also succeeded: 32 Swift unit tests passed,
  seven opt-in network tests were skipped in this separate suite, unsigned iOS
  Release compilation passed, and all ten simulator UI tests passed (five each
  on iPhone 16 Pro and iPad Pro 11-inch M4, portrait and landscapeLeft). The
  Release fixture-exclusion check passed. Reports record `unsigned: true` and
  `uploaded: false`. Evidence: `artifacts/ios-native-evidence-42304266979/`.
- [Run 42302927918](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42302927918),
  revision `0d9aa6d`, ran all seven integration tests against ejabberd 26.09 with
  zero failures and no skips. Trusted WSS availability, SASL authentication,
  resource binding, heartbeat and cancellation passed; wrong passwords,
  untrusted certificates and hostname mismatches were rejected as expected.
- The heartbeat session remained connected for 40 seconds and ejabberd reported
  no connected users after cancellation. This is short-run transport evidence,
  not a stability soak test or complete XMPP interoperability certification.
- **That earlier workflow failed:** restoring the runner's
  previous administrator trust settings times out. The temporary certificate
  itself was removed successfully, but `cleanupCompleted` remains false. The
  workflow deliberately failed rather than hiding the cleanup error. The newer
  run replaces full trust restoration with targeted, verified CA denial as
  described above; it does not claim full restoration of the runner trust store.
  Only the disposable GitHub-hosted VM was affected; no local trust store or
  production server was accessed. VM disposal is the remaining cleanup boundary.
- Earlier run 42301960672 also passed all seven networking tests but failed
  certificate cleanup. The first run 42300479410 timed out before providing
  passing test evidence; its negative TLS fixture was subsequently separated
  from ejabberd's global certificate selection.
- [Unsigned preview run 42300479292](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42300479292)
  at revision `0749a96` passed 32 Swift unit tests, unsigned device Release
  compilation and ten simulator UI tests (five on iPhone and five on iPad,
  including rotation). Its seven opt-in network tests were skipped as intended,
  not counted as passes. Later commits changed only the test harness and docs.

Downloaded evidence is under `artifacts/ios-native-evidence-42302927918/` and
`artifacts/ios-native-evidence-42300479292/`. Reports contain no signing keys or
fictional account passwords. No TestFlight upload occurred.

These macOS transport tests do not test the PHP account API, production WAMP
routing/certificates, a physical iPhone/iPad, messaging or TC. The test account
is constructed inside the test target only; the application continues to require
its HTTP account gate. Next gates are end-to-end account authentication and
device testing, followed by native messaging parity.

### Native HTTPS account-contract to XMPP chain (hosted-tested)

`NativeLoginIntegrationTests` adds seven opt-in tests using the actual
`NativeLoginModel`, `NativeAccountClient`, reachability probe and XMPP transport,
without injected Swift network doubles. A separate loopback HTTPS fixture exposes
the account JSON contract and proxies WebSocket upgrades to the disposable real
ejabberd. Both TLS legs validate certificates; the native client retains normal
system trust. Only the generated successful test account exists in ejabberd.

The new tests cover account HTTP acceptance followed by actual XMPP binding and
disconnect, HTTP credential rejection, a two-factor challenge even with account
fields present, an unexpected returned identity, a refused HTTP redirect, an
HTTP-accepted identity rejected by ejabberd, and cancellation during a delayed
HTTP response. Server-side counters require exactly one request for each case
and nine WebSocket upgrades: seven availability probes, one successful login and
one rejected XMPP login. Additional connections, followed redirects, unexpected
HTTP requests or proxy errors fail the harness.

**This is a client integration/HTTP contract test, not a real PHP/MySQL backend
test.** The fixture supplies controlled API responses and does not run
`php/public/api/account.php`. Evidence therefore keeps `accountAPITested: false`
and separately records `accountHTTPContractTested` only after the new assertions
pass. It does not verify backend session cookies, access control, 2FA completion,
OAuth, biometric login or any physical device. Ordinary Swift unit runs skip all
fourteen opt-in integration tests unless explicitly enabled by the hosted harness.

Local Node tests validate fixture scenarios, isolation and request checks.
[Isolated run 42308604385](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42308604385)
at revision `0996458` passed all seven native login-chain tests and all seven
existing transport tests against ejabberd 26.09. Each account scenario ran once;
the fixture recorded nine WebSocket upgrades, zero unexpected requests and zero
proxy errors. All authenticated sessions were released. The additional fresh
process certificate-revocation test passed, with temporary CA denial and
certificate removal verified. The deny-only trust record remains until the
disposable VM is discarded, as described above.

Sanitized evidence is under `artifacts/ios-native-evidence-42308604385/`.
The result records `accountHTTPContractTested: true`, `accountAPITested: false`,
`physicalDevicesTested: false`, `unsigned: true` and `uploaded: false`.
No production application code was changed for this step; the additional fixture
is not bundled in the native app. No local/production server was contacted and
no TestFlight upload occurred.

The companion [unsigned preview run 42308604255](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42308604255)
at the same revision is **not green**. Both attempts passed 32 Swift unit tests
(46 total, with 14 opt-in integration tests skipped), unsigned device Release
compilation and the check excluding UI fixture markers from the Release binary.
The first attempt failed the iPhone simulator test command; the second reached
its 900-second limit (`xcodebuild ETIMEDOUT`, `SIGTERM`). Neither produced a
completed iPhone UI suite, and iPad UI testing was not reached. This does not
establish whether the cause is simulator infrastructure or an application/UI-test
defect; the saved failure output does not identify the failing assertion.
Do not carry forward the earlier revision's green UI results as current evidence.
Downloaded artifacts are in `artifacts/ios-native-evidence-42308604255/` and
`artifacts/ios-native-evidence-42308604255-attempt2/`.

### Simulator diagnostics and subsequent passing run (2026-11-07)

Revision `1650777` changes only the test runner and its Node regression tests.
The runner now retains command stdout, stderr and exit/timeout metadata on
failure instead of losing XCTest assertion output. It also exports structured
test summaries and test trees from each available `.xcresult`, including after a
failed test command. Export errors are recorded separately and never replace
the original command failure. This uses Apple's
[xcresulttool test-results commands](https://developer.apple.com/documentation/xcode-release-notes/xcode-16_3-release-notes).
Four new local Node tests cover successful output, assertion failure, timeout
diagnostics and incomplete result-bundle exports.

[Unsigned preview run 42313158516](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42313158516)
passed 32 Swift unit tests (14 opt-in network tests skipped), unsigned device
Release compilation, Release fixture-exclusion checks, and all ten UI tests:
five on iPhone 16 Pro and five on iPad Pro 11-inch (M4), both with iOS 18.5.
Portrait and landscape-left scenarios passed; both exported summaries report
zero failures and zero UI-test skips. Evidence is downloaded under
`artifacts/ios-native-evidence-42313158516/`.

The earlier simulator failure was not reproduced in this run. Neither app code,
UI-test assertions nor command timeouts were changed, so this is **not proof of
a root-cause fix** or of consistently reliable simulator runs. Preserve the
earlier failed evidence; use the new diagnostics if it recurs. This run confirms
the current unsigned preview regression suite, not real-device or complete app
feature parity. No TestFlight upload, signing credentials or production server
changes were involved.

Setup references: [ejabberd Homebrew installation](https://docs.ejabberd.im/admin/install/homebrew/)
and [ejabberd listener options](https://docs.ejabberd.im/admin/configuration/listen-options/).
Certificate lifecycle uses Apple's documented `add-trusted-cert -r deny` and
`delete-certificate -Z` commands, without changing authorization policies:
[Apple security tool manual](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/security.1).

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
