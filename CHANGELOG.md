# Changelog

## Unreleased

### Added

- Public TeleTypTel branding pass for the web package, Windows demo language
  files, language package manifests, project metadata, XSF entry drafts and
  architecture diagrams. Internal `Tiedragon.XmppMessenger` namespaces and
  executable names remain stable for build compatibility.
- TeleTypTel web client shell now uses the TeleTypTel logo, branded chat
  wallpaper, messenger-style empty state, compact top actions, settings gear,
  theme toggle and separate contact/group list.
- Account and identity model for local accounts plus linked login identities:
  e-mail/JID separation, account/JID collision handling direction, Google,
  Facebook and Apple OAuth Authorization Code + PKCE backend flows, account
  profile storage and XMPP account binding.
- Account security flows for local development: password reset by e-mail,
  e-mail verification codes, TOTP/QR-code two-factor setup, remembered browser
  sessions and account/profile database migration helpers.
- Profile UI and persistence for display name, avatar, phone/date/language and
  provider metadata, including an avatar cropper with zoom and circular preview.
- PHP XMPP library expanded into a PHP-only server/runtime path that does not
  require .NET 10: TCP/STARTTLS stream client, SASL PLAIN/OAUTHBEARER/SCRAM,
  resource binding, roster, presence, chat, RTT, PubSub/PEP, upload, MAM,
  BOSH, WebSocket and common XEP wire-model helpers.
- PHP helpers for XEP-0050, XEP-0054, XEP-0059, XEP-0060, XEP-0077, XEP-0084,
  XEP-0115, XEP-0124/XEP-0206, XEP-0156, XEP-0157, XEP-0198, XEP-0203,
  XEP-0215, XEP-0245, XEP-0280, XEP-0334, XEP-0352, XEP-0357, XEP-0359,
  XEP-0385, XEP-0392, XEP-0393, XEP-0424, XEP-0425, XEP-0433, XEP-0486,
  XEP-0494 and XEP-0514.
- XEP-0486 MUC Avatars support in PHP and C# helpers, plus web UI for
  choosing and rendering group avatars in the conversation list and header.
- XEP-0060 provider announcement/news helper with Atom entry publish, item
  retrieval and event-notification parsing.
- Web attachment menu for photo, video, documents and location sharing, with
  file/photo cards, local upload API, image preview popup and download action.
- Database-backed chat history for completed messages, edited messages,
  retractions, attachments and location cards, so browser sessions can reload
  conversation state instead of only showing transient relay text.
- Interactive location sharing UI with map preview, share duration up to eight
  hours, Google Maps/OpenStreetMap provider setting, browser geolocation
  permission handling and single live location card updates instead of duplicate
  GPS bubbles.
- Total Conversation call UI with combined audio/video/RTT modes, hangup,
  microphone mute, camera on/off, speaker mute, volume control and show/hide
  live RTT overlay during a call.
- Two-line live RTT overlay during Total Conversation calls: local text and
  remote/relay text remain visible over the video area while the normal chat
  timeline stays available.
- Web client smiley picker behavior now inserts smiley codes while rendering
  images in messages, keeping the typed protocol text clean.
- LocalServer Admin Windows app for local development: process/port overview,
  Apache/WAMP visibility, local server controls, SQL status and force-terminate
  action for stuck localhost services.
- Enterprise/customer documentation folder with standards notes, EN 301 549 and
  WCAG 2.2 AA direction, SIP-gateway positioning, ejabberd provider-server
  recommendation and a simplified network/layers SVG.
- Linux setup and README now explain the split between the C# XMPP library and
  PHP XMPP library, including that PHP-hosted deployments do not require
  .NET 10 unless C# tools or desktop samples are used.
- GitHub Actions cross-platform protocol test workflow for Ubuntu, Windows and
  macOS.
- XEP-0045 Multi-User Chat helpers for room discovery, room items,
  join/leave presence, groupchat messages, direct invitations, room
  configuration forms and admin role/affiliation flows.
