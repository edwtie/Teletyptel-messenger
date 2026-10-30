# Isolated iOS Simulator smoke tests

The `iOS Simulator smoke tests` workflow builds the repository's Capacitor iOS
shell on a GitHub-hosted Mac and launches it on two actual Apple iPhone
simulators. It is not a Windows browser emulator and does not require publishing
an app to the App Store.

## Scope and privacy

- Only **committed** source is read with `git show HEAD:...`. Uncommitted Android,
  PostNL and support changes on a developer's computer are not part of this test.
- An explicit allowlist selects Messenger HTML, JavaScript, styles, translations
  and brand images. No PHP, uploads, account configuration, credentials or local
  certificates are bundled. The source hashes are saved in the artifacts.
- A generated staging copy of the existing iOS project uses Capacitor 8.4.3.
  Production iOS files and the local Android configuration are not rewritten.
- The fixture uses Sam and Noor at `example.test`. HTTP APIs and XMPP sockets
  are mocked; the content-security policy blocks external connections. No WAMP
  tunnel, Google translation request or real login takes place.
- A simulator-debug-only controller writes test results from the WKWebView to
  the app's own container. It is not added to the production app.
- The workflow has read-only repository permissions, pinned actions, no signing
  credentials, a 25-minute timeout and seven-day artifact retention.

## What is checked

Inside the native WKWebView, the JavaScript smoke suite checks the iOS Capacitor
bridge, incoming message rendering, outgoing XMPP serialization, outgoing sent
status, the message menu, incoming/own live RTT rendering, phone-width layout,
composer visibility and uncaught JavaScript errors. Menu/input actions are
synthetic DOM events, not XCUITest hardware taps or keyboard automation.

This is a **native-shell and client-logic smoke test**, not a complete product
acceptance test. It does not prove real login, ejabberd delivery, Google
translation, camera/microphone capture, calls, interpreter availability, push,
background execution, physical keyboard behaviour or device signing. Those need
separate integration and real-iPhone tests. A green run must not be advertised
as production readiness.

## Running

The workflow runs for changes to its test scripts on
`codex/teletyptel-beta-polish`. It also supports `workflow_dispatch` when present
on the repository's default branch. It does not modify `master` or publish a
release. Standard macOS runner availability is managed by GitHub.

For local preparation (Windows also supported):

```text
cd scripts/ios-simulator
npm ci --ignore-scripts
npm run prepare:fixture
npm test
npm run preview
```

`preview` is only a WebKit browser preflight and deliberately stubs the platform
identifier; it is **not evidence of an iOS Simulator run**. The macOS workflow
instead verifies a result written by the native simulator controller.

Preparation refuses to overwrite an existing generated project. Before another
local preparation, remove only `artifacts/ios-simulator/project` after checking
its absolute path, or use a fresh checkout. On a Mac, `npm run simulate` then
builds and starts the native simulators using the selected Xcode installation.

## Evidence

The run artifact contains the Xcode version, source manifest, build log, results
for both phones, screenshots and `TeleTypTel-iOS-simulator.zip`. That archive is
a **simulator-only `.app` with fictitious data**, not an installable `.ipa`,
TestFlight build or production Messenger. Its screenshots must remain identified
as simulator test evidence.

The workflow exits unsuccessfully when compilation, startup, native reporting
or any asserted check fails. Screenshots are retained for diagnosing failures;
their presence alone is not a passing result.
