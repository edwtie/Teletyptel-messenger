# Jingle Synchronized Real-Time Text

Readable Markdown copy of the ProtoXEP XML draft.

The XSF XML file remains the source of truth for submission. This file is for
review, discussion and product planning inside Teletyptel.

## Metadata

| Field | Value |
| --- | --- |
| Short name | `jingle-rtt-sync` |
| Status | ProtoXEP |
| Type | Standards Track |
| Namespace | `urn:xmpp:jingle:apps:rtt-sync:0` |
| Author | Edward Tie, `info@tiedragon.com` |
| Revision | 0.0.2, 2026-05-30 |

## Abstract

This specification defines a Jingle application extension for negotiating
real-time text as part of the same conversational session as audio and video.

## Dependencies

| Dependency | Role |
| --- | --- |
| XEP-0166 | Jingle session framework |
| XEP-0167 | Jingle RTP sessions |
| XEP-0176 | Jingle ICE-UDP transport |
| XEP-0301 | In-band real-time text fallback |
| RFC 4103 | RTP payload for T.140 real-time text |
| RFC 8865 | Real-time text conversation reference |

## Introduction

XEP-0301 already defines real-time text for XMPP. Jingle already negotiates
real-time audio and video sessions. The gap appears when a client starts a
Jingle audio/video call, but sends live text as ordinary XMPP messages outside
the Jingle session. The user sees one conversation, while the protocol state is
split into unrelated paths.

This draft defines how to negotiate real-time text as a Jingle content inside
the same session as audio and video. That text can be typed RTT, captions, ASR
output, interpreter text, translation text or transcript text.

The goal is Total Conversation: audio, video and text presented as one
conversation unit.

## Requirements

1. Enable a Jingle initiator to offer real-time text in the same session as
   audio and video.
2. Enable a responder to accept or reject real-time text independently from
   audio and video.
3. Define a first-class Jingle content for text, for example `text` or `rtt`.
4. Allow endpoints to identify the text purpose, source and language.
5. Allow endpoints to indicate whether the text is synchronized to a media
   clock, a session clock, the call session only, or not synchronized.
6. Allow fallback to XEP-0301 when synchronized Jingle text is unsupported.
7. Prevent clients from silently presenting fallback RTT as synchronized text.

## Implementation Levels

| Level | Name | Minimum capability | User-visible promise |
| --- | --- | --- | --- |
| 0 | XEP-0301 fallback | Ordinary in-band RTT outside Jingle | Live text, not media synchronized |
| 1 | Jingle co-session text | Text is negotiated by the same Jingle session but does not share a media clock | Belongs to the call, limited synchronization |
| 2 | Session-clock text | Text has timestamps relative to a shared call or session clock | Call-synchronized text |
| 3 | Media-clock text | RTP/T.140 or equivalent media-clock timing with audio/video correlation | Strict synchronized Total Conversation |

An implementation must not advertise a higher level than it can deliver. A
WebRTC data channel that is merely opened during a call is Level 1 unless it can
show a shared session clock or media clock.

## Glossary

| Term | Meaning |
| --- | --- |
| RTT | Real-Time Text, transmitted while it is being typed or created. |
| Total Conversation | A conversation containing simultaneous audio, video and real-time text. |
| Jingle content | A named component inside a Jingle session, such as audio, video or text. |
| Conversation group | A set of Jingle contents intended to be presented as one synchronized conversational unit. |

## Use Cases

### Offering Total Conversation

An initiator offers audio, video and text contents in one Jingle session. The
receiver accepts all three contents and presents them as a single Total
Conversation.

```text
Jingle session sid = abc123
  content audio -> RTP audio
  content video -> RTP video or signing
  content text  -> RTP T.140 or WebRTC datachannel T.140
```

### Adding Text During A Call

A participant starts an audio-video call and later adds captions, ASR or typed
text by sending a Jingle `content-add` action for the text content.

### Fallback To XEP-0301

If the peer does not support this specification, a client can fall back to
XEP-0301. The fallback must be visible to the user when synchronized text is
required.

