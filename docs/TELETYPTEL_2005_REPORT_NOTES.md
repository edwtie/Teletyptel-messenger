# TeleTypTel 2005 Report Notes

Source: `Eind verslag-teletyptel versie 20.pdf`.

Internal historical source details:

- Authors: Kamel Mejri and Edward Tie.
- Date shown in the report: 14 January 2005.
- Extracted PDF metadata creation date: 23 February 2018.
- Length: 66 pages.

These notes preserve the useful product and architecture lessons from the
original TeleTypTel school/project report. They are not a public claim that the
old system is still running.

## Original Mission

The report describes TeleTypTel as a bridge between the hearing world and the
deaf world. The service was positioned as an internet-based alternative to older
text telephone and relay services.

The original user problem was already clear:

- older text telephones were expensive and becoming less attractive;
- deaf users were moving to internet tools such as MSN, ICQ and SMS;
- many companies still required telephone contact;
- email was too slow for urgent situations;
- a relay service was needed when one side could use internet chat and the other
  side still used a normal phone.

This is directly connected to Teletyptel 2.0. The difference is that the modern
version should not only replace a relay service. It should make accessible total
conversation normal for everyone.

## Original Product Model

The 2005 project described five main components:

1. A tariff/accounting system for different telephone number types.
2. An assignment system that selects an available intermediary.
3. A private chat system between client and intermediary.
4. Protection against misuse, scams and spam through registration.
5. SMS invitation when a hearing caller wants to reach a deaf user.

Modern mapping:

| 2005 TeleTypTel | Teletyptel 2.0 |
| --- | --- |
| Tariff system | Provider/account/billing integration later |
| Assignment system | Contact routing, provider tabs, support queues |
| Private Flash chat room | XMPP one-to-one chat, MUC/private rooms, RTT |
| Registration against misuse | Real account model, TLS, blocking, abuse contacts |
| SMS invitation | Push notifications, call invitation, provider fallback |

## Original Architecture

The old design used:

- browser access;
- PHP pages and templates;
- MySQL database;
- Flash/FlashChat;
- roles for customer, intermediary and administrator;
- a chat/assignment server concept;
- HTTPS as the intended security layer;
- VPN for remote intermediaries;
- possible Linux server as a stronger production direction.

The design already separated practical roles:

- customer;
- intermediary/telefonist;
- administrator;
- support/contact forms;
- account/profile data;
- call/chat history and invoices.

Modern mapping:

- FlashChat becomes XMPP/WebRTC/RTT.
- PHP/MySQL remains useful for local web edge and account profile API, but not
  as the complete protocol server.
- HTTPS/VPN intent becomes mandatory TLS, XMPP server policy, WebSocket WSS and
  secure provider infrastructure.
- Role-based relay work becomes provider/service tabs and future operator
  workflows.

## Testing Lessons

The original report planned a small user test with roughly 10 to 25 selected
test users, followed by an experience questionnaire.

Important test criteria from the old plan:

- users needed their own broadband connection and computer;
- users needed some computer experience;
- users should have experience with Teleplus or comparable services;
- speed, chat appearance, service quality, pricing and comparison with Teleplus
  were test subjects;
- personal questionnaire data should be destroyed after processing.

Modern Teletyptel should keep this discipline:

- test with real users, not only developers;
- measure readability and speed, not only technical success;
- test accessibility and service trust;
- separate personal data from product metrics;
- treat public-service and emergency features as simulator/pilot work first.

## Lessons From Blockers

The old project hit several constraints:

- SSL certificate was delayed because the organization was not yet registered in
  the trade register;
- payment integration was postponed;
- FlashChat needed more modification than expected;
- a telephone line at school was not available in time;
- Linux server setup was considered safer but required more expertise;
- promotion and user recruitment were hard;
- financial risk and subsidy were major concerns.

Teletyptel 2.0 should treat these as product requirements, not surprises:

- define a provider/organization model early;
- keep production security and certificates separate from local development;
- avoid depending on closed, hard-to-modify chat engines;
- make the demo usable without telecom lines first;
- document Windows and Linux server paths;
- keep funding and provider adoption in the roadmap;
- use AI-assisted development to reduce prototype cost, while still planning for
  hosting, audit, legal and user-test costs.

## Market Lesson: Competing With Everyday Messengers

The 2005 report already noticed that deaf users were moving away from expensive
text telephones toward MSN, ICQ and SMS. That lesson is even stronger today.
TTY/RTT or relay products do not only compete with each other. They compete with
the social reality that most families, friends, schools, care providers and
workplaces already use mainstream messengers such as WhatsApp, FaceTime,
Messenger, Teams and similar services.

This is a strategic risk:

- users often choose the network where everyone already is;
- a technically better accessibility feature can lose if it is isolated;
- "special app for deaf users" can become a social barrier;
- investors and providers need proof that the product has a wider market than a
  small assistive niche;
- ignoring market research and user behavior can make a technically valid relay
  project fail.

Teletyptel 2.0 should therefore avoid the old trap. It should not present itself
only as a replacement for TTY or as a separate deaf-only tool. It should compete
as an open, modern communication platform for everyone, with accessibility built
in:

- live real-time text as a normal conversation mode;
- audio/video and captions in the same conversation;
- provider tabs and verified service channels;
- ordinary contact lists and groups;
- location and public-service readiness;
- future AI sign-language and speech/text assistance.

The product lesson is simple but important: accessibility must sit inside normal
communication, not outside it.

## Strategic Continuity

The old project was already about:

- bridge-building;
- internet-based relay;
- browser access;
- private conversation rooms;
- account identity;
- operator assignment;
- practical service delivery;
- testing with deaf users;
- affordability.

Teletyptel 2.0 extends that idea with:

- XMPP as an open messaging standard;
- XEP-0301 real-time text;
- WebRTC audio/video;
- XEP-0080 location for explicit assistive/emergency-oriented sharing;
- NG112 gateway research;
- LngPdk localization;
- provider tabs and verified service channels;
- AI-assisted captions and future sign-language interpretation.

## Product Sentence

Teletyptel 2.0 is the continuation of the 2005 TeleTypTel idea: a bridge between
communication worlds, rebuilt with open protocols, modern web/mobile clients and
accessibility as a normal part of everyday communication.
