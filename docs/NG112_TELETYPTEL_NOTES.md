# NG112 And Teletyptel Location Notes

Teletyptel 2.0 is not an emergency-service replacement. These notes record the
technical direction for future accessibility and public-service interop without
claiming live 112/NG112 readiness.

## Product Principle

Teletyptel should make total conversation normal:

- real-time text;
- normal chat;
- audio and video;
- captions;
- file and image exchange;
- verified contact and provider identity;
- explicit, permission-gated location.

Location is sensitive. It must be shared deliberately and shown with accuracy,
timestamp and source.

## XMPP Location Path

Use XEP-0080 User Location on the XMPP side. It fits Teletyptel because it can
publish location through PEP/PubSub and can carry useful fields such as
latitude, longitude, altitude, accuracy, timestamp and human-readable text.

Protocol implementation now includes:

- a typed location model;
- XEP-0080 parse/serialize;
- XEP-0163 publish/retrieve/clear/retract integration;
- service discovery support detection, because some XMPP servers do not offer
  PEP/XEP-0080 publish or retrieval;
- local-server PEP storage for smoke tests;
- browser location permission flow with share-once, live-share and stop-share
  controls;
- visible accuracy, timestamp, source, stale-location and server-support warnings;
- PIDF-LO export helper for simulator/gateway experiments.

Product work still needs:

- real-server PEP testing with a non-emergency account on both supporting and
  non-supporting servers;
- hosted mobile WebView permission smoke;
- NG112 simulator-only gateway test plan.

## NG112 Gateway Path

Emergency-service systems use different protocols and operational rules. XMPP
location is useful inside Teletyptel, but a public-safety gateway must translate
trusted location state to emergency-service formats such as PIDF-LO/RFC 6442.

Do not connect this to live emergency services without agreements,
certification, logging policy, privacy review and operational testing.

## Total Conversation Mapping

| Teletyptel capability | XMPP side | Emergency gateway side |
| --- | --- | --- |
| Live text | XEP-0301 | RFC 4103 / MSRP / gateway-specific RTT |
| Audio/video | Jingle/WebRTC | SIP/WebRTC/NG112 gateway media |
| Location | XEP-0080 | PIDF-LO / RFC 6442 |
| Service contact | XEP-0157 | provider/service metadata |
| Identity/account | JID/profile/provider | authenticated caller/callback identity |

## Standards To Track

- XEP-0080 User Location: https://xmpp.org/extensions/xep-0080.html
- XEP-0163 Personal Eventing Protocol: https://xmpp.org/extensions/xep-0163.html
- RFC 6442 Location Conveyance for SIP: https://www.rfc-editor.org/rfc/rfc6442
- RFC 5194 Framework for Real-Time Text over IP: https://www.rfc-editor.org/rfc/rfc5194
- RFC 9071 RTT mixing: https://www.rfc-editor.org/rfc/rfc9071
- ETSI NG112 core architecture: https://www.etsi.org/technologies/emergency-communications

## Checklist

- [x] XEP-0080 model and XML helpers.
- [x] Browser/mobile location provider.
- [x] User consent and stop-sharing controls.
- [x] UI for accuracy, timestamp, source, stale state and server-support warning.
- [x] Server capability model for PEP/XEP-0080 support.
- [x] Local-server PEP smoke path.
- [ ] Real-server PEP smoke path on supporting and non-supporting servers.
- [x] PIDF-LO/RFC 6442 export prototype.
- [ ] NG112 simulator-only test plan.
