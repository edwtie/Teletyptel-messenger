# WhatsApp, RTT And Emergency Communication Notes

WhatsApp is strong for everyday social messaging, but it is not a complete replacement for official telecommunication and emergency-access functions.

This matters for TabMessenger because the product idea is not just "another chat app". The goal is clearer, more readable and more accessible communication for everyone.

## Gap 1: WhatsApp Does Not Provide Telecom RTT

RTT means Real-Time Text. The receiver can read text while it is being typed, without waiting for the sender to press Send.

This is different from normal instant messaging:

| Feature | Normal messenger | RTT |
| --- | --- | --- |
| Typing indicator | Shows that someone is typing | Optional |
| Text visibility | After pressing Send | While typing |
| Conversation feel | Message-by-message | Live conversation |
| Accessibility value | Useful, but delayed | Closer to a live call |

WhatsApp follows the normal instant-messaging pattern: type, send, wait. It is not a telecom RTT service.

Modern phones handle RTT at the operating-system/phone-call layer:

- iOS supports RTT/TTY through the Phone app.
- Android supports RTT during calls when the phone, carrier and region support it.

## Gap 2: WhatsApp Is Not 112/911

WhatsApp should not be treated as an emergency service.

Risks:

- no official 112/911 emergency route through WhatsApp
- no guaranteed emergency handling
- no automatic official emergency location flow
- dependency on a commercial chat platform
- dependency on internet availability and WhatsApp service availability

## Dutch Official Route: 112NL

In the Netherlands, the official 112NL app exists for people who need help reaching the emergency room when calling is difficult.

Officially described functions include:

- contact with the emergency control room
- chat when the caller cannot hear or speak well
- location sharing when permission is given
- chat translation in the preferred language

This is the correct type of official route for emergency access. TabMessenger must not claim to replace it.

## Product Lesson For TabMessenger

TabMessenger should not market itself as an emergency-calling replacement.

Better positioning:

> TabMessenger can make everyday and organizational communication more readable through chat, real-time text, captions, transcripts and verified information channels. Official emergency access remains with national emergency services and their official apps.

## Design Direction

Use these lessons:

- build RTT as a first-class communication mode
- make live text useful for everyone, not only as a special accessibility feature
- support verified channels for public information, newsrooms and organizations
- avoid dependency on one closed commercial platform
- avoid pretending to be 112/911
- link users to official emergency routes where appropriate

## Sources

- Rijksoverheid: https://www.rijksoverheid.nl/vraag-en-antwoord/alarmnummer-112/112-bellen-doven-slechthorenden
- Politie 112NL app information: https://www.politie.nl/informatie/informatie-over-de-112nl-app.html
- Apple RTT/TTY support: https://support.apple.com/en-mide/111776
- Android RTT support: https://support.google.com/messages/answer/9042284
