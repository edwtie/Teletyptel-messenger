# User Guide

New subscription applications are available at `/aanmelden/`, also linked from the Messenger account menu. Users first sign in or create their account; only explicitly published plans appear. BSN and medical documents are required only for plans configured to request them. See [the intake guide](INTAKE.md) for admin/staff review, deployment prerequisites and privacy safeguards.

Teletyptel 2.0 Alpha 2 is a local evaluation build for accessible chat,
real-time text, attachment/location experiments and WebRTC Total Conversation
testing. It is intended for testers and developers, not for production use.

## Opening The Client

### Calling A Phone Number (Preparation)

Use the keypad symbol in the top toolbar (**Call a number** / **Nummer bellen**).
On mobile it is in the top menu. Enter an international number with its country
code, using the keyboard or keypad. Closing the panel clears the number; it is
not sent or saved. The existing Messenger contact/call controls are unchanged.

The call button is deliberately disabled: a SIP provider and an RTT-capable
gateway have not been integrated yet. No number calls or emergency calls are
available here. RTT is the intended default for the future number route, not a
claim that RTT is already connected or supported by every telephone destination.

### Website And Messenger

The local website starts at `/index.php`, with navigation to Messenger, subscription
applications, tester contact and frequently asked questions. Its Messenger preview
uses screenshots of the actual interface with fictitious test data. The screenshot
tour at `/demo.html` includes desktop, mobile and settings views; it is not a live
chat or call. Use HTTPS for `/aanmelden/`; account, document and
review permissions are unchanged by the website design. The public homepage and intake
screens share the blue/orange TeleTypTel identity, readable controls and mobile layouts.

The homepage is intentionally excluded by the existing `.gitignore`; keep a separate
deployment/backup copy of `php/public/index.php` when moving this local website.
Website layout checks can be run with `node tests/website-ui.test.js` (Playwright Chromium
and PHP CLI required; set `PHP_BINARY` if PHP is not on PATH). These checks use fixture
responses and never access live accounts. Screenshots go to the system temporary
directory, or `WEBSITE_SCREENSHOT_DIR` when supplied.

Refresh the public Messenger screenshots with `node scripts/capture-messenger-demo.js`.
This runs the chat interface in isolated Chromium and WebKit browsers with fixture API responses.
Install both engines with `npx playwright install chromium webkit`. The iPhone view uses
the iPhone 13 touch/device profile in WebKit, not a resized desktop browser. The checks
cover toolbar bounds, the contacts return button, display menu and composer at 320–390px
widths and reduced viewport height. This is emulation, not a physical-iPhone test.
External network traffic and WebSockets are blocked; no real accounts are created and no
messages or locations are sent. PNG output is in `php/public/assets/demo/`. Review images
before publishing, and update the capture date in `demo.html` when refreshing them.

Open:

```text
http://127.0.0.1/chat.html
```

Do not open `php/public/chat.html` directly from `C:\...`; the account login
uses PHP endpoints and must run through localhost. Use two browser windows to
test a conversation. Both windows should use the same ejabberd XMPP WebSocket
endpoint.

## Connecting

1. Start or verify ejabberd.
2. Leave the XMPP WebSocket URL as `wss://localhost:5443/websocket/`.
3. Sign in or create an account in the start screen.

The client connects automatically after sign-in. The status in the title bar
changes when XMPP is connected.

Developer-only transport controls and XML/debug diagnostics are hidden in the
normal user interface. Open `http://127.0.0.1:8090/chat.html?dev=1` when you
need the legacy relay/RFC 7395 switch, manual connect button and debug panel.

## Sending Messages

- Type in the message box.
- With **Live RTT** enabled, the other side sees your text while you type.
- Press Enter to send a final message.
- Use Shift+Enter to insert a line break.

## Modes

- **XMPP WebSocket**: normal browser route through ejabberd, usually
  `wss://localhost:5443/websocket/`.
- **Relay**: optional local PHP relay mode for legacy RTT/RFC7395 smoke tests.
- **RFC 7395**: WebSocket framing test mode for XMPP-over-WebSocket transport
  experiments.

ejabberd WebSocket is the normal browser path. The old PHP relay is kept only
for local experiments and compatibility smoke tests.

## Website Support Chat

Website visitors can open **Klantenservice**, enter a name and chat without a
Messenger account. Staff answer from the separate **Klantenservice** inbox at
`admin/support-chat.php`. See [Website support chat](SUPPORT_CHAT.md) for access,
availability, privacy and retention. After staff claim the chat, visitors and
staff can choose RTT, Total Conversation or **Gebarentolk oproepen**. Participation
and interpreter access require explicit permission; ordinary text chat remains
available when a call ends. Only approved own interpreters are connected.

