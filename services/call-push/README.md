# iOS call-push transport (not activated)

## Logout revocation and production-APNs preparation (2026-11-16)

PHP logout/session replacement, explicit device revocation and registration
rotation can now durably enqueue the exact old device generation in the same
transaction that removes/replaces its registration. After commit, a bounded
HTTPS request asks the actual scoped ejabberd backend to revoke that generation;
the backend stops its live c2s processes and denies unused bootstrap nonces.
Other generations and ordinary account sessions remain untouched. Network I/O
never holds the registration transaction. A missing queue prevents a false
successful logout; an unavailable remote server leaves a durable pending event
for retry rather than claiming remote delivery.

The opt-in is `TELETYPTEL_CALL_SCOPE_REVOCATION=1` on PHP and ejabberd, with
`TELETYPTEL_CALL_SCOPE_REVOCATION_URL=https://<internal-host>:<tls-port>/call-revocations`.
The listener handler is `teletyptel_call_revoke`. Keep this operator route on a
private listener/firewall, not the public chat route. It requires actual TLS,
bounded POST data and a purpose-separated HMAC under the protected bootstrap
key. Client forwarding headers, generic account authentication, expired/altered
permissions and GET requests cannot revoke anything. The acknowledgement pins
the event ID. Authenticated retries are idempotent. Configure
`TELETYPTEL_CALL_SCOPE_CA_FILE` for a private trusted CA; certificate validation
is never disabled. Provision the queue explicitly through the registry migration
or `php services/call-push/revocations.php --migrate`. The latter's `--once`, or
the opted-in push worker, retries pending events; schedule it at short intervals.

With a healthy listener, logout does not wait for a 25-second media lease to
expire. During a transport failure it is **not immediate remote revocation**:
the generation is removed locally and new leases are denied, but an already
issued lease remains the bounded fallback. Process/network failures cannot be
described as guaranteed immediate delivery. This does not yet add an immediate
outbox event to every independent admin account-blocking implementation.

The combined `check-call-active-ejabberd.js` fixture now performs actual PHP
web-session logout after more than 45 seconds of accepted-call renewal. It
verifies synchronous HTTPS acknowledgement, c2s closure within three seconds,
refused renewal and survival of the other account sessions. It also exercises
cleartext, forwarding-header, signature, environment, method and lifetime
rejection. `php php/tests/call-scope-revocation-test.php` covers durable rollback,
transport failure/retry, rotation and acknowledgement correlation. These tests
use generated keys, an isolated database and a disposable server, never real
users or Apple delivery.

`scripts/configure-apns-local.ps1` verifies the chosen APNs P-256 signing key and
copies it to an ACL-protected directory outside source/web roots. It writes only
operator metadata and the protected key path to `apns-production.json`. Set
`TELETYPTEL_CALL_PUSH_APNS_CONFIG_FILE` to that file in the worker environment;
the sender then loads the production configuration without publishing the key.
No global Windows environment, Apache configuration or running worker is changed
by this helper. `node services/call-push/check-apns.js` checks the key and a
certificate-verified Apple HTTP/2 connection, **not provider authentication or
device delivery**. It sends no VoIP invitation or fake device token.

The separate `ios-native-push-test.yml` workflow compiles an explicitly opted-in,
unsigned native push-test target for `com.tiedragon.teletyptel`, with production
APNs entitlements, audio/VoIP modes and the existing cold-call laboratory gate.
It does not sign, upload or replace TestFlight. Defaults remain the isolated
non-push preview, and the normal TestFlight workflow is unchanged. Production
provider settings cannot silently be copied from the different preview bundle.
Actual activation still requires deployment of this server chain, a signed native
test build using the correct production profile, explicit device consent and a
real PushKit token. Only a real incoming call can establish Apple/topic/device
acceptance and locked-screen CallKit/media behavior.

## Active-call lease continuation (2026-11-16)

The disabled laboratory bridge now has a separate `tcl1` active-call permission.
The initial SASL credential is still single-use and limited to twenty seconds.
Only the reserved winning resource, after its server-acknowledged `tca1` answer
and actual observed `proceed`, may request continuation. The real ejabberd
producer observes that resource and subsequent scoped keepalive IQs, checks both
live resources and their privacy/preferences, and emits signed short-lived
`active` metadata. It never replays an already-accepted proposal to new devices.