- XEP-0363 HTTP File Upload support for slot requests, HTTPS slot parsing,
  PUT execution, allowed-header filtering, server `max-file-size` discovery and
  OOB message-link creation.
- XEP-0065 SOCKS5 Bytestreams helpers for disco/proxy detection, proxy address
  queries, bytestream streamhost negotiation, streamhost-used responses, proxy
  activation, SOCKS5 destination-address hashing and local streamhost
  handshake/data-pump smoke.
- XEP-0234/XEP-0260 Jingle direct file-transfer helpers for file metadata,
  ranges, XEP-0300 hashes, received/checksum session-info and S5B transport
  candidates/states.
- XEP-0047/XEP-0261 In-Band Bytestream helpers for Jingle file-transfer
  fallback, including IBB open/data/close stanzas and Jingle IBB transport
  negotiation.
- Real-server direct file-transfer smoke paths for XEP-0065 hosted SOCKS5
  bytestream proxy discovery/activation/byte transfer and XEP-0047 IBB
  open/data/close fallback transfer between two accounts.
- Real-server XEP-0313 Message Archive Management smoke path for seeded
  one-to-one chat delivery plus MAM lookup against a public server archive.
- XEP-0308 Last Message Correction support for one-to-one and MUC message
  stanzas, stream-client correction helpers, web edit-message flow and
  public-server two-account correction smoke.
- Advanced group-chat protocol helpers for XEP-0402 PEP-native bookmarks,
  XEP-0048/XEP-0049 legacy bookmark compatibility and XEP-0410 MUC self-ping.
- Generic XEP-0049 Private XML Storage helper and stream-client get/set
  methods; legacy bookmark compatibility now uses the shared private-data
  layer.
- XEP-0223 persistent private data over PubSub/PEP with persistent whitelist
  publish-options, notification trust checks and stream-client store/retrieve
  methods.
- Public-server XEP-0313 MUC archive smoke now passes against an
  archive-enabled room on `conference.conversations.im`.
- XEP-0384 OMEMO wire scaffolding for device lists, bundle requests and
  encrypted message wrappers.
- OMEMO payload encryption boundary helpers, trust fingerprints, X3DH
  X25519 agreement, signed pre-key verification gate, experimental in-tree
  Double Ratchet engine, OMEMO key-transport envelope mapping, opaque session
  storage, local device/pre-key publication models, encrypted local key files
  and a native secret vault layer for key-store passphrases on Windows, Linux
  and macOS.
- Standalone PHP OMEMO Double Ratchet helper for Linux/web runtime experiments,
  using sodium X25519 and openssl AES-256-GCM without C# or .NET dependency,
  plus an internal audit note that keeps production E2EE claims blocked until
  independent review, test vectors and live OMEMO interop are complete.
- XEP-0166/0167/0176/0320 Jingle call signaling for RTP descriptions,
  ICE-UDP candidates, DTLS-SRTP fingerprints, `transport-info` updates and
  RTP `session-info` call states.
- XEP-0353 Jingle Message Initiation helpers for call `propose`, `ringing`,
  `proceed`, `reject`, `retract` and `finish` messages, including XEP-0167
  audio/video RTP descriptions, store hints, tie-break and migration metadata.
- Web client audio/video call controls with a local WebRTC bridge using
  Jingle-shaped relay envelopes for offer, answer, ICE candidates and hangup.
- Total Conversation web path: a Jingle/WebRTC audio/video call now advertises
  ProtoXEP synchronized RTT as a `text` content, opens a reliable `rtt`
  datachannel, carries live drafts/final text as `jingle-rtt` packets and
  falls back to XEP-0301 relay RTT when the call channel is unavailable.
- Browser session profiles via `?profile=...`, so two browser windows can keep
  different local accounts, JIDs and resources while using the same relay.
