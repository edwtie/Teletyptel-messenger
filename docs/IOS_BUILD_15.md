# iOS internal build 15.1

Requested on 2026-11-03 for iPhone and iPad. This is an internal TestFlight build,
not a public App Store release or live SIP/provider activation.

## Included

- Resource-bound Jingle discovery and direct audio, video and Total Conversation
  calls between compatible Messenger clients; existing group/legacy routing remains.
- Plain reliable T.140 for the negotiated project profile, Unicode edits, bounded
  queues, session cleanup and explicit live-text status. Legacy JSON RTT remains
  separately identified; these are not claims of full XEP-0517/RFC interoperability.
- Correct simultaneous hangup and termination-before-media-release ordering.
- Existing iPhone/iPad layout, native Google/Facebook authentication and system TLS
  validation remain in place. The existing exempt-encryption declaration is checked
  during preparation and archive export; no server-side cryptography is bundled.

## Excluded

No PostNL demo, private-label/admin changes, local credentials, user data, Docker
containers, Asterisk patch or Node media gateway. The separately tested gateway
is still a local lab. Installing this client does not enable telephone numbers.

## Release checks

The native bundle has explicit tests for all four Jingle helper files, their load
order and exact source contents, and excludes server gateway code. GitHub must
pass preparation/unit tests, Xcode compilation and simulator startup before the
protected `ios-testflight` upload job is approved. Simulator startup does not prove
working calls or authentication on a physical device.

After installation, test on two real accounts/devices: Google/Facebook login,
audio, video, TC with Unicode/backspace, both-direction hangup, rotation, camera
switching, lock/unlock and Wi-Fi loss. Keep WAMP/ejabberd reachable on the configured
local HTTPS address and keep the test certificate trusted on each device.
# Patch 15.2 — 2026-11-03

- Camera-off TC uses the full RTT area on phones, in portrait, landscape and
  keyboard layouts. Disabled local/remote video no longer leaves a black surface.
- Phone live text stays in its chat bubble without a duplicate composer panel.
- File uploads and TC recording uploads restore the current connection status.
- Translation transport failures are distinguished from missing configuration;
  transient live failures can retry on the next edit, respecting consent/throttle.

Local verification: 23 layout/camera/upload tests, 32 focused runtime/RTT/incoming
call tests, and the translation and XMPP-translation browser suites passed. The
older full-page `live-rtt-integration.test.js` timed out finding its mock contact
before exercising translation, so it is not counted as a passing end-to-end test.
No real translation API calls were made by the browser tests. Real iPhone/iPad
retesting and the protected TestFlight build/upload are still required.

The exclusions below also apply to patch 15.2.

## Pending connection-stability changes

The user reports disconnects during active iPhone chat/calls. The exact device-side
trigger has not been captured. The client previously retired the XMPP socket after
one 15-second unanswered ping, resetting Jingle sessions as well. It now sends one
confirmation probe and waits another 15 seconds before retiring the connection.
Sender-validated replies to either probe stop the timeout. Repeated foreground
events cannot restart this deadline; send failures still recover immediately.

Regression coverage includes delayed replies, forged senders, stale callbacks,
bounded retry, lifecycle events, failed sends, logout and preservation of drafts.
Additional health diagnostics record elapsed time, queued bytes and close status.
There is no change to TLS, authentication or cleanup after a real signalling loss.

Not yet included in a TestFlight build. On a real iPhone, test active chat and TC
for several minutes, rotate the device and briefly interrupt Wi-Fi. Record the
time of any remaining outage and the `xmpp-health` / WebSocket close diagnostics.
Confirm automatic reconnect, draft preservation and normal hangup. Successful
unit tests do not establish stable physical-device calls or media recovery.