The PHP ledger requires the accepted registry winner, exact call/SID, resource,
nonce, generation, current account versions, consent/device expiry, current
mutual policy and an unexpired previous bootstrap/active authorization. Active
events extend only this accepted call; ordinary unanswered invitations retain
their original expiry. The cookie-free broker's `lease` action then signs an
independently purposed permission for at most 25 seconds. It cannot authenticate
a new XMPP stream or alter the original peer, media or scope. Renewal cannot
resurrect an expired, ended, revoked or differently answered call.

Both native stream deadlines are extended only after ejabberd acknowledges the
signed lease. The native recovery requests an initial lease before returning a
media offer, renews every eight seconds and rechecks local consent/context.
Denied renewal, cancellation or expiry stops the scoped connection and ends the
call; no old timer may terminate a newer acknowledged lease. These are source
changes behind the existing laboratory gates, not APNs activation.

Source `fde7b5e` passed the
[isolated server/core run](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43878040142):
42 PHP active-lease guards, 137 actual scoped TLS/WSS checks, 70 combined real
producer/broker/renewal checks and 107 selected Swift tests with zero failures.
The combined conversation remained scoped beyond 45 seconds, survived old expiry
timers and closed on an actual server preference change. Native tests cover
lease context, acknowledged stream extension, expiry, cancellation and a clocked
call past its original invitation deadline. This is not real APNs or physical
CallKit/WebRTC acceptance.

The [unsigned iPhone/iPad SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43878046114)
for the same source passed 246 selected Swift tests and native RTT checks in
each job, plus generic iOS device-SDK compilation. Both downloaded reports say
`unsigned: true`, `uploaded: false`, `deviceCompiled: true` and `uiTests: []`.
Local targeted Node checks passed 86 tests with one explicit macOS-only skip.
No signed build, TestFlight distribution, real-device capture or APNs delivery
is implied by these results.

The combined isolated fixture is `node scripts/check-call-active-ejabberd.js`.
It uses the actual producer, TLS c2s backend, PHP ledger/broker and repeated
acknowledged renewals beyond both the 20-second bootstrap and 45-second invitation
deadlines, then verifies server preference revocation closes that stream. It
does not use native WebRTC, CallKit hardware or APNs. PHP lifecycle guards are
`php php/tests/call-active-lease-test.php`. Explicit schema provisioning must now
include both `CallPushSignaling::ensureSchema()` and
`CallPushBootstrap::ensureSchema()`; HTTP requests still do not migrate tables.

Still required: deployment of the logout/device revocation path described above,
immediate independent admin account-event integration, key/schema/worker setup, a combined native-media
transport run and signed physical-device acceptance. SQL logout already prevents
new leases, but an issued lease can remain usable for up to 25 seconds unless the
live server is explicitly notified. Do not describe that as immediate revocation.
The real producer closes an active scoped stream on its observed policy/offline/
end events. No production container, APNs flag, route, entitlement or TestFlight
upload is changed here.

## Native push-to-media laboratory bridge (2026-11-16)

This checkpoint supersedes the older no-broker/no-native-wiring statements below.
It is **not a production background-call release**. The new chain is:
app-delegate-owned singleton, restored explicit device consent, PushKit callback,
immediate CallKit report, answer-time cookie-free broker, one-shot scoped WSS,
fresh proposal, device/resource proof, reservation, signed answer authorization,
proceed, fresh matching Jingle
and the existing incoming native WebRTC/media gate. The UI observes that same
runtime; appearing/disappearing views must not create a second CallKit owner.
CallKit audio activation still controls the microphone. Permission requests and
camera capture are not introduced on a locked/background screen.

The broker at `api/call-recovery.php` accepts only bounded POST/JSON and a separate
`tcd1` device authorization. It cannot log in to chat, retrieve history, list calls
or send arbitrary invitations. Enrollment occurs only inside the existing
authenticated, CSRF-checked, consented device registration. The encrypted token
contains only the push-specific session binding and device/account scope, not a
web session cookie, XMPP password or biometric credential. Every request checks
the current registry generation, expiry and account access version. Logout,
registration rotation and revocation prevent subsequent broker access. Failed
enrollment revokes the newly registered device instead of silently leaving it
enabled. The old status/end-only control bearer is unchanged.

The broker issues a separate `tca1` answer permit only after the actual reservation
and resource proof are current, under the same registry lock. It pins the winning
call/device/generation/full resource/nonce/peer/profile and cannot extend the
original bootstrap expiry. The native chain must obtain an XMPP acknowledgement
of this permit before `proceed`. The authentication backend itself blocks
`proceed` and Jingle media negotiation until that acknowledgement: a modified
client cannot bypass the reservation by merely following a different UI sequence.
A permit for another nonce/resource is refused. This does not restrict ordinary
full-account XMPP clients as though they used these call-only credentials.