- WinForms demo peer addressing, making the Windows app path usable beside the
  web client instead of only echoing anonymous relay traffic.
- WinForms demo now has a messenger-style shell with menu bar, conversation
  list, chat timeline, composer, visible connect/settings actions and a
  separate settings dialog for account/server fields.
- WinForms demo contact list now supports contacts and group conversations,
  including a simple group creation and invite flow for local messenger testing.
- WinForms demo contact rows now show presence directly in the list with
  green online and red offline indicators.
- WinForms demo no longer opens a default chat room on startup; the chat room
  becomes active only after selecting a contact or group.
- Web client now follows the same messenger model: contacts and groups are
  listed first, no chat room is opened automatically, presence is visible per
  row and the composer/calls/uploads unlock after selecting a conversation.
- WinForms demo and web client now expose black/white theme switching through
  a View/Theme menu instead of requiring users to hunt for theme state.
- WinForms demo now has a View/Language menu for Nederlands and English, saved
  in the local settings file.
- WinForms demo now uses WebView2 as the chat timeline renderer, giving the
  desktop app HTML/CSS message bubbles with dark/light theme support while
  keeping the existing relay and XMPP logic.
- WinForms demo WebView2 timeline now renders the legacy smiley catalog from
  local app assets, including SVG fallbacks for missing GIF files.
- WinForms settings dialog now docks its connection and XMPP panels correctly,
  and the debug log is hidden by default so the main chat window keeps its
  messenger layout.
- `XmppStreamClient` helper methods for the new upload, OMEMO, MUC, Jingle
  and XEP-0080 user-location protocol flows.
- XEP-0080 User Location payload model, XML parser/serializer, PEP
  publish/retrieve/clear/retract helpers, server capability detection and
  local-server PEP storage for accessibility and emergency-readiness
  experiments.
- Web client location tab with explicit browser-permission request, share once,
  live sharing, stop sharing, accuracy/timestamp/source/server-support warnings
  and PIDF-LO export for simulator/gateway experiments.
- Real-server smoke MUC options for XEP-0045 service discovery, room discovery,
  two-account room join, groupchat delivery and optional owner/admin checks.
- Public-server validation evidence against `conversations.im` for XEP-0368
  direct TLS, hostname-negative TLS, login/bind, roster, XEP-0157, one-to-one
  chat, XEP-0363 upload, XEP-0045 MUC, XEP-0065 hosted SOCKS5 bytestream proxy
  transfer, XEP-0047 IBB fallback transfer, XEP-0313 one-to-one MAM,
  XEP-0308 message correction, BOSH and XEP-0215 STUN discovery.
- Local server MUC conference path for repeatable smoke runs.
- `XmppStreamClient.ReadNextStanzaAsync` now preserves additional stanzas that
  arrive in the same stream read, matching real Prosody batching behavior.
- Local web file upload endpoint and chat attachment cards for Alpha relay
  testing.
- Web composer now supports recorded voice and video messages with preview,
  play/pause, record-again, cancel and send controls. Video recording opens in a
  popup first so sign-language messages can be checked before sending.
- Local upload API now supports chunked uploads for larger audio/video message
  files, with clearer PHP upload-limit errors.
- Linux deployment assets now include a `teletyptel-rtt-relay.service` systemd
  unit and Apache/Nginx WebSocket reverse-proxy guidance for `/rtt-relay`.
- Development HTTPS certificate download page and public certificate files are
  included for local iPhone/Safari trust testing.
- Web installer `install.php` can run server checks, create/check the
  TeleTypTel database, write `php/config.php` outside the public directory,
  import `schema.sql` and generate WebSocket relay start files for Windows and
  Linux/systemd, plus an ejabberd Linux install helper when ejabberd is not
  present.
- Web admin panel `admin.php` shows server status, account usage, recent logs
  and early subscription/account-status controls guarded by an installer-created
  admin account, with admin token support kept as an emergency fallback.
