# XSF Software Directory Preparation

This document tracks the Teletyptel 2.0 entry for the XSF/xmpp.org software
directory. The first submission was intentionally held back after review
because the project looked like a concept instead of software that visitors
could evaluate.

Do not resubmit until every item in the readiness checklist is complete.

## Current Scope Boundary

Teletyptel 2.0 is currently an Alpha 2 evaluation project. The repository has
working browser and Windows experiments, a C# XMPP core, a local PHP/WebSocket
edge, a local STARTTLS C2S smoke server and public-server smoke tools.

That is not the same as a public production service. The local server is a
repeatable protocol test target for localhost/protected lab use. The production
server direction remains a hardened XMPP server. ejabberd is the preferred
provider/lab direction when SIP gateway work matters; Prosody and Openfire
remain useful interoperability targets. Production needs coturn, HTTP upload,
MAM, PubSub/PEP, account policy, abuse handling and backup/monitoring around
the chosen XMPP server.

The XSF entry text must describe only what visitors can evaluate today. Do not
list planned Android/iOS packaging, a public hosted service or XEP-0479
compliance until those items are actually released and documented.

## Review Feedback To Address

- A usable release must exist.
- Visitors need either a public demo instance or clear demo instructions.
- The repository needs user-facing documentation.
- The README must describe what works now, not only planned platform support.
- The project should show enough development history and maintenance signals.

## Target Entry

Future entry with DOAP, after the public Teletyptel project page and DOAP file
are published:

```json
{
  "name": "Teletyptel 2.0",
  "doap": "https://www.tiedragon.com/teletyptel/doap.rdf",
  "platforms": [],
  "url": null,
  "categories": [
    "client"
  ]
}
```

Candidate public entry without DOAP:

```json
{
  "name": "Teletyptel 2.0",
  "doap": null,
  "platforms": [
    "Web",
    "Windows"
  ],
  "url": "https://github.com/edwtie/Teletyptel-messenger",
  "categories": [
    "client"
  ]
}
```

The DOAP entry is preferred later because xmpp.org can source the project URL
and platform metadata from the DOAP file. The initial entry uses the public
GitHub repository so the project can be reviewed before the final project page
is online.

## Public Description

Teletyptel 2.0 is a web-based XMPP client for accessible realtime
communication. Alpha 2 includes a browser chat UI, XEP-0301-style real-time
text, contact and account experiments, WebRTC call experiments, file attachment
experiments, a C# XMPP core, STARTTLS local server smoke testing and
real-server smoke tools. Android and iOS packaging are planned after the web
client stabilizes and must not be listed as current platforms yet.

## XMPP Scope

Implementation evidence for Alpha 2:

- RFC 6120: XMPP Core
- RFC 6121: Instant Messaging and Presence
- RFC 7395: XMPP over WebSocket
- RFC 7590: TLS for XMPP
- RFC 7622: XMPP Address Format
- XEP-0030: Service Discovery
- XEP-0045: Multi-User Chat
- XEP-0047: In-Band Bytestreams
- XEP-0050: Ad-Hoc Commands
- XEP-0060: Publish-Subscribe
- XEP-0065: SOCKS5 Bytestreams
- XEP-0077: In-Band Registration
- XEP-0080: User Location
- XEP-0084: User Avatars
- XEP-0085: Chat State Notifications
- XEP-0124/XEP-0206: BOSH client path
- XEP-0133: Service Administration, safe LocalServer read-only commands only
- XEP-0153: vCard-Based Avatars
- XEP-0157: Contact Addresses for XMPP Services
- XEP-0163: Personal Eventing Protocol helpers
- XEP-0166/0167/0176/0320: Jingle call signaling, ICE transport and DTLS fingerprints
- XEP-0184: Message Delivery Receipts
- XEP-0191: Blocking Command
- XEP-0198: Stream Management
- XEP-0215: External Service Discovery
- XEP-0223: Persistent Storage of Private Data via PubSub
- XEP-0234/0260/0261: Jingle file transfer metadata and bytestream fallback helpers
- XEP-0280: Message Carbons
- XEP-0301: In-Band Real Time Text
- XEP-0308: Last Message Correction
- XEP-0313: Message Archive Management
- XEP-0352: Client State Indication
- XEP-0353: Jingle Message Initiation helpers; installed-client interop remains
  release validation
- XEP-0363: HTTP File Upload
- XEP-0368: SRV records for XMPP over TLS
- XEP-0384: OMEMO wire/helper boundary, not production E2EE
- XEP-0385: Stateless Inline Media Sharing
- XEP-0392: Consistent Color Generation
- XEP-0393: Message Styling
- XEP-0398: User Avatar to vCard-Based Avatars Conversion
- XEP-0402/0410: MUC bookmarks and self-ping helpers
- XEP-0424/0425: Message retraction and moderation helpers
- XEP-0433: Extended Channel Search helper; the XEP is Deferred, so live
  search-service interop remains release validation
- XEP-0479: compliance mapping and Total Conversation direction, not a formal
  compliance claim yet
- XEP-0514: Custom Emoji protocol helper; the XEP is Experimental and UI/live
  interoperability remains release validation

Release validation and out-of-scope production work:

- Public hosted Teletyptel instance.
- Android and iOS packaged apps.
- Production OMEMO interoperability through an audited Signal Protocol backend.
- Production HTTP upload, TURN/STUN, MAM and PEP modules on the hosted server.

## Submit Checklist

- [x] Public Teletyptel 2.0 project page copy exists in `docs/PROJECT_PAGE.md`.
- [x] Public source repository exists.
- [x] Public README explains current Alpha 2 evaluation path.
- [x] Public README documents scope and out-of-scope production claims.
- [x] Public license is present.
- [x] User guide exists.
- [x] Getting-started demo instructions exist.
- [x] Release notes exist.
- [x] Build, test and PHP relay validation commands are documented and pass.
- [x] Local server compliance smoke script exists and passes.
- [x] Public two-account real-server smoke has passed.
- [ ] DOAP file is published at the final URL.
- [x] Initial XSF entry uses the public GitHub repository URL.
- [ ] Future XSF entry uses the final DOAP URL.
- [ ] `lint_software_list.py software.json` passes in an xmpp.org fork.
- [x] Real-server smoke test has passed with two accounts.
- [x] Alpha build is runnable from public instructions.
- [x] GitHub release `v0.1.0-alpha1` exists.
- [ ] Alpha 2 release is tagged and downloadable.
- [ ] Public hosted demo instance exists.
- [x] XSF entry text avoids Android/iOS and compliance claims until released.

## Resubmission Position

Resubmit only after an Alpha 2 release is published and either:

- a public hosted demo is live, or
- the XSF maintainers accept the local Alpha 2 demo path as sufficient for an
  early listing.

## XSF Process Notes

The xmpp.org software directory stores entries in `src/data/software.json`.
The XSF README says new entries are added manually to the top-level JSON array,
then validated with `lint_software_list.py`. The JSON file must be saved as
UTF-8 without a byte order mark.
