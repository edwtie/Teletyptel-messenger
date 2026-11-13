# TeleTypTel native iOS migration

Status: first isolated implementation, not a replacement for the working TestFlight app.
Requested scope: the complete iPhone and iPad application, including native UI,
authentication, messaging and Total Conversation. This is a staged rewrite, not a
claim that those features already work in this target.

## Current increment: authenticator second-factor login (2026-11-13)

The native preview now has a second-factor screen for the existing account API's
`authenticator` challenge. This supersedes the older statements below that native
two-factor login is unsupported. Google/Facebook, account registration and password
recovery are still separate migration work.

- A challenge is not an authenticated account. XMPP, chat and calling stay closed
  until a successful verification returns the expected account and XMPP resource
  binding subsequently succeeds. An account change in the verification response
  is rejected.
- The login attempt uses its own ephemeral HTTPS session. Its PHP session cookie
  stays in memory for `verify_login_two_factor` on that same origin; it is not
  shared with Safari, WebViews or other login attempts. Redirects are rejected.
  Automatic cookie storage is disabled. A single bounded, Secure `PHPSESSID` with
  an exact matching host and API-compatible path is explicitly retained and sent
  only to the same account API. Missing, foreign or insecure cookies are rejected.
- Codes are six ASCII digits, explicitly submitted, never persisted and cleared
  after submission, cancellation and background entry. There is no automatic
  focus or automatic code submission. Invalid codes can be retried, but the
  challenge is capped at five verification requests and five minutes locally.
  Unsupported email-code challenges fail closed; no security setting is disabled.
- Logout, account/server changes, expiry and background entry close the challenge
  session and invalidate late results. Biometric login does not bypass the server's
  second-factor requirement. Opt-in credential saving still waits for actual XMPP
  connection.
- Tests include a private URLProtocol HTTP fixture for challenge/cookie continuity,
  retry, cancellation, invalid responses and attempt limits, model tests that keep
  XMPP closed before verification, and a Debug-only iPhone/iPad flow that enters an
  invalid and then valid fictional code. Real PHP/TOTP operation and physical
  device testing are not proven by these fixtures.

No production PHP, authentication policy, APNs configuration or TestFlight release
is changed by this increment.

Validation of revision `7d7e40a`:
[unsigned run 43431351085](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43431351085)
passed Release device compilation/fixture exclusion, 163 Swift tests including ten
second-factor tests, and all twelve iPhone/iPad UI tests in portrait and
landscape-left. Fifteen opt-in real-server tests were skipped. The four-profile
same-host WebRTC loopback remained green. The second-factor UI scenario now checks
both a rejected fictional code and successful connection after a valid fictional
code. The initial HTTP fixture exposed missing automatic cookie continuity; this
was fixed with explicit, origin-bound cookie handling rather than weakening the
verification test. Real PHP/TOTP and physical-device validation remain required.

## Current increment: opt-in biometric saved login (2026-11-13)

The native preview now includes an optional Face ID/Touch ID login path. This
section supersedes the older statements below about Keychain/cold-start login.
It does not make background calling operational.

- Remembering is off by default. The user must select the biometric-login option
  during manual login; credentials are saved only after the matching XMPP account
  is actually connected, not after HTTP authentication alone.
- iOS biometric authentication is required before saving and unlocking. The
  Keychain item uses `biometryCurrentSet`,
  `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`, and no iCloud synchronization.
  Changed biometric enrollment invalidates access. No unprotected password fallback
  or biometric data is stored by the app.
- On a later cold launch, an existing saved item starts biometric unlocking.
  Only after success does the normal HTTPS/account/XMPP login chain run, including
  certificate verification and server availability checks. Cancellation leaves
  manual login available; failed unlocks do not loop or silently send credentials.
- Disconnect/logout removes the saved login. A separate removal button is also
  available. A failed removal remains visible rather than claiming success.
  Automatic restore is disabled before deletion, even if Keychain deletion fails.
  Only a nonsecret consent boolean uses preferences; all credentials stay in
  Keychain. An existing Keychain item alone does not authorize automatic login
  after reinstall or loss of the consent preference.
  Configuration changes, background entry and cancellation invalidate pending
  operations; stale results cannot log in or update the UI.
- Preview credentials use a separate Keychain service. Debug UI fixtures disable
  the real vault and cannot save or automatically restore test credentials.
- Swift tests cover payload validation/redaction, opt-in, confirmed matching login,
  cancellation, successful/failed unlocking, deletion and late results. Source
  checks are not proof of real Keychain or Face ID operation. Actual enrollment,
  permission denial, lockout, reboot, logout/relaunch and cancellation require
  physical iPhone/iPad validation before a signed release. No TestFlight upload,
  APNs activation or server changes are included.