- Auth0 can now be configured as an OpenID Connect login provider alongside
  Google, Facebook and Apple.
- The web installer now collects Google, Facebook, Apple and Auth0 provider
  IDs/secrets and writes the matching OAuth callback configuration.
- The web admin panel now shows ejabberd/XMPP and SIP gateway readiness,
  including SIP/SIPS port checks for future ejabberd_sip/mod_sip work.
- The web installer now disables itself after a successful installation by
  renaming `install.php` to a timestamped disabled file when the server allows it.
- Web chat now creates link-preview cards from Open Graph metadata when a
  message contains an HTTP/HTTPS URL.
- Mobile voice-message recording preview now stacks cleanly on phone screens,
  keeping the audio player, recording wave and action buttons inside the viewport.
- Active mobile voice recording now stays on one compact row with a short timer,
  waveform and action buttons.
- Video recording dialog actions now use compact icon buttons instead of visible
  text buttons.
- Mobile voice recording waveform now expands across the available row space
  instead of leaving an empty area.
- Mobile voice-message preview now removes the redundant custom play/pause
  button and keeps the audio controls plus actions on one row.
- Message URLs now render as links without smiley replacement inside the URL,
  and link-preview fetching uses a browser-like request header for sites such as YouTube.
- Link-preview cards now use a lighter WhatsApp-style surface in the default
  chat theme instead of the previous dark block.

### Changed

- Public package and repository metadata now point to
  `edwtie/Teletyptel-messenger`.
- Product copy now presents TeleTypTel as an open messenger and Total
  Conversation platform instead of the older "Tiedragon XMPP Messenger" working
  name.
- Production server direction is documented as ejabberd plus coturn and
  production modules for roster, MUC, MAM, PubSub/PEP, HTTP upload, TURN/STUN
  discovery and optional SIP-gateway work.
- XSF/software-directory notes now describe only the current evaluation scope
  and avoid claiming Android/iOS or formal XEP-0479 compliance before release
  validation.

### Release Validation Still Required

- OMEMO has protocol, key-material and crypto-boundary scaffolding, but
  production use still needs XEdDSA signed pre-key verification, independent
  review/test vectors for the in-tree Double Ratchet engine and live vault
  smoke on Linux and macOS.
- Voice/video interop against existing federated Jingle clients still needs
  real-server smoke testing; local browser calls, media permissions, device
  selection and per-call device switching are in place.
- Web file upload currently stores files locally under the PHP public upload
  directory; XEP-0363 service discovery, slot request and HTTP PUT are covered
  by the core helpers and have passed against a public server.
- Direct file-transfer S5B/IBB command-line smoke paths have passed against
  `conversations.im`; repeat with one installed XMPP client before making a
  polished user-facing file-transfer interop claim.
- XEP-0313 one-to-one and MUC archive smoke have public-server evidence; repeat
  against the production TeleTypTel/ejabberd server before making a hosted
  service claim.
- Live social-login smoke still needs final real Google/Facebook/Apple
  provider configuration and redirect URLs for the production domain.
- Account security flows are implemented for development/evaluation, but still
  need production hardening, rate limiting, mail-delivery monitoring and abuse
  policy before public signup.

### Current Known Limits

- The current web client is strong enough for Alpha 2/Beta-RC evaluation, but
  the public hosted TeleTypTel service still needs final domain/server release
  operations, public signup policy, moderation, backups and monitoring before a
  production launch.
- Browser chat, profile, history, attachment, location and Total Conversation
  flows run through the TeleTypTel PHP web/API layer and local relay today.
  Standards-based XMPP pieces are available in the PHP/C# libraries, LocalServer
  and real-server smoke tools, but the browser UI is not yet a full federated
  direct-XMPP client for arbitrary providers.
- OMEMO/Double Ratchet work is intentionally audit-gated: wire helpers,
  envelopes, local key models and experimental PHP/C# ratchet code exist, but
  production end-to-end encryption must wait for independent review, stable test
  vectors and live interop with existing OMEMO clients.