## Protocol Overview

A Total Conversation call should contain three Jingle contents:

```xml
<content name='audio'> ... </content>
<content name='video'> ... </content>
<content name='text'>  ... </content>
```

The `text` content is not an ordinary XMPP message stream. It is part of the
Jingle session and is described by this extension.

The binding key is the Jingle `sid` plus the content name and `sync-group`. A
client must not infer synchronization only from the peer JID, because a user can
have multiple sessions, devices or fallback chat streams with the same peer.

## Discovery

An entity supporting this specification must advertise:

```xml
<feature var='urn:xmpp:jingle:apps:rtt-sync:0'/>
```

If the entity supports RTP/T.140, it should advertise:

```xml
<feature var='urn:xmpp:jingle:apps:rtt-sync:rtp-t140:0'/>
```

If the entity supports WebRTC datachannel T.140, it should advertise:

```xml
<feature var='urn:xmpp:jingle:apps:rtt-sync:dc-t140:0'/>
```

If it supports fallback to XEP-0301, it should also advertise the normal
XEP-0301 feature.

## Application Format

This specification defines an `rtt-sync` element in the namespace
`urn:xmpp:jingle:apps:rtt-sync:0`.

| Attribute | Required | Values | Meaning |
| --- | --- | --- | --- |
| `role` | yes | `conversation`, `caption`, `transcript`, `translation`, `interpreter` | Purpose of the text stream |
| `source` | no | `human`, `asr`, `captioner`, `interpreter`, `translation`, `system` | Origin of the text |
| `lang` | no | BCP 47 language tag | Language of the text |
| `sync-group` | yes | token | Group shared by audio, video and text contents |
| `sync-reference` | no | content name | Content this text is synchronized with, usually audio |
| `sync-mode` | yes | `media-clock`, `session-clock`, `co-session`, `none` | Synchronization model |
| `max-skew` | no | milliseconds | Maximum target presentation difference |
| `finality` | no | `partial`, `final`, `mixed` | Whether text can change |

```xml
<rtt-sync xmlns='urn:xmpp:jingle:apps:rtt-sync:0'
          role='caption'
          source='asr'
          lang='nl-NL'
          sync-group='tc1'
          sync-reference='audio'
          sync-mode='media-clock'
          max-skew='500'
          finality='partial'/>
```

## RTP/T.140 Profile

The RTP/T.140 profile is preferred when strict synchronization with audio and
video is required. The initiator offers a Jingle RTP content with `media='text'`
and payload types for `t140` and optionally `red`.

```xml
<iq from='romeo@example.org/desktop'
    to='juliet@example.org/mobile'
    id='j1'
    type='set'>
  <jingle xmlns='urn:xmpp:jingle:1'
          action='session-initiate'
          initiator='romeo@example.org/desktop'
          sid='abc123'>
    <content creator='initiator' name='audio'>
      <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'>
        <payload-type id='111' name='opus' clockrate='48000' channels='2'/>
      </description>
      <transport xmlns='urn:xmpp:jingle:transports:ice-udp:1'/>
    </content>
    <content creator='initiator' name='video'>
      <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='video'>
        <payload-type id='96' name='VP8' clockrate='90000'/>
      </description>
      <transport xmlns='urn:xmpp:jingle:transports:ice-udp:1'/>
    </content>
    <content creator='initiator' name='text'>
      <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='text'>
        <payload-type id='98' name='t140' clockrate='1000'/>
        <payload-type id='100' name='red' clockrate='1000'>
          <parameter name='fmtp' value='98/98/98'/>
        </payload-type>
        <rtt-sync xmlns='urn:xmpp:jingle:apps:rtt-sync:0'
                  role='conversation'
                  source='human'
                  lang='nl-NL'
                  sync-group='tc1'
                  sync-reference='audio'
                  sync-mode='media-clock'
                  max-skew='500'
                  finality='mixed'/>
      </description>
      <transport xmlns='urn:xmpp:jingle:transports:ice-udp:1'/>
    </content>
  </jingle>
</iq>
```

