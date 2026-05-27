# RTT And TTY Interworking Notes

Source:

- Gunnar Hellström, Omnitor / RERC on Telecommunications Access, "Real-Time Text and TTY interworking in IMS/LTE and various technical environments", 2014.
- PDF: https://tap.gallaudet.edu/IPTransition/Real-Time%20Text%20and%20TTY%20interworking%20in%20various%20technical%20environments.pdf

## Why This Source Matters

This document explains the transition from legacy TTY/PSTN text communication to IP-based RTT in IMS/LTE environments.

It is important for Teletyptel 2.0 because it confirms the core product direction:

> Modern text communication should move from fragile audio-tone/telephone-era technology to IP-based real-time text with better quality, lower latency and richer conversation modes.

## Important Technical Points

RTT is not just normal chat. The document describes RTT as:

- two-way simultaneous text communication
- smooth remote text presentation while typing
- target latency below one second from keypress to remote display
- UTF-8 text coding for international use
- text editing support such as newline and erase-last-character with remote effect
- possible simultaneous use with audio, and optionally video

This matches the Teletyptel 2.0 idea:

- chat should be readable live
- audio/video and text should coexist
- text must not be treated as a fallback only

## Legacy TTY Limitations

The source describes legacy TTY as having useful but limited functionality. It also notes quality problems when audio-coded TTY tones are transported over IP networks.

Important lesson:

> Audio-tone text transmission is fragile in packet networks. Modern communication should use native IP text protocols where possible.

For Teletyptel 2.0:

- do not emulate legacy TTY tones
- do not depend on audio-tone detection
- use XMPP/XEP-0301 or another native IP text protocol for RTT

## Interworking Lesson

The document discusses interworking units that convert between legacy TTY and modern RTT.

That is useful historically, but it is not the first Teletyptel 2.0 product goal.

Teletyptel 2.0 should focus first on native IP communication:

- RTT-to-RTT
- chat-to-chat
- audio/video with RTT/captions
- verified information channels

Interworking with legacy emergency or telecom systems should only happen through official partnerships, standards and public-service integrations.

## Accessibility Requirements

The source mentions terminal accessibility needs such as:

- audible alerting
- visible alerting
- tactile alerting
- possible external alerting devices

Teletyptel 2.0 should translate this into modern app behavior:

- sound notifications
- vibration/haptics
- visual alerts
- persistent missed-call/message indicators
- configurable emergency/important-channel alert style
- accessible notification settings on iOS and Android

## Product Principle

RTT should not be hidden as a special mode for a small group.

It should be part of the normal communication model:

- type live during chat
- type live during audio/video
- read back conversation history
- combine voice, video, text and captions
- support everyone who benefits from readable live communication

## Relation To XMPP

XMPP has a direct RTT path through:

- XEP-0301: In-Band Real Time Text

The telecom/IMS world has its own RTT architecture. Teletyptel 2.0 should not copy IMS, but the quality requirements are still useful:

- low latency
- reliable text delivery
- UTF-8
- visible handling of loss or failed delivery
- editing semantics that make sense to both sides

## Open Questions

- Which mobile platform primitives are needed for the web, Android and iOS clients?
- Which XEP-0301 behavior must be shared between all Teletyptel 2.0 clients?
- How should RTT appear in the UI: inline draft stream, separate live panel or combined transcript?
- How should RTT interact with normal message send?
- Should RTT be on by default per contact, per room or per call?
- How should RTT behave in group chat?
- What fallback should appear when the other client does not support RTT?

## Strategic Sentence

Teletyptel 2.0 should carry forward the useful idea of TTY and text telephony, but implement it as native IP real-time text for modern mobile communication.

