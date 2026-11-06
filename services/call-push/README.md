# iOS call-push transport (not activated)

This directory contains the APNs VoIP transport and an opt-in, one-job CLI worker.
`php/lib/CallPushService.php` provides a durable encrypted device/invitation/outbox
registry; `api/call-push.php` exposes only authenticated registration/revocation.
This is **not yet a complete incoming-call integration**. The preview client is
wired for account-bound consent, registration, renewal and revocation; no ejabberd
adapter, real devices or running worker have been connected. No notification is
sent on import. There is no automatic retry loop or public arbitrary-push endpoint.

## Contract

`createApnsSender({ keyId, teamId, bundleId, environment, privateKey })` accepts an
APNs P-256 private signing key read by the server from a protected file outside the
repository and web root. It is not the App Store Connect upload key. Never bundle
it with the app or print the key, bearer JWT or device tokens. Environment is
explicitly `production` or `sandbox`; host URLs cannot be supplied by a caller.

`sendIncoming(deviceToken, { callId, sid, hasVideo, expiresAt })` sends only a real,
currently ringing invitation. `callId` is a UUID, `sid` is a bounded opaque session
ID, and `expiresAt` is an integer Unix timestamp no more than 60 seconds away.
The payload excludes caller identity, chat, RTT, SDP, ICE and credentials. The
receiver must obtain authenticated call details from the server, not trust the
notification as authorization to join a conversation.

The sender uses HTTP/2 with system TLS verification, ES256 (P1363) provider tokens,
the `<bundle-id>.voip` topic, priority 10 and APNs expiration 0. Acceptance by APNs
does not prove delivery, vibration, CallKit presentation or a connected call. A
topic-specific key's permission for this VoIP topic still needs a real-device test.

Failures contain only allowlisted diagnostic reasons. `retryable` is advice to a
future worker, not permission to resend an ended or expired call. Before each
retry, recheck the authoritative call and registration. An Unregistered response
includes Apple's millisecond `invalidatedAt` timestamp: deactivate only the exact
registration generation that predates it, never a newly registered device token.
Transport timeouts have an unknown delivery outcome; deduplicate by call UUID.

## Durable registry and dispatch

- Tables are created only by an explicit migration, never by an HTTP request.
  SQLite tests and the existing PDO/MySQL architecture share the same schema.
  MySQL deployment and migration have not been exercised on the live database.
- Registration requires the authenticated active account, dedicated CSRF token,
  HTTPS, explicit consent and a valid opaque device UUID/token. A random session
  binding is stored hashed. At most eight devices per account; registrations
  expire after 24 hours and require renewal. Other sessions cannot list tokens.
- Tokens use AES-256-GCM with authenticated device/account/generation/environment
  context. A separate HMAC identifies duplicates. The storage key is independent
  of the Apple signing key. Losing/rotating it requires a planned registration
  migration or revocation and re-registration, not silently generating a new key.
- Every registration creates a new generation. Stale jobs and late Apple 410
  responses cannot revoke a replacement generation. Invalidation additionally
  checks Apple's timestamp; registration time rounds conservatively upward within
  its second to avoid deleting a token refreshed during that same second.
- Logout and successful new login/session binding revoke the previous session's
  registrations. A database failure does not pretend revocation succeeded.
  Account blocking or access-version changes suppress dispatch; unblocking alone
  does not reactivate registrations from a revoked version.
- The authenticated `revoke-device` action removes only the current account's
  installation UUID, including a registration left by an expired older session.
  It requires the same HTTPS/CSRF guards and cannot revoke another account's row.
  Successful responses include the authenticated account ID so a stale native
  account cannot register its token under a different cookie session.
- `inviteVerified` is a server-only interface, **not an HTTP action**. The required
  policy closure receives the call and operation (`invite`, `dispatch`, `read`,
  `accept`). It must consult authoritative signaling, recipient blocking/DND/mute
  state and, on acceptance, ownership of the newly authenticated full JID. Missing,
  throwing or non-boolean-true policy denies the operation. Never use an always-true
  policy in a deployment; that exists only in isolated tests.
- Invitations last at most 60 seconds, allow at most five new calls per caller
  per minute and one pending handoff per recipient. UUID/SID replay is idempotent;
  a replay cannot change the recipient or revive a canceled invitation. The DB
  mutex makes simultaneous acceptance select exactly one device/generation.
  `accepted` here is a **signaling handoff reservation**, not proof of connected
  media. The original invitation deadline still applies to this reservation.
