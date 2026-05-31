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
6. session-bound Jingle file transfer or HTTP upload attachments;
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
| XEP-0004 | recommended | Data forms for extended capability metadata |
| XEP-0030 | yes | Service discovery |
| XEP-0128 | recommended | Service discovery extensions using data forms |
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
| XEP-0363 | file profile | HTTP file upload for message or conversation attachments |
| XEP-0234 | call/file-transfer profile | Jingle file-transfer metadata that can be bound to the same session |
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

## Relationship To XEP-0479 Advanced Client

This profile is intended to sit on top of XEP-0479 instead of replacing it.
XEP-0479 defines the general XMPP client compliance suites. Total Conversation
defines the integrated conversation behavior that uses those suites together.

| Total Conversation level | XEP-0479 baseline | Additional profile meaning |
| --- | --- | --- |
| TC-0 Core conversation | Core Client | Normal authenticated XMPP chat identity, stream, TLS, disco and presence foundation. |
| TC-1 Live text conversation | Core Client plus IM Client messaging path | XEP-0301 live text is available with normal message fallback. |
| TC-2 Audio/video conversation | A/V Calling Client baseline | A real Jingle call can be proposed, accepted and represented as audio/video in the conversation. |
| TC-3 Synchronized Total Conversation | A/V Calling Client plus Jingle synchronized RTT ProtoXEP | Live text/captions are negotiated inside the same Jingle session instead of only in chat. |
| TC-4 Assistive context | Advanced IM/Mobile/A/V features where applicable | Location, files, captions, device state, service contact and assistive context are explicit and discoverable. |

Advanced Client requirements remain separate claims. For example, a client can
implement TC-2 locally without honestly claiming full XEP-0479 Advanced A/V
Client until interop, hosted STUN/TURN and release evidence exist.

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

### Capability Data Form

The base feature advertises the profile family. The actual level and supported
modalities should be carried in a XEP-0128 service discovery extension form.
This avoids creating many feature strings for every possible combination while
still making TC-0 through TC-4 machine-readable.

```xml
<query xmlns='http://jabber.org/protocol/disco#info'>
  <identity category='client' type='web' name='Teletyptel'/>
  <feature var='urn:xmpp:total-conversation:0'/>
  <x xmlns='jabber:x:data' type='result'>
    <field var='FORM_TYPE' type='hidden'>
      <value>urn:xmpp:total-conversation:0</value>
    </field>
    <field var='tc#level' type='list-single'>
      <value>tc-2</value>
    </field>
    <field var='tc#modalities' type='list-multi'>
      <value>chat</value>
      <value>rtt</value>
      <value>audio</value>
      <value>video</value>
      <value>file</value>
    </field>
    <field var='tc#fallbacks' type='list-multi'>
      <value>xep-0301</value>
      <value>xep-0363</value>
    </field>
  </x>
</query>
```

The `tc#level` value must be one of `tc-0`, `tc-1`, `tc-2`, `tc-3` or `tc-4`.
A client must not advertise `tc-3` unless it also advertises and can negotiate
the Jingle synchronized RTT ProtoXEP. A client must not advertise `tc-4` unless
it can also represent assistive context such as call-scoped location, fallback
state and consent state.

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

Teletyptel implementation status:

| Level | Current state |
| --- | --- |
| TC-0 | Implemented in the XMPP core and local/public smoke paths. |
| TC-1 | Implemented with XEP-0301 RTT, normal body fallback and browser/relay demos. |
| TC-2 | Working in current software through Jingle-shaped call setup and browser WebRTC audio/video. This is implementation evidence, not a formal XEP-0479 A/V compliance claim yet. |
| TC-3 | Prototype path exists through the Jingle synchronized RTT ProtoXEP and browser `rtt` datachannel tests. |
| TC-4 | Draft/prototype direction through XEP-0080 and Jingle user location; production consent, mobile and interop evidence remain required. |

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
  content file      -> XEP-0234 Jingle file transfer
