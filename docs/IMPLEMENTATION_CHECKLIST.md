# Implementation Checklist

This checklist tracks protocol and product progress. Use `[x]` only when the
item is implemented, tested and documented.

## Alpha 2 - Web, Accounts And Localization

- [x] Teletyptel architecture diagram linked from the README.
- [x] XMPP core, RFC 7395 and XEP extensions shown as separate architecture layers.
- [x] Web client light/dark theme switch.
- [x] Web client account profile controls for JID, display name, peer, password option and language.
- [x] Local browser profile fallback for account settings.
- [x] PHP account API for loading and saving account profiles.
- [x] MySQL/MariaDB schema for account profiles.
- [x] WAMP/MySQL local setup documented.
- [x] Account API smoke-tested against local MariaDB.
- [x] Web `.lng` loader with English and Dutch language files.
- [x] `preferredLanguage` saved through the account profile API.
- [x] Legacy smiley catalog and web rendering support.
- [x] AI bot console demo for live RTT testing.
- [x] Critical `.lng` versus LngPdk risk notes documented.
- [x] LngPdk production direction documented separately from loose `.lng` fallback.
- [ ] LngPdk package serving and verification in the web/mobile clients.
- [ ] Language key completeness validator for web `.lng` and packaged LngPdk resources.
- [ ] Account authentication/session model; current Alpha 2 profile API is not login security.
- [ ] Password handling hardening; current local profile password option is a prototype setting.
- [ ] Real XMPP server two-account chat smoke test.
- [ ] Roster/contact model backed by XMPP instead of local demo state.
- [ ] Replace demo relay semantics with standards-based XMPP production routing.
- [ ] Mobile WebView packaging smoke test for Android and iOS.

## RFC 6120 - XMPP Core

- [x] JID/address parsing.
- [x] Connection settings with TLS default.
- [x] Stream open XML.
- [x] Stream close XML.
- [x] Stream feature parsing.
- [x] Open-ended stream reader.
- [x] Stream writer with flush.
- [x] TCP client skeleton.
- [x] STARTTLS command.
- [x] STARTTLS proceed/failure handling.
- [x] TLS stream upgrade hook.
- [x] Real `SslStream` upgrader.
- [x] Stream restart after STARTTLS.
- [x] Required TLS downgrade protection.
- [x] SASL PLAIN.
- [x] SCRAM-SHA-1.
- [x] SCRAM-SHA-256.
- [x] SASL mechanism selection.
- [x] Stream restart after SASL success.
- [x] Resource binding request.
- [x] Bound JID storage.
- [x] Typed protocol exceptions.
- [x] Full stream error parser.
- [x] Full stanza error parser.
- [ ] Real server TLS certificate smoke test with `Tiedragon.XmppMessenger.RealServerSmoke`.

## RFC 6121 - IM And Presence

- [x] Chat message model.
- [x] Presence model.
- [x] Roster item model.
- [x] Roster get IQ.
- [x] Roster result parsing.
- [x] Initial presence helper.
- [x] Incoming stanza classification.
- [x] Presence subscription workflow.
- [x] Roster set/remove workflow.
- [x] Normal chat send/receive fake-server scenario.
- [ ] Real server two-account chat smoke test with `Tiedragon.XmppMessenger.RealServerSmoke`.

## RFC 7395 - XMPP Over WebSocket

- [x] Decide whether core library should implement RFC 7395 directly.
- [x] Separate current demo relay from standards-based WebSocket XMPP.
- [x] WebSocket stream transport abstraction.
- [x] RFC 7395 framing/open test.
- [x] PHP relay accepts `xmpp` WebSocket subprotocol.
- [x] PHP relay handles RFC 7395 open/close frames.
- [x] PHP relay RFC 7395 smoke test.

## RFC 7590 - TLS For XMPP

- [x] TLS required by default.
- [x] STARTTLS downgrade protection.
- [x] `SslStream` client authentication path.
- [x] Certificate validation policy documentation.
- [ ] Hostname validation smoke test with `Tiedragon.XmppMessenger.RealServerSmoke --bad-host`.
- [x] Minimum TLS version policy.

## RFC 7622 - XMPP Address Format

- [x] Bare JID parsing.
- [x] Full JID parsing.
- [x] Domain normalization.
- [x] Invalid JID rejection.
- [x] More RFC 7622 edge-case tests.

