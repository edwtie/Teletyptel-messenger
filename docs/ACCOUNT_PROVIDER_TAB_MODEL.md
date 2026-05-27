# Account, Provider And Tab Model

Teletyptel 2.0 should be a user-controlled communication platform. Providers
can supply services, tabs and integrations, but they do not own the core
conversation model.

## Goals

- keep XMPP and RTT as the open communication backbone;
- support phone numbers, SMS, SIP/voice, captions and provider services through
  adapters;
- let organizations offer tabs without reading chat content by default;
- make the same web client usable on desktop, Android and iOS;
- avoid dependency on one provider, app store or care/reimbursement route.

## Account Model

A Teletyptel account can have several identifiers:

| Field | Purpose |
| --- | --- |
| `accountId` | Local stable Teletyptel profile id. |
| `jid` | XMPP identity for chat and RTT. |
| `displayName` | User-facing name. |
| `phoneNumber` | Optional E.164 number for SMS/voice adapter routing. |
| `providerId` | Optional primary service provider. |
| `accessibilityProfileId` | Selected accessibility settings profile. |
| `preferredLanguage` | UI and communication language preference. |

The JID is the open messaging identity. Phone number and provider ids are
adapters, not replacements for the open identity.

Example:

```json
{
  "accountId": "local-edward",
  "jid": "edward@example.org/teletyptel",
  "displayName": "Edward",
  "phoneNumber": "+31612345678",
  "providerId": "kpn-nl",
  "accessibilityProfileId": "default-large-live-text",
  "preferredLanguage": "nl"
}
```

## Provider Model

A provider supplies optional capabilities:

- XMPP account hosting or federation guidance;
- SMS gateway;
- SIP/voice routing;
- captions or speech-to-text;
- text-to-speech;
- relay/teletolk service;
- customer-service or public-information tabs;
- billing/support metadata.

Providers are configured through manifests. A provider adapter can be enabled,
disabled or replaced without changing the XMPP core.

Provider categories:

| Category | Examples |
| --- | --- |
| telecom | KPN, Odido, VodafoneZiggo |
| caption | Speaksee, Ava, speech-to-text provider |
| relay | teletolk or accessibility relay service |
| organization | school, municipality, care provider |
| public-service | emergency information, official support channels |

## Tab Model

Tabs are product extensions, not protocol extensions. They can show provider
services, websites or built-in tools while the conversation stays clean.

Core tabs:

- `chat`
- `contacts`
- `settings`
- `accessibility`

Optional tabs:

- provider support;
- captions/transcript;
- relay/teletolk;
- service website;
- public information;
- sponsored offers.

Rule:

> Ads and provider information belong in explicit tabs, not inside the chat
> timeline.

## Tab Types

| Type | Purpose |
| --- | --- |
| `builtin` | First-party Teletyptel view. |
| `web` | Sandboxed website or provider page. |
| `provider-service` | Provider adapter UI backed by a capability. |
| `public-channel` | Verified organization or public-service information. |

Website tabs must be sandboxed and must not receive chat content unless the
user grants a specific capability.

## Capability Permissions

Manifest capabilities are explicit:

| Capability | Meaning |
| --- | --- |
| `chat:none` | No access to chat content. |
| `chat:send` | May send user-approved messages. |
| `rtt:publish` | May publish shared RTT text. |
| `caption:local` | May create local-only captions. |
| `caption:share` | May share captions to conversation after consent. |
| `phone:sms` | May send/receive SMS through configured provider. |
| `phone:voice` | May start/receive voice sessions. |
| `profile:read` | May read display name/language/accessibility preferences. |

Default for provider tabs is `chat:none`.

## Provider Manifest

Provider manifests should be JSON and versioned. They describe tabs,
capabilities and adapter endpoints without embedding secrets.

Minimal example:

```json
{
  "schema": "https://www.tiedragon.com/teletyptel/schemas/provider-manifest-v1.json",
  "providerId": "example-provider",
  "name": "Example Provider",
  "version": "1.0",
  "homepage": "https://example.org",
  "capabilities": [
    "phone:sms",
    "caption:local"
  ],
  "tabs": [
    {
      "id": "support",
      "title": "Support",
      "type": "web",
      "url": "https://example.org/teletyptel/support",
      "sandbox": true,
      "capabilities": [
        "chat:none",
        "profile:read"
      ]
    }
  ]
}
```

## Adapter Boundary

Adapters live outside the XMPP core:

```text
Teletyptel Web Client
  -> Teletyptel App Model
  -> Tiedragon XMPP Core
  -> Provider Adapters
       -> SMS
       -> SIP/voice
       -> captions
       -> relay
       -> website tabs
```

Provider SDKs may be used inside adapter packages or server-side bridges. They
must not become dependencies of `Tiedragon.XmppMessenger.Core`.

## Privacy Rules

- Chat content is never used for ads.
- Provider tabs do not get chat content by default.
- Captions can be local-only or remote-shared.
- User consent is required before sharing speech/caption output.
- Logs should separate protocol diagnostics from personal content where
  possible.
- Public-service tabs should be verified and visibly labeled.

## Alpha Direction

Alpha 1 should implement the model in documentation and local configuration
only. Runtime enforcement can start with:

- local account profile JSON;
- provider manifest loader;
- static tab rendering in the web client;
- capability display in settings;
- no external provider secrets in the repository.
