# RFC 6120 Implementation

Source: RFC 6120, "Extensible Messaging and Presence Protocol (XMPP): Core".

This document tracks the client-to-server core protocol work for
`Tiedragon.XmppMessenger`. The WebSocket RTT relay remains a development
transport; this file is about the real XMPP stream stack.

## Compliance Matrix

| RFC 6120 Area | Status | Implementation |
| --- | --- | --- |
| XML stream open and close | Started | `XmppStreamHeader` creates the client stream open tag and close tag. |
| Stream features | Started | `XmppStreamFeatureSet` parses STARTTLS, SASL mechanisms, resource binding and session features. |
| STARTTLS negotiation | Started | `XmppStreamClient.BeginStartTlsAsync` sends `<starttls/>`, handles proceed/failure, upgrades the stream and restarts XML stream. |
| SASL authentication | Started | `AuthenticateBestAsync` selects SCRAM-SHA-256, SCRAM-SHA-1 or PLAIN, authenticates and restarts the XML stream after success. |
| Resource binding | Started | `BindAfterAuthenticationAsync` validates bind features, sends bind IQ, stores bound JID and updates client state. |
| Negotiation order | Started | `XmppStreamNegotiationPlan` selects STARTTLS, SASL, bind or ready from parsed features. |
| Stanza primitives | Partial | Message, presence and IQ models serialize/parse; `XmppIncomingStanza` dispatches incoming stanza kind. |
| Stream errors | Started | `XmppProtocolException` carries stream error category and XML element. |
| Stanza errors | Started | IQ errors are surfaced through `XmppIqTracker` / `SendIqAndWaitAsync`. |
| XML stream reader | Started | `XmppStreamReader` handles chunked stream features, stanzas and stream close. |
| XML stream writer | Started | `XmppStreamWriter` writes open stream, stanza elements and close stream. |
| TCP client | Started | `XmppStreamClient` connects to TCP, opens the stream, reads features and closes cleanly. |
| TLS policy | Started | Required TLS now rejects feature sets that do not offer STARTTLS; certificate validation policy is documented in `TLS_POLICY.md`; certificate smoke coverage remains open. |

## Build Order

1. Stream feature parser and XML command factories.
2. TCP stream client with open-stream and feature-read cycle.
3. STARTTLS socket upgrade and stream restart.
4. SASL authentication and stream restart.
5. Resource binding.
6. Message, presence and IQ send/receive dispatch.
7. RTT integration through XEP-0301 message payloads.

## Notes

- RFC 6120 stream negotiation restarts the XML stream after STARTTLS and after
  successful SASL authentication. The client must model that explicitly.
- The stream reader cannot wait for a complete XML document, because an XMPP
  stream is intentionally open-ended.
- RFC 6121 features such as roster and presence build on this layer but should
  stay separate from the core stream negotiation code.

## Implementation Plan

### Phase 1 - XML Stream Foundations

Goal: read and write XMPP stream XML without pretending the stream is a normal
closed XML document.

Deliverables:

- `XmppStreamReader` that can read:
  - opening `<stream:stream>`
  - `<stream:features>`
  - top-level `<message/>`, `<presence/>` and `<iq/>` stanzas
  - `<stream:error>`
  - closing `</stream:stream>`
- `XmppStreamWriter` that writes:
  - client open stream
  - close stream
  - raw stanza elements
  - flushes after each protocol command

Current status:

- `XmppStreamReader` and `XmppStreamWriter` exist.
- Chunked feature parsing is covered by tests.
- Multiple stanzas in one buffer are covered by tests.
- Stream close is covered by tests.
- `XmppStreamClient` wires these classes to a TCP stream, reads first stream
  features from a fake server and returns the first negotiation decision.

Acceptance:

- A fake server can send open stream + features and the reader returns features.
- A fake server can send multiple stanzas in one buffer and the reader returns
  them one by one.
