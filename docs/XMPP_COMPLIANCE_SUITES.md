# XMPP Compliance Suites

Official reference:

- https://xmpp.org/about/compliance-suites/
- https://xmpp.org/extensions/attic/xep-0479-0.1.0.html

The XMPP Standards Foundation publishes compliance suites to group required
specifications by application category. The currently referenced suite is
XEP-0479: XMPP Compliance Suites 2023. The compliance page explains that suites
define categories such as Core, Web, IM and Mobile, and levels such as Core and
Advanced.

This project should use the suites as an external checklist, next to its own
implementation checklist.

## Core Compliance - Client Direction

Required for a normal client direction:

| Feature | Provider | Project status |
| --- | --- | --- |
| Core features | RFC 6120 | Started |
| TLS | RFC 7590 | Started |
| Feature discovery | XEP-0030 | Started |
| Feature broadcasts | XEP-0115 Entity Capabilities | Started |

Advanced client direction:

| Feature | Provider | Project status |
| --- | --- | --- |
| Direct TLS | XEP-0368 | Planned |
| Event publishing | XEP-0163 PEP | Later |

## Web Compliance

Web compliance builds on Core.

| Feature | Provider | Project status |
| --- | --- | --- |
| Web connection mechanisms | RFC 7395 and/or XEP-0206 / XEP-0124 | Started |
| Connection mechanism discovery | XEP-0156 | Started |

The PHP/WebSocket relay now supports RFC 7395 transport smoke tests, but it is
still not a full XMPP server.

## IM Compliance - Client Direction

IM compliance builds on Core.

| Feature | Provider | Project status |
| --- | --- | --- |
| IM and presence core | RFC 6121 | Started |
| The `/me` command | XEP-0245 | Started |
| vcard-temp | XEP-0054 | Started |

Advanced IM direction:

| Feature | Provider | Project status |
| --- | --- | --- |
| User avatars | XEP-0084 | Later |
| vCard avatar compatibility | XEP-0398 and XEP-0153 | Later |

## Mobile Compliance

Mobile compliance builds on Core.

| Feature | Provider | Project status |
| --- | --- | --- |
| Stream management | XEP-0198 | Planned |
| Client state indication | XEP-0352 | Planned |
| Push notifications | XEP-0357 | Started |

## Important For This Project

Minimum practical client target:

- Core client direction.
- IM client direction.
- XEP-0301 real-time text as a project-specific priority.
- XEP-0198 before serious mobile/unstable network scenarios.

Do not claim compliance until the listed requirements are implemented, tested
and documented.

## Gap Against Compliance Suite

Current known gaps:

- XEP-0198 Stream Management real-server testing.
- XEP-0352 Client State Indication.
- XEP-0357 Push Notifications real-provider/mobile integration.

RTT/XEP-0301 is not the main compliance-suite baseline, but it remains central
to this product.

## Core Client Self-Assessment

| Requirement | Status | Evidence |
| --- | --- | --- |
| RFC 6120 streams | Started | Stream open/read/write, feature parser and fake-server tests. |
| RFC 6120 TLS/SASL/bind | Started | STARTTLS plan, TLS upgrader hook, SCRAM/PLAIN and bind tests. |
| RFC 7590 TLS policy | Started | TLS required by default and downgrade protection tests. |
| RFC 7622 addresses | Started | Bare/full JID, IDN normalization and invalid JID tests. |
| XEP-0030 discovery | Started | disco#info request/result and RTT feature checks. |
| XEP-0115 capabilities | Started | Verification string/hash and presence payload tests. |
| XEP-0156 alternatives | Started | host-meta XML/JSON parser for WebSocket/BOSH endpoints. |

Core is not yet claimed compliant because real-server TLS hostname and account
smoke tests are still open.

## IM Client Self-Assessment

| Requirement | Status | Evidence |
| --- | --- | --- |
| RFC 6121 chat | Started | Normal chat serialization, parsing and fake-server send/receive. |
| RFC 6121 presence | Started | Presence, subscription and initial presence helpers. |
| RFC 6121 roster | Started | Roster get/set/remove helpers and parser tests. |
| XEP-0245 `/me` | Started | Body-preserving parser/display helper tests. |
| XEP-0054 vcard-temp | Started | IQ get/set/result helpers for core vCard fields. |
| XEP-0357 push | Started | Enable/disable IQ payload helpers. |

IM is not yet claimed compliant because real two-account chat, UI login and
server smoke coverage are still open.