- SIP/NG112/relay-provider interop is documented as provider-server direction.
  ejabberd plus coturn and optional SIP gateway modules are the selected
  deployment path, but production SIP gateway operation is not bundled in the
  web client.
- Android and iOS remain packaging targets. The browser UI and iOS shell notes
  are present, but app-store-ready mobile builds and device-contact integration
  are still separate release work.
- LngPdk is the intended signed language-package path. Loose `.lng` web files
  still exist for development fallback until web/mobile package serving,
  verification and completeness checks are finished.

### Fixed

- Old public product names were replaced with TeleTypTel in visible UI text,
  language files, project metadata, XSF draft entries and public documentation.
- Cross-platform protocol tests no longer assume separate TCP reads for XMPP
  Client State Indication; Linux/macOS socket coalescing is now tolerated.
- Local server port conflicts are easier to diagnose through the LocalServer
  Admin process overview and force-terminate action.
- Smiley images in the live RTT draft no longer reload and flicker on every
  typed character.
- Receiving a final message no longer rebuilds the full timeline, so existing
  smileys stay stable while new text arrives.
- WinForms WebView2 message bubbles reuse existing message and smiley nodes
  during RTT updates, preventing smiley flicker in the desktop app too.
- Audio/video call buttons are also available in the message composer toolbar
  so they are visible even when the chat header is cramped.
- The service worker now uses network-first app-shell loading and versioned
  CSS/JS URLs so new UI buttons do not get hidden by stale PWA cache.
- Web media settings now let users choose camera, microphone and video quality,
  refresh device labels and preview the selected webcam before calling.
- Real-server MUC smoke now submits an explicit open room configuration for
  newly created rooms, so public servers with restrictive defaults do not make
  the second account fail with `registration-required`.
- Local account creation and login now keep localhost accounts on the active
  PHP relay (`ws://127.0.0.1:8787`) instead of falling back to the old
  `wss://localhost:5443/websocket/` endpoint, and existing local usernames
  return clearer account suggestions.
- Generated browser resource JIDs such as `/web-...` are no longer shown as
  separate people in the UI; contact names and bare JIDs are used for display
  while full JIDs remain available for routing.
- Call media panes no longer show black local or remote video previews when a
  stream has no usable video track.
- Total Conversation now switches to the full realtime-text view when RTT is
  active and video is unavailable, ended, locally disabled or remotely muted.
- iPhone/Safari Total Conversation layout now keeps the avatar, hangup/retry
  controls, video, RTT overlay and composer usable across portrait, landscape
  and keyboard-resize states.
- iPhone camera handling now uses a compact front/back switch and hides desktop
  camera/microphone device lists that Safari cannot reliably expose.
- Video recording popup no longer fails before opening because the dialog title
  element is now wired and guarded in JavaScript.
- The web client now prefers the current HTTPS host's `/rtt-relay` WSS endpoint
  for local TeleTypTel/dev accounts instead of stale localhost WebSocket URLs.

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
- Local XMPP server with mandatory STARTTLS, XEP-0077 registration, SASL
  PLAIN, resource binding, basic roster response, disco#info and one-to-one
  chat relay.
- Real-server smoke tool for TLS validation, hostname rejection, XEP-0077 and
  two-account chat checks.
- LngPdk package loader/compiler library used by the demo localization path.
- Public documentation for getting started, real-server testing, protocol
  coverage, accessibility vision and XSF software-directory readiness.

### Known Limits At Alpha 1 Release

- The hosted public demo was not live yet; Alpha 1 was evaluated locally.
- The PHP relay was a development bridge, not a production XMPP server.
- The web UI did not log into arbitrary production XMPP servers directly.
- End-to-end encryption, group chat, file upload and calls were not part of the
  Alpha 1 release payload yet. Current progress is tracked in the Unreleased
  section above.
