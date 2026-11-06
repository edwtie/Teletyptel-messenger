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
- End events are retained in a bounded in-memory list for acknowledgment by the
  future authenticated signaling adapter. This is not durable delivery yet.
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

## Build safety

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
reservations. The registration-only endpoint is disabled by default. Logout and
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

## Sources

- [Apple: responding to VoIP notifications](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit)
- [Apple: sending APNs requests](https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns)
- [Apple: token-based authentication](https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns)
- [Apple: regenerate provisioning profiles](https://developer.apple.com/help/account/provisioning-profiles/edit-download-or-delete-profiles/)
