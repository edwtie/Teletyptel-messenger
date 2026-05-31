# Total Conversation Profile

Readable Markdown draft for a Teletyptel ProtoXEP.

This draft describes an umbrella protocol profile. It does not replace the
existing XMPP RFCs, published XEPs or the two Jingle ProtoXEPs. It defines how
they fit together when a client claims to support Total Conversation.

## Metadata

| Field | Value |
| --- | --- |
| Short name | `total-conversation-profile` |
| Status | Draft ProtoXEP direction |
| Type | Standards Track / Profile |
| Namespace | `urn:xmpp:total-conversation:0` |
| Author | Edward Tie, `info@tiedragon.com` |
| Draft date | 2026-05-31 |

## Abstract

This specification defines an XMPP Total Conversation profile: a conformance
model for clients that combine real-time text, audio, video, files, optional
call-scoped location and accessibility services into one coherent conversation
experience.

It composes existing XMPP RFCs and XEPs, plus the ProtoXEPs for Jingle
synchronized real-time text and Jingle user location.

## Problem Statement

Many clients can already do chat. Some can do calls. Some can send files. Some
can send real-time text. The user problem appears when those features are shown
as one conversation but the protocol state is split:

- text is sent outside the call;
- captions are indistinguishable from typed chat;
- location is a global presence update instead of call-scoped consent;
- history does not show whether text was synchronized or fallback;
- assistive services cannot reliably know which media belongs together.

Total Conversation needs a profile that says which protocol pieces are required
and how they are bound to one conversation.

## Design Goal

The profile goal is interoperability. A Total Conversation client should be able
to discover another client's capabilities and determine whether a conversation
can support:

1. normal XMPP messaging;
2. live real-time text;
3. audio/video calling;
4. Jingle-synchronized text in the same call;
5. call-scoped location when the user explicitly shares it;
6. file transfer or HTTP upload attachments;
7. archiving and multi-device sync without hiding fallback state.

The profile is not a new media codec, account system, encryption system or
emergency-services standard.

## Normative Building Blocks

### Core XMPP

| Protocol | Required for profile | Purpose |
| --- | --- | --- |
| RFC 6120 | yes | XMPP streams, TLS negotiation, SASL and stanza routing |
| RFC 6121 | yes | Instant messaging and presence |
| RFC 7590 | yes | TLS requirements for XMPP |
| RFC 7622 | yes | XMPP address/JID format |
| RFC 7395 | web profile | XMPP over WebSocket |
| XEP-0030 | yes | Service discovery |
| XEP-0198 | recommended | Stream management and reconnect |
| XEP-0352 | mobile/web profile | Client state indication |

### Messaging

| Protocol | Required for profile | Purpose |
| --- | --- | --- |
| XEP-0085 | recommended | Chat state notifications |
| XEP-0184 | recommended | Message delivery receipts |
| XEP-0280 | recommended | Message carbons |
| XEP-0301 | yes for live text | In-band real-time text fallback and chat RTT |
| XEP-0308 | recommended | Last message correction |
| XEP-0313 | recommended | Message archive management |

### Group Conversation

| Protocol | Required for profile | Purpose |
| --- | --- | --- |
| XEP-0045 | group profile | Multi-user chat |
| XEP-0048 | compatibility | Legacy bookmarks |
| XEP-0402 | recommended | PEP-native MUC bookmarks |
| XEP-0410 | recommended | MUC self-ping |

### Files

| Protocol | Required for profile | Purpose |
| --- | --- | --- |
| XEP-0363 | file profile | HTTP file upload |
| XEP-0234 | call/file-transfer profile | Jingle file-transfer metadata |
| XEP-0065 | optional | SOCKS5 bytestreams |
| XEP-0047 | fallback | In-band bytestreams |
| XEP-0260 | optional | Jingle SOCKS5 bytestream transport |
| XEP-0261 | fallback | Jingle IBB transport |

### Audio, Video And Calls

