# iOS internal build 16.1

Requested on 2026-11-03 for iPhone and iPad. This release separates Total
Conversation live text from ordinary chat. It is not a public App Store release.

## Included

- Own editable TC text box: edits are sent live through the negotiated call
  text channel, without Send and without creating a chat message.
- New calls start with empty text; old chat and call notifications stay outside
  TC. Ordinary chat messages, drafts and translations remain separate.
- Per-call translation state, composition handling, stale-event guards and
  retention of the current TC draft while its text channel is unavailable.
- Keyboard button focuses TC input only after a user action. Phone keyboard
  layouts retain readable input; iPad portrait/landscape layouts are preserved.
- Includes the connection-recovery hardening from build 15.3.

## Excluded

No PostNL demo, admin/private-label changes, local credentials, user data,
Docker/Asterisk gateway or external interpreter service activation. No claims
of production SIP or 112 interoperability. TLS verification remains enabled.

## Validation

Local unit, layout, translation and Chromium WebRTC channel tests passed before
release preparation. The release-only source is tested separately before push.
GitHub must pass native preparation, compilation and simulator startup before
the protected TestFlight upload is approved. Apple processing follows upload.

The installed local WebKit engine lacks RTCPeerConnection, so browser layout
checks do not establish working iPhone/iPad media transport. On two updated
physical devices, test TC typing, newline/backspace/emoji, separate chat sending,
camera on/off, keyboard, rotation and a second call with empty TC text. Verify
that a brief interruption preserves the draft and that normal hangup works.

## Patch 16.2 — 2026-11-04

- Hide the ordinary chat composer during TC and restore its existing draft after
  the call. Dedicated TC input remains available; incoming-call and normal chat
  behavior are unchanged.
- Remove light-blue TC frames, retaining a neutral keyboard-focus indicator.
- Add an indeterminate blue native startup bar that stops on errors and respects
  reduced motion. Do not add a separate startup logo to ordinary browsers.

Release scope and exclusions remain unchanged. Local phone/tablet layout,
startup, keyboard and call regression checks passed. Native compilation and
simulator startup run in GitHub before the protected upload is approved.
Real-device verification is still needed, especially TC with the keyboard open.

## Patch 16.3 — 2026-11-04

- Restore dark-blue borders around the own and peer RTT areas.
- Remove the separate white focus outline and shadow while typing in TC.
- Preserve the hidden ordinary chat composer during TC and restore it afterward.

Only this visual correction, cache updates and regression coverage are included.
The same release exclusions apply. Internal TestFlight uploads now proceed after
successful preflight without a manual reviewer; the environment remains limited
to the release branch and keeps its signing/upload credentials protected. This
does not authorize public App Store publication.