When `sync-mode='media-clock'` is negotiated, endpoints should use the same RTCP
CNAME for audio, video and text RTP streams belonging to the same endpoint.
Receivers should use RTP/RTCP timing to align text with audio or video where
possible. If timing information is unavailable, the receiver may fall back to
session arrival time and should indicate reduced synchronization quality.

## WebRTC Datachannel/T.140 Profile

The datachannel profile supports browser/WebRTC deployments using T.140 over a
reliable, ordered data channel. Data channels do not automatically share the RTP
media clock, so the synchronization mode must be declared carefully.

| Mode | When to use |
| --- | --- |
| `co-session` | Text is part of the same call but is not strictly media-clock synchronized. |
| `session-clock` | The implementation provides a common session clock. |
| `media-clock` | The implementation can provide reliable media-clock alignment. |

```xml
<content creator='initiator' name='text'>
  <description xmlns='urn:xmpp:jingle:apps:rtt-sync:0'
               profile='dc-t140'>
    <datachannel subprotocol='t140'
                 reliability='reliable'
                 order='in-order'
                 label='rtt'/>
    <rtt-sync role='conversation'
              source='human'
              lang='nl-NL'
              sync-group='tc1'
              sync-reference='audio'
              sync-mode='co-session'
              max-skew='700'/>
  </description>
  <transport xmlns='urn:xmpp:jingle:transports:dtls-sctp:1'/>
</content>
```

The exact Jingle mapping for WebRTC data channel negotiation should align with
the relevant Jingle data channel signalling specification. This document does
not replace that signalling.

## Fallback To XEP-0301

If the responder does not support `urn:xmpp:jingle:apps:rtt-sync:0`, the
initiator may fall back to XEP-0301. Fallback must be explicit in the user
interface when synchronization is required.

```xml
<message from='romeo@example.org/desktop'
         to='juliet@example.org/mobile'
         type='chat'>
  <rtt-fallback xmlns='urn:xmpp:jingle:apps:rtt-sync:0'
                sid='abc123'
                method='xep-0301'
                sync-mode='none'
                reason='peer-unsupported'/>
</message>
```

Fallback is a state transition, not just a transport choice. If a Jingle text
content is rejected but audio and video are accepted, the call may continue
without synchronized text. If fallback RTT is started for the same conversation,
it should be bound to the Jingle `sid` and shown as fallback rather than
synchronized captions.

## Business Rules

### Sender Rules

1. A sender that offers synchronized RTT must include an `rtt-sync` element.
2. A sender must identify whether the stream is conversation text, caption text,
   transcript text, interpreter text or translation text.
3. A sender should include a language tag when known.
4. A sender must not label ASR text as human captioning.
5. A sender must route Jingle text for the negotiated content through the
   negotiated Jingle transport, not through an unrelated ordinary chat path.

### Receiver Rules

1. A receiver must treat a Jingle synchronized RTT content as part of the call,
   not as normal chat.
2. A receiver should use the negotiated `sync-mode` to determine presentation.
3. A receiver must bind incoming synchronized text to the Jingle `sid` and
   content name before presenting it as part of a call.
4. A receiver should detect duplicate text received through both Jingle text and
   XEP-0301 fallback and avoid showing it twice.
5. A receiver should expose diagnostics when RTT is present in chat but absent
   from the Jingle session.

## User Interface Guidance

A user interface should distinguish live text, live captions, AI captions,
human captions, translation and unsynchronized fallback.

During call setup, a client should expose whether synchronized text was
negotiated, whether live text fallback is active or whether text is unavailable
in the call.

```text
Synchronized text: negotiated
Live text fallback: active
Text in call: unavailable
```

## Accessibility Considerations

This specification is motivated by accessibility and Total Conversation use
cases. A deaf or hard-of-hearing user must be able to distinguish typed text,
human captions, AI/ASR captions and translated text where this information is
known.

A client should visibly indicate late captions, uncertain ASR captions or
unsynchronized fallback text. A client should allow users to prefer synchronized
captions over lowest-latency captions, or lowest-latency captions over strict
synchronization.

