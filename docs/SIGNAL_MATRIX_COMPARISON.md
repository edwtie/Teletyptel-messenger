# Signal And Matrix Comparison

Signal and Matrix are important references for Teletyptel 2.0. They solve parts of the same communication problem, but with different trade-offs.

## Signal

Signal is a secure messenger with open-source clients and strong end-to-end encryption.

Strengths:

- excellent privacy reputation
- strong Signal Protocol cryptography
- mature mobile-first chat experience
- voice and video calls
- open-source clients and protocol libraries
- simple user experience

Limitations for the Teletyptel 2.0 idea:

- not federated like XMPP or Matrix
- users depend on Signal's service network
- not designed as an open verified-channel platform for newsrooms, public organizations and self-hosted communities
- not a general open protocol ecosystem where many independent servers can interoperate
- not focused on RTT as a first-class live text mode

Useful lessons:

- simple onboarding matters
- privacy must be understandable to normal users
- calling must feel reliable before it is marketed heavily
- cryptography UX is as important as cryptography itself

## Matrix

Matrix is an open standard for decentralized real-time communication. Element is the best-known Matrix client and Element Call builds on Matrix real-time calling work.

Strengths:

- open protocol
- federation and self-hosting
- rooms, spaces and communities
- end-to-end encryption
- bridges to other services
- strong fit for teams and organizations
- active work on MatrixRTC and Element Call for real-time communication

Limitations for the Teletyptel 2.0 idea:

- can feel complex for normal users
- homeserver identity and room concepts can be harder to explain than ordinary chat
- mobile push/background behavior still needs careful product design
- not primarily positioned around RTT and readable live communication for everyone
- ecosystem complexity may be heavy for a small first product

Useful lessons:

- federation can support public/private organizational communication
- rooms/spaces map well to Teams and News tabs
- calls and live collaboration should be part of the protocol model, not a bolt-on
- self-hosting can be a business and trust advantage

## XMPP Compared With Matrix

| Area | XMPP | Matrix |
| --- | --- | --- |
| Age/maturity | Very mature internet messaging standard | Newer but mature enough for production use |
| Federation | Yes | Yes |
| Mobile ecosystem | Strong clients exist, but uneven | Strong Element ecosystem |
| Real-time text | XEP-0301 exists | No equivalent product-defining default |
| Calls | Jingle + WebRTC | Matrix calls / MatrixRTC + WebRTC |
| Complexity | Modular through XEPs | Larger integrated room/event model |
| Self-hosting | Prosody, ejabberd, Openfire | Synapse, Dendrite, Conduit and others |
| Fit for simple first prototype | Good for chat/RTT if library choice works | Good for rooms/teams, heavier for first protocol implementation |

## Product Decision For Now

Keep XMPP as the first protocol direction because:

- XEP-0301 gives a direct standards path for RTT
- Jingle maps to audio/video signaling
- MUC and PubSub can support rooms and channels
- the protocol is open and federated
- it avoids depending on one closed commercial platform

Keep Matrix as a serious second track:

- study Element/MatrixRTC for group calls and teams
- consider Matrix bridge/interoperability later
- re-evaluate if mobile XMPP libraries or Jingle/WebRTC prove too weak

Do not build on Signal as the main platform because Signal is not a federated/open service layer for the verified-channel and self-hosting model. Study it for privacy UX and mobile polish.

## References

- Signal GitHub organization: https://github.com/signalapp
- Signal Protocol library: https://github.com/signalapp/libsignal
- Element open source overview: https://element.io/en/open-source
- Element GitHub organization: https://github.com/element-hq
- MatrixRTC overview: https://element.io/blog/exploring-matrixrtc-real-time-communication-in-rooms/
- Matrix VoIP FAQ: https://matrix.org/docs/older/faq/
- Matrix JavaScript SDK VoIP guide: https://matrix-org-matrix-js-sdk.mintlify.app/guides/voip-calling