## Interpreter Support

Press **Gebarentolk oproepen** to request an available approved interpreter directly
in your conversation, without another window or an address form. If there is no
call, Messenger starts a Total Conversation call to the selected contact first.
The other participant must allow sharing before the interpreter receives media
and live text. The interpreter appears in the same call panel; removing the
interpreter keeps the original call running. For registration and limitations,
see [Own interpreters](INTERPRETERS.md). Tolkcontact remains disabled pending
technical integration details.

## Message Translation

Settings → Preferences controls the interface language (Dutch/English).
Settings → Privacy and cookies contains message translation and its permissions.
Translation preferences are saved per signed-in
account together with the other settings using **Save settings** at the bottom.
**Save and connect** also saves changed translation preferences when already signed in.
If saving translation preferences fails, the dialog stays open and keeps your
choices for retry; it explicitly reports if account settings were already saved.
Choose Off, Manual or Automatic. Additional translation languages are listed in
the selector; this does not add translations of the interface itself.

When translation is enabled and the service is available, the message context menu
offers **Translate** for completed text messages, including your own messages.
Enable manual translation permission under **Privacy and cookies** and use
**Save settings**. There are no confirmation popups: without permission, Translate
opens these settings without sending text. The checkbox is off by default.
A first-party cookie remembers this choice for this account in this browser for
180 days, including after reload. It uses SameSite=Strict, Path=/ and Secure on
HTTPS; its value contains only permission, not chat text, and is not used for tracking.
Unchecking immediately removes the cookie and pauses requests; save settings to
finish. Turning translation Off also removes it. Blocked cookies leave manual
translation paused with an error, not silently enabled. Legacy local-storage
popup permission is removed, not automatically converted to cookie consent.
Automatic and live RTT permissions remain separate. There is no
separate translation icon in each bubble. The same menu offers **Hide translation**
or **Show translation** for an existing result without requesting it again.
Automatic mode requires explicit permission and applies only to new incoming
text messages after the preferences load/save successfully. It does not translate
existing history, outgoing messages, live RTT drafts, files or location cards.
Changing translation controls pauses translation until preferences are saved.

**Translate live RTT too** is a separate, default-off permission. It works in
Manual or Automatic mode and sends incoming draft text from the open conversation
to Google, including text the sender may later edit or delete. Only enable with
the other participant's agreement. Off mode clears this permission. The server
checks the saved live-RTT permission separately from completed-message permission.

**Also show a translation while I type** is a second, default-off permission for
your own unsent text. Save it in Settings → Preferences. Your preview appears
below your own draft in chat and in the **You** panel during Total Conversation.
It uses the selected translation language, independently of the other person's
preview. Sending still sends your original text, never the translation. Clearing
or sending your draft removes its preview. Google may already have received text
that you later delete. Incoming-draft consent does not enable this option.
If your preview cannot start, the draft now shows why: disabled preview, unsaved
preferences, unavailable service or missing server session. **Translation settings**
opens the correct preferences panel; **Sign in again** opens authentication.
Choosing Automatic for received messages alone does not enable own draft previews.