## Internationalization Considerations

Text content must support Unicode. Language tags should use BCP 47. Clients
should support multiple simultaneous text streams where translation or
interpreter text is provided in addition to original captions.

## Security Considerations

Synchronized RTT and captions can contain sensitive conversation content.
Implementations should use end-to-end encrypted signalling and encrypted media
where available.

For RTP/T.140, implementations should use SRTP or an equivalent encrypted RTP
transport, authenticate the sender of the text stream and protect against false
caption injection. Implementations should prevent downgrade attacks from
synchronized RTT to unsynchronized fallback without user indication.

Clients should avoid misrepresenting AI captions as human or verified text.

## Privacy Considerations

Real-time text can reveal text before the sender considers it final. Captions
can reveal speech content to captioning, relay or ASR services. A client should
obtain user consent before sending typed RTT and before sending audio to ASR or
captioning services.

A client should not store partial captions or partial RTT as a final transcript
unless enabled. A client should indicate when a third-party captioning, ASR,
relay or interpreting service is active.

## IANA Considerations

This document makes no direct IANA request unless future revisions define new
SDP attributes or media types. The RTP/T.140 profile uses existing `text/t140`
and `text/red` media formats.

## XMPP Registrar Considerations

Requested namespace:

```text
urn:xmpp:jingle:apps:rtt-sync:0
```

Requested service discovery features:

```text
urn:xmpp:jingle:apps:rtt-sync:0
urn:xmpp:jingle:apps:rtt-sync:rtp-t140:0
urn:xmpp:jingle:apps:rtt-sync:dc-t140:0
```

## Design Considerations

This document does not replace XEP-0301. XEP-0301 remains appropriate for
chat-oriented real-time text and as a fallback. The distinction is that this
specification binds text to a Jingle session when Total Conversation semantics
are needed.

RTP/T.140 is the preferred strict synchronization profile. WebRTC datachannel
T.140 is useful for browser deployments, but must not be described as
media-clock synchronized unless the implementation can provide that timing
relationship.

## Implementation Experience

An experimental browser implementation tested the WebRTC datachannel profile at
Level 1. Two browser sessions negotiated one Jingle audio-video session plus a
text content using `urn:xmpp:jingle:apps:rtt-sync:0`, opened a reliable ordered
data channel labelled `rtt`, exchanged live RTT updates and delivered final text
bound to the Jingle session. The client presented the call as live text
synchronized with the call session.

The same implementation retained XEP-0301 fallback for peers that do not
negotiate the Jingle text content, so ordinary live text remains available
without being presented as synchronized call media.

## XML Schema Sketch

```xml
<xs:schema
    xmlns:xs='http://www.w3.org/2001/XMLSchema'
    targetNamespace='urn:xmpp:jingle:apps:rtt-sync:0'
    xmlns='urn:xmpp:jingle:apps:rtt-sync:0'
    elementFormDefault='qualified'>

  <xs:element name='rtt-sync'>
    <xs:complexType>
      <xs:attribute name='role' use='required'/>
      <xs:attribute name='source' use='optional'/>
      <xs:attribute name='lang' type='xs:language' use='optional'/>
      <xs:attribute name='sync-group' type='xs:NCName' use='required'/>
      <xs:attribute name='sync-reference' type='xs:NCName' use='optional'/>
      <xs:attribute name='sync-mode' use='required'/>
      <xs:attribute name='max-skew' type='xs:nonNegativeInteger' use='optional'/>
      <xs:attribute name='finality' use='optional'/>
    </xs:complexType>
  </xs:element>
</xs:schema>
```

## Open Issues

1. Should this be a new Jingle application format or an extension to XEP-0167?
2. Should RTP/T.140 be mandatory-to-implement for strict synchronization?
3. Which existing Jingle datachannel signalling elements should be used for the
   WebRTC datachannel profile?
4. Should emergency-service profiles have stricter requirements?
5. Should multiparty RTT support be included here or deferred to a separate
   specification?
