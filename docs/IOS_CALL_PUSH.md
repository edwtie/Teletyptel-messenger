# iPhone incoming calls: PushKit / CallKit preparation

Status: 2026-11-06. Implemented locally as a disabled, non-releasable preview.
**Locked-screen calling is not yet fixed end to end.** The existing foreground
haptic implementation remains unchanged. Server-side registry/worker source code
has been added, but no live database, server configuration or GitHub secrets
were changed and no Apple push was sent during these checks.

## Apple setup evidence

The user enabled Push Notifications for `com.tiedragon.teletyptel` and created a
production topic-specific APNs key. The downloaded private key parses as EC P-256.
The newly downloaded distribution profile's CMS signature was cryptographically
checked (not a full certificate trust-chain validation). It contains the expected
application identifier, `aps-environment=production`, `get-task-allow=false`, no
device list, and an expiration on 2027-10-30. It is not yet installed in CI. Private
keys and provisioning profiles are ignored by Git. No private key data belongs in
this document, app bundle, public web directory or test reports.

## Native preview

- `VoipCallPlugin.swift` is concatenated into the staged AppDelegate. The native
  launch hook initializes only when `TeleTypTelCallPushEnabled` is true. PushKit
  registration additionally requires an explicit registration request. The normal
  build sets the flag to false: it does not register or interrupt existing calls.
- A VoIP callback reports to CallKit before completing, without waiting on the
  WebView, network, Face ID or JavaScript. Caller display is deliberately generic;
  calls are excluded from system Recents. Invalid/expired invitations are ended
  after reporting, rather than silently treating them as a background notification.
- UUIDs identify calls, deadlines limit ringing, duplicate reports do not replace
  an existing call, and only one call is admitted. Answer actions stay pending
  until the integration confirms media for the exact call UUID and SID. Recovery
  has at most 15 seconds; failure/timeout ends the call instead of pretending it
  connected. No automatic camera/microphone capture is added.
- End events use a bounded list. The native control follow-up below persists it
  when a separate call-control credential has been installed; without that
  credential it is still memory-only. This is not guaranteed signal delivery.
  Token updates/invalidation and native call state can be queried from the bundled
  Messenger only after its biometric access guard permits requests. Change events
  contain no tokens or caller data. Disabling unregisters locally and ends calls;
  `native-call-push.js` now connects native registration, renewal and revocation
  to authenticated Messenger login, Face ID recovery and sign-out. The settings
  control is hidden in normal builds and browsers. Explicit consent is requested
  only after the server confirms the current account, not automatically at login.
  Consent and a stable installation UUID are scoped to the configured server;
  consent additionally belongs to one account. Tokens are not put in localStorage,
  chat logs or URL parameters. Registration renews while active, on token changes
  and when returning to the app; this is not a background JavaScript keepalive.
- Signing out immediately clears the private UI and disables native registration,
  then serializes server revocation behind pending registrations. Native pending
  revocation survives app restarts if offline. The next same-account login retries
  it without re-enabling notifications. A different account cannot inherit consent
  or confirm the old account's revocation; the user must first sign in to that old
  account. The device-only revoke endpoint can clean up that account's installation
  after an old web session expires, without revoking other devices. Offline server
  revocation is not immediate: the existing 24-hour server lease remains a limit.
- No background audio workaround, TLS exception or biometric bypass is used.
  CallKit's audio callbacks alone do not implement a native WebRTC media engine.

## Authenticated reconciliation follow-up — 2026-11-06

The opted-in registry endpoint now accepts a bounded `reconcile` request. It
checks account, session binding, installation, registration lifetime and access
version, then matches each invitation by UUID **and** SID. Only minimal state is
returned. The endpoint and CLI worker share the required trusted policy loader;
there is still no deployed authoritative ejabberd policy adapter.

The preview client uses this endpoint after authenticated recovery and on native
events. A canceled/expired invitation or a handoff accepted by another device
ends the matching native ringing UI. Native declines are acknowledged only after
the authenticated server confirms a terminal state. A network failure retains the
pending event in the existing native in-memory queue. A losing device cannot end
another device's accepted reservation. Acceptance cannot silently move an already
reserved call to a different XMPP resource.