**Bootstrap limit:** without the separately verified active lease described
above, the scoped stream closes at its signed twenty-second deadline. A prepared
or connected media session by itself is not an exemption. This laboratory chain
cannot yet be offered as a reliable production or emergency service. The native registry challenge
still does not advertise background-answer readiness, so ordinary app enrollment
cannot accidentally turn this experiment into a released feature.

The extra server opt-in is `TELETYPTEL_CALL_RECOVERY_LAB=1`, together with the
existing registry and `signaling-v1` settings. It needs an independently provisioned
`TELETYPTEL_CALL_BOOTSTRAP_KEY_FILE`, base64 32 bytes, protected outside the
repository/web root. Schemas must be explicitly provisioned; HTTP does not migrate
them. No flags, files, keys, production configuration or native entitlements are
activated by this source change. Native cold restoration additionally requires
both native push and `TeleTypTelNativeCallRecoveryLabEnabled`; neither is added
to the preview plist. Do not enable them for normal TestFlight users.

Scoped WSS uses a separate `/xmpp-call-websocket` route handled by
`teletyptel_call_ws`. The stock websocket path does not establish physical TLS
proof in the c2s state. The new adapter requires an actual `fast_tls` HTTPS socket,
strips any user-supplied internal attestation, then adds a five-second, single-use,
server-HMAC proof bound to the actual peer endpoint. The authentication backend
verifies/consumes it through c2s initialization; it never trusts a client-provided
`Forwarded`/`X-Forwarded-Proto` header. Direct TLS c2s remains supported. A proxy
must also use verified HTTPS to this dedicated listener; plaintext proxy upstreams
are deliberately refused. Compile/test the adapter against the exact ejabberd
version, with `mod_ping` available. No route is installed here.

Local automated checks include the actual encrypted-device broker and proof/
reservation database path, fail-closed HTTP ingress, real TLS/WSS scoped auth and
cleartext/spoofed-header rejection. Swift tests cover restored-consent rejection,
generation/expiry/account scope, no general-credential conversion, cancellation
and the cold proof/reserve/proceed/fresh-offer order. Unsigned SDK checks are not
real APNs or locked-screen iPhone acceptance.

Validation of source `b77ec56` passed the
[isolated server/core workflow](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43868902921):
105 actual TLS/WSS authentication, scope, answer-permit and rejection checks on
disposable ejabberd 25.10; 24 PHP broker checks; five fail-closed HTTP ingress
checks; existing registry/producer regressions; and 103 selected Swift core tests.
The [unsigned SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43868908105)
passed 242 selected Swift tests and native RTT checks in each iPhone/iPad-labelled
job, with successful generic iOS device-SDK compilation. Both reports contain
`uploaded: false`, `deviceCompiled: true` and `uiTests: []`. This is component and
contract evidence, not one combined real-APNs-to-CallKit-to-hardware-media test.
The native flags, live ejabberd/Asterisk containers, production server settings
and TestFlight distribution were not changed.

Before activation: wire immediate server-side scope revocation to PHP logout/account
events; jointly exercise the real broker, protected WSS route, producer and native
media transport; provision the correct APNs VoIP topic/entitlements and explicitly
enroll test devices; then test signed foreground, locked, system-terminated,
cancelled and competing-device calls on actual iPhone/iPad hardware. This source
does not claim reliable delivery after a user force-quits the app.

## Scoped cold-call authentication foundation (2026-11-16)

`CallPushBootstrap` and `ejabberd_auth_teletyptel_calls.erl` introduce a separate
single-use, HMAC-authenticated `tcr1` credential. This is **an isolated, opt-in
foundation, not a working cold-launch/APNs release**. No public bootstrap route,
device bootstrap broker, live migration, ejabberd configuration, push activation,
provisioning change or TestFlight upload is included.

Issuance requires the existing authenticated account/session binding, current
device registration and generation, a still-ringing invitation, current account
access versions and the trusted producer's live caller/policy leases. The
credential pins issuer, environment, domain, owner, full caller JID, call UUID,
SID, device/generation, requested media profile, one resource and an expiry of
at most twenty seconds. A separate 32-byte key is required; the producer key and
ordinary status/end control credential are not reused. Issuance is transactional,
limited to three attempts per call/device and does not reserve or answer a call.