This foreground-only biometric item must not be reused to bypass authentication
for locked-screen background calls. That requires a separate scoped and revocable
call authorization design and server integration.

Validation of revision `92f0755`:
[unsigned run 43424813510](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43424813510)
passed device Release compilation and fixture exclusion, 153 Swift tests (including
eight saved-login tests), and all twelve UI tests across iPhone 16 Pro and iPad Pro
11-inch (M4), portrait and landscape-left. Fifteen opt-in network tests were skipped;
no new real-server test is claimed. The existing same-host WebRTC loopback also
passed all four profiles. UI fixtures keep the biometric vault disabled: these
results do not prove real Keychain access or Face ID/Touch ID authentication.

Reference: [Apple Keychain accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility).

## Implemented in this first stage

### Concrete native media engine and call lifecycle

The isolated target now includes `NativeMediaPeer`, `NativeJingleSession` and
`NativeIncomingPeerNegotiator`. These connect the earlier strict description
converter to actual native WebRTC peers and the authenticated Jingle transport.
This does **not** yet connect calls to the login UI or enable background push.

- Offers use explicitly selected PCMU/VP8 codecs and independent UDP ICE/DTLS
  transports. Optional local BUNDLE, RTP header extensions and transport-wide
  congestion feedback are removed before setting the local description. Remote
  bundled offers remain unsupported; arbitrary browser interoperability is not
  claimed. ICE gathering and asynchronous operations have bounded deadlines.
- Native RTCP extended round-trip reports remain unchanged in the SDK's local
  description. The Jingle projection does not advertise this optional, unmapped
  capability; unsupported XR forms fail closed. This avoids overriding the SDK's
  SDP-munging guard. Audio NACK is mapped using XEP-0293. RTCP round-trip reporting
  is unrelated to the T.140 real-time text channel.
- The session state machine binds each call to the authorized full JID, SID and
  connection binding. IQ acknowledgement is distinct from negotiated media and
  from an actually connected peer. Invalid profiles, foreign calls, duplicate
  session transitions and late results after cancellation cannot open media.
  Preparation/answering expire after 20 seconds and unanswered calls after 45
  seconds; stale timers cannot terminate an established call.
- Incoming offers are validated and acknowledged without creating capture
  tracks. Only preparation after answering obtains the injected tracks. Local
  and remote hangup close the peer, stop prepared capture and release signalling.
  The CallKit media driver still waits for the required tracks and, when used,
  the reliable T.140 channel before reporting readiness.
- The new macOS loopback test exercises four profiles using two actual WebRTC
  peers and the real Jingle IQ parser/state machine over an in-memory wire.
  Synthetic VP8 frames must be decoded in both directions; RTT must carry
  Unicode, edits and deletion. Microphones remain disabled: negotiated audio
  tracks are not evidence of audible audio. The incoming provider is also tested
  for deferred capture and hangup cleanup.

The unsigned workflow now fails when this media test fails, rather than relying
only on successful compilation or description round-tripping. Initial runs
exposed a mismatch between native SDP and the constrained converter; runtime
validation is being completed. Do not treat a compiled app as an operational
calling app. The results and remaining gates below must be updated with actual
successful run evidence before declaring this stage validated.

Still required: native capture/rendering and call controls, authenticated call
discovery and login-lifecycle wiring, push registration/revocation, APNs delivery,
TURN/public-network and physical-device tests, native group/translation/history
and OAuth feature parity. No TestFlight, live APNs or server configuration was
changed by this stage.

### Native media description conversion (unsigned validation completed)

`NativeJingleMedia` adds native SDP/Jingle description conversion for audio,
audio/video, audio/RTT and Total Conversation. This is a **restricted negotiation
format**; the historical validation below tested the converter, not an operational
call engine. It uses PCMU audio, VP8 video, mandatory
SHA-256 DTLS fingerprints, complete UDP ICE candidates and negotiated, reliable,
ordered T.140 datachannel 0. RTT remains conversational media, not a chat message.
Answers must preserve the offered SID, profile, ordered media IDs and payloads;
they cannot silently remove RTT/video or add unoffered feedback.

The XML parser's existing 64 KiB, 128-node and depth limits are unchanged. Each
content accepts up to 24 candidates so a full TC description, including its IQ
envelope, fits that parser. Malformed candidates, duplicate IDs, unsupported
codecs, insecure transport, partial-reliability RTT and XML/SDP injection are
rejected. Debug descriptions redact ICE credentials and addresses.

