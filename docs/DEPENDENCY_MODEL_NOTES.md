# Dependency Model Notes

This project should learn from earlier communication and assistive-technology initiatives that became too dependent on a narrow funding or platform model.

## Risk Pattern

Some accessibility or care-related products become fragile because they depend on one dominant external buyer or reimbursement route:

- one mobile platform
- one public contract
- one insurer/reimbursement model
- one grant/subsidy stream
- one narrow target group

When that dependency changes, the service can become financially or operationally unstable even when users still need it.

## Lessons From Earlier Examples

### AnnieS

The AnnieS case shows the risk of a narrow service model and platform dependence. A service that users rely on for communication and emergency access should not depend on one fragile provider or one declining platform.

### Care And Assistive-Technology Suppliers

Several Dutch care or assistive-technology suppliers have run into continuity problems when contracts, municipalities, insurers or reimbursement streams changed. The exact companies differ, but the strategic lesson is the same:

> A communication platform should not survive only when one care payer or reimbursement system keeps paying.

### VisiCom And TeleToets

Goedhart Electronics developed VisiCom, a text telephone for deaf users, in 1986. In 1989 it introduced TeleToets as an extra device for hearing users. TeleToets offered a QWERTY-like keyboard and a small LCD display so hearing users could type replies more easily than with a normal telephone keypad.

The idea was practical for its time: it improved communication between hearing users and deaf or hard-of-hearing users through dedicated telephone-era hardware.

The long-term lesson is different:

- dedicated hardware can help early adoption, but it can become obsolete quickly
- telephone-era devices were replaced by internet, smartphones and general-purpose communication apps
- a product should not depend on special hardware when open software and mainstream devices can solve the same problem for more people
- accessibility features should move into everyday communication tools instead of staying locked in separate devices

For Teletyptel 2.0 this means:

> Do not build a modern TeleToets as a closed device. Build the communication layer for the devices people already use: iOS, Android and later desktop/web.

## Protocol Dependency Rule

The XMPP protocol layer is not outsourced to a third-party XMPP client library.
Teletyptel 2.0 should own the RFC 6120 stream flow, TLS/SASL negotiation,
stanza models and XEP-0301 real-time text behavior.

This does not mean rewriting every low-level primitive. Normal platform
building blocks are welcome:

- .NET networking and TLS primitives;
- browser WebSocket and DOM APIs;
- XML, JSON and cryptography libraries;
- provider SDKs at adapter boundaries.

The boundary is protocol ownership. If a dependency decides how XMPP login,
stream restart, RTT payloads or stanza dispatch work, it belongs outside the
core or must be replaced by typed Teletyptel code.

## Product Principle

Teletyptel 2.0 should be useful for everyone, not only reimbursed as a care tool.

This means:

- consumer use should make sense without a care insurer
- team/business use should make sense without a subsidy
- news/editorial channels can have their own paid model
- public-service channels should use partnerships, not hidden dependency
- accessibility features should be part of the normal product

## Business Model Direction

Avoid one fragile revenue source. Use multiple routes:

- free personal tier
- paid team/workspace tier
- verified channels for organizations and newsrooms
- optional hosted server/service
- future integrations with captioning/transcription partners
- possible public-sector partnerships for verified information channels

## Design Rule

Accessibility is a mainstream communication value, not a separate isolated market.

If the product helps everyone communicate more clearly, it is less vulnerable than a product that exists only because a specific care system reimburses it.

Avoid both traps:

- the reimbursement trap: the product exists only if a care payer pays
- the hardware trap: the product exists only on special or declining devices

## References For The Broader Risk

- AnnieS continuity case: https://www.nu.nl/tech/2841037/overheid-steunt-doventelefonie-na-faillissement.html
- Hulpmiddelencentrum bankruptcy and public-contract continuity concerns: https://www.skipr.nl/nieuws/hulpmiddelenleverancier-gemeenten-failliet-verklaard/
- Rechtspraak note on Hulpmiddelencentrum / Beenhakker group: https://www.rechtspraak.nl/organisatie-en-contact/organisatie/rechtbanken/rechtbank-rotterdam/nieuws/faillissement-beenhakker-groep
