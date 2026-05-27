# XSF Software Directory Preparation

This document prepares the Teletyptel 2.0 entry for the XSF/xmpp.org software
directory. Do not submit this entry until Alpha 1 has a public project page,
public repository and repeatable real-server smoke result.

## Target Entry

Preferred entry with DOAP:

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

Fallback entry without DOAP:

```json
{
  "name": "Teletyptel 2.0",
  "doap": null,
  "platforms": [
    "Web",
    "Android",
    "iOS"
  ],
  "url": "https://www.tiedragon.com/teletyptel",
  "categories": [
    "client"
  ]
}
```

The DOAP entry is preferred because xmpp.org can source the project URL and
platform metadata from the DOAP file.

## Public Description

Teletyptel 2.0 is a web-based XMPP client for accessible realtime
communication. It combines standard chat with XEP-0301 real-time text and is
designed for future Android and iOS packaging.

## XMPP Scope

Implemented or planned standards for the public entry:

- RFC 6120: XMPP Core
- RFC 6121: Instant Messaging and Presence
- RFC 7395: XMPP over WebSocket
- RFC 7590: TLS for XMPP
- RFC 7622: XMPP Address Format
- XEP-0030: Service Discovery
- XEP-0085: Chat State Notifications
- XEP-0184: Message Delivery Receipts
- XEP-0198: Stream Management
- XEP-0280: Message Carbons
- XEP-0301: In-Band Real Time Text
- XEP-0313: Message Archive Management

## Submit Checklist

- [ ] Public Teletyptel 2.0 project page exists.
- [ ] Public source repository exists.
- [ ] Public README explains accessible realtime text direction.
- [ ] Public license is present.
- [ ] DOAP file is published at the final URL.
- [ ] XSF entry uses the final DOAP URL.
- [ ] `lint_software_list.py software.json` passes in an xmpp.org fork.
- [ ] Real-server smoke test has passed with two accounts.
- [ ] Alpha 1 build is downloadable or runnable from public instructions.

## XSF Process Notes

The xmpp.org software directory stores entries in `src/data/software.json`.
The XSF README says new entries are added manually to the top-level JSON array,
then validated with `lint_software_list.py`. The JSON file must be saved as
UTF-8 without a byte order mark.
