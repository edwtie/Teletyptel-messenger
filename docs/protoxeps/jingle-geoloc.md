# Jingle User Location

Readable Markdown copy of the ProtoXEP XML draft.

The XSF XML file remains the source of truth for submission. This file is for
review, discussion and product planning inside Teletyptel.

## Metadata

| Field | Value |
| --- | --- |
| Short name | `jingle-geoloc` |
| Status | ProtoXEP |
| Type | Standards Track |
| Namespace | `urn:xmpp:jingle:apps:geoloc:0` |
| Author | Edward Tie, `info@tiedragon.com` |
| Revision | 0.0.1, 2026-05-31 |

## Abstract

This specification defines a Jingle application extension for negotiating and
updating user location inside an active Jingle session using the XEP-0080 User
Location payload.

## Dependencies

| Dependency | Role |
| --- | --- |
| XEP-0030 | Service discovery |
| XEP-0080 | User Location payload |
| XEP-0166 | Jingle session framework |
| XEP-0167 | Jingle RTP sessions |
| XEP-0176 | Jingle ICE-UDP transport |
| XEP-0353 | Jingle Message Initiation context |

## Introduction

XEP-0080 defines a payload for user location in XMPP. Jingle defines session
negotiation, commonly used for audio and video calls. When location is shared
during a call using only an out-of-session PEP event, the user experience can
look call-scoped while the protocol state is not bound to that Jingle session.

This specification defines a Jingle application extension for carrying XEP-0080
location information inside the same Jingle session as audio, video or other
real-time media. This lets a client express that a location update belongs to a
specific call, and stop sharing that call-scoped location when the call or
sharing action ends.

The motivating use cases include accessibility assistance, captioned or
interpreted calls, emergency-readiness experiments and Total Conversation
systems where text, audio, video and location may need to be shown as one
deliberate conversational context.

## Requirements

1. Reuse the existing XEP-0080 User Location payload instead of defining a new
   coordinate format.
2. Allow an initiator or responder to advertise location sharing as a Jingle
   content.
3. Allow a participant to send location updates during an active Jingle session.
4. Allow a participant to explicitly stop location sharing within that session.
5. Bind location updates to the Jingle `sid` and content name.
6. Permit session-scoped location sharing even when PEP/XEP-0080 publishing is
   unavailable on the server.
7. Preserve user consent, privacy and accuracy semantics from XEP-0080.
8. Support accessibility and emergency-readiness user interfaces without
   claiming to be an emergency-service protocol.

## Glossary

| Term | Meaning |
| --- | --- |
| Call-scoped location | A location update explicitly associated with one Jingle session. |
| Location content | A named Jingle content whose description uses this specification's namespace. |
| Live location | A sequence of user-consented location updates during an active session. |

## Use Cases

### Location In An Accessibility Call

A user starts a video call with an accessibility assistant or relay service. The
user explicitly chooses to share the current location with the call. The
location is negotiated as part of the Jingle session and later updated with
`session-info`.

### Location Update During Total Conversation

A Total Conversation session contains audio, video and real-time text. During
the session, the user shares a location update so the remote party can
understand where the user is, without treating the location as a global presence
update for all contacts.

### Server Without PEP Support

A server supports ordinary Jingle IQ routing but does not support PEP or
XEP-0080 publication. The client can still exchange call-scoped location with
the peer using this extension, provided the peer supports it and the user
consents.

### Stopping Location Sharing

A user shares live location during a call and then presses a stop-sharing
control. The client sends a Jingle `session-info` marker telling the peer that
this call-scoped sharing has stopped.

## Protocol Overview

This specification defines the namespace:

```text
urn:xmpp:jingle:apps:geoloc:0
```

A Jingle location content uses a `description` element in that namespace. The
description may include an initial XEP-0080 `geoloc` payload.

After the Jingle session is active, a participant sends live or one-time
location updates using Jingle `session-info` with a `location` element in this
namespace. The child payload is the normal XEP-0080 `geoloc` element.

Stopping call-scoped location sharing is represented with a `location-stop`
session-info element.

All location data remains subject to the semantics and validation rules of
XEP-0080. This specification only defines how that payload is scoped to a
Jingle session.

## Discovery