The actual ejabberd backend requires an existing account and encrypted c2s SASL1
authentication. Generic password checks cannot redeem these grants. It disables
auth caching, consumes nonces atomically in durable Mnesia storage, fixes the
bound resource and terminates at the signed deadline. Early authenticated-packet
hooks reject forbidden actions before normal server handlers; output filtering
also covers server-generated stanzas. Only bounded matching-peer/SID JMI/Jingle,
correlated IQ replies, server ping and matching resource-handoff metadata pass.
Normal chat, roster, MAM retrieval, presence, account registration/removal, policy
changes, other peers/SIDs and stream-management resumption are denied. Requested
TC cannot silently downgrade to audio. Ordinary password authentication remains
separate. SASL2 and FAST modules deliberately make this bootstrap fail closed;
their compatibility has not been established.

`revoke_device/3` is a trusted local Erlang operation, not a user API. It closes
consumed streams and transactionally denies still-unredeemed grants for that
device generation. **Real logout, account/policy revocation and registry events
are not yet connected to this operation**. Already-issued credentials otherwise
remain usable until their short signed expiry. Key rotation, multi-node shared
nonce/revocation storage, WSS/proxy behavior and plugin combinations require
deployment-specific validation; this single-node fixture is not proof of them.

The native `NativeCallBootstrapGrant` validates bounded, context-matching response
metadata and payload consistency, without claiming to authenticate the server's
HMAC locally. A future authenticated, certificate-verified broker must supply
the response; ejabberd verifies its signature during SASL. The new call-only
stream initializer consumes the credential in RAM, binds only its signed resource
and closes on expiry. It never creates a general account credential, loads chat
history or persists this secret in Keychain. It is not yet wired into cold app
launch or the CallKit media driver.

Run `php php/tests/call-bootstrap-test.php` for the issuer guards and
`node scripts/check-call-bootstrap-ejabberd.js` for actual isolated TLS/SASL,
stanza isolation, nonce replay, deadline and revocation checks. The latter uses
only a digest-pinned disposable ejabberd, generated CA/keys, fictional accounts
and loopback-published ports; cleanup removes only its own container. It neither
uses nor modifies the running TeleTypTel services. Native metadata/handshake tests
are `NativeCallBootstrapTests`; SDK compilation is a separate unsigned CI gate.

Validation of source `015189a` passed the
[isolated server/core run](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43855684916):
39 PHP issuance checks, the existing registry/recovery regressions, the real
signed-spool/resource-proof chain and 79 actual scoped-authentication checks on
ejabberd 25.10 over verified TLS. The macOS core job passed 95 selected Swift
tests. The separate
[unsigned iPhone/iPad SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43855690437)
passed 234 selected Swift tests with zero failures in each job, native RTT tests
and the generic iOS device-SDK build. Both reports say `uploaded: false` and
`uiTests: []`. These are not physical-device, camera/audio, WSS-scoped-auth or
end-to-end cold-launch/APNs acceptance results.

Remaining sequence: cookie-free revocable device bootstrap authorization;
authenticated broker and real event-driven revocation; cold-launch CallKit
ownership; an explicit active-call lease beyond the initial twenty-second
bootstrap; fresh Jingle/media handoff; then signed physical-iPhone locked-screen
and terminated-app tests. Keep recovery capability and native push disabled
until these gates pass. A bootstrap grant is not media readiness and must not
be used as a persistent call session or ordinary autologin token.

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
inspection of arbitrary existing Jingle IQ sessions. Native call buttons now use
intent routing for supported local accounts after acknowledged privacy policy;
foreground legacy fallback remains separate. Cold-start media still requires
server-enforced scoped authentication and native bootstrap. An old IQ is never
replayed to a replacement resource.
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
policy, resource-proof and proceed messages. Archived/delayed delivery, carbons,
unknown recipients, session mismatches and media downgrades are rejected.
An empty recipient-bound legacy archive marker attached by ejabberd to a live
message is permitted; a marker is not a forwarded MAM result or delayed delivery.
`NativeCallAnswerRecovery` sequences proof, authenticated reservation, then proceed;
errors/cancellation abandon an attempted reservation. Success is `awaitingJingle`,
not connected media. The registry client validates the returned UUID, SID, profile,
video flag, state and deadline.