## XEP-0030 - Service Discovery

- [x] disco#info request.
- [x] disco#info result parsing.
- [x] Identity parsing.
- [x] Feature parsing.
- [x] Client helper to request server discovery.
- [x] Contact/client capability discovery.

## XMPP Compliance Suites

- [x] Compliance suites document added.
- [x] XEP-0115 Entity Capabilities.
- [x] XEP-0156 Alternative Connection Method discovery.
- [x] XEP-0245 `/me` command.
- [x] XEP-0054 vcard-temp.
- [x] XEP-0357 Push Notifications.
- [x] Compliance self-assessment table for Core Client.
- [x] Compliance self-assessment table for IM Client.

## XEP-0301 - Real-Time Text

- [x] RTT packet model.
- [x] RTT insert/erase model.
- [x] RTT XML parse/serialize.
- [x] RTT state application.
- [x] Unicode code point positions.
- [x] RTT JSON envelope for demo relay.
- [x] RTT XMPP message payload with body fallback.
- [x] Per-contact RTT state manager.
- [x] RTT receive integration in `XmppStreamClient`.
- [x] RTT capability check through XEP-0030.

## XEP-0085 - Chat State Notifications

- [x] Model states: active, composing, paused, inactive, gone.
- [x] Serialize chat state payload.
- [x] Parse chat state payload.
- [x] Send helper.
- [x] Receive helper.

## XEP-0184 - Message Delivery Receipts

- [x] Receipt request payload.
- [x] Receipt received payload.
- [x] Message id correlation.
- [x] Send helper.
- [x] Receive helper.

## XEP-0198 - Stream Management

- [x] Enable stream management.
- [x] Track outbound stanza count.
- [x] Track inbound stanza count.
- [x] Ack request/response.
- [x] Resume support.
- [x] Reconnect fake-server test.

## XEP-0280 - Message Carbons

- [x] Enable carbons.
- [x] Parse sent/received forwarded message.
- [x] Device sync tests.

## XEP-0313 - Message Archive Management

- [x] Query archive.
- [x] Parse forwarded archived messages.
- [x] Paging/result-set management.

## Tooling And Samples

- [x] WinForms RTT demo.
- [x] Legacy smiley code catalog.
- [x] Web chat client shell.
- [x] Web chat client RTT relay integration.
- [x] Web chat client RFC 7395 controls.
- [x] Browser/PHP RTT relay demo.
- [x] PHP RTT relay protocol boundary documented.
- [x] PHP RTT relay safety boundary documented.
- [x] PHP RTT relay syntax validation script.
- [x] AI bot console demo.
- [x] LngPdk package loading.
- [x] LngPdk package compilation.
- [x] WinForms login using `XmppStreamClient.LoginAsync`.
- [x] Debug console for raw XML trace.
- [x] Local Prosody/Openfire smoke setup notes.
- [x] Real-server smoke tool for TLS, hostname validation and two-account chat.

## Accessibility Agent

- [x] Accessibility agent vision document.
- [x] Accessibility input/source architecture direction.
- [x] Speech-to-text provider abstraction.
- [x] Text-to-speech provider abstraction.
- [x] Live captions model.
- [x] Caption-to-RTT bridge.
- [x] Local-only versus remote-shared caption mode.
- [x] Speaker label model.
- [x] External microphone kit/provider adapter.
- [x] Transcript retention/privacy settings.
- [x] Agent message marking.
- [x] Translation provider abstraction.
- [x] Sign-language research notes.
- [x] Video/sign-language provider abstraction.
- [x] Accessibility user testing notes.

## Product Platform

- [x] Account/provider/tab model documented.
- [x] Provider manifest example documented.
- [x] Provider manifest loader.
- [x] Static provider tabs in web client.
- [x] Local account profile JSON.
- [x] Capability display in web client settings.

## Documentation

- [x] Protocol notes.
- [x] RFC 6120 implementation plan.
- [x] Architecture document.
- [x] Existing XMPP app study.
- [x] XEP roadmap.
- [x] Implementation checklist.
- [x] Accessibility agent vision.
- [x] Public API overview.
- [x] Real-server setup guide.
- [x] XSF software directory preparation notes.
- [x] Teletyptel 2.0 DOAP draft.
- [x] Own-XMPP-core dependency rule documented.
