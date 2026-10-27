# TeleTypTel

**Total Conversation for everyone.**

TeleTypTel is an open messenger for people who want text, voice, video and live
conversation support in one place. It is designed for deaf, hard-of-hearing and
hearing users together, without forcing anyone into a separate communication
world.

The goal is simple: a familiar messenger experience with accessibility built in
from the start.

TeleTypTel is a brand of Tiedragon Labs and Tiedragon.

## Why TeleTypTel

Most people already understand chat apps. TeleTypTel builds on that familiar
idea, then adds communication features that make conversations easier for more
people:

- live text while someone is typing;
- audio and video calls;
- Total Conversation with text, voice and video together;
- contacts and groups;
- file, photo and location sharing;
- consent-based message translation and live-text translation previews;
- requesting an approved sign-language interpreter during a conversation;
- a website customer-service popup with a separate staff inbox;
- light and dark mode;
- Dutch and English interface text;
- a browser-first design that can grow into Windows, Android and iOS apps.

TeleTypTel is not meant to be a separate tool only for accessibility situations.
It is meant to be useful for everyone, so accessibility becomes part of normal
daily communication.

## Who it is for

TeleTypTel is being built for:

- people who rely on text during conversations;
- families, friends and colleagues who want one shared communication app;
- support desks and service providers;
- care, accessibility and relay-service environments;
- future emergency-readiness and location-sharing workflows;
- organizations that prefer open communication infrastructure.

## What is in this repository

This repository contains the TeleTypTel web client, local PHP backend, account
and profile API, browser chat interface, call and media controls, language files,
server-side test tools, C# protocol library and automated tests.

The project is built around open communication standards and provider-friendly
deployment. Detailed engineering notes live in the `docs` folder, so the public
README can stay focused on the product and the user experience.

## Product direction

TeleTypTel is growing toward:

- private one-to-one chat;
- group conversations;
- real-time typed conversation;
- voice and video calling;
- Total Conversation sessions;
- photo and document sharing;
- interactive location sharing;
- user profiles and avatars;
- account login through local accounts and external identity providers;
- web, desktop and mobile packaging;
- provider/server deployment for organizations.

The long-term vision is a decentralized messenger that can be operated by
providers and organizations instead of depending on one closed messaging company.

## Current feature overview

The October 2026 development branch includes:

| Area | Available in the codebase |
| --- | --- |
| Messenger | Chat, groups, live RTT, audio/video, attachments and compact mobile controls. |
| Translation | Google-backed message and live-draft translation with consent; optional private XMPP translation requests, including personal MUC results. |
| Interpreters | Own-interpreter applications, admin approval and three-person participation in an existing call. |
| Customer service | Visitor popup, staff inbox, automatic RTT, optional video/interpreter, photo/document uploads and five interface languages. |
| Administration | Separate admin portal, user/staff management, bulk actions, recoverable trash and audit views. |
| Plans and billing | Plan requirements, scheduled transitions, invoices and worker-driven recurring billing. |
| Applications | Own-application portal and authorized review; sensitive data collection requires explicit server setup. |
| Website | Public homepage, demo and responsive iPhone/Android browser layouts. |

RTT means real-time text; Total Conversation combines text, audio and video.
These are development features, not a production-readiness or standards-compliance
claim. Tolkcontact, SIP/provider gateways, payment/insurance-claim integrations
and native-app release validation remain separate work. See the
[implementation checklist](docs/IMPLEMENTATION_CHECKLIST.md) for completed and
open items.

## Local development

Build the .NET solution:

```bash
dotnet build Tiedragon.XmppMessenger.slnx
```

Run the protocol tests:

```bash
dotnet run --project tests/Tiedragon.XmppMessenger.Tests/Tiedragon.XmppMessenger.Tests.csproj
```

For the current web client, use ejabberd's XMPP WebSocket endpoint as the
normal route:

```text
wss://localhost:5443/websocket/
```

Serve `php/public` through a local web server such as Apache/WAMP and open:

```text
http://localhost/chat.html
```

Do not open `chat.html` directly from the filesystem, because the account and
profile APIs require a local web server.

The old PHP RTT relay (`php/rtt-websocket-server.php`) is still included for
local RTT/RFC7395 smoke tests, but it is no longer the normal webclient route
when ejabberd is available.

## Documentation

- User guide: [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Admin and billing: [docs/ADMIN_TOOL.md](docs/ADMIN_TOOL.md)
- Applications and review: [docs/INTAKE.md](docs/INTAKE.md)
- Own interpreters: [docs/INTERPRETERS.md](docs/INTERPRETERS.md)
- Customer-service chat: [docs/SUPPORT_CHAT.md](docs/SUPPORT_CHAT.md)
- Implementation checklist: [docs/IMPLEMENTATION_CHECKLIST.md](docs/IMPLEMENTATION_CHECKLIST.md)
- Getting started: [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)
- Windows setup: [docs/WINDOWS_SETUP.md](docs/WINDOWS_SETUP.md)
- Linux setup: [docs/LINUX_SETUP.md](docs/LINUX_SETUP.md)
- iOS app shell: [docs/IOS_APP.md](docs/IOS_APP.md)
- Account and identity model: [docs/ACCOUNT_IDENTITY_MODEL.md](docs/ACCOUNT_IDENTITY_MODEL.md)
- Accessibility vision: [docs/ACCESSIBILITY_AGENT_VISION.md](docs/ACCESSIBILITY_AGENT_VISION.md)
- Enterprise customers: [docs/grote-klanten/README.md](docs/grote-klanten/README.md)
- Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)

Technical protocol notes are kept in separate engineering documents so product
pages and marketing copy remain readable for non-developers.

## License

MIT. See [LICENSE](LICENSE).
