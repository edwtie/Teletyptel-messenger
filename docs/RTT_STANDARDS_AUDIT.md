# RTT standards review — 2026-10-31

## Scope

Code review of the current browser/iOS client and C# helpers, with local fixtures.
This is not certification or an interoperability test against an independent SIP,
RTT or Total Conversation endpoint. No runtime protocol changes were made during
the initial review. The existing local UI changes are separate from these findings.

## Local repair following the review

Issues 1 and 3 below are repaired locally, not yet released to TestFlight:

- Unknown JSON-shaped payloads now take the raw-text path; recognized legacy
  envelopes still support reset/final events and session checks.
- New senders wrap JSON-looking deltas in existing private snapshots, protecting
  older TeleTypTel receivers and text that resembles a private envelope.
- Raw and JSON send failures keep a reset requirement. Relay fallback sends the
  complete draft; the next channel send resets the remote baseline. Closed and
  newly configured channels also require a snapshot. A draft is not proof of
  delivery if all transports are unavailable; recovery needs a subsequent update.
- Late async packets from ended/replaced calls are ignored.

`tests/rtt-text-loss.test.js` covers these cases; the live RTT browser fixture now
passes numeric/JSON-looking text through the actual packet dispatcher. The mixed
legacy format remains ambiguous for literal text matching a private envelope sent
by an older sender. Explicit format negotiation is still needed for that case and
for pure T.140 interoperability. Issues 2, 4 and 5 remain open.

## Findings at initial review

1. **Raw text can disappear.** In `php/public/chat-client.js`,
   `handleJingleRttSyncPacket` tries JSON before raw text. Valid JSON text that is
   not a recognized private envelope is discarded. Executing the actual function
   with a stubbed presentation layer produced:

   | Incoming text | Delivered to raw-text handler |
   | --- | --- |
   | `Hallo` | `Hallo` |
   | `123` | nothing |
   | `true` | nothing |
   | `"Hallo"` | nothing |
   | `{}` | nothing |

   This affects RTT text containing numbers, not the new DTMF keypad.

2. **Mixed wire formats.** `sendJingleRttSyncPacket` sends linear edits as raw
   text, but sends reset/final/non-linear events as private JSON on the same
   `protocol: "t140"` channel. A local reset probe confirmed the JSON envelope.
   A pure T.140 receiver cannot be expected to interpret that envelope as editing
   metadata. Keep private metadata distinct from a negotiated T.140 text stream.

3. **Raw-send failure bypasses fallback.** The linear edit `.send()` is outside
   the JSON branch's try/catch. A simulated channel-close exception escaped the
   function rather than returning false to allow the caller's fallback path.
   Recovery must also resynchronize the text baseline, not merely catch an error.

4. **RFC 8865 negotiation is incomplete.** `createPeerConnection` creates a
   reliable ordered channel with `protocol: "t140"`, but the browser client has
   no `dcmap`/`dcsa` mapping. The RFC requires `dcmap` negotiation; the protocol
   string alone is insufficient. RFC 8865 sections 4–5 also define T140block
   transport and character-rate behavior. This is currently an app-specific
   co-session implementation, not verified RFC 8865 interoperability.

5. **Synchronization status overstates capability.**
   `jingleRttSyncStatusText` and channel callbacks use the same synchronized-text
   label for a connected channel and fallback. XEP-0517 distinguishes co-session
   text from shared-clock synchronization, and requires visible fallback when
   synchronization is required. The interface should make that distinction.

## What exists, and what is not established

- XEP-0301 receive handling uses Unicode code points, validates sequence numbers
  for edits, restores state on reset/new and separates group participant drafts.
  The sender uses full reset snapshots, which XEP-0301 permits for simple RTT.
  A complete sender/resource/timing conformance review remains outstanding.
- `src/Tiedragon.XmppMessenger.Core/Xmpp/XmppRtpT140.cs` contains UTF-8/T.140,
  RTP parsing/packetization and redundancy helpers. Their unit tests are not a
  running SIP/RTP gateway. No browser-to-provider RFC 4103 transport was verified.
- XEP-0517 is Experimental. The checklist's co-session implementation must not
  be read as proof of strict media-clock synchronization or external compatibility.
- DTMF is a separate audio-sender mechanism; it does not establish RTT compliance.

## Validation performed

- `node tests/live-rtt-integration.test.js`: Android/Chromium and iPhone/WebKit
  fixtures passed. These do not cover every raw input through the JSON dispatcher.
- `dotnet run --project tests/Tiedragon.XmppMessenger.Tests --no-restore`:
  suite passed, including T.140 codec and RTP/redundancy helper tests.
- Targeted VM probes of the actual JavaScript functions reproduced issues 1–3
  with fictitious text and stubbed transports; no user messages or live calls used.

## Required follow-up

- Add regression tests for numeric/JSON-looking text and channel failure.
- Select explicit, versioned negotiation for the legacy private format versus
  standard T.140. Do not silently break communication with installed build 7.1.
- Separate metadata from text, then test corrections, emoji, line endings,
  rate limiting, channel replacement and fallback resynchronization.
- Implement the selected SDP/Jingle mapping and a real RFC 4103 gateway path.
- Test both directions against an independent endpoint, including packet loss,
  reconnection and an actual iPhone. Keep conformance boxes open until proven.

## References

- [ITU-T T.140](https://www.itu.int/rec/T-REC-T.140/en): text conversation protocol.
- [RFC 8865](https://www.rfc-editor.org/rfc/rfc8865.html): WebRTC T.140 transport.
- [RFC 4103](https://www.rfc-editor.org/rfc/rfc4103.html): RTP text transport.
- [XEP-0301](https://xmpp.org/extensions/xep-0301.html): XMPP in-band RTT.
- [XEP-0517](https://xmpp.org/extensions/xep-0517.html): experimental co-session
  and synchronization profiles, especially sections 2.1, 9 and 11.