An entity supporting this specification must advertise this feature in response
to XEP-0030 `disco#info` requests:

```xml
<feature var='urn:xmpp:jingle:apps:geoloc:0'/>
```

An entity should also advertise support for XEP-0080 if it supports normal PEP
or PubSub location publication. Support for this specification does not imply
that the entity can publish location through PEP.

## Application Format

The Jingle application namespace is `urn:xmpp:jingle:apps:geoloc:0`.

| Element | Context | Meaning |
| --- | --- | --- |
| `description` | Jingle content | Advertises call-scoped user location support and may carry an initial XEP-0080 geoloc payload. |
| `location` | Jingle `session-info` | Updates the current call-scoped location with an XEP-0080 geoloc payload. |
| `location-stop` | Jingle `session-info` | Indicates that the sender has stopped sharing call-scoped location. |

The `location` and `location-stop` elements should include the Jingle `creator`
and `name` attributes when the update refers to a named location content.

## Session Initiation

A client may include a location content in a Jingle `session-initiate`, or add
it later using Jingle `content-add`. The content name should be `location`
unless another unique content name is required.

```xml
<iq from='romeo@example.org/phone'
    to='juliet@example.org/tablet'
    id='loc1'
    type='set'>
  <jingle xmlns='urn:xmpp:jingle:1'
          action='session-initiate'
          initiator='romeo@example.org/phone'
          sid='call-123'>
    <content creator='initiator' name='audio' senders='both'>
      <description xmlns='urn:xmpp:jingle:apps:rtp:1' media='audio'>
        <payload-type id='111' name='opus' clockrate='48000' channels='2'/>
      </description>
      <transport xmlns='urn:xmpp:jingle:transports:ice-udp:1'/>
    </content>
    <content creator='initiator' name='location' senders='both'>
      <description xmlns='urn:xmpp:jingle:apps:geoloc:0'>
        <geoloc xmlns='http://jabber.org/protocol/geoloc'>
          <lat>52.0907</lat>
          <lon>5.1214</lon>
          <accuracy>8</accuracy>
          <timestamp>2026-05-31T09:15:00Z</timestamp>
          <text>Utrecht</text>
        </geoloc>
      </description>
    </content>
  </jingle>
</iq>
```

If a client wants to offer call-scoped location but does not yet have permission
or a fresh location, it may send an empty location description and send the
first location with `session-info` after the user grants consent.

## Location Updates

During an active session, a participant sends location updates using Jingle
`session-info`. The update is scoped to the Jingle `sid` and optional content
name.

```xml
<iq from='romeo@example.org/phone'
    to='juliet@example.org/tablet'
    id='loc2'
    type='set'>
  <jingle xmlns='urn:xmpp:jingle:1'
          action='session-info'
          sid='call-123'
          initiator='romeo@example.org/phone'
          responder='juliet@example.org/tablet'>
    <location xmlns='urn:xmpp:jingle:apps:geoloc:0'
              creator='initiator'
              name='location'>
      <geoloc xmlns='http://jabber.org/protocol/geoloc'>
        <lat>52.0910</lat>
        <lon>5.1219</lon>
        <accuracy>6</accuracy>
        <timestamp>2026-05-31T09:16:00Z</timestamp>
      </geoloc>
    </location>
  </jingle>
</iq>
```

A receiving client must validate the XEP-0080 payload before presenting or
storing the update. A receiving client should show timestamp and accuracy when
coordinates are displayed.

## Stopping Sharing

A participant stops call-scoped location sharing by sending a `location-stop`
`session-info` element.

```xml
<iq from='romeo@example.org/phone'
    to='juliet@example.org/tablet'
    id='loc3'
    type='set'>
  <jingle xmlns='urn:xmpp:jingle:1'
          action='session-info'
          sid='call-123'>
    <location-stop xmlns='urn:xmpp:jingle:apps:geoloc:0'
                   creator='initiator'
                   name='location'/>
  </jingle>
</iq>
```

After sending or receiving `location-stop`, a client must not continue
presenting the previous call-scoped location as live. It may keep a historical
call transcript entry if local policy and user settings permit retention.

## Fallback And Relationship To XEP-0080

This specification complements XEP-0080 and does not replace it.

