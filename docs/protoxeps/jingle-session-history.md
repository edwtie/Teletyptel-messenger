# protoXEP: Jingle Session History

Namespace: `urn:xmpp:jingle-history:0`

TeleTypTel uses this experimental extension to represent Jingle call history as
ordinary XMPP message metadata. It is intentionally not a media archive.

## Architecture

- Jingle remains responsible for live media/session signalling.
- MAM archives normal message events and call metadata.
- Audio/video recordings, voice messages and video messages remain file/media
  objects outside MAM.
- Local-only call history can remain on the device without sending an XMPP
  message.
- Cloud or external recordings require explicit consent or policy-based service
  rules and must carry encryption/retention metadata when known.

## Message Shape

```xml
<message type='chat' id='call-001'>
  <body>Total Conversation call · 12:44</body>
  <jingle-history xmlns='urn:xmpp:jingle-history:0'
                  sid='tc-908812'
                  direction='outgoing'
                  disposition='completed'
                  media='audio video rtt captions'
                  profile='total-conversation'
                  duration='764'
                  recording='none'
                  transcript='local'/>
  <store xmlns='urn:xmpp:hints'/>
</message>
```

## Discovery

Clients can advertise:

```xml
<feature var='urn:xmpp:jingle-history:0'/>
<feature var='urn:xmpp:jingle-history:recording:0'/>
<feature var='urn:xmpp:jingle-history:transcript:0'/>
<feature var='urn:xmpp:jingle-history:emergency:0'/>
```

## Current Implementation

The web client module is `php/public/jingle-history.js`. It provides constants,
parser, serializer, message builder, renderer, duration formatter, local-only
payload handling and local storage helpers.

The current web integration adds `<jingle-history/>` to archived call summary
messages for completed, missed, declined and failed calls. Existing TeleTypTel
`call-info` metadata is retained for backwards-compatible UI rendering.
