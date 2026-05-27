# Historical Telephony Notes

## VisiCom

VisiCom was a text telephone for deaf and hard-of-hearing users. It was developed by Goedhart Electronics in Amersfoort in 1986.

It belonged to an earlier communication era where accessibility often required separate hardware.

## TeleToets

TeleToets was introduced in 1989 as an extra tool for hearing users who communicated with deaf or hard-of-hearing users through text telephony.

The device provided:

- a QWERTY-like keyboard
- an LCD display with 16 characters
- a way to prepare and check typed text before sending it
- headset-based listening for the hearing user
- typed replies sent to the text telephone user

This improved the telephone-keypad typing experience and made typed communication easier in that context.

## Product Lesson

TeleToets was useful because it removed friction from typed communication. The deeper idea remains valuable:

> Make live communication easier by giving people a better text channel.

But the form must change. Dedicated telephone-era hardware was eventually replaced by internet and smartphones.

## Technical Note: DTMF And Telephone-Era Signaling

DTMF means Dual-Tone Multi-Frequency. It is the touch-tone telephone technique where each key press sends two audio frequencies over the voice channel. Classic telephony used DTMF for keypad signaling, menu control and remote equipment commands.

TeleToets belongs to that telephone-era design space: text and commands were carried through ordinary telephone audio/signaling paths instead of internet data channels.

Important caution:

- DTMF is well documented as the telephone keypad/touch-tone method.
- Text telephones could also use modem-like text transmission methods, not only plain DTMF key tones.
- We should treat TeleToets as a useful historical reference, not as a modern protocol model to copy.

Modern replacement:

| Telephone-era method | Modern method |
| --- | --- |
| DTMF / in-band tones | XMPP stanzas |
| Text telephone signaling | XEP-0301 RTT and normal chat messages |
| Telephone audio path | WebRTC audio/video transport |
| Dedicated hardware protocol | Open internet protocol |

## Lesson For Teletyptel 2.0

Teletyptel 2.0 should keep the useful principle and avoid the outdated form.

Keep:

- fast typed communication
- real-time text
- mixed voice/text interaction
- readable live conversation
- support for hearing, deaf and hard-of-hearing users in the same communication flow

Avoid:

- special single-purpose hardware
- one shrinking platform
- dependence on telephone-era assumptions
- accessibility as a separate island

Modern translation:

| Earlier tool | Modern Teletyptel 2.0 equivalent |
| --- | --- |
| Text telephone | XMPP chat and RTT |
| TeleToets keyboard | Smartphone/desktop keyboard and live text editor |
| 16-character LCD | Full conversation timeline and live transcript |
| Headset voice listening | Audio/video call with captions and RTT |
| Separate assistive device | Mainstream iOS/Android app |

## Strategic Sentence

Teletyptel 2.0 should not recreate old text telephony. It should bring the useful parts of text telephony into mainstream mobile communication.