The original RTT still appears immediately. A separate **provisional RTT
translation** follows after an 800 ms typing pause, with a maximum wait of about
4 seconds during continuous typing and at least 3 seconds between requests.
Provider response time is additional. Only the latest snapshot is queued, with
one live request at a time shared between incoming and own drafts. Both directions
share the usage limits; simultaneous typing can add waiting time. When the sender appends text, the last translated
prefix stays visible with **Updating…** until the next translation arrives.
Corrections or deletions within that prefix immediately hide the outdated result.
This works with the existing XMPP RTT, relay and Jingle/T.140 receive handlers,
not a new SIP translation gateway. See [XEP-0301](https://xmpp.org/extensions/xep-0301.html)
for the distinction between live text and a completed message.

Live translation stops on reset, final message, chat change, leaving the browser
tab, logout or a preference change. Returning to the tab resumes on the next RTT
update. Completed-message translation follows its own Manual/Automatic setting.
On a provider error or quota limit, original RTT continues; use **Reload** in
translation settings to retry later. Cancelling a request cannot recall text
already received by Google. Draft translations are not saved in chat history.

The original always remains visible. Machine translations are labeled, may contain
errors, and can be hidden. Results remain only in browser memory; they are cleared
on logout/account change, reload or preference changes. They are not sent to the
other participant or written into the chat archive. When the administrator enables
the XMPP translation service, the browser discovers and requests translations with
[XEP-0171](https://xmpp.org/extensions/xep-0171.html) private IQ stanzas. Google remains
the translation engine. Without that configuration, the existing HTTPS API is used.
There is no automatic HTTP retry after an XMPP failure and no SIP translation negotiation.

### Multilingual Groups (MUC)

Each participant selects their own translation language. The original message is
sent once to the MUC room; English, Turkish or other translations are shown only
to the requesting participant. They are never posted as extra group messages.
The service account does not join rooms, invite users or subscribe to room traffic.
Only requested text is sent to it. Agree with participants before enabling live
draft translation, which can include text they subsequently delete.

Incoming XMPP RTT drafts and their sequence state are independent per room occupant.
Typing simultaneously does not replace another person's draft. Final messages,
cancellation and leaving the room clear only the relevant participant's draft.
At most 50 incoming live drafts are kept per room. They share the existing throttled
translation queue and quota with your own preview; busy rooms can add delay.
The compact **Translation** label opens the warning and provider details.

The service is disabled until the owner configures it in Admin → Settings.
Preferences can be saved before activation. On 26 October 2026 the configured
Google provider was tested with short fictional Dutch messages and live-RTT
snapshots, returning English translations. A subsequent real ejabberd test used two
temporary accounts in a private MUC room, English and Turkish XEP-0171 replies,
and received/own draft requests. The test room and accounts were removed afterwards.
Browser tests cover Android/iPhone emulation with isolated fixtures; physical-phone
interoperability is not claimed.

## Mobile Lifecycle

On iPhone and Android phone screens up to 520px, the top bar uses a compact Menu button instead of
multiple rows of actions. It opens labeled icons for news, history, settings and
other available actions. Tap outside or press Escape to close it. The back arrow
in the conversation heading returns to the contacts list. The conversation heading
keeps the avatar, name, prominent RTT symbol (without a visible text label) and three-dot options button on one
row, with status below the name. The RTT button starts the existing Total
Conversation mode (RTT, audio and video). Audio-only, video and RTT reset/enable
actions are available under the three-dot button. During an active call, the
existing call controls return.
Desktop navigation is unchanged.

The browser client sends XEP-0352 active/inactive state automatically when the
page becomes visible, hidden, focused, blurred, frozen or resumed. In XMPP mode
it is sent as `<active/>` or `<inactive/>` with `urn:xmpp:csi:0`; in legacy
relay mode it is visible as `client-state` traffic.

Future Android, iOS and WebView2 shells can drive the same logic by calling
`window.TeletyptelLifecycle.setActive()` and
`window.TeletyptelLifecycle.setInactive()`.

## Light And Dark Mode

Use the theme button in the top bar. The selected mode is saved in browser
storage.

## Languages

The web client currently includes English and Dutch UI language files:

```text
php/public/lang/eng.lng
php/public/lang/ned.lng
```

These are development language files. Signed LngPdk packages are the stricter
production direction.

## Smilies

The smiley button opens the local smiley picker. Supported legacy text codes,
such as `:)` and `:D`, are converted to local SVG/GIF smiley assets in the
message view.

## Account Profile

The account panel lets you set:

- display name
- e-mail/JID
- peer/contact
- phone field
- provider id
- language
- optional password memory setting

The profile is stored through `php/public/api/account.php` when MySQL/MariaDB
is configured. The browser keeps only a temporary browser-session account
reference when that option is enabled.

## Privacy Notes

### User Administration

Open **User administration** from the account settings menu, or visit
`admin/`. This requires a separate administrator login, not a Google login.
See [the administrator guide](ADMIN_TOOL.md) for first-owner setup, user search,
conversation metadata, access auditing, scheduled plan changes, invoices to
customers/insurers, recurring billing and owner-only settings. Company and VAT
settings may stay blank, but final invoices require completed details.

Alpha builds are for evaluation. The account API stores password hashes on the
server, but do not use production passwords on a local WAMP/development install.
Use dedicated test accounts for LocalServer, Prosody, ejabberd, Openfire or
other XMPP smoke targets.

## Current Scope

- No hosted public service yet.
- ejabberd WebSocket is the normal webclient route. The PHP relay is a local
  edge for old RTT/RFC7395/WebRTC demo testing only; it is not the authoritative
  XMPP server.
- LocalServer covers STARTTLS, SASL, bind, session, roster, presence, MUC,
  XEP-0077 registration including optional local CAPTCHA, XEP-0313 local
  archive, XEP-0363 slot/PUT, vCard, blocking, stream management and
  client-state smoke paths.
- OMEMO protocol/key-storage helpers plus experimental C# and standalone PHP
  Double Ratchet engines exist, but production end-to-end encryption still needs
  XEdDSA signed pre-key verification, independent review and live
  interoperability validation.
- Group chat, file upload and calls have local/demo and smoke paths; public
  release validation still needs hosted server accounts and interoperability
  runs against existing clients.
- No packaged Android/iOS app yet.
