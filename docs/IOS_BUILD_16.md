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