- Each device/generation has one queued job per call. Dispatch rechecks account
  versions, registration lifetime, generation, invitation state and the policy.
  Network I/O occurs outside the DB lock. Cancellation can race an already-started
  APNs request; native expiry plus authenticated reconciliation must close such
  stale calls. Cancellation must not be sent as another VoIP push.
- `dispatching`/unknown-outcome jobs are never automatically resent after a crash
  or timeout. This intentionally favors no duplicate ringing over guaranteed
  delivery. A future retry policy requires reconciliation first. Calls/jobs are
  retained for at most a day when cleanup/dispatch runs, not as permanent history.
- `send.js` reads one bounded request from stdin, never command-line tokens. It
  reads the signing key from an external file and emits only the sanitized result.
  `CallPushTransport` invokes Node without a shell, bounds output/runtime, and does
  not expose stderr containing configuration paths. APNs acceptance is not delivery.

## Operator wiring (not performed)

Keep the normal app preview flag off. Before activating anything, complete the
release blockers below. New server environment variables are intentionally unset:

- `TELETYPTEL_CALL_PUSH_REGISTRY=1`: opt-in to the registration API only.
- `TELETYPTEL_CALL_PUSH_WORKER=1`: opt-in to the CLI worker/transport only.
- `TELETYPTEL_CALL_PUSH_STORAGE_KEY`: base64 of a securely generated 32-byte
  storage key, kept in protected server configuration, never public or in Git.
- `TELETYPTEL_CALL_PUSH_ENVIRONMENT`: explicitly `production` or `sandbox`.
- `TELETYPTEL_CALL_PUSH_NODE`: absolute path to the trusted Node executable.
- `TELETYPTEL_APNS_KEY_FILE`, `TELETYPTEL_APNS_KEY_ID`, `TELETYPTEL_APNS_TEAM_ID`:
  protected server-side Apple credentials. The key file must be outside this
  repository **and all deployed web roots** with restricted filesystem access.
- `TELETYPTEL_CALL_PUSH_POLICY_FILE`: trusted operator-owned PHP file outside the
  repository/web roots, returning a factory `Closure(PDO): Closure`. The returned
  policy must perform the authoritative checks above. No production adapter is
  supplied yet. It must not fetch arbitrary client-provided URLs or log tokens.

With reviewed configuration, `php services/call-push/worker.php --migrate` explicitly
creates the four tables; `--once` handles at most one eligible job. Running the
worker regularly is an operator deployment step, not done automatically here.
Do not enable the registration API before the migration is ready. The API returns
404 while disabled, 403 on HTTP, and generic failures without leaking credentials.

## Remaining release blockers

- Connect the server registry to actual authenticated ejabberd/Jingle signaling,
  including authoritative blocking, DND and mute state. The policy gate exists;
  its production adapter does not. No arbitrary client invitation may bypass it.
- Exercise the implemented native consent/token lifecycle on a real device.
  `native-call-push.js` binds it to login/logout with explicit settings consent,
  renewal and serialized revocation. Offline revocation is remembered natively;
  only a verified same-account server response clears it. Account switches do not
  inherit consent, and require finishing the previous account's revocation first.
  An expired web session bounds registration by its 24-hour lease, not immediate
  session-store detection; revocation is not guaranteed while offline.
- Recover a fresh XMPP resource after cold start. Existing Jingle discovery uses
  online full JIDs; delivering an old IQ to a vanished resource is not a solution.
- Connect answer/decline/end events to the same verified call. Ringing/answer
  deadlines must hold across restarts; failed recovery must end the native call.
- Validate native media and audio-session integration while locked. A WKWebView
  JavaScript timer is not a reliable background call/media implementation.

## Checks

Run `php php/tests/call-push-smoke.php`, `php php/tests/call-push-endpoint-test.php`
and `node --test tests/apns-call-push.test.js tests/call-push-transport.test.js
tests/ios-call-push.test.js` from the repository root. Tests use generated fake keys,
an isolated disposable SQLite database (including two competing PHP processes),
and mock APNs responses, not real signing keys/device tokens. They do not establish
Apple delivery, native vibration or real ejabberd interoperability.

See `docs/IOS_CALL_PUSH.md` for the staged native implementation and release gate.