- Partial XML chunks are tolerated.
- Invalid stream XML becomes a typed stream failure instead of crashing the UI.

Tests:

- chunked stream features
- multiple stanzas in one read
- malformed XML
- stream close

### Phase 2 - TCP Client Skeleton

Goal: create a real client-to-server transport for RFC 6120 before TLS/SASL.

Deliverables:

- `XmppStreamClient`
- connect/disconnect lifecycle
- cancellation support
- send stanza API
- receive event/channel API
- debug trace hook for raw XML

Acceptance:

- Client connects to a fake TCP XMPP server.
- Client sends the open stream header with `to`, `from`, `xml:lang`,
  `jabber:client` and `stream` namespaces.
- Client reads first stream features.
- Client closes stream gracefully.

Current status:

- `XmppStreamClient` exists.
- Fake server test covers connect, open stream, first features, first
  negotiation decision and graceful close.
- Send/receive raw XML trace hooks exist for debug console integration.

Tests:

- successful connect
- connection refused
- cancellation during connect
- graceful close

### Phase 3 - STARTTLS

Goal: enforce the RFC 6120 TLS step before authentication.

Deliverables:

- STARTTLS command send
- `<proceed/>` and `<failure/>` handling
- network stream upgrade to `SslStream`
- stream restart after TLS
- downgrade protection when `RequireTls` is true

Acceptance:

- If TLS is required and not offered, connection fails.
- If TLS is offered, client sends `<starttls/>`.
- After `<proceed/>`, the stream upgrades and sends a fresh open stream.
- A TLS failure produces a typed error.

Current status:

- `IXmppTlsStreamUpgrader` allows the stream upgrade to be tested.
- `XmppTlsStreamUpgrader` performs the real `SslStream` client authentication.
- `XmppStreamClient` restarts the XML stream after STARTTLS proceed.
- Fake-server test covers command, upgrade hook and fresh open stream.
- Required-TLS policy rejects servers that do not offer STARTTLS.
- Real certificate/server smoke coverage remains open.

Tests:

- required TLS offered
- required TLS missing
- optional TLS offered
- TLS failure
- stream restart after TLS

### Phase 4 - SASL Authentication

Goal: authenticate after TLS and restart the stream after success.

Deliverables:

- SASL mechanism selection
- SASL PLAIN
- SCRAM-SHA-1 and SCRAM-SHA-256 design slot
- `<success/>`, `<failure/>` and challenge/response handling
- stream restart after success

Acceptance:

- Client refuses to send credentials before TLS when TLS is required.
- Client selects the strongest supported mechanism it implements.
- SASL success restarts the stream.
- SASL failure returns a typed auth error.

Current status:

- PLAIN and SCRAM authentication paths restart the XML stream after success.
- SCRAM-SHA-1 is verified with the RFC test vector.
- SCRAM-SHA-256 is selected automatically when offered.
- Fake-server tests cover SASL challenge/response and stream restart.

Tests:

- PLAIN success
- PLAIN failure
- unsupported mechanism
- no mechanism offered
- auth-before-TLS blocked

### Phase 5 - Resource Binding

Goal: complete the RFC 6120 session identity by binding a resource.

Deliverables:

- bind request IQ
- bound full JID storage
- bind failure handling
- optional legacy session handling if a server still offers it

Acceptance:

- Client sends bind IQ after SASL success.
- Client stores the bound full JID from the result.
- Client reaches `Ready` only after resource binding.

Tests:

- requested resource accepted
- server-assigned resource
- bind error
- ready state after bind

Current status:

- `ReadFeaturesAsync` reads post-SASL stream features.
- `BindAfterAuthenticationAsync` requires the bind feature before sending bind IQ.
- `BindResourceAsync` stores `BoundJid` and marks the client resource-bound.
- Fake-server mini-login covers SASL restart, bind features, bind IQ and bound JID storage.

### Phase 6 - Stanza Dispatch

Goal: route incoming top-level stanzas into typed application events.

