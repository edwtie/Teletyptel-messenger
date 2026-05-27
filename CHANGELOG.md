# Changelog

## Unreleased

### Added

- XEP-0045 Multi-User Chat helpers for room discovery, room items,
  join/leave presence, groupchat messages, direct invitations, room
  configuration forms and admin role/affiliation flows.
- XEP-0363 HTTP File Upload support for slot requests, HTTPS slot parsing,
  PUT execution, allowed-header filtering, server `max-file-size` discovery and
  OOB message-link creation.
- XEP-0384 OMEMO wire scaffolding for device lists, bundle requests and
  encrypted message wrappers.
- XEP-0166/0167/0176 Jingle scaffolding for RTP session signaling and an
  ICE-UDP transport placeholder.
- `XmppStreamClient` helper methods for the new upload, OMEMO, MUC and Jingle
  protocol flows.
- Local web file upload endpoint and chat attachment cards for Alpha relay
  testing.

### Known Limits

- OMEMO cryptography, key trust, ratchet/session storage and encrypted payload
  handling are not implemented yet.
- Voice/video media transport, WebRTC integration and ICE candidate exchange
  are not implemented yet.
- Web file upload currently stores files locally under the PHP public upload
  directory; browser-to-real-XMPP XEP-0363 wiring still needs UI integration.

## 0.1.0-alpha1 - 2026-05-27

First public alpha evaluation release.

### Added

- Web chat client with conversation list, live RTT draft view, final message
  bubbles, light/dark mode, language selector, provider tabs and smiley assets.
- PHP WebSocket relay for local XEP-0301 RTT and RFC 7395 frame experiments.
- MySQL/MariaDB account profile API with local browser fallback.
- English and Dutch web `.lng` files.
- C# XMPP core for RFC 6120/6121 basics: JID parsing, stream features,
  STARTTLS planning, SASL, resource binding, roster, presence, one-to-one chat
  and typed incoming stanzas.
- XEP helpers for service discovery, stream management, in-band registration,
  real-time text, chat states, delivery receipts, message carbons, vCard-temp,
  push notification IQs and archive query/result parsing.
- Local fake XMPP server with mandatory STARTTLS, XEP-0077 registration, SASL
  PLAIN, resource binding, empty roster, disco#info and one-to-one chat relay.
- Real-server smoke tool for TLS validation, hostname rejection, XEP-0077 and
  two-account chat checks.
- LngPdk package loader/compiler library used by the demo localization path.
- Public documentation for getting started, real-server testing, protocol
  coverage, accessibility vision and XSF software-directory readiness.

### Known Limits

- The hosted public demo is not live yet; Alpha 1 is evaluated locally.
- The PHP relay is a development bridge, not a production XMPP server.
- The web UI does not yet log into arbitrary production XMPP servers directly.
- End-to-end encryption, group chat, file upload and calls are roadmap items.