```

### Fallback Paths

Fallback is allowed, but it must not be hidden:

| Missing capability | Fallback | UI obligation |
| --- | --- | --- |
| Jingle synchronized RTT | XEP-0301 chat RTT | Show "live text fallback" instead of "synchronized text". |
| Jingle location | XEP-0080 PEP/PubSub location | Show that location is not call-scoped. |
| Session-bound Jingle file transfer | XEP-0363 HTTP upload or ordinary link | Show that the file is an attachment/link, not a negotiated Jingle transfer. |
| HTTP upload | Jingle file transfer or ordinary link | Show transfer method and failure state. |
| Jingle call | ordinary chat | Do not present text-only chat as a call. |

## File Transfer And Upload Binding

The profile distinguishes three file states:

| State | Protocol path | Synchronization meaning |
| --- | --- | --- |
| Message attachment | XEP-0363 HTTP File Upload plus message body or out-of-band URL | The file belongs to a message or conversation thread, but it is not negotiated as media in the Jingle session. |
| Session-bound file transfer | XEP-0234 Jingle File Transfer with XEP-0260 or XEP-0261 transport | The file transfer belongs to the active Jingle session and is synchronized at the session/protocol level. |
| Media-synchronized stream | RTP/WebRTC media or future timed media profile | The content has media timing. Ordinary files are not media-clock synchronized unless a future profile defines timed playback. |

When a file is exchanged during an active Total Conversation call, clients
should prefer XEP-0234 if both sides support it, because it can be negotiated as
another Jingle content or call-associated transfer. XEP-0363 remains valid for
attachments, screenshots, documents and asynchronous sharing, but a client must
not present a plain HTTP upload link as a negotiated Jingle transfer.

If an archive records a file exchanged during a call, it should preserve whether
the file was transferred through Jingle or attached through HTTP upload.

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

## XMPP Registrar Considerations

This profile would request registration of the following service discovery
feature:

```text
urn:xmpp:total-conversation:0
```

It would also request registration of the following XEP-0128 form type:

```text
FORM_TYPE = urn:xmpp:total-conversation:0
```

Initial form fields:

| Field | Type | Values | Meaning |
| --- | --- | --- | --- |
| `tc#level` | `list-single` | `tc-0`, `tc-1`, `tc-2`, `tc-3`, `tc-4` | Highest Total Conversation level the entity can honestly negotiate. |
| `tc#modalities` | `list-multi` | `chat`, `rtt`, `caption`, `audio`, `video`, `file`, `location`, `translation`, `interpreter` | Conversation modalities the entity can present or send. |
| `tc#fallbacks` | `list-multi` | protocol names such as `xep-0301`, `xep-0363`, `xep-0080-pep` | Fallback paths the entity can use and expose to users. |

## IANA Considerations

This profile does not require IANA action.

## Submission Readiness

This Markdown draft is close to ProtoXEP submission shape, but it should not be
submitted as XML before these steps are done:

1. Decide whether XSF prefers this as a separate profile XEP or as explanatory
   text after the two Jingle ProtoXEPs.
2. Keep the TC-level advertisement model small: one base disco feature plus one
   XEP-0128 form is easier to review than many feature strings.
3. Convert this Markdown into XSF XEP XML only after the two smaller Jingle
   ProtoXEPs receive initial Council/standards feedback.
4. Keep Teletyptel's current claim at TC-2 until TC-3/TC-4 can be demonstrated
   with accepted protocol text and interop evidence.

## Open Issues

1. Should synchronized RTT be mandatory for any client that claims Total
   Conversation, or only for TC-3 and higher?
2. Should location be part of the main profile or an optional accessibility and
   emergency-readiness extension?
3. How should archives represent call-bound text without requiring servers to
   store media streams?
4. Should this profile be submitted as a separate XSF ProtoXEP after the two
   Jingle ProtoXEPs have been reviewed?