| Protocol | Required for profile | Purpose |
| --- | --- | --- |
| XEP-0166 | call profile | Jingle session signaling |
| XEP-0167 | call profile | RTP audio/video session descriptions |
| XEP-0176 | call profile | ICE-UDP transport |
| XEP-0215 | recommended | STUN/TURN discovery |
| XEP-0320 | recommended | DTLS-SRTP fingerprints |
| XEP-0343 | datachannel profile | WebRTC data channels in Jingle |
| XEP-0353 | call profile | Message-based call proposal flow |

### Accessibility, Context And Identity

| Protocol | Required for profile | Purpose |
| --- | --- | --- |
| XEP-0080 | location profile | User location payload |
| XEP-0084 | recommended | User avatars |
| XEP-0157 | service profile | Service contact addresses |
| XEP-0163 | recommended | Personal Eventing Protocol |
| XEP-0191 | safety profile | Blocking command |

### Encryption

| Protocol | Required for profile | Purpose |
| --- | --- | --- |
| XEP-0384 | recommended | OMEMO end-to-end encryption |
| XEP-0454 | recommended for media sharing | OMEMO media sharing |

### Teletyptel ProtoXEP Building Blocks

| ProtoXEP | Namespace | Role in this profile |
| --- | --- | --- |
| Jingle Synchronized Real-Time Text | `urn:xmpp:jingle:apps:rtt-sync:0` | Binds live text, captions, T.140 or RTT datachannel text to one Jingle call. |
| Jingle User Location | `urn:xmpp:jingle:apps:geoloc:0` | Binds XEP-0080 location payloads to one active Jingle call. |

## Discovery

A client that supports this profile should advertise:

```xml
<feature var='urn:xmpp:total-conversation:0'/>
```

The feature is a profile claim, not a replacement for detailed discovery. A
client must still advertise the underlying features it actually supports.

Example:

```xml
<query xmlns='http://jabber.org/protocol/disco#info'>
  <identity category='client' type='web' name='Teletyptel'/>
  <feature var='urn:xmpp:total-conversation:0'/>
  <feature var='urn:xmpp:rtt:0'/>
  <feature var='urn:xmpp:jingle:1'/>
  <feature var='urn:xmpp:jingle:apps:rtp:1'/>
  <feature var='urn:xmpp:jingle:transports:ice-udp:1'/>
  <feature var='urn:xmpp:jingle-message:0'/>
  <feature var='urn:xmpp:jingle:apps:rtt-sync:0'/>
  <feature var='urn:xmpp:jingle:apps:geoloc:0'/>
</query>
```

If a client advertises `urn:xmpp:total-conversation:0` but omits one of the
underlying features, peers must treat that omitted part as unsupported.

## Conformance Levels

| Level | Name | Required behavior |
| --- | --- | --- |
| TC-0 | Core conversation | RFC 6120/6121 messaging, presence and service discovery. |
| TC-1 | Live text conversation | TC-0 plus XEP-0301 live text and fallback message bodies. |
| TC-2 | Audio/video conversation | TC-1 plus Jingle call proposal and audio/video session signaling. |
| TC-3 | Synchronized Total Conversation | TC-2 plus Jingle synchronized RTT in the same call session. |
| TC-4 | Assistive context | TC-3 plus consent-gated call-scoped location and accessibility/service metadata. |

A client must not claim a higher level in user-facing UI or documentation than
it can negotiate on the wire.

## Binding Model

All call-scoped media and context must be bound by:

```text
peer JID + Jingle sid + content name + optional sync-group
```

The peer JID alone is not enough. A single contact can have multiple devices,
browser sessions, simultaneous calls or fallback chat paths.

## Session Model

### Call Proposal

A Total Conversation call should start with XEP-0353 when the peer supports it.
The proposal can express intent before an IQ-based Jingle session exists.

### Jingle Session

The actual call uses XEP-0166. Audio and video are normal Jingle contents.
Synchronized text is an additional Jingle content using
`urn:xmpp:jingle:apps:rtt-sync:0`. Call-scoped location is either an additional
location content or later `session-info` using
`urn:xmpp:jingle:apps:geoloc:0`.