This first profile deliberately rejects BUNDLE and session-level security
attributes rather than silently losing them. It is **not yet compatible with
arbitrary default WebRTC offers**, which commonly advertise bundled media and
multiple codecs. Native peer configuration/codec selection or explicit grouping
support must be implemented and tested before connecting it to live calls.
It does not implement RTP/T.140 (RFC 4103), SIP interworking, trickle ICE, ICE
restart, media capture/rendering or a full Jingle session state machine.

Fourteen new Swift tests cover all four profiles in both directions, answer
matching, parser/transport bounds and negative security cases. Validation of
revision `9e50fb4` on 2026-11-07:

- Local Node source/generator/fixture checks: 22 passed, one macOS-only Swift
  invocation skipped on Windows.
- [Unsigned run 42366475598](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42366475598):
  117 Swift tests passed, including all fourteen new media description tests;
  fifteen opt-in network tests skipped, zero failures. This run did not repeat
  the earlier isolated ejabberd integration test.
- Unsigned iOS device Release compilation and test-fixture exclusion passed.
  All twelve UI tests passed: six on iPhone 16 Pro and six on iPad Pro 11-inch
  (M4), in portrait and landscape-left, with no failures or skips.
- Evidence is retained under `artifacts/ios-native-evidence-42366475598/`.
  Initial test runs exposed an XCTest property-name collision and an incorrect
  ICE-fragment boundary fixture; both were corrected before the successful run.
  The test harness now retains Swift assertion output even when the initial
  generator check fails.

These tests exercise description conversion and existing UI, **not actual
audio/video media exchange, camera capture, background calls or APNs delivery**.
Physical-device tests and the concrete native peer-negotiation provider are
still required. No TestFlight, APNs or server changes are included.