Foreground reconciliation uses a two-second timer only while work remains, with
failure backoff up to 30 seconds; it stops when hidden, offline or signed out.
This is **not background execution**. A late
response after logout cannot mutate native call state. Pending invitations defer
registration renewal to avoid unnecessary generation changes during recovery.
If the authenticated server reports no registration for this installation/session,
the client restores it before retrying, rather than repeatedly calling an endpoint
that will deny the obsolete binding.
Connected media is excluded from invitation-expiry reconciliation: the short
ringing deadline must not disconnect an established call.

This foreground reconciliation change did not connect native answering/media,
create invitations from ejabberd, or install the APNs worker. Native persistence
was subsequently added in the separate follow-up below. Neither change enables
the preview or removes the TestFlight release gate.
Locked-screen calling remains incomplete. Automated reconciliation tests use
isolated SQLite and mocked native/network interfaces, not physical iPhones.

Validation for this follow-up: 56 focused JavaScript tests passed; 33 PHP
reconciliation checks, 81 existing registry checks, the two endpoint guards and
the disabled/invalid-key PHP-to-Node transport checks passed. PHP syntax checks
passed. No live database, APNs request, signed build, deployment or GitHub
publication was performed for this follow-up.

## Native call-control follow-up — 2026-11-06

The preview now has a **native status/decline path**, independent of the WebView
and its Face ID-locked session. This is a real HTTPS client implementation, but
it is **not yet a working background telephone app**: incoming signaling, native
media negotiation/answering and deployment are still missing.

- After authenticated opt-in, the registration endpoint can issue a signed,
  narrowly scoped `call-control-v1` capability. It contains only the installation,
  registration generation, environment and expiry, not chat credentials. The new
  `call-control.php` endpoint accepts only invitation UUID/SID checks and end
  requests, not account login, media descriptions, invitations or acceptance.
  Generation, account-access version, revocation and the 24-hour device lease are
  checked again inside the registry transaction. Other accounts stay opaque;
  another device cannot cancel the winning handoff.
- Installation of that credential still requires the unlocked, trusted bundled
  Messenger and matching account consent. It is stored separately in the iOS
  Keychain using `AfterFirstUnlockThisDeviceOnly`, with iCloud synchronization off.
  It is never returned in the native snapshot. After a reboot, this protection
  requires one device unlock before background access becomes possible. The
  separate Face ID-protected chat credential is unchanged.
- Push handling reports to CallKit first, then schedules native reconciliation.
  Native answering requests and declines also trigger reconciliation. An ephemeral
  URLSession uses only the fixed configured HTTPS origin, no cookies or URL
  credentials, no redirects, system certificate validation, a 10-second resource
  timeout and a 16 KiB response limit. Every response batch is identity-validated
  before mutation. Logout/credential rotation invalidates in-flight callbacks.
- Each exchange requests a finite UIKit background task and releases it on
  completion/cancellation. Checks repeat only for a pending ringing/answer request
  within its existing short deadline. This does not keep the application running
  indefinitely or promise execution after iOS suspends it. No silent-audio loop,
  recurring idle timer or camera activation was added.
- Pending decline events are saved with the call-control Keychain record, bounded
  to 32. They are acknowledged only after a matching terminal server response.
  Offline events retry on a later wake/foreground event; a decline arriving during
  an outstanding check is followed up. Keychain write failure is reflected in
  `controlStorageReady`; persistence is not guaranteed when storage is unavailable.
  Active calls are not restored after process termination. A native media engine
  must define call recovery separately.
- Server acceptance still means only a handoff reservation. It never fulfills
  CallKit's answer action or starts audio. Established media is excluded from
  invitation polling. Native media must be integrated with CallKit audio activation
  before enabling any release.

Server opt-in additionally requires `TELETYPTEL_CALL_PUSH_NATIVE_CONTROL=1`.
This setting was not enabled, no live database/configuration was changed, no
APNs request was sent, and nothing was pushed to GitHub or TestFlight in this
follow-up. Tests: 63 focused Node checks (including explicitly labeled Swift
source-wiring assertions), 21 isolated preview-staging checks using dummy Facebook
configuration, 28 new isolated PHP capability checks, 8 native endpoint guards,
33 reconciliation checks, 81 registry checks, 2 existing endpoint guards and
disabled/invalid-key transport checks passed. These are **not Swift compilation,
Keychain runtime, PushKit delivery or physical locked-iPhone tests**.

