# iOS call-push transport (not activated)

## Authenticated ejabberd producer and signed journal (2026-11-15)

There is now a concrete journal-backed policy adapter, not an always-true policy
placeholder. `CallPushSignaling` accepts authenticated, short-lived metadata from
one pinned producer, queues the existing encrypted invitation registry and
requires a device/generation-bound proof before reserving a recipient resource.
An opt-in producer now exists in `ejabberd/mod_teletyptel_calls.erl` and has been
exercised against a disposable real ejabberd and the actual PHP ledger.
**It is not installed on the live server; no live migration, worker activation
or APNs delivery was performed, and background answering remains disabled.**
A signature alone proves key possession, not authenticated XMPP ownership.

The producer must independently observe authenticated ejabberd sessions, actual
Jingle call contents, current privacy/block/DND/mute decisions and resource
ownership. Do not expose its signing key or feed through a browser/mobile API.
`signaling-event.js` is only a signing helper. The Erlang module observes actual
c2s ownership, XEP-0353 proposals, privacy/blocking and persisted call preferences.
It writes signed metadata to a protected local spool consumed by `CallPushSpool`;
neither module sends APNs itself. This producer handles message intents, not
inspection of arbitrary existing Jingle IQ sessions. The app's direct-full-JID
call UI still needs to adopt the intent/recovery transport before cold-start media
can work. An old IQ is never replayed to a replacement resource.
[XEP-0353](https://xmpp.org/extensions/xep-0353.html) and
[XEP-0357](https://xmpp.org/extensions/xep-0357.html) are relevant integration
references; this is a bounded local-domain XEP-0353 subset, not a claim of complete
XEP-0353/0357 conformance.

### Producer, spool and native transport

The module is off unless explicitly loaded and configured. It monitors bound c2s
processes, emits offline transitions on termination or stream-management pending,
and refreshes leases every ten seconds. An old replaced process cannot revoke the
new resource. Privacy storage failures fail closed. Both directions and every
online resource are checked, including active privacy lists and DND presence.
An observed block/privacy change conservatively invalidates related pending calls
without waiting for renewal. Already in-flight remote delivery cannot be recalled.

An authenticated account can send an IQ to its own server with namespace
`urn:teletyptel:call-recovery:1`. `preferences` has exact `enabled` and `dnd`
boolean attributes and up to 256 empty `muted` children with local bare-JID `jid`
attributes. Preferences persist in Mnesia; missing preferences deny calls. They
express call policy, not APNs consent or a device registration. Legacy clients
that do not synchronize this policy cannot use this push path.

A live `propose` from an authenticated full caller JID to a local bare recipient
is retained for at most 45 seconds after both owners' policy checks. Metadata
preserves audio, video, audio-rtt and total; malformed/duplicate media is not an
offer. A newly bound recipient receives a fresh proposal for the still-live intent
at its new full resource. This is metadata reproposal, not replay of SDP/ICE or an
old session-initiate IQ. A `handoff` IQ on that actual recipient connection supplies
`callId`, `sid`, `deviceId` and `generation`; PHP independently verifies registration,
session/account ownership and access versions. Client-supplied `allowed` fields
never substitute for these checks.

The native XMPP connection now parses/buffers bounded live intents and can send
policy, resource-proof and proceed messages. Archived/delayed messages, carbons,
unknown recipients, session mismatches and media downgrades are rejected.
`NativeCallAnswerRecovery` sequences proof, authenticated reservation, then proceed;
errors/cancellation abandon an attempted reservation. Success is `awaitingJingle`,
not connected media. The registry client validates the returned UUID, SID, profile,
video flag, state and deadline.

**Remaining app integration:** this state machine is not yet called by the app's
`NativeCallController`/CallKit media driver. Cold-launch bootstrap still needs
narrowly scoped call credentials and revocation, matching the invitation to an
authenticated proposal, then fresh Jingle negotiation and media. Do not copy chat/
Face ID credentials into background storage as a shortcut. Existing login and
the old status/end-only capability are unchanged.

Deployment additionally needs `TELETYPTEL_CALL_SIGNALING_SPOOL`: an absolute,
non-symlink directory outside all web roots/repositories, mode 0700. Events and
the separate signing-key file use 0600. Compile against the exact ejabberd version
and explicitly add `mod_teletyptel_calls: {}` alongside `mod_privacy`/`mod_blocking`.
Mnesia tables are created on that explicit module activation, not by a public
request. The producer and draining worker need the same protected filesystem
identity; the web API need not access the spool. For different PHP/ejabberd users,
provision protected verifier-key copies separately rather than making a secret
group/world readable. No configuration or filesystem identity is installed here.

`php services/call-push/signaling.php --drain` consumes at most 128 ordered events
under a local consumer lock, verifies signatures and queues eligible invitations.
Bad/obsolete events are rejected without printing contents; transient storage or
rate-limit errors retain the current event. The configured worker drains the same
bounded batch before one-job dispatch. Capacity is bounded, partial writes stay
hidden, and a crash after ingest is safe to replay. Keep the drainer timely: leases
expire instead of trusting a stalled producer. This is a single-node/local-domain
adapter; cluster failover is not established.

### Event contract

`signEvent(event, {key, environment, domain, issuer})` returns JSON fields
`payload` (canonical base64 of a JSON envelope) and `signature` (HMAC-SHA256).
The signed body contains `version:1`, the pinned issuer, integer Unix timestamp,
a random 32-hex nonce and the event. Authentication separates domain, issuer,
environment and protocol version. The PHP receiver admits at most 16 KiB, pins
one local domain and uniquely resolves bare JIDs to existing accounts. It does
not accept foreign-domain federation or arbitrary Unicode localparts in this
initial adapter. No message body, RTT text, SDP, ICE or password is stored.

| Type | Required event fields besides `type` | Meaning |
| --- | --- | --- |
| `resource` | `jid`, `online`, `revision`, `expiresAt` | Full JID observed on an authenticated connection; online is a boolean |
| `policy` | `owner`, `peer`, `allowed`, `revision`, `expiresAt` | Current combined blocking/DND/mute/privacy decision for two local bare JIDs |
| `offer` | `caller`, `recipient`, `sid`, `mediaProfile`, `revision`, `expiresAt` | Validated full caller JID, bare recipient and immutable `audio`, `video`, `audio-rtt` or `total` |
| `end` | `caller`, `recipient`, `sid`, `actor`, `revision` | Cancellation from the original caller resource or an authorized recipient resource |
| `handoff` | `callId`, `sid`, `jid`, `deviceId`, `generation`, `revision`, `expiresAt` | Resource proof observed from the authenticated recipient, bound to the current registration |

Unknown fields are rejected, not silently retained. Events may be at most 30
seconds old or five seconds ahead. Resource and policy leases last at most 30
seconds, handoff proofs 15 seconds, and offers 60 seconds, bounded by both issue
and receive time. Both directional privacy leases are required. The producer
must refresh authoritative observations before expiry; no app timer can assert
that a disconnected resource is still online. Revisions must increase for each
resource, privacy pair, call or device handoff and survive producer restarts.
Missing/stale/reordered observations fail closed. Exact envelope retries are
idempotent; reusing a nonce for different content is rejected.

Privacy decisions and resources are bound to account access versions. Blocking,
logout/resource loss, a denial, an old registration generation or an expired
lease cannot authorize a push. Denials cancel queued jobs under the registry's
existing mutex. End-before-offer tombstones prevent delayed offers resurrecting
a call. A status/end bearer capability is **not** promoted into XMPP or answer
credentials. No additional VoIP push is sent to cancel a call, consistent with
[Apple's VoIP notification lifecycle](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit).

Only the normal HTTPS/account/CSRF-authenticated registry route gains an `accept`
action, and only with `TELETYPTEL_CALL_PUSH_POLICY=signaling-v1`. Its exact body
is `action`, `callId`, `deviceId`, `generation`, `fullJid`. It additionally requires
the matching signed handoff, current device lease and the same web-session
binding. Competing devices select one winner atomically; a loser cannot replace
the winning resource or end that reservation. Acceptance reserves signaling;
it is not proof of media connection and retains the invitation deadline.
The native status/end-only endpoint remains unchanged. No
`backgroundAnswerRecovery:true` capability is advertised by this change.

### Explicit operator setup (not executed on the live server)

In addition to the existing independent storage key/environment, the new mode
requires:

- `TELETYPTEL_CALL_SIGNALING=1` and `TELETYPTEL_CALL_PUSH_POLICY=signaling-v1`.
- `TELETYPTEL_CALL_SIGNALING_DOMAIN`: the actual local XMPP domain.
- `TELETYPTEL_CALL_SIGNALING_ISSUER`: pinned producer identifier.
- `TELETYPTEL_CALL_SIGNALING_KEY_FILE`: protected external file containing base64
  of a separately generated 32-byte key, not the token-storage or Apple key.
  The file must be outside the repository and every web root. Unix permissions
  must exclude group/other access; equivalent Windows ACLs remain an operator
  responsibility. Never put actual keys in these instructions or command lines.

Reviewed deployment commands, using protected server configuration, are:

```text
php services/call-push/signaling.php --migrate
php services/call-push/signaling.php --ingest < signed-server-event.json
php services/call-push/signaling.php --enqueue
```

The CLI is not a public HTTP handler. Migration is explicit and creates the
registry plus five journal tables; no HTTP request performs DDL. Ingest writes
one authenticated event and queues at most eight eligible invitations. Enqueue
repairs a crash between recording an offer and linking its registry UUID without
creating a second invitation/job. The existing worker's `--once` also repairs
this bounded queue when the new policy is selected, then dispatches at most one
job. It does not automatically retry an unknown APNs delivery outcome. No daemon,
scheduled task, firewall rule or service configuration is installed by this code.

Local checks include real Node-to-PHP signature interoperability, isolated SQLite
state transitions, old-generation/revocation/expiry/reordering cases and two
independent PHP answer processes. Run `node --test tests/call-push-signaling.test.js`
or `php php/tests/call-push-signaling-test.php`. Mock dispatch is explicitly
injected; no actual Apple request is made. Linux CI separately checks these
server paths. Live MySQL migration, producer installation, native cold-launch
bootstrap, fresh Jingle/media negotiation and locked-device acceptance remain open.

Validation snapshot (2026-11-15): the Windows PHP fixture passed 89 assertions,
including a two-process answer race, and the focused Node server selection
passed 20 tests with zero skips. PHP/Node transport rejection checks and syntax
checks passed too. These results use synthetic registrations and do not establish
live APNs delivery, MySQL concurrency or an answered call on a locked iPhone.
The same focused Linux checks passed in
[GitHub run 43715442019](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43715442019)
at `ee6fbd3`: 20 Node tests, zero failures/skips, the registry/reconciliation/
control/media regression fixtures, endpoint guards and PHP syntax checks.

The new disposable integration runs with `node scripts/check-call-signaling-ejabberd.js`
(Node 22+, PHP SQLite and Docker). It compiles the actual module in a digest-pinned
ejabberd image, creates fake accounts, tests offline intent/new-resource proof with
the actual PHP reservation, injects mock dispatch, checks DND/mute/XEP-0191,
cancellation/spool tampering and removes its temporary container. The initial
integration and 31 selected Swift tests passed in
[run 43718394685](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43718394685).
These are not real PushKit delivery or cold-launch audio/video tests.

The older baseline below describes the original transport. Statements that no
adapter exists refer to that baseline and are superseded by the opt-in producer,
not a complete, activated ejabberd/PushKit integration.

This directory contains the APNs VoIP transport and an opt-in, one-job CLI worker.
`php/lib/CallPushService.php` provides a durable encrypted device/invitation/outbox
registry; `api/call-push.php` exposes authenticated registration/revocation and
device-bound invitation reconciliation, not arbitrary invitation creation/sending.
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
- `reconcile` accepts at most 64 UUID/SID pairs in a 16 KiB JSON request, with
  HTTPS, CSRF, account, session and current installation checks. It returns only
  invitation state, never caller identities, device tokens or media descriptions.
  Native declines cancel queued jobs; cancellation is never another VoIP push.
  A device that lost an answer race cannot end the winning device's reservation.
  `CallPushPolicy` is shared with the worker and fails closed when not configured.
  The client retries pending reconciliation only while visible/authenticated.
  This is not a background keepalive or a native media/signaling implementation.
- The separately opted-in `call-control.php` endpoint accepts a signed,
  generation-bound `call-control-v1` bearer capability instead of a chat cookie.
  It exposes only the same minimal UUID/SID invitation checks and declines. It
  rechecks registration expiry, environment, revocation and account access under
  the registry lock. No accepting, media negotiation, arbitrary push or chat API
  is exposed. Capabilities cannot exceed the 24-hour device lease; background
  renewal is not implemented. Clients must return to authenticated foreground
  registration to renew. Never log the Authorization header or token response.
  The Swift preview keeps this capability in a separate device-only Keychain item
  and uses bounded native HTTPS requests. This is not complete native calling.
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
- `TELETYPTEL_CALL_PUSH_NATIVE_CONTROL=1`: additionally issue scoped capabilities
  and allow native invitation status/decline requests. Requires the registry flag
  and real policy adapter; keep disabled until native compilation/tests pass.
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

TC invitations must use the explicit sixth `inviteVerified` argument `total`
(`audio-rtt` for audio with RTT). `hasVideo` alone only describes audio/video and
does not imply RTT. The durable `media_profile` is passed unchanged to APNs and
native state, checked for consistency and immutable for a caller/SID. The explicit
`--migrate` operation adds this column to old schemas; unknown historical profiles
are not sent. No migration is performed by HTTP endpoints. The native answer bridge
requires the negotiated profile and all its ready contents; the actual native
Jingle/media adapter is still required before background TC can work.

Run `php php/tests/call-push-media-test.php` for isolated media-profile checks and
`node --test tests/native-call-media.test.js` for source guards and the macOS-only
Swift contract runtime test. The latter is explicitly skipped on Windows, not
counted as proof of physical iOS behavior.

Run `php php/tests/call-push-smoke.php`, `php php/tests/call-push-endpoint-test.php`
`php php/tests/call-push-reconcile-test.php`, `php php/tests/call-push-control-test.php`
and `php php/tests/call-control-endpoint-test.php`,
and `node --test tests/apns-call-push.test.js tests/call-push-transport.test.js
tests/ios-call-push.test.js tests/native-call-control.test.js tests/native-call-push.test.js`
from the repository root. Native source-wiring assertions are not Swift compilation
or Keychain/URLSession runtime tests. Tests use generated fake keys,
an isolated disposable SQLite database (including two competing PHP processes),
and mock APNs responses, not real signing keys/device tokens. They do not establish
Apple delivery, native vibration or real ejabberd interoperability.

See `docs/IOS_CALL_PUSH.md` for the staged native implementation and release gate.
