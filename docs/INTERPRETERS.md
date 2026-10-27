# Own interpreters — direct in-call requests

## Use

1. Sign in to Messenger and press **Tolk toevoegen** in the conversation. This
   requests an interpreter in the existing call without a new tab or JID form.
   If no call exists, it starts a Total Conversation call to the selected contact.
   A waiting banner allows cancellation without ending the original call.
2. An interpreter opens **Werkplek voor eigen tolken**, chooses **Aanmelden als
   tolk**, and waits for approval. This never grants admin or intake access.
3. An existing owner/admin opens **Tolkenbeheer** from `/admin/`, verifies the
   person's qualifications separately and approves the application. Staff and
   ordinary Messenger accounts cannot approve applications.
4. The interpreter marks themselves available and keeps the desk open. An
   active desk refreshes availability; it expires from the dispatch queue after
   30 seconds without a heartbeat. Accepting a request marks the interpreter busy.
5. The waiting queue shows only a request ID, creation time and whether the
   request belongs to an ongoing call, not participant details or the call ID.
   A decline hides it from that interpreter; another available interpreter can
   still accept. Human availability and response time are not guaranteed.
6. The other participant sees **Tolk toelaten** and a notice about sharing audio,
   video and live text. The request must match the current call ID and peer.
   An interpreter's **Accepteren** notice explains camera/microphone access.
   Accepting opens their workspace and starts joining using a one-use same-tab
   marker, checked against the assigned account. A room URL alone does not start
   media. No interpreter signaling is allowed until all three have joined.
7. The interpreter appears pinned in the original participants' call panel.
   The original two-party call stays connected. Removing the interpreter or
   cancelling ends only the interpreter connections; ending the original call
   also ends the interpreter request. Permission is held only in the current
   page instance; reloading does not silently resume sharing.
8. **Tolkwerkplek** remains available from the conversation menu for operators
   and the standalone three-person workflow. Standalone participants explicitly
   choose camera/microphone or RTT only before joining.

## Boundaries — do not present these as implemented integrations

- The original one-to-one XMPP/Jingle peer connection is retained. Two additional
  WebRTC connections link the interpreter to the original participants using
  authenticated same-origin PHP signaling. The server rejects an extra connection
  between the original participants. This is not a federated XMPP conference.
- Original local tracks are shared, preserving microphone/camera mute state.
  An audio-only requester is asked for a separate signing camera, with its own
  preview and toggle. Removing the interpreter stops that extra camera, not the
  original microphone. The interpreter receives no earlier history or text from
  unrelated selected conversations.
- The interpreter connections use a reliable data channel for live text snapshots,
  not XEP-0301 XML or RTP T.140. Native RTT remains unchanged. No new XMPP/SIP
  federation or third-party client interoperability is claimed.
- Both other participants must have local Messenger profiles and sign in on the
  same website. Cross-origin HTTP/HTTPS sessions are not interchangeable. Open
  only one room tab per account; rejoining an already joined account is refused.
- **Tolkcontact** is visible but disabled; the server also rejects that provider.
  No credentials, endpoints, third-party calls or claimed partnership are added.
- There is no provider billing, reimbursement decision, booking calendar,
  recording, history import, medical-document access or automatic translation
  inside the interpreter room. Interpreter qualifications require human review.
- Camera/microphone require HTTPS (localhost is suitable for local testing).
  Existing `/api/rtc-config.php` supplies STUN/TURN configuration. A working TURN
  deployment and real-device/network tests are still necessary for reliable
  external use. Mesh is deliberately limited to three participants, not a general
  conference server. The new workspace currently has Dutch labels.

## Access, lifetime and storage

- Regular PHP login plus `AccountAccess` session/version checks; mutations require
  a dedicated CSRF token. Admin role changes use the existing separate admin
  session and their own CSRF token. A room URL is not a bearer-access token.
- Server-side membership consists of exactly caller, nominated contact and the
  interpreter who atomically claimed the request. Users cannot self-assign a role,
  claim someone else's room without approval, or signal unjoined/foreign accounts.
- Claiming and room mutations serialize on a database mutex row. Only one open
  interpreter session is allowed per participant. Requests are limited to five
  per caller per minute; signaling to 200 retained records per sender/room.
- Waiting requests and accepted-but-not-fully-joined sessions expire in 10 minutes.
  An active session has a two-hour maximum. A joined participant missing heartbeats
  for 45 seconds ends the session. Network/API failure stops interpreter media
  (all local media in the standalone workspace), not the original call. Access
  revocation or an admin block is detected on the next successful room poll.
- Interpreter media and live/final text are not sent to the signaling API or saved
  as chat history. The original Messenger conversation retains its existing history
  behavior. Interpreter text exists in browser memory; session end clears that UI.
  This cannot prevent recipients from taking screenshots or recording externally.
- SDP/ICE signaling (which can contain network addresses) is retained for at most
  60 seconds **until the next service cleanup**; ending the room deletes it
  immediately. Ended room/member metadata is cleaned after 24 hours; interpreter
  role-change audit entries after 90 days. Cleanup runs on service requests, not a
  guaranteed wall-clock background deletion schedule. No message bodies in audits.
- The service worker treats `/tolk/`, `/admin/` and `/api/` as private, network-only
  routes. No offline cached room or cross-user history fallback.

## Verification

Website support calls now appear in the same interpreter desk under
**Klantenservice · gebarentolk**, after both original participants consent. They
use a separate, role-bound support-call transport rather than creating Messenger
accounts for visitors or staff. Shared reservations prevent a double assignment
across the two interpreter queues. See [Support chat](SUPPORT_CHAT.md) for the
guest/staff permissions, browser limitations and media lifetime.

`npm run test:interpreter` runs isolated SQLite service checks and browser tests.
The browser fixture uses a temporary loopback PHP server and a temporary SQLite
database; it creates no live Messenger or ejabberd accounts and calls no provider.
Temporary files and servers are cleaned up after each run.

Chromium tests establish three real WebRTC peer connections with synthetic camera
and microphone tracks, exercise three-way RTT and verify admin blocking closes
media on every participant. iPhone/WebKit layout and approval/access controls are
tested separately: the Windows WebKit runtime has no WebRTC implementation, so
that test checks the unsupported-browser guard, **not real iPhone media**.
The inline browser test retains a real original two-party WebRTC connection while
adding the interpreter, checks consent gating, two-way RTT, unrelated-chat
isolation, cancellation and continued original media/data after removal. It uses
the real module and markup with a call adapter, not a live ejabberd end-to-end call.
Real iPhone/Android hardware, public-internet TURN routing and Tolkcontact remain
explicitly unverified.