Deliverables:

- incoming message dispatch
- incoming presence dispatch
- incoming IQ dispatch
- outgoing IQ request/response correlation by id
- timeout for unanswered IQ requests

Acceptance:

- Message, presence and IQ are surfaced independently.
- IQ result/error completes the matching request.
- Unknown stanzas are logged but do not break the stream.

Current status:

- `XmppIncomingStanza` classifies incoming message, presence and IQ elements.
- `XmppStreamClient` can send message, presence and IQ elements.
- `XmppStreamClient.ReadNextStanzaAsync` returns the next typed incoming stanza.
- `XmppIqTracker` correlates IQ result/error by id.
- `XmppStreamClient.SendIqAndWaitAsync` sends IQ and waits for result/error.
- Broader IQ timeout behavior is started, but needs more real-server coverage.

Tests:

- message receive
- presence receive
- IQ result correlation
- IQ timeout
- unknown stanza

### Phase 7 - Error Model

Goal: make protocol failures inspectable and useful for UI/debugging.

Deliverables:

- `XmppStreamException`
- stream error parser
- stanza error parser
- authentication error type
- TLS error type
- disconnect reason enum

Acceptance:

- UI can show a readable connection/auth/protocol error.
- Debug log can show the original XML error element.
- Tests can assert exact failure categories.

Current status:

- `XmppProtocolException` and `XmppProtocolErrorKind` exist.
- STARTTLS failure, SASL failure, resource bind failure, stream close and stream
  error now have typed exceptions.
- IQ error responses become typed protocol exceptions.

Tests:

- stream conflict
- not-authorized
- policy-violation
- malformed XML

### Phase 8 - RFC 6121 Bridge

Goal: build normal chat behavior on top of the now-real RFC 6120 stream.

Deliverables:

- send one-to-one chat message
- receive one-to-one chat message
- initial presence
- roster get
- presence update events

Acceptance:

- Two test accounts can exchange a normal `<message type="chat">`.
- Roster loads after login.
- Presence can be set online/away/offline.

Current status:

- `RequestRosterAsync` sends roster IQ and returns typed `XmppRosterItem` values.
- `SendInitialPresenceAsync` sends initial presence after login.
- Message send/receive primitives already exist through stanza APIs.

Tests:

- chat send/receive through fake server
- roster result parse
- presence update parse

### Phase 9 - RTT Integration

Goal: move XEP-0301 RTT from demo transport into real XMPP message payloads.

Deliverables:

- RTT packet inside `<message type="chat">`
- normal `<body>` fallback
- RTT enable/disable option
- reset when conversation target changes
- sequence handling per contact/conversation

Acceptance:

- Live text arrives over real XMPP.
- A non-RTT client still receives a normal body fallback.
- Out-of-sequence RTT recovers through reset or body fallback.

Current status:

- `XmppRealTimeTextMessage` creates `<message type="chat">` with normal
  `<body>` fallback plus XEP-0301 `<rtt/>` payload.
- `XmppStreamClient.SendRealTimeTextAsync` can send the RTT message element.
- Per-contact RTT receive state remains open.

Tests:

- RTT message stanza build
- RTT receive state per sender
- fallback body receive
- sequence loss recovery

### Phase 10 - Real Server Smoke Tests

Goal: prove the stack outside fake-server tests.

Targets:

- local Prosody or Openfire
- TLS enabled
- two test accounts
- one desktop client instance per account

Acceptance:

- login succeeds
- roster loads
- messages send/receive
- presence updates
- RTT live text works when enabled
- disconnect/reconnect does not freeze the UI

## First Milestone Definition

Milestone `RFC6120-M1` is complete when:

- `XmppStreamReader` and `XmppStreamWriter` exist.
- A fake server test covers open stream, features and graceful close.
- `XmppStreamClient` can connect to the fake server and reach the first feature
  negotiation decision.
- All current RTT and XMPP model tests still pass.