Example content set:

```text
Jingle sid: call-123
  content audio     -> XEP-0167 RTP audio
  content video     -> XEP-0167 RTP video
  content text      -> ProtoXEP Jingle synchronized RTT
  content location  -> ProtoXEP Jingle user location
```

### Fallback Paths

Fallback is allowed, but it must not be hidden:

| Missing capability | Fallback | UI obligation |
| --- | --- | --- |
| Jingle synchronized RTT | XEP-0301 chat RTT | Show "live text fallback" instead of "synchronized text". |
| Jingle location | XEP-0080 PEP/PubSub location | Show that location is not call-scoped. |
| HTTP upload | Jingle file transfer or ordinary link | Show transfer method and failure state. |
| Jingle call | ordinary chat | Do not present text-only chat as a call. |

## User Interface Rules

A Total Conversation client must make these states visible:

| State | Meaning |
| --- | --- |
| Live text | Characters are visible while being typed. |
| Synchronized text | Text belongs to the active Jingle call session. |
| Caption source | Text source is human, ASR, interpreter, translation or system. |
| Audio/video active | The call media is active or held/muted. |
| Location shared | Location is actively shared for this call. |
| Fallback active | A required synchronized capability was not negotiated. |

Color alone must not be the only indicator.

## Archive And Transcript Rules

Archives must not erase the difference between synchronized and fallback text.
If a transcript contains call-bound text, the client should retain enough
metadata to show:

- the Jingle `sid`;
- the content name;
- the text source and language when known;
- whether text was synchronized, session-bound or fallback;
- whether captions were partial, final or corrected.

XEP-0313 may store messages, but this profile does not require servers to store
raw media streams, RTP packets, WebRTC datachannel events or location history.

## Security Considerations

Total Conversation can combine sensitive media, text, files and location.
Clients should use encrypted transport and end-to-end encryption where
available. A deployment must not imply that this profile alone provides
end-to-end confidentiality.

Downgrade attacks are important. If synchronized text falls back to ordinary
XEP-0301, or call-scoped location falls back to PEP location, the user must be
informed.

Received captions, ASR text and location must not be treated as verified facts
unless additional trust and verification mechanisms exist.

## Privacy Considerations

The profile can expose:

- partial text before a message is final;
- live speech through captions;
- contact availability;
- file metadata;
- location and movement;
- call participation across multiple devices.

Clients must ask for user consent before sending live location or enabling
assistive services that involve third parties such as ASR, captioning,
translation, relay or interpreter providers.

Location sharing must stop when the call ends, when the user stops sharing, when
permission is revoked, or when the source becomes stale.

## Accessibility Considerations

This profile exists primarily because accessibility requires the conversation to
be coherent. Deaf, hard-of-hearing, speech-impaired and mixed-hearing groups
need to know whether text is:

- typed by the other person;
- generated by ASR;
- entered by a captioner;
- translated;
- interpreted;
- delayed;
- synchronized to the call;
- fallback outside the call.

The profile should support keyboard operation, screen readers, high contrast
modes, captions, sign-language video, live text and clear fallback warnings.

## Relationship To Emergency Services

This profile can support emergency-readiness experiments, but it is not an
emergency-services standard. XEP-0080 and the Jingle location ProtoXEP are not
enough by themselves for NG112, PSAP routing, legal caller identity or certified
emergency location.

Emergency gateways need separate requirements, including PIDF-LO/RFC 6442 style
translation, policy, certification, auditing and simulator testing.

## Open Issues

1. Should the profile define explicit conformance labels such as `tc-1`,
   `tc-2`, `tc-3` and `tc-4` in service discovery?
2. Should synchronized RTT be mandatory for any client that claims Total
   Conversation, or only for TC-3 and higher?
3. Should location be part of the main profile or an optional accessibility and
   emergency-readiness extension?
4. How should archives represent call-bound text without requiring servers to
   store media streams?
5. Should this profile be submitted as a separate XSF ProtoXEP after the two
   Jingle ProtoXEPs have been reviewed?