**Warm app integration (2026-11-15):** `NativeCallController` now connects the
CallKit media driver through `NativeCallMediaGate` and `NativeWarmCallSession`.
The incoming invitation is recorded in memory before the immediate CallKit report;
no network requests or media preparation delay that report. Answering uses only
the already authenticated account and HTTP session still in RAM. A separate XMPP
connection skips roster, chat delivery, presence announcements and discovery.
This client-side isolation is not a server-enforced call-only credential.

The sequence is fresh bind, authenticated matching proposal, resource proof,
authenticated reservation, authoritative caller/recipient comparison, proceed,
fresh Jingle offer and the actual incoming WebRTC negotiator. Only the explicit
`425 resource_proof_pending` is retried (at most twelve attempts); HTTP approval
is still not media readiness. Logout/account changes, revoked consent, device
generation changes, DND/block/mute, deadlines and cancellation stop preparation.
Declining before answer also attempts authenticated registry cleanup. Offline
cleanup may fail; existing server deadlines remain the fallback.

Capture waits for verified negotiation preparation. The microphone stays disabled
until CallKit audio activation; a late-created track inherits the current mute,
hold and audio-session state. Background operation never presents new microphone
or camera permission prompts, and the camera stays paused until foregrounded.
The complete requested profile, ICE/tracks and RTT channel must still be ready
before answering succeeds; the app never substitutes audio for requested TC.

**Not a completed cold-launch release:** a fully terminated app still needs
narrowly scoped background authentication/bootstrap and revocation. Do not copy
chat/Face ID credentials into background storage as a shortcut. The regular
outgoing call UI and acknowledged privacy-policy synchronization now use the
compatible JMI path for supported local accounts, but do not supply cold-launch
authentication. Native APNs
enrollment and the backend recovery capability remain disabled: no live APNs,
server settings, entitlements or provisioning were enabled by this change.
The old status/end-only capability cannot log in or reserve an answer. Signed
locked-screen/cold-start iPhone tests remain mandatory before activation.

Validation: source revision `c932d5b` passed the
[unsigned iPhone/iPad SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43725280351):
206 selected Swift tests with zero failures in each matrix job, the native RTT
contract tests and the actual iOS device-SDK build. `uiTests` is empty; this is not
a simulator camera/audio test or a signed physical-device result. The unchanged
server/core source at `d473e5d` also passed the
[isolated signaling checks](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43724972857),
including 71 recovery/registry/stream tests and a real temporary ejabberd to PHP
signed-spool/resource-proof chain. Local PHP signaling fixtures passed 92 checks.
No real APNs request or TestFlight upload was made.

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

Follow-up evidence: [run 43718864843](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43718864843)
passed the real server chain plus 32 Swift tests at `ef4e334`, including stream-
pending invalidation and fresh intent delivery to the replacement resource.
[Unsigned app run 43718867260](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43718867260)
passed both iPhone/iPad matrix entries: 164 selected Swift tests, native RTT tests
and an unsigned iOS SDK build in each entry. No simulator UI/media/physical device
test or upload was performed by that focused workflow.
[Run 43719254763](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43719254763)
passed the server chain and 33 Swift tests at `dd8a5c2`, adding bare-JID retraction
before any recipient resource has been selected. The SDK build above predates
that internal targeting-rule/test-only follow-up; its public method signatures
are unchanged. None of this opens the remaining app integration release gate.

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
  including deployment of the reviewed producer/journal adapter and authoritative
  blocking, DND and mute state. Native policy synchronization and local intent
  routing now exist, but are not live activation. Extend pending-offer handling
  into an accepted/active-call lifecycle; a 45-second invitation is not an active
  media lease. No arbitrary client invitation may bypass these checks.
- Exercise the implemented native consent/token lifecycle on a real device.
  `native-call-push.js` binds it to login/logout with explicit settings consent,
  renewal and serialized revocation. Offline revocation is remembered natively;
  only a verified same-account server response clears it. Account switches do not
  inherit consent, and require finishing the previous account's revocation first.
  An expired web session bounds registration by its 24-hour lease, not immediate
  session-store detection; revocation is not guaranteed while offline.
- Recover a fresh XMPP resource after cold start. Existing Jingle discovery uses
  online full JIDs on the legacy path; the new native intent path selects a fresh
  resource before Jingle. Cold bootstrap and server-enforced call/device/SID-scoped
  credentials are still missing. Do not expose normal account credentials in
  background storage or expand the existing status/end-only token into login.
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
requires the negotiated profile and all its ready contents. The warm-memory
Jingle/media adapter is wired as described above; cold launch and physical-device
background TC behavior are not established by the unsigned tests.

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