| Situation | Recommended behavior |
| --- | --- |
| User wants normal account-level or contact-visible location publication | Use XEP-0080 through PEP/PubSub. |
| User wants location to belong to a specific Jingle call | Use this Jingle location extension. |
| Peer does not support this specification | A client may offer normal XEP-0080 sharing, but must not present it as call-scoped unless the UI makes the difference clear. |

## Business Rules

A client implementing this specification must not send location automatically
merely because a call has started. A client must obtain a user action or policy
grant before sending location.

A client should provide separate controls for share once, share live and stop
sharing. A client should distinguish automatic GPS location from manual or stale
location.

This specification does not define emergency call routing, legal caller
identification, public-safety answering point behavior or regulatory
obligations.

## Accessibility Considerations

Call-scoped location can help users who rely on real-time text, captions, relay
services, sign-language video or other assistive communication. User interfaces
should make location sharing state visible without relying only on color, and
should expose location sharing controls to keyboard, screen-reader and switch
users.

When used with accessibility or emergency-readiness features, location should be
shown with accuracy, timestamp and source so both parties can understand how
reliable the information is.

## Internationalization Considerations

This specification reuses the XEP-0080 payload. Human-readable text inside the
XEP-0080 `geoloc` element may use `xml:lang` as specified by XEP-0080.
Coordinates are serialized using the existing XEP-0080 field formats.

## Security Considerations

Location is sensitive. A client must treat call-scoped location as sensitive
user data and must not send it without consent or an explicit configured policy.

Jingle signaling can be protected by TLS between client and server, but ordinary
XMPP stanza routing is not necessarily end-to-end encrypted. Clients that
require end-to-end confidentiality need an encryption design outside the scope
of this specification.

A malicious or compromised peer can lie about its own location. Clients must not
treat received location as verified unless additional trust, identity and
verification mechanisms are in place.

## Privacy Considerations

Clients should minimize retention of call-scoped location. If location is stored
in a call history or transcript, that retention must be visible to the user and
controlled by user or deployment policy.

Clients should stop sending location when the call ends, when the user presses
stop sharing, when the application loses the necessary permission, or when the
location source becomes stale.

Clients should avoid broadcasting call-scoped location through presence, MUC
history or message archives unless the user explicitly chooses a broader sharing
mode.

## IANA Considerations

This document requires no interaction with IANA.

## XMPP Registrar Considerations

Requested protocol namespace:

```text
urn:xmpp:jingle:apps:geoloc:0
```

Requested service discovery feature:

```text
urn:xmpp:jingle:apps:geoloc:0
```

## Design Considerations

One alternative is to use only XEP-0080 PEP publication. That is appropriate for
normal user location publication, but it does not bind the update to a
particular Jingle session and can fail on servers without PEP support.

Another alternative is to define new latitude and longitude attributes inside
Jingle. That would duplicate XEP-0080, lose fields such as accuracy and
timestamp, and create unnecessary conversion work. This specification therefore
reuses the complete XEP-0080 payload.

## XML Schema Sketch

```xml
<xs:schema
    xmlns:xs='http://www.w3.org/2001/XMLSchema'
    targetNamespace='urn:xmpp:jingle:apps:geoloc:0'
    xmlns='urn:xmpp:jingle:apps:geoloc:0'
    xmlns:geoloc='http://jabber.org/protocol/geoloc'
    elementFormDefault='qualified'>

  <xs:import namespace='http://jabber.org/protocol/geoloc'/>

  <xs:element name='description'>
    <xs:complexType>
      <xs:sequence minOccurs='0' maxOccurs='1'>
        <xs:element ref='geoloc:geoloc'/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>

  <xs:element name='location'>
    <xs:complexType>
      <xs:sequence>
        <xs:element ref='geoloc:geoloc'/>
      </xs:sequence>
      <xs:attribute name='creator' type='xs:string' use='optional'/>
      <xs:attribute name='name' type='xs:string' use='optional'/>
    </xs:complexType>
  </xs:element>

  <xs:element name='location-stop'>
    <xs:complexType>
      <xs:attribute name='creator' type='xs:string' use='optional'/>
      <xs:attribute name='name' type='xs:string' use='optional'/>
    </xs:complexType>
  </xs:element>
</xs:schema>
```