### Remaining telephone-app release gates

1. Authoritative ejabberd/Jingle invitation/cancellation adapter and APNs worker
   deployment, including actual topic-key/provisioning verification.
2. Native authenticated call acceptance, SDP/ICE and WebRTC audio, CallKit audio
   activation/interruption handling, and safe foreground video/RTT handoff.
3. macOS compilation and native tests for redirect rejection, response limits,
   Keychain persistence, account changes and decline/network races.
4. Two-device tests: open, background, locked, reboot/first unlock, caller cancel,
   answer on another device, network loss and audio interruption. Never use 112.
5. Only after these pass: explicitly enable capabilities, sign with the new APNs
   profile, remove the release gate with evidence and publish an internal build.

Apple references: [VoIP push lifecycle](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit)
and [background-accessible device-only Keychain protection](https://developer.apple.com/documentation/security/ksecattraccessibleafterfirstunlockthisdeviceonly).

## Build safety (unchanged)

`IOS_CALL_PUSH_PREVIEW=1` generates `CallPush.entitlements` with production APNs and
adds audio/VoIP background modes in an isolated staging project. It is intended
for unsigned native compilation/simulator development only at this stage.
Normal builds do not request these capabilities. The build script refuses a
TestFlight upload with the preview flag enabled until the remaining integration
is implemented and validated. Production APNs entitlements are required by the
profile validator whenever the preview is requested. The old profile must not
silently be used for a future push-enabled release.

## Verification and remaining work

Automated tests cover payload limits, JWT signatures/rotation, fixed APNs origins,
expired requests, sanitized failures and signing/release guards. Swift assertions
in Node tests check source wiring only: they are not a Swift compile, simulator
execution, or a physical vibration test.

Local checks on 2026-11-06 passed: 23 focused APNs/build/haptic checks, 21 default
staging/Facebook checks, 34 preview staging/focused checks (overlapping suites),
and four incoming/audio-video layout checks in Chromium/WebKit. Staging used
dummy Facebook configuration, not local credentials. No Swift compiler/Xcode is
available on this Windows machine; compilation and real-device behavior are
still unverified. No APNs key was copied into either staging directory.

## Server registry follow-up

`CallPushService.php` now implements encrypted device storage, account/session and
generation binding, bounded invitations, a durable outbox and exclusive answer
reservations. The registration/reconciliation endpoint is disabled by default. Logout and
new authenticated session binding revoke registrations when present; existing
logins without push registrations retain their previous behavior. Authoritative
account blocking/version checks run again before sending. A required, fail-closed
policy adapter is the gate for trusted Jingle invitations, blocking/mute/DND and
the recipient's new full JID; **this real signaling adapter is still missing**.

The opt-in CLI worker can migrate explicitly or process one queued job using the
Node APNs sender over bounded stdin/stdout pipes. It is not installed/running.
Cancellation cannot recall an APNs request already sent: native expiry and
authenticated call reconciliation remain essential. See
`../services/call-push/README.md` for contracts, limitations and operator wiring.

Follow-up checks passed: 75 isolated PHP registry checks (including two simultaneous
answer processes), two endpoint disabled/HTTPS guards, and 28 Node transport/build/
haptic checks. Existing account-action (19), interpreter (49), native Facebook (223),
native Google (29), and offline OAuth-session tests also passed. These are local
fixtures, not a MySQL deployment, signed iOS run or live Apple delivery test.

Release gates, in order:

1. Connect and validate the registry/worker against authoritative server-side
   Jingle signaling and recipient preferences; validate the newly wired token lifecycle.
   Review/migrate MySQL and configure secrets only as a separate deployment step.
2. Reconcile wakeup with Jingle discovery and a new full JID; cancel old offers.
   Test multi-device acceptance, caller cancellation and call/account revocation.
3. Connect the native answer/end state to authenticated signaling and real media.
   Test locked-screen audio and Face ID behavior without silently unlocking chat.
4. Compile with Xcode and test iPhone/iPad cold start, foreground, locked, network
   changes, expired/duplicate invitations, system Focus, denied access and logout.
5. Validate the actual topic-specific key against `.voip` using a registered test
   device and a genuine test call, then securely update the CI profile and deploy
   the worker. Only then remove the preview upload block and release TestFlight.

## Total Conversation media contract — 2026-11-06

Background calling must preserve the requested conversation, not silently replace
TC with audio. The preview now carries `mediaProfile` from the trusted registry,
through its outbox and APNs, to the native incoming-call snapshot:

| Profile | Required negotiated contents |
| --- | --- |
| `audio` | audio |
| `video` | audio, video |
| `audio-rtt` | audio, RTT |
| `total` | audio, video, RTT |

The server-only invitation API accepts `mediaProfile` as its sixth argument.
An old boolean-only caller gets `audio` or `video`, never an inferred TC promise.
The future authoritative Jingle adapter must explicitly pass the verified offer's
profile. A repeated caller/SID cannot change profile. Push payloads with missing,
unknown or contradictory profile/video fields are rejected. Text-only `rtt` is
not offered through the VoIP push path; ordinary text notifications are separate.

`ensureSchema()` adds a nullable `media_profile` column only during an explicitly
requested migration. Historical unknown profiles remain null and are not guessed;
their queued jobs are skipped. No live schema migration was run for this change.

Native `mediaConnected` now requires the same call UUID/SID, exact
`negotiatedProfile` and the complete, non-duplicated `readyContents` set. An
audio-only or audio/video completion cannot complete a `total` invitation.
The trusted caller must derive readiness from actual media transport callbacks,
including an open negotiated T.140 channel, not from APNs delivery, a server
answer reservation or the push hint alone. These are transport requirements,
not a requirement to turn on the microphone or camera without user consent.
This bridge contract is not itself proof of media flow: the native engine and
authenticated answer adapter remain unimplemented and preview upload stays blocked.

Remaining TC implementation and device acceptance gates:

1. Native authenticated Jingle recovery/acceptance for a new full JID, binding
   each content and transport to the exact UUID/SID and verified remote offer.
2. Native WebRTC audio/video and reliable ordered T.140 data channel. Use the
   existing browser profile and Unicode/backpressure vectors; keep TC buffers
   separate from chat and clear them on every call termination/new call.
3. Integrate CallKit audio activation with the native audio device. Negotiation
   and transport preparation must not wait for audio playout that itself waits
   for answer fulfillment. Keep transport readiness and actual capture/flow
   diagnostics distinct; test this ordering on a physical locked iPhone.
4. Background/lock suspends camera capture as required by iOS; do not silently
   drop the negotiated video or RTT content or claim all channels are flowing.
   Resume allowed capture after foregrounding with the user's camera choice
   preserved. RTT transport survival and bounded buffering while locked require
   native implementation/testing; no lock-screen RTT UI is promised.
5. Verify iPhone-to-iPad TC with simultaneous audio, visible video and typed RTT;
   then repeat with camera off, locking, rotation, network loss, cancellation,
   a second call and another answering device. Interpreter/group interoperability
   is an additional test gate, not implied by this one-to-one media contract.

Local validation: 38 new PHP media checks plus the 81 registry, 33 reconciliation
and 28 native-control checks passed in isolated SQLite. The focused Node suites
passed 52 tests; one Swift runtime test was explicitly skipped on Windows.
`tests/native-call-media.test.js` compiles and executes the pure Swift contract
on macOS and is included in the iOS npm test command for the next authorized build.
Source-wiring assertions are not an iOS media test. No real push, server deployment,
GitHub publication or TestFlight release was performed.

Isolated preview staging with dummy sign-in configuration also passed 22 checks
(one repeated Swift-runtime skip). Sixteen existing browser T.140/TC isolation
tests and eight disabled/invalid native-control endpoint checks passed. No private
Apple key or user data was used in these checks.

## Native T.140 session follow-up — 2026-11-06

`NativeT140Session.swift` implements the native text codec and bounded session
state, independent of JavaScript timers and ordinary chat messages. It is bundled
into the staged app. It does **not** create a WebRTC peer connection or implement
authenticated Jingle signaling: the preview is still not a working background TC
implementation and remains blocked from TestFlight upload.

- The codec follows the existing browser project's T.140 profile: strict UTF-8,
  Unicode-scalar deletion, split CR/LF handling, ignored BOM/control characters,
  a 4096-byte block limit and a 32768-scalar text limit. Literal JSON stays text;
  no snapshot/control envelope is interpreted. This is not a new claim of full
  RFC 8864/8865 SDP or media-clock interoperability.
- Outgoing edits become plain UTF-8 blocks. At most one latest bounded pending
  snapshot is retained when the transport queue reaches 64 KiB or rejects a send.
  The accepted-send baseline advances only after transport acceptance, not before.
  A subsequent drain callback resumes from that baseline without replaying already
  accepted edits. Transport acceptance is not a remote delivery receipt.
- Every session binds UUID, SID and channel object identity. An incoming call owns
  its RTT session; end, logout, timeout, provider reset and report failure clear
  it and close its channel. Late callbacks from an old channel/call are ignored.
  A replaced call starts empty even if a SID were accidentally reused.
- `attachRtt`, `receiveRtt` and `rttTransportChanged` are native-only entry points
  for the future authenticated media adapter, not methods exposed to arbitrary
  web content. It must dispatch callbacks onto the main thread, provide the exact
  verified channel properties and call the drain hook when buffering falls.
  Attachment is permitted only after the user's answer request. A TC completion
  now also requires this actual attached RTT channel to be open; a JavaScript
  list containing the string `rtt` alone is insufficient.
- The bundled, unlocked UI can use `rttState` and `setRttText` with matching call
  UUID/SID. The latter returns `queued` plus current state; `queued: false` with
  `pending: true` means the latest text is buffered, not delivered. Ordinary push
  snapshots expose readiness/status only, not text. No RTT text is persisted to
  the Keychain, push payload, event log or server control endpoint.
- Malformed/oversized received text closes only the RTT session and exposes
  `invalid-text`; channel termination exposes `unavailable`. Audio/video do not
  get silently relabeled as complete TC. The future UI must show this degradation
  and recovery must negotiate a new, explicitly bound media session.

Shared fixtures in `tests/fixtures/native-t140-vectors.json` are consumed by both
the browser checks and the Swift test executable. Swift tests additionally cover
large edits, backpressure, send failure, Unicode limits, malformed bytes, wrong
channel properties, late callbacks, close-during-send and reentrant input changes.
`tests/native-t140.test.js` compiles/runs the Swift executable on macOS and is part
of the iOS npm test command. On Windows the native-runtime test is explicitly skipped.

Local results: 34 focused tests passed with two native-runtime skips. Isolated
preview staging with dummy sign-in configuration passed 26 checks with the same
two skips. These source/browser/staging checks do not prove Swift compilation,
WebRTC media flow, locked-screen behavior or Apple push delivery. No live worker,
database migration, APNs request, GitHub publication or TestFlight release was
performed for this follow-up; a compile-only publication was requested separately.

Next integration: instantiate the native WebRTC transport, connect verified
Jingle offer/answer and ICE, pass its negotiated reliable/ordered T.140 channel to
this session, and connect the TC renderer to the protected RTT bridge. Then test
actual iPhone/iPad media, including CallKit audio activation and camera restoration.

## Sources

- [Apple: responding to VoIP notifications](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit)
- [Apple: sending APNs requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
- [Apple: token-based authentication](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)
- [Apple: regenerate provisioning profiles](https://developer.apple.com/help/account/provisioning-profiles/edit-download-or-delete-profiles/)
- [Apple: camera interruption in background](https://developer.apple.com/documentation/avfoundation/avcapturesession/interruptionreason/videodevicenotavailableinbackground)
- [Apple: making and receiving VoIP calls](https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls)
- [XEP-0517: Jingle Synchronized Real-Time Text](https://xmpp.org/extensions/xep-0517.html)
- [RFC 8865: T.140 conversation over WebRTC data channels](https://www.rfc-editor.org/rfc/rfc8865.html)