References: [Jingle RTP (XEP-0167)](https://xmpp.org/extensions/xep-0167.html),
[DTLS-SRTP (XEP-0320)](https://xmpp.org/extensions/xep-0320.html), and
[experimental synchronized RTT (XEP-0517)](https://xmpp.org/extensions/xep-0517.html).
The constrained implementation is not a claim of complete XEP conformance.

### Native Jingle signalling transport (unsigned validation completed)

The authenticated WSS connection now exposes a separate Jingle channel after
SASL authentication and resource binding. A caller must explicitly bind an
authorized **full peer JID and call SID** before sending or receiving requests.
Each binding belongs to one connection; replacing/closing it invalidates pending
exchanges and response capabilities. Nothing in a push payload alone authorizes
that peer. The normal chat API remains separate.

Outgoing IQs finish on a matching peer response, not on WebSocket write success.
Incoming IQs require an explicit handler decision; an IQ result acknowledges
signalling only and never marks media connected or enables a microphone/camera.
Unknown calls are rejected, not automatically accepted. Eight concurrent inbound
and outbound requests, eight-second monotonic deadlines, and 256 retained inbound
IQ results per binding bound resource usage. Duplicate requests reuse their
reply without re-delivery. Once the replay cache is full, new requests are refused
until the binding is released. Cancellation does not retry an uncertain request.

Tests cover routing after authenticated resource binding, exact peer/resource,
recipient and SID validation, rejection, cancellation, duplicate/late responses,
logout/replacement, XML limits and bounded replay memory. An opt-in integration
test connects two resources of one fictional account to the disposable ejabberd,
checks actual bidirectional IQ exchange and rejection, then cancellation,
timeout, unbinding and disconnection. This is **not** a two-person media test.

This stage validates Jingle envelopes, **not complete RTP/ICE/DTLS/SDP content or
the Jingle session state machine**. The native `NativePeerNegotiating` provider,
verified incoming-call/peer resolution, native capture/rendering, login lifecycle
integration and authenticated push registration still need implementation.
Neither this transport nor the earlier CallKit adapter makes background calls
operational yet. Push remains disabled; no TestFlight or live server changes.

Protocol reference: [XEP-0166 Jingle](https://xmpp.org/extensions/xep-0166.html).
Validation of revision `b86cc09` on 2026-11-07:

- Local validation: 22 Node source/generator/fixture checks passed; the macOS-only
  Swift invocation was skipped on Windows, not counted as runtime proof.
- [Unsigned iOS run 42362990199](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42362990199)
  passed 103 Swift tests, including fourteen new Jingle/routing tests. Fifteen
  opt-in network tests were skipped in this run. Unsigned device Release
  compilation and Release fixture-exclusion checks passed. All twelve UI tests
  passed: six on iPhone 16 Pro and six on iPad Pro 11-inch (M4), covering portrait
  and landscape-left. No UI failures or skips were reported.
- [Isolated ejabberd run 42362992332](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42362992332)
  executed those fifteen network tests: seven WSS/server checks, seven native
  HTTPS/XMPP login-contract checks and one new bidirectional Jingle test. All
  passed against temporary ejabberd 26.09. Jingle acknowledgement, rejection,
  cancellation, timeout, unbinding and disconnect were exercised over actual
  Apple WebSocket transport. Sessions were released, temporary certificate trust
  was revoked and checked, and test-environment cleanup completed.

Evidence is downloaded under `artifacts/ios-native-evidence-42362990199/` and
`artifacts/ios-native-evidence-42362992332/`. These results do not cover physical
devices, actual PHP account authentication, complete audio/video/RTT negotiation
or APNs delivery. The UI tests exercise the existing native interface, not a
complete CallKit call. No signing, TestFlight upload, production secrets or live
server changes were involved.

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
  endpoints are embedded. No server is contacted automatically on a cold launch.

The probe closes its connection after checking. **Reachable is not authenticated
or continuously connected.** After a successful probe, the native UI now offers
an explicit account/password login using the connection foundation below. It
never treats a successful probe as a logged-in session. Initial login is manual;
foreground return can now reconnect an already authenticated in-memory session,
as described below.
The configured domain is the XMPP virtual host, not necessarily the HTTPS host.
For local testing it may still be `localhost`. The placeholder public hostname is
not evidence of a deployed service. This initial UI is Dutch; other languages are
part of migration parity, not implemented here.

## Direct chat and bounded background lifecycle (unsigned tests passed)

Published and tested on 2026-11-07 in the isolated native preview only.
Unsigned compilation, unit tests and iPhone/iPad simulator tests passed.
**No physical-device validation or TestFlight upload is claimed.**
The working Capacitor app and server configuration are unchanged.

- Selecting a roster contact opens a native one-to-one chat sheet with incoming
  and outgoing text, accessible send control and no automatic keyboard focus.
  This is direct XMPP messaging, not TC RTT, group chat, translation or a bot.
- Chat stanzas use the authenticated WSS session and XML-escaped text. Only
  direct `chat`/`normal` messages addressed to this account/resource are accepted.
  Groupchat, nested forwarding/carbons and self echoes are not consumed. Messages
  from contacts outside the loaded roster are ignored in this preview. Up to 32
  early events wait for the initial roster; overflow or roster failure drops
  these events. This is not reliable offline delivery or history synchronization.
- Each contact has an in-memory draft. Rotating, dismissing the chat sheet and
  background/foreground return preserve drafts and session messages. Ending the
  app process, account/configuration changes, a new login or explicit disconnect
  erase them. There is no database, Keychain session or cold-start auto-login yet.
- Limits: 8 KiB UTF-8 text, 100 drafts, 200 messages across the session and eight
  in-flight writes. Old received/submitted messages may be evicted with a visible
  history-limit notice. Uncertain/rejected writes are retained; if they fill the
  history, new sends are refused without clearing the draft. Duplicate detection
  uses sender plus stanza ID within retained incoming history, not globally.
- A completed socket write means **submitted, not delivered or read**. Errors
  with matching peer and stanza ID mark rejection. Timeout, cancellation or
  connection loss mark in-flight messages uncertain, preserving their text.
  They are never automatically resent. A late socket callback cannot convert an
  uncertain or rejected write into a success. Domain-only server error senders
  are not mapped to a conversation in this initial direct-chat codec.
- On background entry, new sends are disabled. Only already initiated writes
  receive a finite UIKit background task, capped locally at five seconds and
  subject to earlier OS expiration. The session is then closed and presence
  cleared. The task is always ended; no silent audio, background-mode entitlement
  or permanent socket workaround is added.
- Returning to the foreground cancels a still-running completion window or
  rechecks WSS availability and authenticates a fresh XMPP connection with the
  already approved account credentials held only in RAM. It does not replay the
  HTTP login, bypass an initial 2FA challenge, restore a stream with XEP-0198,
  fetch MAM/history or retry failed sends. Explicit logout, a failed reconnect,
  configuration change or process termination discards those credentials.
  No reconnect loop runs in the background. Repeated foreground events cannot
  start concurrent reconnects, and previous-generation events are ignored.

**Still required for background incoming calls/messages:** integrate the
PushKit/CallKit call engine with this target, authorize its actual app identity,
connect authenticated push registration/server delivery, and test APNs on real
locked iPhones. Ordinary message notifications require their own notification
flow; VoIP pushes are not a generic background-chat transport. This step does
not promise ringing, vibration, message reception or continued calls while the
app is suspended or terminated.

Added tests: ten chat codec/store tests, four model chat/lifecycle tests, one
session-routing test and one iPhone/iPad UI scenario covering receive/send,
rotation, draft retention, sheet reopening and foreground return. Existing
isolated ejabberd tests still cover the earlier login/roster chain; two-account
chat interoperability and background timing/expiration are not yet validated.
The Debug UI fixture is explicitly fictional and never reaches a server.

Validation evidence:

- Feature commit `a77e9fc4e1e1ad6d08d2f519a41e8dec23f23d7d`; test-helper fixes
  `abd7594` and `6c8a58598011b47ee53b0fc442b6da40edf3f4b9`. Only scoped native
  preview sources, tests, generator and this documentation were published.
- [Unsigned simulator run 42343322052](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42343322052)
  passed on `6c8a585`: 67 Swift tests passed, 14 opt-in network tests skipped in
  that suite; unsigned device Release compilation passed and Debug fixtures
  were absent from the Release binary. Six UI tests passed without skips on
  each of iPhone 16 Pro and iPad Pro 11-inch (M4), both iOS 18.5 simulators.
  These include portrait/landscape, fictional send/receive, draft/history
  retention, background/foreground return and explicit disconnect.
- [Isolated ejabberd run 42341137558](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42341137558)
  passed on `a77e9fc`: seven WSS tests and seven native login HTTP-contract
  tests against disposable loopback ejabberd 26.09 and a fictional account API.
  Session cleanup, temporary CA removal and trust revocation were verified.
  This is regression evidence for authentication/roster, not two-peer chat
  interoperability or validation of the production PHP API.
- Earlier runs `42340983130` and `42342207540` failed UI automation. The first
  queried an offscreen label's tap point after rotation. The second exposed
  ineffective full-window scroll gestures and a failed termination during an
  unnecessary launch/terminate/relaunch sequence. The helper now checks visible
  geometry before hittability, uses bounded drags and launches each fixture
  once. Assertions remain enabled; these failures were not ignored or retried
  automatically into a green result. Application code was unchanged by these
  test-helper fixes.
- Local validation: 19 Node harness/source/fixture checks passed, with the Swift
  runner skipped on Windows. Project generation includes all three new sources
  byte-for-byte; scoped whitespace checks passed.
- Downloaded reports are retained locally under
  `artifacts/ios-native-evidence-42343322052/` and
  `artifacts/ios-native-evidence-42341137558/`; the two failed runs have separate
  evidence directories. GitHub artifacts have limited retention. The reports
  record `unsigned: true` and `uploaded: false`; no production/local server,
  signing key or TestFlight deployment was used.

Remaining acceptance gates before release:
isolated two-account ejabberd send/receive including offline and rejection cases;
real-device Home/lock/rapid-return/network-loss tests while writes are in flight;
VoiceOver, Dynamic Type and rotation/keyboard checks. Verify that return preserves
drafts, never resends uncertain text and never exposes another account's messages.

References: [RFC 6121 direct messaging](https://www.rfc-editor.org/rfc/rfc6121.html#section-5),
[Apple finite background tasks](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time),
and [Apple VoIP notification handling](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit).

## Incoming-call lifecycle foundation (unsigned validation passed)

This isolated step adds `NativeIncomingCall.swift` and ten Swift unit tests.
It does **not** yet connect PushKit, CallKit, media, registration or the UI. The
successful chat runs above predate this change; the separate run below validates
this new source. No APNs entitlement, secret, backend change or TestFlight upload
is part of this step.

Local validation on 2026-11-07: 20 Node/source/fixture checks passed; one Swift
runner check was skipped because Windows has no macOS Swift test environment.

Unsigned GitHub validation on 2026-11-07:
[run 42358499938](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42358499938)
passed at revision `a827872212d98303521bc19a527e2dc34fc14e2f`.

- Swift: 77 passed, including all ten new incoming-call lifecycle tests; 14
  opt-in network integration tests skipped; no failures. This run does not
  establish live call or server interoperability.
- UI regression tests: six passed on iPhone 16 Pro and six on iPad Pro 11-inch
  (M4), both iOS Simulator 18.5, including portrait/landscape checks; no failures
  or skips. These exercise the existing native UI/chat, not a new call UI.
- Unsigned device Release compilation passed and the Debug login fixture was
  confirmed excluded. No signing, push activation or TestFlight upload occurred.
- Downloaded evidence is retained locally under
  `artifacts/ios-native-evidence-42358499938/ios-native-check-1794042602646/reports/`.
  The lifecycle remains unit-tested groundwork; physical-device background
  calls and APNs/CallKit/media integration still require the gates below.

- Decode the existing incoming-call JSON contract with typed booleans, UUID,
  bounded session identifier, four media profiles and a maximum 60-second
  invitation lifetime; payloads are limited to 4 KiB.
- Consent/account context and a per-registration generation are required before
  admitting an invitation. Reconfiguration/logout invalidate previous handles.
  The future authenticated registration layer must establish that context;
  this local state machine is not push authentication or token storage.
- One admitted call at a time, explicit reporting/ringing/answering/connected
  phases, a maximum 15-second answer deadline and bounded replay suppression.
  Old completion callbacks cannot end or revive another call. Expiry processing
  must be scheduled by the future adapter; this value type starts no timer.
- Total Conversation cannot be marked connected with audio alone or without a
  ready RTT channel. Negotiated profile and the full unique set of ready media
  must match the invitation. Audio-only calls remain supported.
- New Swift tests cover malformed/expired payloads, consent, registration/account
  changes, report failure, duplicate calls, exact media readiness and deadlines.
  Node checks verify project inclusion and compatibility with the existing media
  profile definitions, but do not execute Swift behavior on Windows.

Historical integration gates for the lifecycle-only step: implement a CallKit adapter that reports incoming VoIP pushes
promptly, maps lifecycle endings to system calls, and completes each pending
answer once; wire authenticated registration/revocation and secure call-control
credentials; connect native Jingle/WebRTC/RTT before fulfilling an answer. A
rejected payload here does **not** authorize silently dropping a PushKit callback:
the adapter must follow Apple's CallKit reporting requirements, including stale
or invalid incoming-call handling. No arbitrary chat messages may use VoIP pushes.
Then validate real APNs delivery and calls on locked physical devices.

Reference: [Apple's VoIP push handling requirements](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit).

## CallKit, PushKit and media adapters (unsigned validation passed)

The next isolated step connects the lifecycle to actual Apple framework adapters
and the existing pinned WebRTC/T.140 implementation. It does **not** turn on live
background calls. The SwiftUI login screen does not construct this runtime yet;
`NativeCallRuntime(negotiation:)` requires an authenticated Jingle/media provider.
There is deliberately no fake provider that declares a call connected.

- `NativeCallCoordinator` reports pushes before starting media, handles exactly-once
  push/answer completions, expires ringing/answering calls, and cancels stale work
  after logout or a new registration. Rejected or duplicate pushes are reported
  with a separate UUID and ended, never ending an existing call by mistake.
- `NativeCallPlatform` forwards PushKit callbacks to CallKit, including invalid
  invitations; routes answer/end/mute/reset and audio activation to the coordinator;
  and gates registration on consent and an explicit build flag. Tokens are handed
  to a supplied registration callback, never printed or stored in defaults.
  Disable/logout requires authenticated server revocation confirmation before
  another account can register within this runtime.
- `NativeWebRTCCallMedia` creates the existing negotiated T.140 channel before
  accepting the peer negotiation. It waits for connected ICE/DTLS peer state,
  live negotiated audio/video tracks and an open RTT channel as requested. It
  keeps WebRTC audio manual until CallKit activation, supports system mute, and
  closes peer/channel and the signaling/capture owner on end. A disconnected
  connected peer gets a bounded ten-second recovery window.
- The generated unsigned project includes WebRTC at the same fixed revision as
  the existing native media experiments, plus unchanged copies of
  `NativeT140Session.swift` and `NativeWebRTCChannel.swift`. No new vendor or
  floating dependency is introduced. SwiftPM verifies the binary package checksum.
- Twelve coordinator tests use fake system/media ports and a controllable clock.
  These test ordering, invalid/duplicate pushes, delayed completion, TC readiness,
  timeouts, logout, mute and stale callbacks. They do not prove APNs delivery,
  CallKit system UI or live audio/video on physical devices.

The `NativePeerNegotiating` contract must be implemented by the native authenticated
Jingle layer: bind the verified remote peer, SID and call ID to the handle; obtain
microphone/camera permission before capture; create and retain the peer/delegate
and capture owner in `prepare`; forward peer/track changes on the main actor;
negotiate only after the RTT channel is attached; return the exact negotiated
profile from `accept`; and stop capture/signaling in `close`. Readiness does not
wait for CallKit audio activation, which follows successful answer fulfillment.
Remote termination must be routed using the matching current call handle.

Remaining release gates: implement that live Jingle provider and authenticated
token registration/revocation, persist a revocation-safe account/control context
in Keychain, restore it during cold launch before registering PushKit, and attach
the runtime to the native app login/logout lifecycle. Add microphone/camera usage
descriptions, signed APNs entitlement and appropriate background capabilities only
for an explicitly authorized signed build. The APNs topic/key scope must match
that build's bundle identity; the separate `.nativepreview` identifier is not the
existing production topic. Current Info.plist has none of these
and no `TeleTypTelNativeCallPushEnabled` flag, so `enable` refuses activation.
No APNs key, server setting, existing TestFlight target or production UI is changed.

Validation on 2026-11-07:

- Local Node/source/fixture checks: 21 passed, one macOS Swift runner skipped on
  Windows. Source checks are not Apple-framework runtime tests.
- [Unsigned run 42360587888](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42360587888)
  passed at revision `c8de38fa31c75ae58ca11f4d0605d48a8415669e`.
  Swift: 89 passed, including all twelve coordinator tests; 14 opt-in network
  tests skipped; no failures. Device Release compilation with Apple frameworks
  and pinned WebRTC passed, and the Debug fixture was excluded.
- Existing UI/chat regression tests: six passed on iPhone 16 Pro and six on iPad
  Pro 11-inch (M4), both Simulator 18.5, with no skips or failures. These are not
  real CallKit UI, camera, APNs delivery or background-call acceptance tests.
- The initial run `42360391265` passed the Swift tests but failed device compilation
  on two WebRTC audio category/mode argument types. The API takes typed Apple
  values, not raw strings; the correction is included in the successful revision.
- Evidence is retained locally under
  `artifacts/ios-native-evidence-42360587888/ios-native-check-1794044365489/reports/`.
  No TestFlight upload, live push registration, keys or server changes were used.

References: [Apple CallKit lifecycle](https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls),
[Apple PushKit reporting](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit),
[WebRTC audio activation API](https://webrtc.googlesource.com/src/+/refs/heads/main/sdk/objc/components/audio/RTCAudioSession.h).

## Contact presence step (runtime validation pending)

Historical preparation notes below predate the chat validation above. The
current unsigned run now also passes the presence unit tests and fictional UI
status checks. Real-device and multi-resource interoperability remain untested.

The next step adds XMPP contact availability to the read-only native list.
Initially prepared locally only, this step was subsequently approved for GitHub
publication on 2026-11-07. The publication commit skips automatic CI; no GitHub
tests, TestFlight upload or live server changes are part of this publication.

- Each contact starts with "Status onbekend", not an assumed offline status.
  Available, away, extended-away, do-not-disturb and explicit unavailable presence
  are displayed as text, not color alone. These are server-reported indications,
  not delivery/read receipts or a guarantee that a person can answer.
- Only contacts in a loaded roster with subscription `to` or `both` are updated.
  Unknown contacts, subscription requests, errors, malformed show values and
  presence addressed to another account/resource do not update availability.
- Resource availability is tracked separately: one device disconnecting does not
  hide another connected device. Bare-JID unavailable clears all resources.
  Aggregation prefers online, then away, extended-away and busy; this is a UI
  policy, not message routing. Presence priority is not used for routing here.
- Renaming preserves availability. Subscription revocation, removal, account
  switch, disconnect and background suspension discard it. Existing generation
  checks reject late callbacks from old sessions.
- Up to 64 resources per contact are retained. Overflow reports unknown until
  bare-JID unavailable, subscription reset, removal or a new session; it never
  converts incomplete resource knowledge into an offline claim. Presence before
  the first roster snapshot is ignored, not buffered. Directed presence from
  non-subscribed contacts, status messages and presence publishing controls are
  outside this step. JID normalization remains subject to the roster limitations.

Reference: [RFC 6121, presence](https://www.rfc-editor.org/rfc/rfc6121.html#section-4).
Eight new presence unit tests and a session-routing test are prepared; existing
model tests now include online contacts when checking lifecycle cleanup. The UI
fixture checks the textual online status before and after rotation. The existing
real-server roster test permits asynchronous presence changes but does **not**
test resource availability transitions. macOS Swift compilation, simulator tests,
real-server presence transitions and physical iPhone/iPad tests remain pending.
Earlier passing runs below do not validate this presence implementation.

Local validation on 2026-11-07: the three Node suites
`ios-native-foundation.test.js`, `ios-native-ejabberd.test.js` and
`native-login-http-fixture.test.js` passed 17 checks, with the macOS Swift test
skipped on Windows. Project generation includes the updated roster source
unchanged; scoped `git diff --check` also passed. These are harness/source and
fixture checks, not execution of the new Swift presence tests or live ejabberd.

## Authenticated XMPP foundation

### Read-only native contacts (2026-11-07)

The isolated native target now requests the XMPP roster after resource binding.
It shows contact names, bare JIDs and roster categories, with distinct loading,
empty and unavailable states. Categories are **not MUC chat rooms**. Contact
editing, phone address-book access and avatars are not implemented in that step.
Presence and opening direct chats are subsequent changes described above.

Roster results are correlated with the pending request. Pushes accept only an
absent sender or the authenticated account's bare JID, require one valid item,
and acknowledge accepted updates. Logout, account change, background suspension
and connection failure clear the list and invalidate previous callbacks. A
ten-second roster timeout shows unavailable without declaring XMPP disconnected.
Retry currently requires disconnecting and signing in again.

This bounded preview supports up to 100 contacts and 16 categories per contact;
the existing 64-KiB / 128-element XML-frame limits also apply. Oversize or invalid
data is rejected, never silently truncated. Exceeding the shared XML-frame limit
closes the session; exceeding roster-specific limits reports unavailable or an
IQ error. Pushes before a valid initial snapshot are rejected, not buffered.
Roster versioning, full JID normalization and extension-element interoperability
remain future work; this is not a full RFC 6121 conformance claim.

Unit tests cover correlation, spoofed senders, updates/removals, malformed data,
limits, timeout and stale account callbacks. The existing isolated HTTPS/XMPP
integration scenario now also checks a seeded fictional roster contact and
clearing on logout. The five-case UI suite now verifies a fictional contact in
portrait and landscape-left, and its disappearance on logout. The runtime
results for this step are recorded below, separately from earlier-stage evidence.

Protocol reference: [RFC 6121, roster management](https://www.rfc-editor.org/rfc/rfc6121.html#section-2).
The disposable loopback-only ejabberd fixture enables `mod_roster` and
`mod_admin_extra` and seeds a fictional entry through
[add_rosteritem](https://docs.ejabberd.im/developer/ejabberd-api/admin-api/#add_rosteritem).
No live server, user contacts, signing keys or TestFlight uploads are involved.

#### Roster validation evidence

[Isolated ejabberd run 42316644793](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42316644793)
passed on revision `53940c9`: seven real-transport tests and seven native
HTTPS-account-contract/XMPP tests, including the fictional roster entry and
clearing it on disconnect. A separate post-cleanup certificate rejection test
also passed. All sessions were released, the temporary CA was denied and removed,
and cleanup completed. This is ejabberd 26.09 plus a controlled HTTPS fixture,
**not the production PHP account API or a physical iPhone/iPad test**.

The first preview run
[42316644486](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42316644486)
passed 43 Swift unit tests and unsigned Release compilation, but failed two of
five iPhone UI tests: contact identification and locating the failure status.
The parent contact-container identifier was removed so it does not interfere
with per-contact identifiers; the UI helper now reveals status before checking
its text. The next run
[42317874080](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42317874080)
passed four of five iPhone UI tests. Its saved accessibility hierarchy confirms
the contact and connected status were present, but the helper scrolled downward
while the status was below the landscape viewport. Revision `09ef2c3` chooses
scroll direction from element and viewport geometry instead of a fixed direction.
Neither failed run reached the iPad suite; their failures must not be described
as a successful iPhone/iPad regression. The protocol/model code is unchanged
since the passing ejabberd run.

The final [preview run 42319989504](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42319989504)
passed on revision `09ef2c3`: 43 Swift unit tests, unsigned device Release
compilation and release-fixture exclusion. All five UI tests passed on iPhone
16 Pro and all five on iPad Pro 11-inch (M4), both with iOS 18.5 simulators,
including portrait and landscape-left. There were no UI failures or skips.
The 14 opt-in network tests were skipped in this preview run; their separate
passing ejabberd evidence is recorded above. Reports confirm `unsigned: true`
and `uploaded: false`. Physical-device validation remains pending; the working
TestFlight application and existing servers are unchanged.

Evidence is saved locally under `artifacts/ios-native-evidence-42316644793/`,
`artifacts/ios-native-evidence-42316644486/` and
`artifacts/ios-native-evidence-42317874080/`, with the final passing preview under
`artifacts/ios-native-evidence-42319989504/`. No test timeout was increased and no
assertion was removed to address these UI failures.

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

At this foundation revision the connection supplied readiness/loss detection only,
not a chat API. Roster, presence and direct-chat/foreground-return handling were
added subsequently as described above. Receipts, MUC, XEP-0198 resume and background
incoming calls are still not delivered by this preview. No existing TestFlight
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
  persistence, cold-start automatic login or production server defaults are introduced.
- Pressing login clears the password field, rechecks server availability, invokes
  the account API and only then starts XMPP. The existing single status panel
  distinguishes checking, account verification, XMPP negotiation and connected.
- The API account must match the requested JID and configuration; the connected
  callback must match that same account. Cancellation, account/server edits and
  connection loss invalidate the generation so stale callbacks cannot restore
  an online status or start the next step of an obsolete login.
- The connection can be explicitly cancelled or disconnected. At this adapter
  revision backgrounding stopped the connection and required manual re-login.
  The later bounded background/foreground-return step above supersedes that
  behavior. Neither implementation is background-call support.
- A 2FA challenge remains fail-closed and explains how to use the existing app;
  it never suggests disabling 2FA. Calls remain pending; the later contact list
  and direct-chat implementation are documented above.
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
