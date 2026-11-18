# TeleTypTel native iOS migration

## Screen by screen visual audit (2026-11-17)

The visual acceptance catalogue in `scripts/native-visual-audit/catalogue.js`
contains 44 app screens, each with iPhone/iPad, portrait/landscape and light/dark
variants: 352 required comparisons. A missing capture does not disappear from
the denominator. A successful screenshot or simulator job is not pixel equality.
The catalogue is a bounded set of initial states, not every possible message,
language, keyboard, error, accessibility text size or live video combination.

`capture-web.js` renders the actual committed `chat.html`, CSS, scripts, logo,
wallpaper and smileys. It records the exact revision and source hashes, freezes
the clock, mocks API/XMPP with fictitious content and blocks external requests.
It neither connects to WAMP/APNs nor substitutes a lookalike HTML mockup. On
wide web layouts some actions are persistent toolbars instead of popovers; that
presentation is retained, not forcibly restyled to resemble native. The separate
`native-visual-web.yml` workflow captures desktop WebKit on macOS, on explicit
dispatch or changes to its own capture tooling. This
is a reproducible web reference, not a claim of physical iOS Safari equivalence.
Touch emulation and mobile viewport behavior are explicit; captures verify a
coarse pointer, touch-event support and no hover capability. The reported touch
point count is recorded without overriding it (desktop WebKit may report zero).
Visible interaction uses
touch taps, not a desktop mouse. Earlier desktop-pointer captures are useful
review material but cannot pass the mobile pixel-acceptance contract. A Windows
Chromium capture may also use Segoe UI where iOS falls back to Arial; it must not
be presented as an iOS font/rasterization reference.

The unsigned native `visual` scope captures main-menu sheets in both orientations
and themes, plus existing login, contacts, menus, chat, groups, smileys, TC and
startup scenarios. Real XCTest screenshots also retain point-based geometry.
`import-native.js` imports known screenshot names, hashes original PNGs and reads
XCTest's EXIF orientation; landscape is not inferred from filenames alone.
Original bytes are retained. Earlier captures have different message/history
content and time from the web fixture, and no measured app-only safe-area crop.
A transparent one-point DEBUG-only probe now measures the actual UIWindow safe
area when the UI runner explicitly enables it; it is not active in normal app
use or Release. Geometry attachments carry that measurement when accessible.
Where that viewport matches the reference's full original scale,
`VISUAL_DIAGNOSTIC=1` can additionally produce app-only images and red pixel diffs.
These are useful review evidence but **not strict pixel acceptance** until the
shared content/clock/fixture contract also matches. Diagnostic differences never
become green results; the originals remain linked in the gallery.
The gallery also compares measured header/menu/draft rectangles, subtracting only
the measured safe-area origin from native point coordinates. It does not rescale
images or treat equal rectangles as equal rendering. These layout diagnostics
help distinguish real width/spacing differences from differing fixture text.
Default catalogue canvas sizes are not measurements. The iPad simulator actually
reported 834×1161 in portrait, 1210×785 in normal landscape and 1210×809 when TC
hides the status bar. The importer retains those exact measured app sizes. Set
`VISUAL_NATIVE_MANIFEST` to the imported `native-manifest.json` before capturing
the web reference to render each available counterpart at that exact CSS size.
This changes the fresh browser viewport, not existing screenshot pixels. Missing
native cases keep explicitly labelled default sizes and cannot become successes.

The first web-reference run produced 216 images, but image review found that the
fixture had not finished initializing the inactive call toolbar and subsequently
blurred menu focus. Those menu images are superseded, not accepted comparisons.
The capture now initializes the real call UI, preserves menu focus, requires a
visible nonempty popover and checks the requested screen before recording
`stateVerified: true`. Older captures without that flag cannot pass acceptance.
WebKit teardown is bounded and the partial manifest is saved after each case;
a renderer teardown failure remains a failure rather than hanging indefinitely.
The separate `visual-metrics` native scope captures the three presentation suites
without rerunning unrelated message/group operations or enabling signed uploads.
Its first attempt also exceeded the UI budget: the form inventory and chat
presentation finished on iPhone, but the final TC capture did not finish in time
to export a valid result bundle. These partial logs are not screenshot acceptance.
Snapshot geometry now queries only identifiers relevant to that visible scenario,
rather than eight possible controls behind every form/full-screen presentation.
Every snapshot still measures its app viewport; layout assertions are unchanged.

The broad `visual` attempt compiled both simulator families but exceeded its
20-minute UI budget before producing a complete result bundle. Its logs also
identified an iPad progress accessibility frame outside the clipped strip and a
group-message menu hit-test failure during rotation. Those are not visual passes.
The animated progress segment is hidden from accessibility; a separate static
four-point strip supplies its bounded accessibility element. Message-menu labels
have full rectangular hit targets. The group
visibility predicate caches its frame reads rather than repeating costly AX
queries; its geometric and hittability conditions remain mandatory. The minimum
44-point assertion allows only a one-millionth-point floating arithmetic error,
not a smaller visual or touch target. `visual-repair` checks these four focused
menu/group/progress scenarios separately from the longer form-capture suite.

`compare.js` produces a local HTML gallery and full coverage JSON. Eligible pairs
require identical fixture hash, content clock, locale, timezone, viewport,
scale, orientation and theme, with an explicitly measured native app viewport.
PNG EXIF rotations are lossless pixel permutations. There is no resampling,
automatic alignment, antialiasing allowance, similarity threshold, app-region
mask or automatic baseline approval. Every RGBA channel must match. The command
exits nonzero until all 352 catalogue cases are eligible and identical. Native
system keyboards, permission/OS pickers and provider-owned login pages are
outside the app viewport, not silently ignored app controls.

Run the tools from the repository root, always with fresh output directories:

```text
npm install --prefix scripts/native-visual-audit --package-lock=false --ignore-scripts --no-audit --no-fund
node scripts/native-visual-audit/node_modules/playwright/cli.js install webkit
node scripts/native-visual-audit/capture-web.js artifacts/visual-web-new
node scripts/native-visual-audit/import-native.js EXPORTED_ATTACHMENTS artifacts/visual-native-new EXACT_NATIVE_COMMIT RUN_URL
node scripts/native-visual-audit/compare.js artifacts/visual-web-new artifacts/visual-native-new artifacts/visual-report-new
node --test tests/native-visual-audit.test.js
```

The CI reference uses committed source only. The local worktree currently also
has unpublished dialer/branding changes; it must not be represented as that same
commit. To review those actual local files without publishing them, explicitly
set `VISUAL_SOURCE=working-tree` when running `capture-web.js`. This mode reads
only known public frontend files plus the two named branding assets, retains
their exact hashes and marks the report as uncommitted local source. It still
blocks backend/provider connections and does not read private configuration or
the PostNL demo. `VISUAL_BROWSER=chromium` identifies a desktop Chrome reference,
not an iOS WebKit or physical-device result.

XCTest exports supplied to the importer use family-prefixed `iphone-manifest.json`,
`ipad-manifest.json` and family-prefixed original exported PNG basenames. Do not
mix revisions or infer fixture metadata from screenshots. The initial visual
review found unnecessarily tall message bubbles: native chat/group menu targets
were inside the bubble and timestamps always occupied a separate line. Menus
now retain their 44-point targets beside the bubble; short text and metadata
share a baseline, while longer text wraps with metadata below. The simulator
checks compact short-bubble height and menu/text/metadata nonoverlap through
rotation. This is a targeted correction, not a completed all-screen parity claim.

## Visual audit results and remaining work (2026-11-18)

**Full pixel equality is not established, and the current interfaces are visibly
different.** This is not a completed all-screen visual acceptance or a new
TestFlight release. The source/generator/tool checks pass 111 tests, with one
macOS-only check skipped; these are not 111 passed visual comparisons.

Actual unsigned evidence at native source `f7f40394978a30b58bf351632cf25422ec443bd1`:

- [Capture run 44195745476](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44195745476):
  iPad Pro 11-inch (M4), iOS 18.6 passes all three presentation suites, producing
  50 distinct imported images after deduplication. The iPhone build exceeded its
  compiler time budget, so there is no complete iPhone capture set from this run.
- [Repair run 44195752179](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44195752179):
  the iPad passes all four focused checks. The iPhone compiles and passes main-menu
  geometry and startup progress/cancel/certificate checks, but fails the rotation
  settling predicate and group-message-menu activation check. Those failures are
  unresolved validation gaps, not waived assertions or proof of device acceptance.
- [WebKit touch-reference run 44195757146](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44195757146)
  captures 216 verified web states. A separate local Chromium capture includes
  the unpublished frontend changes without publishing those files. Desktop engine
  references are not physical-device Safari or native rendering proof.

The local review at `artifacts/native-visual-review-final-2026-11-18/index.html`
uses 56 newly rendered local web views, matching the measured native app size
where a counterpart exists, and the 50 original iPad captures. Its 352-case matrix
contains 46 diagnostic pairs, 10 web-only cases, 4 native-only cases and 292 cases
without either image in that review set. **Zero cases meet strict pixel
acceptance.** This means the full claim is unproven, not that 352 functioning
screens have all failed. Diagnostic pixel percentages include different fixture
content and must not be advertised as a product similarity or quality score.

Confirmed presentation differences and concrete next acceptance work:

| Priority | Area | Required change/evidence |
| --- | --- | --- |
| P0 | Comparable fixtures | Share message/history/avatars, clock, locale, timezone, provider availability and translation state, recording the same verified fixture hash in both captures. Do not fill missing metadata with assumed values. |
| P0 | iPhone rotation/group menu | Resolve the failed rotation-settling and activation checks with their real screenshots/hierarchy; rerun the unchanged hit-area/nonoverlap requirements and obtain a complete capture set. |
| P0 | Valid web device reference | Corrected device detection is now verified in 216 committed WebKit references. Replace the earlier desktop-class references before accepting tablet column or breakpoint conclusions. |
| P1 | Main/conversation menus | Re-measure placement and dimensions against the corrected phone/tablet reference; earlier web dimensions were collected with the wrong device classification. Align symbol artwork and available actions without silently removing capabilities. |
| P1 | Chat | Compact short bubbles are implemented, but composer dimensions, history/status rows, wallpaper sizing, message alignment and reaction/menu symbols still differ. Retest with identical message data. |
| P1 | Forms and missing native screens | Native Forms/sheets differ from web dialogs, tabs and grids. Align app-owned account, appearance, groups, translation and dialer components. Native News/Support remain disabled placeholders, not completed equivalents. |
| P2 | Complete proof | Capture every remaining catalogue state, fix measured differences and rerun exact RGBA comparisons. Any deliberate platform exception must be documented, not hidden with masks, scaling, tolerances or automatic baseline approval. |

Native system permission/picker/provider screens remain outside the app-owned
pixel claim. Preserve keyboard, VoiceOver, Dynamic Type and minimum touch targets
while aligning presentation. No backend feature reimplementation, live service
call, APNs activation or production infrastructure change was made for this audit.

### Rotation and menu activation follow-up

The two failed iPhone checks are being addressed without waiving their layout
requirements. Direct/group message menus explicitly use their normalized centre
as the accessibility activation point, rather than inheriting a stale descendant
point after rotation. This uses Apple's documented
[UnitPoint activation modifier](https://developer.apple.com/documentation/swiftui/view/accessibilityactivationpoint(_:)-9l0w0),
available from iOS 14; it does not use guessed screen coordinates or change the
44-point rectangle, menu permissions or message content.

The DEBUG measurement probe also reports the real UIWindow bounds and scene
orientation. The rotation helper first waits for that native state, then checks
the actual screenshot orientation and application frame. It no longer repeatedly
requests a potentially stale AX application frame and a compositor screenshot in
the same polling predicate. Each stage has its own ten-second simulator budget;
this is not a physical-device rotation-latency claim. The group check now also
opens the actual message menu and selects Copy, rather than relying only on an
`isHittable` result. New simulator results remain required before calling either
failed check resolved. The earlier 352-case audit result is unchanged.

The web capture now supplies a Safari phone/tablet user-agent descriptor and
verifies the device class selected by TeleTypTel itself. Touch media and viewport
size alone were insufficient: `detectClientDevice()` branches on user agent and
platform, and tablet CSS intentionally retains a sidebar. No app CSS/body class
is manually forced. Only the classification user agent comes from Playwright's
descriptor; viewport/DPR continue to come from actual native measurements, not
the descriptor's hardware dimensions. The bundled iPhone descriptor's model name
is not a claim to emulate that physical model. Older references without
`deviceVerified` cannot meet strict acceptance. Previous app-layout conclusions
derived from their desktop device class must be reviewed against the new images.

[WebKit run 44205030967](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44205030967)
passed with 216 captured states at web source `94d533b`, all with verified
phone/tablet classification, touch input and requested screen visibility. The
artifact is retained locally under
`artifacts/native-visual-webkit-device-44205030967/`. This is reference evidence,
not 216 native matches. A separate local Chromium check opened 24 additional
real two-factor/reaction/editor states across all eight variants; it did not
submit a code, reaction, correction or provider request.

The earlier [repair run 44203686211](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44203686211)
compiled both simulator families, but is not green: iPhone passed one of four
tests and failed direct/group message-menu activation plus the stopped-app
rotation check; iPad passed three of four, including actually opening the group
message menu and selecting Copy, and failed the stopped-app check. The normalized
activation-point attempt therefore did **not** resolve the iPhone menu defect.
The stopped-app test-helper correction is prepared at `204bece`; it must not be
confused with a production fix for the remaining iPhone menu activation issue.

After the selected-colour/header changes and stopped-app rotation correction,
the focused [startup capture run 44207056454](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44207056454)
and [presentation capture run 44207060897](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44207060897)
use native source `204bece`. They are unsigned, with TestFlight and APNs explicitly
off. Their results remain pending and must not be described as passed. The
earlier `44206105148` appearance run was cancelled as superseded: its test helper
still tried to inspect a terminated app window. Local checks for this follow-up
pass 115 tests, skip one macOS-only check and fail none; they do not replace
simulator captures or the full matrix comparison.

## Shared web smileys (2026-11-17)

Feedback archive 9 shows build 16.9's custom web smiley grid, not Apple's Unicode
emoji keyboard. Native direct/group composers now use the same ordered 41-entry
catalogue and aliases from `chat-client.js`, in a scrollable image popover. Picking
an image inserts its original text code into the draft, with whitespace, and does
not send a message. XMPP bodies, archives, copy/edit/forward and reaction payloads
remain unchanged; reactions still use their separate Unicode picker.

Original GIF bytes are bundled as data assets and animated in the picker using
their frame timing; Reduce Motion keeps the first frame. Web SVG fallbacks are
rasterized at 96 pixels by pinned `@resvg/resvg-js@2.6.2` (see
https://github.com/thx/resvg-js), not redrawn as system emoji. Their checked-in PNG
derivatives and source hashes are verified during staging. There is no new runtime
renderer dependency, webview, external image request or backend change. Regenerate
SVG derivatives with `node scripts/native-smiley-assets.js --render <module-path>`
after installing that pinned renderer into a separate ignored tooling directory.

Regular direct/group message display recognizes the same longest-first aliases,
using the original artwork and retaining raw accessible text. Inline GIFs currently
use their first frame; only the picker animates. Ordinary Unicode text is retained.
The local Weergave option “Smileys weergeven” can disable replacement without
changing stored/transmitted text. TC's raw RTT/media paths are not rewritten.

The focused unsigned `smileys` simulator scope checks real bundled decoding of all
41 images, opens the picker in portrait/landscape, and verifies picking changes
only the draft before explicit Send. Unsigned run `44171628879`, revision
`11fa4a0`, passes 1/1 UI test on iPhone 16 Pro and 1/1 on iPad Pro 11-inch (M4),
iOS 18.6. All 41 bundled images decode; two picked codes survive rotation, no
message is created before Send, and the resulting inline artwork is captured.
Representative picker and inline screenshots were manually inspected. The first
interaction run exposed an image-view hit-target issue; images now ignore touch
events and the full button rectangle handles them. Local checks pass 97 tests
with one macOS-only skip. These are shared-picker/direct-chat simulator checks,
not an actual-device, live XMPP delivery, complete group-chat or animation-timing
acceptance test. The TestFlight upload job is skipped.

## Web-led shared visual styles (2026-11-17)

The existing Messenger web styles are the source of truth for the native visual
palette. `scripts/native-web-palette.js` reads explicit roles from
`php/public/chat-client.css` and the final `call-controls-menu.css` overrides,
resolves light/dark variables and transparency, and emits named sRGB colour sets
into the isolated Xcode asset catalogue during preparation. Missing or unsupported
role values fail the build instead of silently choosing another colour. The web
files themselves are not rewritten by this step. This is a scoped role mapping,
not a general CSS renderer or runtime private-label configuration loader.

Shared native components now use these assets for page/form/header backgrounds,
normal and primary buttons, fields, selected contacts/groups, composer and send
buttons, chat bubble fills/borders, read receipts, presence, TC, RTT and call
controls. Call states stay green/red; disabled call controls retain their existing
capability gates and get the web's unavailable-state colours. Wallpaper overlays
also use the web alpha values. Direct/group chats gain web-style day separators,
without changing messages, archive queries, ordering, consent or network actions.

The focused unsigned `appearance` scope captures real simulator screenshots in
both themes for login, contacts, main/conversation menus, settings, chat and TC,
including portrait/landscape. All data is fictitious and no live media, APNs or
TestFlight upload is enabled. Local source/generator/release checks pass 93 tests,
with one macOS-only skip; actual simulator comparison is a separate checkpoint.
Earlier screenshot evidence elsewhere in this document predates this palette.

The first appearance run (`44122896197`) compiled and passed iPad interaction
checks; its iPhone job was cancelled after manual screenshot inspection rejected
the visual result. Xcode discarded colour variants
because their universal idiom was missing. This is fixed in the generated asset
metadata; a regression check also rejects Xcode's unassigned-colour warnings.
Green interaction tests alone are not visual acceptance. Replacement screenshots
must be inspected before accepting this change.

The replacement interaction run (`44127643007`) also passed on both families,
but its screenshots exposed a second metadata issue: whole-number colour strings
were not rendered as the intended normalized RGBA components. Generated channels
now always use decimal-point notation, including `1.000000` for opaque alpha.
A DEBUG-only fixture check resolves every compiled UIColor in both appearances
and compares its actual RGBA against the generated web reference. The appearance
test requires that runtime check to pass before capturing the UI; this data and
check do not activate any production network service.

Accepted palette evidence: unsigned run `44151699693`, revision `295487f`,
passes 2/2 UI tests on iPhone 16 Pro and 2/2 on iPad Pro 11-inch (M4), iOS 18.6.
The tests resolve all 57 named colours against the web RGBA reference in both
appearances and capture 20 screens per family. Representative login, menu, chat
and TC screenshots were manually inspected, including landscape and dark mode.
The upload job is skipped. This is not an actual-device, live-call, translation
provider or full functional regression result.

Screenshot review also found the TC shortcut shape explicitly painted white,
overriding its disabled foreground. A final presentation-only follow-up makes
that shape inherit the button foreground. It passes the local source checks;
the simulator evidence above predates that one-line follow-up.

This shared foundation is not a claim of complete pixel or functional equality.
iOS keyboard, permission/provider dialogs, pickers and system menus remain native;
SF Symbols and native form layout still require visual comparison. Unimplemented
native News/Support and other documented feature gaps are not made functional by
restyling. Physical-device, provider, SIP and background-call acceptance are outside
this visual-only change. A new signed build is still needed to update TestFlight.

## Advanced server settings and unavailable-server screen (2026-11-17)

The subsequent compact-control correction replaces the visible **Geavanceerd**
word and chevron with the same `slider.horizontal.3` symbol on both screens.
It retains a 44-point touch target, the localized accessible label/help and
expanded/collapsed state. Configuration stays hidden until explicitly opened.
Both symbols now sit at the bottom right: a reserved footer below the startup
scroll view and a bottom safe-area inset on the settings form. They stay within
the native safe area without floating over messages, fields or the retry button.
This small visual correction has local source checks; the simulator evidence
below applies to the preceding text-labelled controls, not a new TestFlight build.

Server addresses, XMPP domains, connection probes and provider configuration
details are now collapsed behind an explicitly opened **Geavanceerd** disclosure.
The normal settings gear still offers language and privacy settings; saving a
server configuration is only available after opening the advanced section.
This is a presentation safeguard, not administrator authorization or a security
boundary. Existing custom settings and secure defaults remain unchanged.

Connection failures use the same startup view with the logo, a short status and
**Opnieuw proberen**, without exposing technical fields or adding an error popup.
Certificate failures retain a distinct security warning and never bypass trust
validation. Account/password and two-factor errors are not labelled server-offline.
Retry clears pending password/code input and checks availability only: it does not
submit credentials, restart OAuth or silently unlock a saved sign-in. Successful
retry returns to sign-in; it does not mean the user is authenticated.

Advanced draft probes use a separate model, so cancelling settings cannot clear
an existing server-failure screen or replace its state with results for an unsaved
server. Closing the sheet cancels and resets only that draft probe. No additional
real startup requests, infrastructure changes or TestFlight upload are added.
The DEBUG offline fixture fails its first probe and succeeds on retry, only for
`example.invalid`/`localhost`. The DEBUG interface includes a test-scenario banner
(which can scroll out of view). Saved simulator screenshots are labelled as tests,
not evidence of a live service outage or physical-device acceptance.

The first actual simulator run (`44074496320`) compiled for both families but
found five failing UI checks on each: native DisclosureGroup propagated its identifier
to child fields, the retry button's actual target was only 32 points, and an
inactive progress element remained in the accessibility tree after cancellation.
Explicit expansion buttons preserve individual field identifiers; retry sizing
is now inside its label, with explicit white text. The inactive progress branch
retains the four-point layout space without an active progress identifier. The
original assertions remain enforced.

[Unsigned startup run 44078210139](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44078210139)
at `53257eb` passes all seven actual UI tests on both iPhone 16 Pro and iPad Pro
11-inch (M4), iOS 18.6 simulators: fourteen passed, no failures or skips. Coverage
includes hidden technical fields, explicit expansion, discard/save, invalid
configuration, portrait/landscape, no keyboard on startup, cancellation, distinct
certificate warnings and retry returning to unauthenticated sign-in. Real
simulator screenshots were inspected and copied to Downloads with `test` in their
filenames. Local source/generator/release checks pass 86 tests with one macOS-only
skip. This is still unsigned testing, not a TestFlight upload or physical-device
acceptance; the installed 17.3 build is unchanged.

## Confirmed server defaults for the next build (2026-11-17)

Fresh installations now prefill `https://dev.teletyptel.nl` and XMPP domain
`localhost`, as confirmed by the owner. Existing saved settings are not rewritten.
Explicitly empty or partial saved settings also stay unchanged: a custom address
is never silently combined with another server's default domain, or vice versa.
The fields remain editable behind the sign-in settings gear, with the existing
HTTPS, certificate, domain and per-login server checks retained. Selecting these
defaults adds no startup network probe or automatic sign-in. DEBUG fixtures and
explicit empty simulator launch arguments remain isolated from the real server.

Three Swift startup tests cover fresh defaults, preserved saved values and
partial-setting rejection. The focused unsigned update check includes those
startup tests. Local source/generator/release checks pass 85 tests with one
macOS-only skip; actual Swift/SDK verification remains a separate CI check.
This source change does not alter the already uploaded TestFlight build 17.3;
it needs a subsequent app build to reach installed devices.

## Internal candidate 1.0 (17.3), uploaded 2026-11-17

The owner requested TestFlight publication of the 16.9-reference menu/icon,
startup-activity and keyboard-focus corrections. Before publication, a read-only
App Store Connect query confirmed 17.2 as the latest processed internal build;
17.3 was selected as the next candidate. Run `44056073428` validated the device archive, WebRTC linkage and
iPhone Release startup, but the iPad XCTest runner timed out waiting for its
Accessibility-loaded notification. The upload job was skipped, not bypassed.
The separate iPad menu rerun `44051521857` attempt 2 met the same bootstrap error.

To isolate the hosted test environment, menu and Release-startup checks now
create a fresh simulator of the same selected device type and iOS runtime.
They boot it, open Simulator from the selected Xcode bundle and verify that its
display renders before compiling the UI-test target. Stock simulator devices,
failed artifacts and local-user devices are not erased or deleted. Preparation
errors propagate; a rendered home screen is not counted as an app startup pass.
Both families must still run the real unchanged Release startup assertion,
and all archive/signature/export gates must succeed before signing/upload.
This is a test-environment correction, not an app, server or permission change.

Local orchestration, release and native UI contracts pass 84 tests, with one
macOS-only check skipped. The existing reviewed internal-Netherlands encryption
and protected signing configuration are unchanged.

[Release run 44061642423](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44061642423)
at `3bf0d3e` is green: both actual Release startup assertions, unsigned device
archive/runtime checks and the separate protected signing/export/upload job
succeed. The bounded upload result confirms version `1.0`, build `17.3`,
`signed: true`, `uploaded: true`, `internalTestOnly: true`, with no failed stage or
cleanup warning. There is no public App Store release or server/APNs activation.
This proves upload, not Apple processing or availability to a particular tester;
the result retains `processingAndCompliancePending: true`. A post-upload App
Store Connect processing state was not independently confirmed at completion.

The additional [menu run 44061648921](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44061648921)
passes on iPhone. The iPad Debug UI run reaches application launch but eventually
hits the twenty-minute `xcodebuild` test timeout without a completed test summary.
It is not reported as a menu pass or as a diagnosed production-app crash.
Physical iPhone/iPad startup, sign-in, menu and rotation acceptance remain needed;
the observed successful Release startup checks do not establish full UI parity.

## Device-launch regression found in 17.1 (2026-11-16)

User-supplied TestFlight feedback for `1.0 (17.1)` reports launch termination
`DYLD 1 Library missing`, specifically `@rpath/WebRTC.framework/WebRTC`, before
application code runs. The earlier archive log shows WebRTC was copied into
`Frameworks`, but the generated app target did not declare
`@executable_path/Frameworks` in `LD_RUNPATH_SEARCH_PATHS`. Successful compilation,
code signing and Apple processing did not establish launchability. The raw
feedback archive and its personal/device identifiers are not published.

Both Debug and Release app configurations now retain `$(inherited)` and add the
embedded-framework runpath. Before signing/upload, the actual device archive must
contain WebRTC, reference its expected install name, include the executable's
framework runpath and contain arm64 app/framework binaries. The same inspection
runs again on the actual exported IPA, which is unpacked only in protected
temporary staging and checked for a valid signature before upload.

Each unsigned archive preflight now also builds and runs the actual Release
startup UI assertion on its iPhone or iPad simulator. It must reach the visible
server-address/startup screen without the keyboard or authenticated state; a
successful build or `simctl launch` alone is not counted as an opstart test.
Build, boot and assertion errors propagate. This is not a physical-device,
social-login, media or APNs acceptance test.

The replacement candidate is `1.0 (17.2)`. Local validation passes 68 checks with
one macOS-only skip, including regression cases where the framework exists but
the executable only searches system/build directories. Actual archive/export
inspection and simulator startup results must still be obtained from the new
workflow; 17.2 is not claimed uploaded at this preparation checkpoint.

The first run on `75202da`,
[43910469934 attempt 1](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43910469934/attempts/1),
verifies both arm64 archives and runtime linkage. The actual Release startup
assertion passes on the iPhone 16 Pro simulator (iOS 18.6), with a visible startup
screenshot, one test passed and no failures. The iPad Pro 11-inch (M4) simulator's
XCTest **runner** is killed before establishing its test connection; no app
startup assertion runs there. This is not counted as a successful iPad test and
the upload job is correctly skipped. The raw test reports are retained.

A failed-job rerun was requested, then canceled before signing/upload when an
artifact-name collision risk was identified. Artifact names now include the run
attempt rather than deleting/overwriting earlier failed evidence. A fresh run
must pass both unchanged Release startup assertions and all archive/runtime gates
before 17.2 may upload. Simulator-runner failure is not silently converted into a
pass, an application crash, or physical-device acceptance.

The replacement run on `a1d0b4c` is
[43915481448](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43915481448).
At 2026-11-16 18:21 Europe/Amsterdam it remains queued with no jobs allocated,
after repeated checks over eleven minutes. It has not signed or uploaded 17.2.
The existing 17.1 device crash must not be described as resolved in an installed
update until the replacement actually uploads and is checked on the device.
This queued run retains both archive/runtime checks and Release startup tests as
mandatory gates before the protected internal upload; no approval, test, TLS or
signature guard was bypassed to make it appear released.

## Internal-NL encryption declaration corrected (2026-11-16)

The owner confirmed this candidate is for internal testing in the Netherlands
only, not France or a public App Store release. The native archive generator now
adds exactly one boolean `ITSAppUsesNonExemptEncryption = false` for that scoped
internal target. Ordinary non-archive preview staging is unchanged. An existing
different/string/duplicate declaration or export-compliance code fails the build
for review rather than being silently overwritten. Actual unsigned and signed
archive validation requires the boolean declaration in the archived app.

The native inventory is **not encryption-free**: URLSession/Security provide
HTTPS/WSS, secure credentials and authentication; CryptoKit provides AES-256-GCM
for the scoped local cache and SHA-256; the pinned WebRTC 157.0.0 dependency uses
standard DTLS/SRTP/SCTP media/data transport. No proprietary encryption algorithm
was identified in the reviewed native implementation. The Google 9.0.0 and
Facebook 18.1.1 sign-in dependencies also remain part of the release inventory;
they are not omitted from the assessment just because sign-in is optional.

Apple's [documentation requirements table](https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption)
distinguishes OS encryption from third-party industry-standard algorithms and
requires the referenced French declaration only for App Store distribution in
France. The [plist key](https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption)
means no **non-exempt** encryption, not no encryption or disabled TLS. This is the
scoped Apple submission assessment for the reviewed internal-NL candidate, not a
blanket export-law certification, a CCATS classification or approval for future
territories. Reassess before public/French distribution, an encryption/provider
dependency change or adding a new encryption feature. Preserve any separate
government reporting obligations; absence of Apple documentation is not a waiver
of those obligations.

The existing signed build `1.0 (17.1)` was updated through Apple's documented
build API, changing only `usesNonExemptEncryption` from unset to boolean false.
A fresh read confirms `processingState: VALID`, audience `INTERNAL_ONLY`,
internal state `IN_BETA_TESTING` and external state `NOT_APPLICABLE`. No binary
was replaced, no second upload was needed and tester groups were not changed.
The signed 17.1 binary itself still predates the plist correction; the server-side
declaration covers that build, while future internal archives contain the key.
APNs activation and physical-device acceptance remain separate, unfinished gates.

Local validation passes eighteen focused Node tests and the expanded suite passes
61 tests with one explicitly macOS-only skip, including real plist parsing, typed
declaration/duplicate/conflict rejection, signed-archive metadata guards and
unchanged isolated preview behavior. No new simulator/media run is claimed for a
packaging-only change.

## Native internal candidate 1.0 (17.1), uploaded 2026-11-16

[Run 43904501035](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43904501035)
on source `69b2990` completes successfully: both unsigned archive jobs and the
separate protected signing/export/upload job pass. The downloaded result records
`signed: true`, `uploaded: true`, `internalTestOnly: true`, version `1.0`, build
`17.1` and the existing production bundle `com.tiedragon.teletyptel`.
No separate public App Store release was submitted.

This result establishes a verified signed upload, not Apple processing or tester
availability. The report explicitly retains `processingAndCompliancePending`,
`privacyReviewRequired` and `exportComplianceReviewRequired`, with
`apnsActivated: false` and `physicalDeviceTested: false`. The first read-only App
Store Connect query did not yet list 17.1; a subsequent read-only query confirms
`processingState: VALID`, `expired: false`, internal state
`MISSING_EXPORT_COMPLIANCE` and external state `NOT_APPLICABLE`. At that checkpoint
the encryption declaration was still unset and those queries made no changes.
The subsequent reviewed internal-NL correction above resolves that specific gate.
Do not repeat the successful upload or silently copy this declaration to a
different distribution/encryption scope.

Before the locked-screen test, finish the private server pilot deployment,
including the Docker-to-Windows signed signaling journal bridge, scoped ejabberd
modules/listeners, explicit recovery schema migration and separate supervised
monitor/dispatch workers. Keep enrollment disabled until these health gates pass.
Then install the native candidate, sign in with the selected pilot account,
obtain explicit background-call consent and a real PushKit registration, and
test a genuine incoming call, answer/media/RTT, cancellation and logout revocation
on the physical iPhone. A successful compile or upload cannot replace that test.

## Explicit native internal-release path (2026-11-16)

`ios-native-preview.yml` now additionally supports the explicit dispatch inputs
`internal_upload=true`, `native_push_test=true`, `validation_mode=focused-archive`
and a unique `build_number`. Both unsigned archive jobs must succeed before the
separate `ios-testflight` environment job may sign or upload. Ordinary pushes and
preview runs cannot activate this job. The existing web-shell release workflow
and its provisioning secret remain unchanged.

`native-internal-release.js --upload-internal` uses the dedicated protected
`IOS_NATIVE_PROVISION_PROFILE_BASE64`, matching existing distribution certificate
and App Store Connect upload credentials. It verifies the production APNs
profile, certificate identity, archived app and embedded profile, actual signed
entitlements and provider settings before exporting an internal-only package.
Signing settings apply only to the app target, not every third-party package.
Temporary keys/profiles/keychain are cleaned up; only a bounded non-secret result
JSON is published, not the IPA, private build logs, provider plist or signing
material. No APNs provider key is sent to GitHub.

Production Google/Facebook registrations are accepted only for this explicit
real-bundle archive; the differently registered preview remains isolated. Provider
tracking flags remain disabled. The app-level privacy manifest documents observed
app-only UserDefaults use and elapsed-time timers (CA92.1 and 35F9.1). It does not
claim that no user data is collected or replace SDK manifests/App Store privacy
answers. The subsequent scoped internal-NL declaration is documented above;
it is not an automatic exemption for other distributions. Apple processing and
export-compliance review may still block availability for a changed release scope.

An uploaded result is not proof of delivered APNs, locked-screen CallKit/media,
privacy conformance or successful real-device Google/Facebook sign-in. Server
pilot deployment and explicit device consent/token registration remain required.
No public App Store release or automatic configuration of other accounts is made.

Archive/signing jobs use GitHub's explicit `macos-15-intel` image with Xcode 26;
the generic iOS archive still contains arm64 device code for both families, not
an Intel iPhone executable. Other preview modes retain their existing runner.
This avoids the observed arm64 runner-capacity queue without dropping archive,
profile, signature or provider checks. See the official
[GitHub runner image matrix](https://github.com/actions/runner-images) for labels
and the [macOS 15 image inventory](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)
for installed Xcode versions.

## Explicit unsigned archive validation (2026-11-16)

The native preview workflow now has an explicit `focused-archive` mode, requiring
`native_push_test=true`. It stages the real app bundle ID, a branded opaque
1024-pixel app icon, archive-enabled Release scheme and explicit version/build
metadata, then actually runs `xcodebuild archive` for generic iOS with signing
disabled. The archive's installed app, executable/assets, bundle identity,
iPhone/iPad families, version and push/background flags are checked. Defaults
remain the separate non-archiving preview. Only reports are published as CI
artifacts, never signing assets or an installable IPA.

The test metadata `1.0 (17.0)` is not a reserved or uploaded TestFlight build.
An archive report always records `unsigned: true`, `uploaded: false` and
`releaseReady: false`. Archive validation is an additional packaging gate, not
proof of signing, App Store acceptance, production social login or APNs delivery.
The production profile, encryption declaration, app/SDK privacy manifests,
deployed background-call services and physical-device acceptance must still be
reviewed. This change does not copy provider registrations from the different
preview bundle, import secrets or replace the user's installed version 16.9.

The server/core revalidation of the scoped logout and pilot-health implementation
on `068bc43` now passes both jobs in
[run 43885375403](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43885375403).
That is isolated ejabberd/PHP/Swift validation, not live APNs activation.

Apple documents the archive step in
[Create an archive](https://help.apple.com/xcode/mac/current/en.lproj/devf37a1db04.html)
and the separate app/SDK reason-API obligations in
[Describing use of required reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

Local validation passes 74 Node checks with one macOS-only skip, plus the ten
isolated worker-loop checks. The first real archive run created the iOS app with
the expected bundle ID, version `1.0 (17.0)`, AppIcon, iPhone/iPad families and
push/recovery flags, but its post-check failed while converting the archive's
date-containing plist to JSON. This is not a successful overall archive check.
Extracting `ApplicationProperties` through JSON conversion also failed on nested
data/date fields in the subsequent run. The reader now uses Python's standard
`plistlib` for binary/XML plists and returns only the two strictly typed string
identifiers needed by the archive check. A real binary-plist regression covers
dates, data and rejection of a non-string application path; validation is not
skipped to hide the conversion error.

Both unsigned archive jobs on source `69b2990` pass in
[run 43904501035](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43904501035).
This validates packaging for both device families, not a simulator or physical
device session. The separate protected signing/upload job is tracked independently;
unsigned success alone does not establish a signed upload or APNs delivery.

## Explicit APNs build staging (2026-11-16)

The existing unsigned preview workflow's explicit `native_push_test` input stages the
actual app bundle ID with production APNs entitlements, audio/VoIP background
modes and both native push/recovery flags. It is an explicit internal test target,
not the default preview or a signed TestFlight release. Consent, Keychain scope,
CallKit-before-network reporting, answer authorization, active leases and the
camera/audio media gates remain mandatory. Provider registrations from the
different preview bundle cannot be implicitly reused in this target.

PHP logout/device revocation now has a transactional outbox and an authenticated
TLS path to the actual ejabberd scope backend. Server installation/flags and a
signed native build are still needed before any real device can exercise it.
An Apple HTTP/2 TLS preflight is not proof of APNs provider/topic acceptance or
locked-screen media delivery. See `services/call-push/README.md` for configuration,
failure/retry semantics and the combined isolated logout test.

## Active scoped-call continuation (2026-11-16)

The gated cold path now requests a separate short active-call lease before its
media offer is returned and every eight seconds while the call remains valid.
The lease pins the original call/device/resource/peer/profile; it never becomes
a saved account or SASL credential. Native deadlines move only after the scoped
ejabberd connection acknowledges the server-signed permission. An expired scope
cannot be revived; revocation, failed acknowledgement and cancellation stop the
connection and end the call. The ordinary foreground account path is unchanged.

The accompanying server producer/ledger lifecycle supports calls beyond the
original invitation timeout; see `services/call-push/README.md` for the actual
TLS/broker integration fixture and remaining immediate-revocation, deployment
and physical iPhone/iPad release gates. No APNs activation or TestFlight upload
is part of this change. Swift unit and unsigned SDK validation must pass before
this source is treated as compiled native evidence.

Source `fde7b5e` passed 107 selected Swift core tests in the
[isolated server/core run](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43878040142),
including the active lease parser, stream deadline extension, repeated renewal
beyond invitation expiry, cancellation and rejected acknowledgements. The same
run passed the combined real ejabberd-producer/PHP-broker renewal fixture. This
does not substitute for the separate SDK build or physical-device media tests.

The subsequent [unsigned SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43878046114)
for this source also passed: 246 selected Swift tests and native RTT checks per
iPhone/iPad-labelled job, with successful generic iOS device-SDK compilation.
Both reports contain `uploaded: false` and `uiTests: []`. No actual iPhone/iPad,
simulator UI, camera/audio or live APNs test is claimed; TestFlight is unchanged.

## Push, CallKit and media bridge (2026-11-16)

The app delegate and SwiftUI now share `NativeCallController.shared`. An extra
disabled laboratory flag gates cold restoration of explicitly consented,
after-first-unlock device-only recovery authorization. No general chat password,
biometric unlock or PHP session cookie is used in the cold path. Network work
starts on answer, after CallKit reporting. The bounded HTTPS broker and distinct
call-only WSS transport feed actual proof/reservation, server-acknowledged scoped
answer authorization, proceed and fresh Jingle
into `NativeIncomingPeerNegotiator` and the existing WebRTC/CallKit audio gate.

This supersedes older statements that no native cold-path wiring exists. It does
**not** remove release gates: scoped XMPP expires after twenty seconds without
the separate active lease described above; immediate PHP revocation integration remains
unfinished, and no readiness capability, APNs activation, entitlements or signed
TestFlight upload is added. The preview plist does not enable
`TeleTypTelNativeCallRecoveryLabEnabled`. See `services/call-push/README.md` for
the isolated adapter/broker contract and all physical-device acceptance gates.

Source `b77ec56` passed the
[unsigned iPhone/iPad SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43868908105):
242 selected Swift tests, native RTT checks and generic device-SDK builds in each
job. The [server/core checks](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43868902921)
passed actual scoped TLS/WSS and answer-permit rejection on disposable ejabberd
25.10, plus 103 core Swift tests. No real APNs request, combined cold-launch media
acceptance test, physical-device validation or TestFlight upload was performed.

## Call-only bootstrap checkpoint (2026-11-16)

The core now has an ephemeral `NativeCallBootstrapGrant` and a distinct
`XMPPSessionStream(bootstrap:)` initializer. Bounded payload/metadata must agree
with the expected account, issuer/domain/environment, invitation UUID/SID/media,
device/generation, fixed resource and twenty-second deadline. Credentials are
redacted, not persisted and not converted into normal saved-login accounts.
Expiry or an unexpected resource closes the stream; roster, chat delivery,
presence announcement and discovery remain suppressed.

This is a parser/handshake foundation, **not connected cold-launch calling**.
The native parser cannot authenticate the private server HMAC: the future
broker's authenticated HTTPS response and actual ejabberd SASL verification are
required. The matching opt-in PHP issuer and restricted ejabberd backend have a
real disposable TLS integration fixture, separately from native unit/SDK checks.
See `services/call-push/README.md` for exact limits, revocation integration still
needed, twenty-second bootstrap versus active-call leases, and release gates.
No live APNs, provisioning or TestFlight upload is performed by these checks.

Source `015189a` passed the
[unsigned SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43855690437):
234 selected Swift tests, native RTT tests and generic device-SDK compilation
in each iPhone/iPad-labelled job. The
[separate server/core run](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43855684916)
also passed actual scoped authentication against a disposable ejabberd 25.10.
Neither run tests signed cold-launch APNs or real iPhone media/background behavior.

## Feature-gap implementation checkpoint (2026-11-15)

This section supersedes older statements below that native registration,
password recovery, recording, one-time location, language resources or unread
indicators do not exist. It does **not** supersede the background-call,
production-SIP, signing, migration or physical-device release gates.

Implemented in `a635dc0`, `044cfbb`, `dee62e0`, `866b8d7`, `8610827`,
`e854614`, `998cb2a`, `ef577a9`, `3cdf028`, `d97b3e3` and `53054ed`:

- Bounded foreground reconnect after an authenticated session loses its
  transport: five attempts with backoff, generation/cancellation guards,
  stable-connection reset, retained drafts and uncertain-send handling. No
  automatic resend, certificate bypass, authentication retry loop or claim of
  XEP-0198 stream resumption. Disconnecting an uncertain call ends its old
  media runtime rather than pretending it survived.
- XMPP-confirmed blocking/unblocking and roster removal/rename, with existing
  roster groups preserved during rename. Blocked direct text, reactions,
  receipts and new incoming/outgoing calls are filtered locally too. Muting
  and Do Not Disturb are account-scoped cached preferences; DND sends busy
  presence, declines new calls and still receives messages. A server refusal
  does not falsely confirm a block. Cross-resource blocklist refresh and
  independent server/module interoperability acceptance remain to be added.
- Native registration using the existing local-domain creation contract,
  recovery-email requests, password changes followed by logout/credential
  removal, security-state loading and explicit authenticator setup/confirmation.
  Password changes use the new authenticated `change_password` server action,
  not generic profile save: current password and account ownership are checked,
  while avatar, provider, XMPP and storage preferences are preserved on the
  server. Deploy the matching `api/account.php` and
  `NativeAccountPasswordChange.php` with the native build. The native client
  requires the advertised password-change capability from the same session,
  account and JID; an older backend cannot silently fall through to generic
  profile save. TOTP confirmation
  can resume after visiting an authenticator app without replacing its pending
  server key; explicit key-copy is device-local and expires after one minute.
  Registration intentionally rejects domains for which the existing backend
  would only save an external profile instead of creating an XMPP account.
  Email delivery, verified recovery identities, TOTP interoperability and signed
  provider flows still require deployed-server/device acceptance. Disabling an
  existing second factor is not silently added or bypassed.
- Explicitly initiated 60-second AAC voice recording, camera photo/video,
  bounded MP4 export, media file selection and existing authenticated chunked
  upload. Recordings are reviewed before upload and staged before sending.
  Native upload policy now admits bounded M4A/MP4 containers, not arbitrary
  executable types. Received supported media/PDF/photos can be downloaded
  through the existing same-origin session and opened in a protected temporary
  Quick Look preview. Recording/preview is excluded during calls and stopped
  on backgrounding. Actual microphone/camera/recording/playback acceptance is
  not proven by SDK compilation or synthetic container fixtures.
- Foreground-only, one-shot location permission/request with a deadline, age
  and accuracy checks, coordinate review, explicit staging and cancellation.
  This shares a normal map link, not a live-location protocol, background
  tracking or emergency-location service.
- Independent system/Dutch/English interface selection on login and in
  appearance settings, generated localized resources and localized system
  permission descriptions. The build rejects missing English translations for
  scanned static screen literals. This is not proof that every dynamically
  composed diagnostic/status or VoiceOver sentence has been localized; a
  language/device review is still needed. User message bodies are not localized
  by this mechanism and changing app language never enables message translation.
- Local unread state for direct and live group messages, independent of
  outgoing read receipts. Delayed group history and imported cloud history are
  not automatically made unread. Message banners/badges require explicit iOS
  consent, show no message body, respect mute/DND/open-chat visibility and are
  cleared on logout. They work only while the app actually receives messages:
  **no remote chat APNs or killed-app delivery is claimed**. Unread state is
  device-local, not cross-device synchronized read state.
- Upload review and the explicit stage-link action precede optional capture
  and location rows, keeping the current operation reachable in a lazy Form.
  Main-menu presentations wait for menu dismissal. Icon borders are inset
  inside explicit 44-point interaction bounds, keeping compact-landscape group
  controls in one native toolbar instead of adding a second row over message
  space. The recovery fixture drops one connection and proves
  transport recovery without a second password prompt, not an endless mock
  disconnect loop.

Validation checkpoints: unsigned run `43702471938` on `a635dc0` passed 130
selected Swift tests. Run `43703357855` on `044cfbb` passed 144 selected Swift
tests, generated-language-resource SDK compilation and same-host native media
fixtures in both iPhone/iPad-labelled jobs. Run `43704519496` on `866b8d7`
passed 146 focused Swift tests and generic iOS SDK compilation in both jobs,
including dedicated password-action and resumed-TOTP tests. Run `43705440747`
on `8610827` passed 147 selected Swift tests and SDK compilation in both jobs,
including the account/session-bound password capability guard. Locally, 100 native
regression checks pass with three macOS-only skips; isolated PHP profile,
avatar, upload and preserving-password tests pass. Synthetic FFmpeg AAC/MP4
files are accepted by the actual upload policy and disguised non-media is
rejected; these are not recordings from device hardware.
Full run `43703698066` on `dee62e0` passed the 399-case Swift suite with
20 explicit skips and no failures, generic SDK compilation, release-fixture
exclusion and all eight same-host media profiles plus the interpreter leg.
Its UI jobs did **not** pass: iPad had three failed cases and iPhone had four
(attachment staging, the obsolete terminal-disconnect expectation, group
discovery/search and iPhone compact-landscape leave hit-testing). English
startup and the separate cloud-history smoke test passed on both simulators.
These failures motivated the later UI fixes; the full run must not be called
green. Run `43706635440` stopped at a stale workflow-choice source assertion
before compiling; that assertion now includes the explicit focused-UI mode.
Focused UI run `43706832872` on `998cb2a` passed six of seven iPad UI cases
and five of seven iPhone cases. The remaining search assertion incorrectly
included the untouched sidebar preview, so it now checks the active group
message viewport, including a positive pre-search assertion. Compact-landscape
leave still exposed hit testing outside the clipped message viewport; that
viewport now has an explicit rectangular interaction shape and decorative
backgrounds cannot intercept taps. Run `43708488002` on `ef577a9` caught a
mis-scoped UI-test variable at compile time; no UI pass is claimed for it.
The declaration is now inside the search test, with a source guard for that
scope. Run `43708897049` on `3cdf028` passed both affected group cases on both
iPhone and iPad. Subsequent compact-toolbar refinement removes the extra row
and adds strict assertions that the latest bubble fits inside the actual
message viewport and the leave button is fully inside the app bounds.
Run `43709975746` on `d97b3e3` passed all seven focused UI cases on iPhone
and six on iPad. The stricter viewport assertion caught approximately two
points of group-bubble border clipping after iPad rotation. Adaptive bottom
spacing now reserves room for that border without adding another toolbar row
or relaxing the assertion. Run `43711508777` on `53054ed` passed both group
cases on both families (two tests per family, no failures). Its exported
iPad landscape screenshot also shows the complete latest bubble above the
composer. This is a targeted final regression, not a claim that all seven
cases or the full unit/media suite were rerun on `53054ed`.

Isolated ejabberd run `43705083617` on `866b8d7` passed real loopback WSS
transport/login, Jingle, archive, group and invitation tests against disposable
ejabberd 26.09, with fictitious accounts and cleanup. The account HTTP service
was a contract fixture: the report explicitly says `accountAPITested: false`.
It is not proof of a deployed PHP account server or physical-device acceptance.

Evidence is retained under `artifacts/native-gaps-*`,
`artifacts/native-gap-final-regressions.txt` and the named GitHub run artifacts.
The focused UI mode only compiles the simulator app and runs the listed UI
cases; it does not claim another complete Swift/media/device-SDK test run.

### Still open: the fifth release family

The server has an opt-in ejabberd c2s/JMI producer, protected local spool, signed
journal and device/resource-proof policy; see `services/call-push/README.md`.
Disposable real ejabberd/PHP integration covers offline intent and proven new
resource acceptance with mock dispatch. The native XMPP transport now supports
live intent/proceed, policy and proof IQs; `NativeCallAnswerRecovery` tests proof,
reservation, cancellation and awaiting-Jingle ordering. It is not yet called by
the app's CallKit media driver, and cold-launch scoped credentials/bootstrap are
still missing. No live producer, APNs or recovery capability was activated. The
status/end-only native bearer has not gained login or answer privileges.

Native background-call completion needs an authoritative server-side wake /
answer / Jingle recovery adapter, cold-start runtime, correct signed identity
and APNs capabilities, deployed worker/policy, revocation and locked-device
acceptance. The existing status/end control credential is not an XMPP login
credential. No chat password was copied into a less-protected background vault
and no capability flag was invented to expose an unfinished feature.

SIP routing remains the existing private local Asterisk echo-600 lab. Initial
inbound SIP calls, production TLS/SRTP/TURN/RTCP/provider acceptance, real native
device-to-gateway codec/DTMF testing and coordinated partner/emergency routing
are not completed by these UI/account changes. No real provider or 112 calls,
APNs activation, server restart, TestFlight upload or wrapper replacement was
performed. The five families therefore must **not** all be marked complete.

## Optional native G.722 audio (2026-11-15)

Account settings now expose `Gespreksgeluid`: standard G.711/PCMU or explicit
G.722 wideband for new outgoing audio, video, audio/RTT and Total Conversation
calls. PCMU remains the default. The local preference is sampled before call
setup; changing it does not modify a live call. Incoming calls follow the
validated offered codec, independently of this outgoing preference.

The native WebRTC peer filters real SDK capabilities before selecting G.722.
Jingle/SDP preserves payload 9, mono `G722/8000` and the historical 8 kHz RTP
clock, not a fictitious 16 kHz RTP clock. No G.711-to-G.722 upsampling or silent
codec fallback is introduced. Unsupported devices/peers fail instead of
advertising successful HD audio. Answer validation rejects codec substitution;
telephone-event, RTT, video, CallKit and hold semantics remain unchanged.

The additional Swift cases cover all call profiles, SDP/XML roundtrips,
answer downgrade, incorrect clocks/payloads/channels/parameters and the
bounded outgoing preference. The native same-host WebRTC fixture additionally
requires all four G.722 profiles, DTMF negotiation, synthetic decoded VP8,
RTT edits/cleanup and an incoming G.722 offer with automatic codec selection.
Its microphone is disabled: it does not prove audible wideband quality, real
iPhone/iPad hardware behavior, APNs or actual native-to-Asterisk calls.

Unsigned validation is available with the existing `ios-native-preview.yml`
workflow in `focused-media` mode. It runs the focused Swift/T.140 checks,
generic iOS Release SDK compilation and the native media loopback. Neither
this mode nor the source change signs an app, uploads to TestFlight, enables
APNs or changes the live server. Source `8acf67c` passed
[unsigned run 43699929606](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43699929606)
in both matrix jobs: 89 selected Swift tests, all five shared T.140 checks
including the compiled Swift runtime, generic iOS Release SDK compilation,
the four existing and four G.722 native media profiles, automatic incoming
G.722 selection and the existing three-party interpreter fixture. Evidence is
retained in `artifacts/native-g722-43699929606/` (not committed).

The matrix labels are not physical iPhone/iPad or simulator/UI evidence. The
media runtime executes same-host macOS WebRTC peers with microphones disabled;
real native-to-Asterisk audio, audible wideband quality, camera, APNs and device
tests remain open. TestFlight replacement remains a separate release step.

## Native CallKit/Jingle hold follow-up (2026-11-15)

The native target now handles `CXSetHeldCallAction` through the current connected
call, native Jingle `session-info` hold/unhold and an acknowledged response.
The app control requests a CallKit transaction too; it does not change an icon
while bypassing CallKit. Pending/rejected operations are not reported as held,
concurrent changes are refused and late results cannot revive an ended/new call.
Remote hold and local hold are independent. Unsupported peers reject the request
without inventing successful SIP support; uncertain signaling ends the session.

The driver gates microphone/camera and DTMF while held or awaiting confirmation,
preserves the previous mute/camera choice and buffers bounded RTT edits for
resume. Receiving RTT remains possible. The shared T.140 channel retains its
call identity and rejects post-close flushes. Native iPhone/iPad controls use
symbols, accessibility labels and a visible pending/held status.

The local experimental gateway translates authenticated full-JID/session-bound
hold requests into SIP re-INVITE and replies only after validated SIP completion.
It does not expose the test HTTP bearer token or SIP credentials to the app.
DNS-SRV and SIP INFO remain gateway-side responsibilities; native DTMF remains
negotiated WebRTC RTP events. There is no separate iOS SIP registrar or arbitrary
number routing in this change. The existing route remains local echo 600.

Source `3ed6213` passed [unsigned run 43694425253](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43694425253):
85 selected Swift tests, all five shared T.140 checks including the compiled
Swift executable, and generic iOS Release SDK compilation passed in each of the
two matrix jobs. The job labels are not simulator/device evidence; no UI,
physical-device, camera/audio, CallKit OS behavior or actual native-to-Asterisk
media tests ran. Evidence is retained locally in
`artifacts/native-hold-43694425253/` (not committed).

Separately, 53 local gateway tests passed, including ACK-committed incoming
SIP hold notifications and session-bound Jingle hold control. The disposable
real ejabberd/Asterisk H.264/INFO fixture passed native-shaped XMPP hold/unhold,
duplicate suppression, paused RTP, preserved Unicode RTT, DNS discovery,
incoming INFO and teardown. This executes a browser/test peer, not the Swift app.
All temporary services/accounts/volumes were removed; existing servers stayed
unchanged and gateway/Docker sources remain local and outside the native commit.

Two pre-existing broad source-text assertions still fail locally (the old
`ChatBackground` marker and the pre-H.264 `startCall` signature); they were not
changed to disguise those unrelated failures. The hold-aware DTMF source guards
and focused update tests pass. No signed build, TestFlight
upload, live gateway deployment, APNs activation or public provider call is
included in this validation step. A gateway/browser pass is not an iPhone pass.
The current installed TestFlight app is not silently replaced by this native
target. Hold signaling follows the bounded informational messages in
[XEP-0167](https://xmpp.org/extensions/xep-0167.html#info-hold); this does not claim
full Jingle/SIP or Total Conversation conformity.

Status: isolated native implementation; not yet shipped over the working TestFlight app.
Requested scope: the complete iPhone and iPad application, including native UI,
authentication, messaging and Total Conversation. This is a staged rewrite, not a
claim that those features already work in this target.

Release direction confirmed on 2026-11-14: replace the existing TestFlight app,
not create a second public/test application. The unsigned preview deliberately
continues to use `com.tiedragon.teletyptel.nativepreview` until the release gates
below are met. Its successful compilation does not authorize changing the live
push topic or prove that existing users can migrate safely.

Before switching the signed target to `com.tiedragon.teletyptel`:
- Retain the existing App Store Connect record and signing team, and assign a
  new monotonically increasing build number. Do not reuse preview version `0.1`.
- Review the native dependency inventory and encryption/export declarations
  before signing. CryptoKit/WebRTC use encryption; do not describe this target
  as having none or copy the wrapper's answers without review.
- Validate the existing Google/Facebook configuration against that exact bundle
  identifier, its URL callbacks and the server's accepted client identities.
- Wire push registration, revocation and authoritative call recovery to the
  signed identity. Verify APNs environment/topic and provisioned capabilities;
  never enable a flag just because a key exists on a developer's computer.
- Decide and test migration of existing saved sign-in/history before updating
  the installed wrapper. This native encrypted cache does not migrate WebView
  storage, and lack of migrated history must not look like server deletion.
- Test real-device start/sign-in, direct and room chat, local gateway media,
  locked-screen incoming calls, logout/revocation and upgrade/recovery. Preserve
  the last working build for rollback and document what rollback cannot restore.

The existing signed/TestFlight workflow still builds the working wrapper. This
step did not silently redirect it to the incomplete native target.

## Remaining web-workflow implementation (2026-11-15)

### Subsequent bounded H.264 negotiation (2026-11-15)

Native SDP/Jingle mapping now preserves one selected VP8 or H.264 primary codec.
The optional H.264 profile requires `profile-level-id=42e01f`,
`packetization-mode=1` and `level-asymmetry-allowed=1`; missing, duplicate or
different parameters fail closed. An answer cannot silently switch codecs.
Incoming calls select the validated offered codec before acquiring a peer;
outgoing calls expose `videoCodec: "H264"` on the controller/negotiator API.
Existing UI calls still use the VP8 default. This is not automatic multi-codec
negotiation, a new settings switch, transcoding, H.263 support or evidence that
an installed iPhone has completed an H.264 call. No TestFlight update or live
PBX configuration is included.

Source `5ff8b51` passed [unsigned run 43689455595](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43689455595):
33 selected Swift tests (including both H.264 rejection/roundtrip tests) and
generic iOS Release compilation passed in both matrix jobs. This did not run
simulator/UI/media tests or upload a signed app. Separately, local browser tests
decoded H.264 video and PCMU audio through disposable ejabberd/Asterisk with
T.140/RED and verified DTMF receipt; the existing VP8 fixture also passed.
Those web/gateway/isolated-PBX fixture edits remain local, separate from the
published native changes. They do not prove native H.264 media on an iPhone,
H.263, SIP INFO, DNS-SRV, re-INVITE or KPN/Tolkcontact interoperability.

Following the UI comparison, four missing workflows have now been implemented:
- New contact uses an actual bounded, cancellable roster-set request. It waits
  for the authenticated server's matching IQ result; it does not invent a local
  contact or online presence. An outgoing presence request is optional and off
  by default. Incoming status requests require explicit Allow/Reject in the
  contacts pane; there is no silent mutual authorization. Timeouts are uncertain
  outcomes and are not automatically retried. New-contact actions require a
  loaded roster below its existing 100-contact limit and do not rename an
  existing contact. The protocol reference is
  [RFC 6121 sections 2.3 and 3](https://www.rfc-editor.org/rfc/rfc6121.html).
- Appearance offers system/light/dark and all six web background choices using
  bundled assets, with a preview. These non-secret device preferences do not
  change the account language, privacy/translation consent or call media.
- History and Archive have separate searchable panels. They reuse the loaded
  roster, session messages and existing cloud catalog/read flows. Archive hides
  conversations and can restore them without deleting messages, leaving rooms
  or blocking contacts. Flags are local, scoped by hashed server/domain/account
  history identity, bounded to 512 entries, and are not cloud-synchronized.
  Summaries show dates/previews only when messages have actually been loaded;
  the current catalog does not provide complete cross-device recency metadata.
- The profile-photo editor uses Apple's single-photo picker, bounded input and
  a thumbnail, movable/zoomable square crop with accessible arrow buttons, and
  explicit Save/Remove. It exports a fresh 256-pixel JPEG without the source
  metadata, rather than uploading the original. `api/native-avatar.php` uses
  the authenticated account, the existing native CSRF mechanism, strict raster
  MIME/size/dimension validation and an avatar-only field whitelist. Passwords,
  other profile fields and other users are not writable through this route.
  Deploy this endpoint and `NativeAvatarService.php` with the native build;
  the installed old server cannot supply the new editor merely through an app
  update. Existing schema, infrastructure and live user records are untouched.

Validation is deliberately focused because this step adds real contact and
avatar logic: isolated PHP avatar/denial tests, selected Swift logic/HTTP-fixture
cases and unsigned Apple SDK compilation. The optional `focused-update` dispatch
mode does not run simulator/UI/media suites; normal push/full validation retains
the existing full matrix.

Recorded evidence for source `95cde60`:
- [GitHub run 43687673506](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43687673506)
  completed successfully after retrying a runner DNS failure fetching WebRTC.
  Both matrix jobs passed the same 13 selected Swift tests with zero failures
  and completed unsigned Release compilation against the generic iOS SDK.
  Despite their iPhone/iPad job names, these are not device or simulator runs;
  both reports contain `uiTests: []` and `uploaded: false`.
- Local isolated PHP checks passed: 23 avatar-service cases and four endpoint
  denial guards, without live profiles or a production database connection.
  The two focused-runner/source checks also passed.
- The earlier attempts exposed two UI compilation errors (group-sheet dismissal
  binding and picker error-state shadowing); both were fixed before this source
  revision. Those failed attempts are not counted as successful validation.

No signed build, TestFlight upload, APNs activation, public SIP or live account
test is included. Complete UI localization, independently verified photo/camera
permissions, installed-device visuals and remaining call/group differences are
not claimed complete by this implementation.

## Earlier web UI comparison, presentation-only follow-up (2026-11-15)

Scope agreed with the owner: compare the website and apps, change presentation
where an existing action already exists, and do not rerun full functional or
simulator suites for cosmetic changes. Backend/protocol behavior is outside this
pass. The earlier successful build below predates these UI changes and must not
be quoted as validation of their rendered layout.

This earlier source inventory is superseded where the implementation above
adds the missing workflows. The reference was local `php/public/chat.html` and its styles/menu
definitions, not a newly invented interface. Windows uses the existing WebView2
web client; the Android shell points to the configured web server. That shared
source is not proof that their installed bundles, viewport or native permissions
match. The separate SwiftUI target has the following source-level differences:

| Screen or element | Presentation aligned in this pass | Still different / not verified |
| --- | --- | --- |
| Empty conversation pane | Same logo, choose-conversation title and explanatory text as the web tablet placeholder; adaptive world background retained | Newly rendered phone/tablet sizes and Dynamic Type not inspected in this pass |
| Main menu and tablet header | Symbol-labelled communication/settings sections, consistent number-call wording, visible number/settings shortcuts on regular-width layouts | Web View/theme/background selection, do-not-disturb and separate History/Archive panels do not have equivalent native controls |
| Contacts and groups | Existing search, selection, plus button and avatar style retained | Native plus menu still lacks a working New contact workflow; contact/group ordering and recent previews are not fully equal |
| Forward picker | Reuses the already-loaded roster avatar for the exact JID instead of always drawing fallback initials | No new profile requests or avatar-format support; uncached profiles still show initials |
| Group chat header | Avatar/title/subtitle layout and the same framed symbol-button style; leave remains destructive/red | No invented group-photo source or unimplemented call buttons |
| Own group-message avatar | Reuses the current owner's already-loaded image at message-avatar size, including groups opened through online history | Other members retain initials: a nickname is not proof of their real JID and must not select somebody else's private photo |
| Message translation action | Group translation moved to the message menu, matching direct chat/web; no repeated manual button underneath each bubble | Existing translation eligibility, consent, result display and automatic actions are unchanged |
| Dialog navigation | Translation settings now has the same labelled 44-point close symbol as the other native sheets | System sheets, contact pickers and context menus intentionally remain native rather than pixel-identical browser controls |
| Message actions and composer | Existing reply/copy/forward/delete, attachment/emoji and TC/audio/video entry points compared; callbacks and permissions retained | Native correction/retraction eligibility and group attachment/call controls are not all equivalent to the web workflows |
| Account and interface language | Existing account/privacy/translation entries retained | Photo editing/upload UI and complete UI localization remain missing; profile language does not translate the native interface |

Review method: source/markup comparison, changed-view call-site review and a
syntax-only parse of the edited Swift views. No new simulator/device screenshots,
functional tests, server requests, signed builds or TestFlight upload are part
of this pass. Reusing the in-memory avatar cache adds no new backend lookups.
Full visual/web parity is therefore still open; missing workflows are listed
instead of being represented by enabled-looking placeholder buttons.

## Native interpreter participants and avatar corrections (2026-11-15)

The native caller and partner now have a consent-first interpreter workflow,
using the existing authenticated `api/interpreter.php` service. The original
Jingle conversation stays connected; separate WebRTC legs connect each customer
to the authorized interpreter. The interpreter uses the existing web staff
workplace, not a new native staff queue. Each participant must join explicitly
before media starts. The side connection shares only existing microphone/camera
tracks; a muted microphone or disabled camera is not silently enabled.

The interpreter's compatibility data channel uses bounded `teletyptel-rtt` JSON
snapshots, matching the existing web interpreter. This is separate from the main
call's negotiated T.140/XEP-0517 transport and is not a claim that JSON snapshots
implement that standard. Leaving, logout, background entry or the main call
ending closes the interpreter legs and clears their text. Ordinary chat and
the primary call are not forwarded as a transcript. This interpreter stage is
foreground-only; APNs/background interpreter recovery and external Tolkcontact
are not enabled.

Avatar initials now follow the web name/JID separators, own-message fallbacks
use the signed-in identity rather than `Ik`, and explicit owner refresh cancels
stale in-flight loads. PNG/JPEG validation and authenticated-origin restrictions
remain unchanged. This does not add every web avatar format or editor feature.

Validation at source revision `b6c8ab5`:
- [Unsigned Apple SDK run 43679172188](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43679172188)
  passed both iPhone 16 Pro and iPad Pro 11-inch M4 families. Each passed 343
  Swift cases, with 20 explicitly opt-in integrations skipped (363 total),
  unsigned Release compilation and Release test-fixture exclusion.
- Each family passed all 17 UI cases, without skips/failures, plus its separate
  one-case cloud-history preflight. The TC case now checks the interpreter
  entry, disabled unavailable-service action and closing the sheet before
  portrait/landscape/portrait checks. Selected TC/consent screenshots were
  inspected; this fixture does not simulate a connected real interpreter.
- All four primary media profiles and the new three-party media fixture passed.
  The latter uses shared synthetic VP8 tracks on three same-host participants,
  both offerer roles, decoded frames and bounded live text in both directions.
  Removing the interpreter clears its media/text while primary Jingle/RTT
  remains connected and carries new text. Microphone capture is disabled;
  this is not audible audio, physical cameras, TURN or public-network evidence.
- Local selected Node checks passed 130 cases with four platform skips. Five
  isolated Swift interpreter cases passed, plus a separate compatibility check
  decoding actual in-memory SQLite `InterpreterService` waiting/ready/active/
  ended output without rewriting its shapes. The existing PHP interpreter
  smoke suite passed 49 checks, without live accounts or provider calls.
- Initial run `43678289339` exposed a private shared video-view visibility
  error; it is not a successful app build. Runs `43678718956` and `43679141702`
  were cancelled after follow-ups superseded them, not counted as passing runs.

Live PHP/staff media interoperability, physical audio/camera, TURN and device
permission/rotation/leave/rejoin tests remain required before release. No signed
build, TestFlight upload, APNs activation or live server change was included.

## Remaining call work: negotiated DTMF and push registration (2026-11-14)

The native RTP audio profile now optionally negotiates `telephone-event/8000`
alongside mandatory PCMU. The answer can decline the optional event codec or
narrow its event range, but cannot invent a payload or widen the offer. The
connected-call keypad and CallKit single-tone actions use the native WebRTC
DTMF sender only when the audio session is active and the sender reports actual
negotiated capability. They do not generate chat, RTT characters or SIP INFO.
Each input is a single telephone key, with a bounded 16-tone queue; pending tones
are cleared when audio deactivates, transport disconnects or the call ends.
The symbols retain accessibility names; an unsupported peer leaves the keypad
disabled. Phone-number letter selection remains a separate pre-call feature.

This is **not full native SIP calling**. The existing isolated route remains
restricted to the private/loopback lab gateway and echo extension 600. The local
gateway follow-up now maps optional RFC 4733 events between negotiated WebRTC
and SIP payloads without turning them into chat/RTT text. A disposable real
ejabberd/Asterisk/Chromium fixture confirmed Asterisk receipt of all 0–9, `*`, `#`
exactly once, plus decoded PCMU/VP8, returned T.140 edits, hangup/disconnect and
resource cleanup. It also relays valid return event packets over DTLS; browser
API acceptance or packet counters alone do not prove application-level delivery
on an independent remote client. The local gateway/Docker work is not part of
the signed app or this narrow native-source publication. There are no public
numbers, providers, 112 or Tolkcontact connections enabled by these checks.

`NativePushRegistryClient` implements the existing authenticated `call-push.php`
contract with explicit consent, its own fresh CSRF challenge, account/device/
generation/expiry validation, a 16 KiB response limit, confirmed revocation and
redacted registration descriptions. The optional control credential remains
opaque and must never be treated as an answer or full-session credential.
The native account screen now includes a consent-first registration lifecycle:
registration and revocation are serialized, late replies are generation-bound,
offline revocation survives relaunch, other accounts cannot inherit a pending
registration, and renewal is deferred during calls/background entry. Only the
installation metadata and opaque limited control credential go into a separate
device-only Keychain record; no APNs token, chat password or Face ID credential
is copied there. A separate non-secret boolean disables automatic restoration
before Keychain mutations, including failed opt-out writes. Turning off push
registration does not reset the active foreground conversation.
Lease renewal uses only the in-memory device token, within an hour of expiry,
while foregrounded and outside a call. A foreground timer checks every ten
minutes and is cancelled on background entry or logout; it is not a background
keepalive. Pending revocation is retried before ordinary foreground calling is
reconnected for the same account.
Local logout immediately disables registration and persists a pending revoke;
it is not a claim of confirmed remote deletion. An offline/closed-session revoke
needs a fresh authenticated same-account session or server-side lease expiry
(currently up to 24 hours). A production release must also close this residual
server-registration window rather than treating the local latch as an APNs-side
revocation guarantee.

This still is **not an activated background-call integration**. The shipping
preview flag remains off. Even an enabled build requires an authenticated
`capabilities.backgroundAnswerRecovery: true` registry response before showing
the opt-in action; the existing endpoint does not provide this capability. Do
not add that field merely to expose the button: the server needs an actual
authoritative wake/answer/signaling-recovery adapter, not its current status/end
credential. Cold-start runtime, signed identity/capabilities, deployed policy/
worker and real locked-screen APNs delivery/answering remain release gates.

Native number selection now offers an explicit consent prompt before Apple's
single-phone-property picker. It returns only the chosen number, does not read
or upload the address book, and never starts a call automatically. The local
echo-only routing restriction is unchanged. Real contact-picker permission and
cancellation behavior remain part of device acceptance, not a simulator fixture
claim. Six new lifecycle cases passed an isolated Linux compatibility harness;
the updated unsigned Apple SDK matrix is recorded after completion below.

For device acceptance, use two authorized test accounts and record app build,
iOS version, Wi-Fi/mobile connection, orientation and observed result:
- Incoming TC while foregrounded, backgrounded and locked; answer, reject,
  caller cancellation, expiry, duplicate/late push and an unavailable server.
- Audio activation and interruption, mute, camera permission/off/switch,
  portrait/landscape, RTT edits in both directions, reconnect and remote hangup.
- Explicit consent off/on, token rotation, logout, account switch, failed revoke
  and relaunch; no former account's calls or credentials may be reused.
- DTMF only after capability negotiation, with confirmed remote lab receipt;
  without support, taps must not send anything or become chat/RTT text.
- Compare direct/group chat, attachments, menus, account settings, translations,
  history and accessibility against the web client on iPhone and iPad. Existing
  simulator cases do not establish complete web parity or physical-device behavior.

Validation of the current native changes at source revision `ca45425`:
- [Unsigned Apple SDK run 43650266496](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43650266496)
  passed both simulator families. Each job passed 336 Swift tests with 20
  explicitly opt-in integration cases skipped (356 total), unsigned Release
  compilation and Release test-fixture exclusion. All six new push-lifecycle
  cases and the explicit registry-versus-answer-recovery capability case passed.
- Each iPhone 16 Pro and iPad Pro 11-inch M4 passed all 17 UI cases, without
  skips or failures, plus its separate one-case online-history preflight.
  The account-settings case confirms that the disabled preview exposes status
  but no push opt-in action. Rotation/keypad and account screenshots were also
  inspected; unsupported DTMF remains disabled rather than simulating input.
- All four native media profiles passed on same-host peers: ICE/DTLS, audio
  negotiation with capture disabled, synthetic VP8 decoding and bidirectional
  T.140. This is not physical camera/audio, SIP receipt, APNs delivery or a
  locked-screen answering test.
- Locally, 137 Node cases passed with four platform skips; the Linux lifecycle
  compatibility harness passed six cases. The sixteen local gateway checks,
  including real ICE/DTLS event remapping with a fixture SIP answer, passed.
  The disposable real browser/ejabberd/Asterisk all-twelve-key fixture passed
  twice and cleaned up its resources. Existing PHP registry/control/media
  checks passed 180 assertions plus ten endpoint guards without sending APNs.
- Superseded run `43649883689` at `1b27fb8` was deliberately cancelled after
  publishing the renewal follow-up; it is not a completed UI validation.

No signed build, TestFlight upload, APNs activation or live server configuration
change is included in this validation. The remaining call/parity gates below
are still open; a green unsigned run does not close them.

Earlier validation at source revision `dc2d5fb`:
- [Unsigned Apple SDK run 43625619117](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43625619117)
  passed both families: 329 Swift tests passed, with 20 opt-in integration tests
  explicitly skipped. Each iPhone 16 Pro / iPad Pro 11-inch M4 simulator on iOS
  18.5 passed all 17 UI cases, plus the separate online-history preflight. No UI
  cases were skipped. The extra keypad case checks portrait/landscape/portrait,
  reachable `* 0 #`, disabled unsupported input, no keyboard and explicit close.
- Unsigned Release compilation and test-fixture exclusion passed. All four
  same-host native media profiles passed, including actual WebRTC DTMF enqueue
  acceptance and clearing on both peers. Audio capture remains disabled in this
  fixture; this is not audible audio, received SIP events or real camera evidence.
- [Disposable ejabberd run 43624344494](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43624344494)
  at `d262d02` passed all 20 isolated transport/account-contract/Jingle/archive/
  group/invitation cases. That Jingle transport/media source is unchanged by the
  later app UI and registry-bound refinements. This does not test real PHP login,
  a configured APNs worker or an Asterisk/provider leg.
- Locally, 135 Node tests passed and four platform-dependent cases were skipped.
  Existing isolated PHP registry/control/reconciliation/media suites passed
  180 checks, plus ten disabled/insecure/method/token endpoint guards. No Apple
  notification, live database or user account was used. The six native registry
  tests use URLProtocol fixtures, not a live PHP/APNs service.

The earlier `d262d02` run 43624331730 passed iPad but its full iPhone UI suite
timed out waiting for animation-idle notifications during the existing chat
draft scenario. It did not finish the iPhone suite; its passing preflight is not
a substitute. The later green run does not establish the cause or a permanent
fix for that intermittent stall. The full 20-minute UI deadline and assertions
were not weakened, filtered or retried. Intermediate runs 43624827175 and
43625355121 were cancelled after newer source revisions superseded them; they
are not counted as successful full runs. Selected evidence is retained locally
under `artifacts/native-selected-evidence-43625619117-iPhone/` and `-iPad/`.

A Linux compatibility attempt compiled the new core sources but could not
validate the existing Darwin SDP fixtures (CRLF splitting differs); it is not a
native pass. The production signed workflow, server configuration and APNs keys
are unchanged. There is no TestFlight upload or physical-device result here.

### Current parity and release gates

This is a source/test inventory, not a declaration that the native app is already
equivalent to the web client. Historical results later in this document retain
their original scope; they are not proof of features added after those runs.

| Area | Native basis present | Still required before calling it complete |
| --- | --- | --- |
| Account/password, Google/Facebook, opt-in biometrics | Native screens, SDK adapters and authenticated XMPP chain | Signed production-bundle provider callbacks, real-device account recovery and upgrade/migration tests |
| Direct and MUC chat | Contacts/presence, drafts, message actions, reactions, receipts, archive and group management | Two-device web/native matrix, room policy differences, reconnect/offline and retained-history scenarios |
| Files/photos and profiles | Native pickers, bounded authenticated upload, profile/settings API | Real PHP deployment contract plus camera/library permission, cancellation and file interoperability checks |
| Appearance | Web-style avatars, bubbles, symbol menus, adaptive layout and TC panes | Side-by-side iPhone/iPad comparison, accessibility/Dynamic Type, keyboard and rotation tests; not pixel-identity proof |
| Translation | Private opt-in message/live-RTT translation model and captions | Own/remote/device tests, source=target suppression, opt-out and failure recovery with the deployed provider |
| Interface languages | Dutch native UI and profile-language selection | Full UI localization; the profile language currently does not translate the native interface |
| TC audio/video/RTT | Native Jingle/WebRTC and four media profiles | Physical camera/audio/routing, independent-network/TURN and interruption/long-call tests |
| Telephone/SIP/DTMF | Private echo route, negotiated native RTP events, local gateway relay and confirmed browser-to-Asterisk DTMF receipt | Native-device-to-Asterisk receipt, independent endpoints and authorized routing/provider integration; no emergency-service readiness claim |
| Background incoming calls | CallKit/PushKit engine, consent UI, Keychain registration/revocation lifecycle and bounded registry client | Cold-start/authoritative call recovery, deployed backend/worker, provisioning and signed locked-screen APNs tests |
| Interpreter and three-party calling | Consent-bound native customer legs to the existing web staff interpreter; three-party same-host media validated, primary call retained | Live PHP/staff interoperability, physical media/TURN and leave/rejoin tests; foreground only, no external Tolkcontact |
| iOS address book | Explicit app consent plus Apple's single-phone-property picker; no broad `CNContactStore` request or upload | Real-device selection/cancel and accessibility checks; importing a number does not enable public calling |

The preview must not show enabled-looking shortcuts for missing workflows or
reuse successful simulator checks as proof of public SIP, interpreter service,
APNs delivery or emergency access. The signed release gate remains closed.

## Shared online chat history (2026-11-14)

The native target now uses the same `message_history` database as the web client:
web uses `api/history.php`, while native uses the authenticated, bounded adapter
`api/native-history.php`. This is storage on the configured TeleTypTel server,
not iCloud, Google Drive or an end-to-end-encrypted cloud vault. The encrypted
device store below is only a recent cache; clearing it does not delete online
messages. This step does not upload camera/audio recordings, private machine
translations, drafts or TC transcripts.

After a confirmed XMPP bind and roster readiness, native discovers up to 32
recent online conversations for the exact active account. Historical contacts
outside the roster are explicitly read-only; importing a conversation never
authorizes sending, adds a contact, or grants MUC membership. Historical groups
start with no live membership snapshot or permissions. The bounded room cache
can replace an inactive, unprotected, draft-free entry when another online group
is explicitly opened, but never silently leaves a live room or drops protected
local state. Online group history is also accessible from the group overview.

Direct and group views fetch 50 records per page with account/peer/kind-bound
timestamp/row-ID cursors. Older-page browsing preserves the message anchor and
can shift the bounded 200-message cache window; returning to recent history
does not require retaining every old message locally. XMPP MAM remains available
as a fallback and for verified protocol identity enrichment. HTTP record IDs
alone never become trusted stanza IDs or occupant IDs, enable group actions,
or send delivery/read receipts. Unknown or archived authors are not converted
into real-user identities.

Existing own web records may have an empty `from` field. Native accepts that
only for an authenticated account's own messages, preserves the raw immutable
identity for conditional updates, and uses the own display identity without
inventing protocol authority. Both the web `read` and legacy `displayed`
delivery-status representations mean the same terminal delivery level.

Only accepted live messages and explicit accepted mutations enqueue online
writes. Restoring the device cache, reading SQL/MAM history, editing drafts,
hiding a local item and clearing the cache never backfill or erase the server.
Updates use the current record version and an atomic compare-and-swap, preserve
opaque attachment/location/call metadata, keep retractions terminal, and never
downgrade delivery state. A conflicting, interrupted or unconfirmed write is
reported rather than blindly retried. Requests and late replies are scoped to
the active account/generation and cancelled on background entry/logout.
An edit or reaction without a known online version is refused rather than
turned into an unintended insertion of an old cached message. Reading on open
or explicit refresh is not a continuous cross-device SQL push subscription.
The legacy web endpoint still has its existing upsert behavior; native CAS does
not prevent a later independent legacy-web write from changing the same row.
Native writes only the active account's SQL history, not another recipient's
account or an alias account. Offline incoming delivery also relies on ejabberd
MAM being enabled with suitable retention; the fresh known-contact view reads
that archive as well. Interrupted, opted-out or unconfirmed SQL saves are not
silently repaired by uploading an old device cache. This is not an assertion
that every historical message already exists in SQL or is retained forever.

The native account page separates new online writes from encrypted local-cache
storage. Disabling native online writes cancels queued uploads but permits
reading existing history; it cannot undo a request already committed by the
server. Existing browser-local `saveChat` preferences are not an account-wide
setting and are not silently treated as synchronized. The API additionally
honors `account_profiles.save_chat_history` when that existing column is present;
otherwise its default matches the web client's default. MAM retention is still
a server policy, not changed by either cache clearing or the native toggle.

Deployment and acceptance boundaries:
- Deploy the new adapter/service alongside the existing history endpoint before
  enabling it in a signed device release. Normal web response semantics remain
  unchanged; no schema migration, live database changes or deployment is run by
  this implementation task. Exact active-account reads intentionally do not
  inherit the old endpoint's broader alias discovery.
- Writes require transactional storage and the existing unique
  `(account_id,message_id)` identity constraint. Do not replace it with a
  non-transactional table or infer that SQLite proves MySQL concurrency.
- Native requests use the authenticated same-origin session, redirect rejection,
  bounded responses and CSRF-protected writes. Reverse proxies must normalize
  the public HTTPS origin through trusted server configuration; untrusted
  forwarded headers are not accepted as proof. Direct TLS is supported.
- Normal web writes use UTC ISO timestamps. Legacy rows which discarded a
  different timezone's offset cannot be reliably repaired from their stored
  wall clock alone; this code does not mass-rewrite their timestamps.
- Native text remains bounded to 8 KiB, encoded records/requests to 32 KiB and
  responses to 1 MiB. Unsupported oversized legacy content fails visibly rather
  than being truncated or silently rewritten. Call-history/transcript migration,
  unlimited conversation-index browsing, retention/deletion administration,
  signed device upgrade and hardware acceptance remain separate work.

Online-history validation record:
- Local Node guards: 133 passed, 4 platform-specific skips, zero failures (137
  total), including the isolated PHP unit/HTTP fixtures. PHP 8.4 confirms session,
  CSRF, origin, account/peer/cursor scoping, metadata preservation, CAS conflicts,
  terminal retractions, web `read` compatibility and unique-index enforcement.
  SQLite fixtures are not evidence of a live MySQL concurrency/load test.
- The Linux compatibility harness passes 103 merge/sync/archive/interaction
  tests, but uses test shims and is not substituted for genuine Apple SDK tests.
- Genuine macOS unit/Release/media evidence at `f5a1dc3`: 317 Swift tests passed,
  20 opt-in integration cases explicitly skipped in the unit job, zero unit
  failures; unsigned Release compilation, fixture exclusion and all four
  same-host native media profiles passed. The skipped integration cases are
  exercised separately, not silently counted as passes.
- [Isolated real ejabberd run 43606641353](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43606641353)
  passes all 20 transport/login/MAM/Jingle/group/invitation checks at `609131f`.
  Subsequent code changes only affect archive UI accessibility and the test
  harness, not the transport or cloud core. No production server was contacted.
- Earlier failed runs are retained as negative evidence: `43604675767` exposed
  an accidental group-model dependency in the standalone media compiler, fixed
  by keeping that helper in the MUC source. `43606640912` and `43609203497` exposed
  inherited archive-label accessibility IDs; the latter iPad full-suite attempt
  also exhausted the unchanged 20-minute UI deadline. `43611473622` then exposed
  the existing test helper's viewport assumption for full-width archive rows.
  These runs are not treated as successful acceptance tests.
- `43606381245` was cancelled in favor of the consolidated fixes.
  `43613768098` then exposed an inherited header status ID overriding the two
  paging controls; the ID now belongs to the status text only. In `43615080635`
  the iPhone passed the preflight and all 16 full-suite cases, while iPad hit
  the new preflight's cold-initialization deadline before any UI case started.
  The preflight now has a separate ten-minute initialization/execution budget;
  this did not raise the full-suite deadline or change its assertions.
- The cloud-history scenario now runs as an additional fail-fast preflight;
  success must still be followed by the full, unfiltered 16-case UI suite for
  each family, with the original 20-minute full-suite limit and assertions.
  No skipped cases, retries or smaller replacement suite are used to turn a
  failing full run green.
- [Unsigned native regression run 43617226936](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43617226936)
  is green at `f5a1dc3`: the iPhone 16 Pro and iPad Pro 11-inch (M4), both iOS 18.5,
  each pass the additional one-case cloud preflight and the full unfiltered
  16-case UI suite, with zero UI failures or skips. The cloud scenario opens a
  non-roster archive read-only, reads incoming web records plus a real-web-shaped
  own record with empty sender and `read` delivery, fetches an older page and
  rotates without enabling its composer or displaying the keyboard.
  Release compilation, fixture exclusion and all four native media profiles
  also pass for both matrix jobs. Reports remain `unsigned: true` and
  `uploaded: false`; this is not a signed-device or production acceptance test.
  Selected summaries/logs/screenshots are retained locally in
  `artifacts/native-selected-evidence-43617226936-iPhone/` and
  `artifacts/native-selected-evidence-43617226936-iPad/`; disposable ejabberd
  evidence is in `artifacts/native-cloud-ejabberd-final/`.
- Visual review then found dark text on the selected blue archive row. Its
  foreground now follows the same selection state and white selected text as
  the existing native roster. The [post-QA run 43620235754](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43620235754)
  is green at `b776a5d`: both families again pass 317 Swift unit tests, unsigned
  Release/fixture checks, all four media profiles, the one-case cloud preflight
  and all 16 full-suite UI cases, with zero UI failures/skips. The same 20 opt-in
  integration cases remain separately verified by the real-ejabberd run above.
  Portrait/landscape cloud-history screenshots were reviewed; the fixture's
  unavailable-translation banner is not a live Google service test. Current
  selected evidence is in `artifacts/native-selected-evidence-43620235754-iPhone/`
  and `artifacts/native-selected-evidence-43620235754-iPad/`. No signed app,
  TestFlight upload, server deployment or live APNs activation was performed.

## Reactions, acknowledgements, device history and local SIP (2026-11-14)

The native preview now has direct-chat and room reaction menus/chips using
[XEP-0444](https://xmpp.org/extensions/xep-0444.html). Each participant replaces
their complete emoji set; an empty set removes it. Room actions require advertised
stable room stanza IDs and occupant IDs, including the current occupant's ID.
They target the room-assigned ID, never a reusable nickname or client-supplied ID.
Unsupported rooms keep reactions disabled rather than guessing an identity.

Direct messages request [XEP-0184 delivery receipts](https://xmpp.org/extensions/xep-0184.html)
and [XEP-0333 displayed markers](https://xmpp.org/extensions/xep-0333.html).
Socket submission, delivery and display have distinct labels and one/two ticks;
only an authenticated matching peer/target can advance them. Blue ticks mean
the other client reported display, not that a human understood the message.
Sending displayed markers is **off by default**. After explicit opt-in it only
occurs for fully visible incoming markable messages in the foreground chat, not
under the app's settings/forward/edit/delete/TC presentations. Delivery sending
can also be disabled. Archive loading never sends delivery receipts; receipt
events do not create visible fallback messages or receipt loops. Group-wide
read counts and per-member read UI are not implemented.

Recent messages, reactions, drafts, hidden identities and chat privacy settings
are saved per HTTPS origin, XMPP domain and confirmed account. AES-256-GCM binds
the ciphertext to that scope; random keys stay in the non-synchronizing iOS
Keychain (`WhenUnlockedThisDeviceOnly`). Atomic files use complete file protection
and are excluded from backup. The history contains no account credentials, session cookies,
translation output or downloaded attachment bytes. Corrupt/locked/missing-key
files are not silently overwritten. Account content is loaded only after a
verified XMPP bind, and logout clears the displayed state without erasing the
device copy. Interrupted sends restore as uncertain and are **not** retransmitted.
The settings page offers opt-out and explicit local clearing, separate from
server deletion. Opt-out retains preferences but no cached message content.

This is a **bounded recent-history cache**, not a full archival database: 200
direct messages per account, 100 drafts, eight rooms with 200 messages each,
bounded retained mutation identities and a 16 MiB plaintext limit (ciphertext adds
the 28-byte AES-GCM nonce/tag overhead).
The existing MAM latest-page retrieval remains separate. Arbitrarily old local
pagination, a cold offline reader and migration from the wrapper's history
are not implemented. File/Keychain/lock behavior still requires hardware tests.

Active CallKit conversations no longer enter the ordinary idle-chat suspension
path when backgrounded. The native target declares only the `audio` background
mode; camera capture pauses on background entry and is serialized on return.
Actual CallKit audio activation remains required; no silent audio/timer is used
to keep idle chat alive. When the call ends in the background, ordinary bounded
send completion and suspension resume. This is **not yet complete background
incoming calling**: native preview APNs enrollment, authoritative call recovery,
locked-device process-launch/relaunch and a signed physical-device test remain
release gates. The live PushKit flag is still absent/disabled; no Apple key,
server registry or production policy was activated by this work. Camera video
must not be advertised as continuing while the ordinary app is backgrounded.
See [Apple's VoIP notification flow](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit).

The native number panel has standard phone letters (2=ABC; 1 has no ABC),
`* 0 #`, delete and visible hold-to-select letters. VoiceOver exposes the digit
and individual letter actions. Vanity letters normalize to numbers, never RTT
or DTMF text. A deliberately restricted local route calls the configured
gateway's existing **600 echo** with native Jingle/TC. It requires a local HTTPS
server, a same-domain full gateway JID and the gateway administrator's full-JID
allowlist. The number is not sent as an arbitrary SIP destination: the existing
lab gateway itself fixes extension 600. No provider, public number, emergency
route or interpreter service is enabled. The native audio SDP profile still
does **not negotiate telephone-event/DTMF**; a working number panel is not proof
of SIP DTMF, incoming SIP or production interconnection.

Validation so far:
- [43599313915](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43599313915)
  is **green** at `8518aee`: both mandatory macOS jobs pass unsigned device
  Release compilation and fixture exclusion, 250 Swift tests (20 opt-in real
  server tests skipped in this suite), and all fifteen UI tests per family.
  Structured iPhone 16 Pro and iPad Pro 11-inch (M4) summaries, both iOS 18.5,
  report zero failures and zero UI skips. Portrait/landscape scenarios cover
  rotation, chat drafts, menus, uploads, rooms, reactions and the local keypad.
  Each job also passes all four native media profiles (audio, video, audio-RTT,
  Total Conversation), using same-host peers and synthetic video, not real
  cameras, audible audio, APNs or public-network interoperability.
  Selected screenshots were inspected for raster avatars, bubbles, the standard
  keypad and reachable TC symbol controls/RTT panes across orientation changes.
  Downloaded evidence is in `artifacts/native-selected-evidence-43599313915-iPhone/`
  and `artifacts/native-selected-evidence-43599313915-iPad/`.
  This successful run validates the current unsigned regression suite; it does
  not prove every earlier simulator timeout's root cause is fixed or replace
  the physical-device/release gates above.
- [43589506150](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43589506150)
  passes twenty isolated real-ejabberd checks at `ca7035c`, including two-account
  reactions, delivery/display routing and MAM reaction restoration. No hardware
  or production server was used.
- [43590906518](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43590906518)
  passes the same twenty real-server checks at `0d09ba7`, now including stable-ID
  room reaction reflection with MAM explicitly enabled on the disposable room.
  The preceding room fixture failure is retained in run `43590223064`; no
  production room or verification guard was changed to make it pass.
- The local existing Docker gateway fixture passes decoded PCMU/VP8 plus
  reliable T.140 to SIP RTP/RED echo, Unicode edits, hangup and actual XMPP loss
  cleanup. Twelve gateway unit/security checks pass. This is **browser** lab
  evidence, not native iPhone-to-Asterisk or general provider interoperability.
- The separate two-leg local SIP fixture passes bidirectional PCMU, encoded VP8,
  T.140/RED and RFC 4733 digits `0–9`, `*`, `#`, with two distinct SIP dialogs and
  RTP ports. A negative test rejects a call whose other leg refuses text and
  verifies hangup/cleanup. That does not add DTMF negotiation to the native app.
  Live ejabberd/Asterisk containers remain running, unchanged; test containers,
  accounts, volumes and networks were removed. Local evidence is retained in
  `artifacts/native-task-sip-gateway.txt`, `native-task-sip-two-leg.txt` and
  `native-task-sip-reject-text.txt` (the latter two are also under `artifacts/`).
- Local Node checks pass 128 tests with four explicit macOS-only skips (132
  total); the macOS workflows execute the native checks rather than treating
  those skips as iOS compilation evidence.
- [43591804764](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43591804764)
  at `95e9931` passes 250 Swift tests (20 opt-in integration tests skipped),
  unsigned device Release compilation, fixture exclusion, all four native media
  profiles, and all 15 iPad UI tests. Its iPhone run times out after fourteen
  completed cases, during teardown of the fifteenth, so **the run is failed**.
  The earlier run `43590780871` instead has a startup-button assertion failure
  on iPad; neither failed run is counted as green. Their evidence is retained
  under `artifacts/native-selected-evidence-<run-id>/`.
  Subsequent source makes the decorative startup border non-hit-testable and
  explicitly gives filled startup buttons white labels. A passing rerun alone
  would not prove the root cause of the earlier missed startup tap.
  Run `43594430331` at `55c76d2` completes all fifteen iPhone UI tests and its
  iPad stdout reports all fifteen cases passed, but the combined iPad
  build/test command reaches its deadline before finalizing its result bundle.
  That run also remains **failed**, not an accepted complete iPad result.
  Revision `a2a0e1f` separately builds each simulator target before running its
  unchanged UI suite. The UI execution deadline stays twenty minutes, compilation
  has its own bounded command, assertions are unchanged, and there are no test
  filters/retries/fallback passes. Two Node tests verify this split and that
  either a build failure or test failure still propagates.
  Run `43595599672` confirms that compilation separation alone did not fix the
  repeated timeout: its iPad suite passes all fifteen tests, but iPhone stops
  during the fourteenth test. It remains failed. Revision `8518aee` additionally
  boots each simulator before the test execution deadline and runs the two
  families in separate macOS jobs. Both jobs remain mandatory, `fail-fast` is
  disabled to retain both results, all fifteen UI cases still run per family,
  and invalid family selections fail rather than silently narrowing coverage.
  This is runner isolation, not evidence that a runtime defect was fixed.
- The first room-reaction integration exposed that the disposable room had MAM
  disabled and therefore did not advertise stable stanza IDs. The test-room
  configuration now explicitly enables MAM; production feature guards remain
  strict. Current unsigned iPhone/iPad and isolated room checks pass, but that
  does not close the hardware, live APNs, native SIP or full-parity release gates.

| Requested area | Implemented in this step | Not yet accepted as complete |
| --- | --- | --- |
| SIP | Native restricted local echo route; real local browser gateway and two-leg SIP tests | Native-to-PBX hardware media, incoming SIP, native DTMF, provider routing/NAT/TURN |
| Background calls | Preserve actual active CallKit/media session; pause camera; suspend idle chat after call ends | APNs enrollment/recovery/server policy, cold launch, killed/locked device and network-change tests |
| Reactions | Direct and stable-identity MUC sets, menus/chips, replace/remove and archive restoration | Wider-client interoperability and adversarial timing/clock-skew tests |
| Read state | Exact-peer direct delivery/display distinction; explicit sending privacy settings | Per-member group read UI and physical two-device display/visibility tests |
| Device history | Scoped authenticated encryption, bounded messages/drafts, opt-out, explicit clear/repair | Full local archive pagination, wrapper migration, physical Keychain/locked storage checks |
| Web similarity | Shared artwork/palette, bubbles, avatars and symbol menus, native phone pad | Full feature/pixel parity, profile-photo editing, remaining contact workflows, native three-party interpreter media and independent usability/accessibility acceptance |

No TestFlight upload or replacement of the working wrapper was performed.

## Avatars, bubbles and message actions (2026-11-14)

The unsigned native preview now reads existing public profile avatars from the
authenticated, same-origin `api/account.php?lookupJid=...` route. Requests are
limited to the signed-in account and its roster (128 cached identities, four
concurrent requests); account changes/logout discard the cache and late replies.
Only bounded PNG/JPEG data URLs are decoded, with a raster signature check,
16-megapixel decode ceiling and 192-pixel thumbnails. Remote image URLs and SVG
are never loaded. Missing/invalid avatars fall back to coloured initials.
Anonymous room nicknames stay anonymous: they are not resolved to real accounts.
This is avatar **display**, not profile-photo upload/editing.

Chat and room bubbles use natural-width content, continuous tails without an
internal seam, light shadows and the existing web artwork/colour palette. A
44-point ellipsis and long-press menu expose actual actions, not decorative icons:

| Action | Direct chat | Room chat |
| --- | --- | --- |
| Reply | Plain quoted original in the draft | Quoted nickname/original in the draft |
| Copy | Original, never the private translation | Same |
| Forward | Explicit known-contact selection and confirmation, new direct message; preserves drafts | Same, from the selected room message |
| Edit | Last own submitted text, correction request | Not offered in this step |
| Delete for me | Hides and clears the item, preserving its identity against archive replay | Same in that room |
| Retract for everyone | Explicit request for own submitted messages | Only when the room advertises retraction and stable occupant IDs, and the own echo supplies room-owned stanza/occupant IDs |

With device history enabled, local hidden identities now survive restart within
the bounded cache described above; disabling it makes hiding session-local.
This is not an account deletion. Forwarding attachment links does not revoke their existing
access. Quoted replies are plain text, not a claim of XEP-0461 reply support.
Edits use [XEP-0308](https://xmpp.org/extensions/xep-0308.html); requests use the
current [XEP-0424 namespace `urn:xmpp:message-retract:1`](https://xmpp.org/extensions/xep-0424.html),
with generic fallback text and a storage hint. Capabilities are advertised through
disco and [XEP-0115](https://xmpp.org/extensions/xep-0115.html). Retractions are
**unenforceable requests**: other clients, screenshots, copies and archives may
retain the original. A successful socket write is not acknowledgement by others;
the UI says so, handles rejection/disconnect and never silently retries a change.
Private incoming changes match bare sender, direction and message identity.
Room changes additionally match [XEP-0421 occupant identity](https://xmpp.org/extensions/xep-0421.html)
and the room's [XEP-0359 stanza ID](https://xmpp.org/extensions/xep-0359.html), not
just a reusable nickname or sender-supplied client ID. Servers without these
features keep the group-wide action disabled. Other legacy retraction namespaces,
moderator deletion and automatic enforcement of advertised server time limits
are not implemented here; a server may refuse a request.

MAM retrieval treats corrections/retractions as author-scoped events rather than
displaying their fallback bodies. Authenticated archive tombstones suppress old
text. Bounded retained identities/events keep hidden/retracted items from being
resurrected by a subsequently loaded older page in the same session. This does
not promise that an unloaded page, an unaware server or a fresh session has all
the information required to apply every historical request. Changed/deleted
text cannot keep a stale private translation displayed underneath it.

[Isolated ejabberd run 43580949741](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43580949741)
passes at `4750b2d`: nineteen opt-in integration tests execute without skips,
including actual two-account correction/retraction delivery and MAM restoration,
private-room membership and invitations, authenticated WSS, Jingle signalling and
the fictional HTTP login contract. The disposable server is ejabberd 26.09 on a
GitHub-hosted macOS runner. Cleanup, session release and test-CA removal/revocation
checks pass; neither the local WAMP server nor production accounts are contacted.

The transport test exposed a real archive edge case: retracting only a correction
ID can leave the original archived stanza. Native retraction now targets the
original message identity, and sparse MAM pages can restore a corrected item even
when the original is absent, then apply its author-matched retraction. Unit tests
also cover older-page replay, forged/ambiguous payloads, edit limits, interrupted
or rejected requests, stale private translations and stable room authorship.
This is not a guarantee of server-side data erasure or cross-vendor compatibility.

[Unsigned preview 43583743962](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43583743962)
passes at `9e7f8bb`: 226 Swift tests pass, with nineteen opt-in integration tests
explicitly skipped in that non-server job. Unsigned Release device compilation,
Debug-fixture exclusion and all 26 simulator UI checks pass (thirteen each on
iPhone 16 Pro and iPad Pro 11-inch M4, iOS 18.5). The new scenario verifies an
actual long-press copy menu, explicit text editing, confirmed forwarding, local
deletion and retraction presentation, with portrait/landscape captures. The
existing complete-latest-bubble, keyboard, rotation and background-return
assertions are retained. Four same-host synthetic media profiles pass too, without
live camera, audible audio, APNs or public-network media. Local Node validation
passes 124 checks with four macOS-only checks explicitly skipped.

Run `43580692365` was not green: message-menu row height clipped the latest bubble
above the landscape keyboard, and the edit test typed over a native text selection.
The 44-point menu target is now an overlay rather than an extra minimum-height
row, and editing has an explicit clear action with an exact field-value assertion.
No geometry assertion or timeout was weakened. Earlier server runs also exposed
the corrected-message archive issue described above; superseded failed/cancelled
runs are not counted as successful evidence.

Selected fictional screenshots and reports are downloaded to ignored
`artifacts/native-selected-evidence-43583743962/`; the compact keyboard layout,
message menu, forwarding confirmation and retraction presentation were visually
inspected. Raster avatars were visibly decoded in chat headers/bubbles. Roster
captures still show the initials fallback, so those images alone do not prove
late-loaded roster-photo replacement or complete photo parity. Room-wide
retraction is covered by bounded stream/model tests, not a real third-party MUC
retraction scenario. Physical-device, VoiceOver, larger-text, dark-mode and real
web/other-client review remain release gates. No TestFlight release, signing,
APNs activation or production-server change is part of this work.

## Web visual language in the native preview (2026-11-14)

The native app uses TeleTypTel's web UI as its visual reference, not the default
iOS sidebar/large-title/grouped-card look. `App/NativeWebStyle.swift` centralizes
light/dark colours from `php/public/chat-client.css`, 8-point message bubbles with
tails, avatar sizing, round composer buttons and bordered symbol controls. The
web font stack falls back to Arial on Apple platforms; native Arial fonts scale
with Dynamic Type. Symbol controls keep at least 44-point touch areas and spoken
labels, rather than copying smaller desktop hit targets.

The brand/status/main-menu bar spans the messenger, with a compact-landscape
exception to preserve keyboard and latest-message space. Contacts use web-style
search, rows, preview/time and actual presence dots. Joined groups also appear in
this conversation list; the floating plus opens existing native group actions.
Chat headers show an avatar, name/presence, primary T button and symbol menu.
Direct and room composers share the same capsule/button styling. Profile,
attachment, translation and group-management forms use the same panel colours and
compact modal headers. TC keeps separate dark RTT panes, a top control-menu button,
separate camera-switch control and always-visible red hangup; media switches stay
green/red. No nonfunctional web buttons are added to imply unsupported features.

This is a shared visual contract, not a claim of full pixel or feature parity.
Apple permission prompts, photo/document pickers, OAuth, keyboard, text selection,
native menus and accessibility affordances remain system UI. Room management
still uses native forms and menus. The app does not embed the website to simulate
native functionality. That earlier styling-only step did not alter protocols,
consent or account permissions. Live TC verification and real-device visual review remain separate
from synthetic media and Debug-only call-layout fixtures.

Local validation passes 124 Node checks with four macOS-only checks skipped.
Source/generator tests compare the native palette with the web CSS, check shared
composer/bubble/shell use and require at least 4.5:1 contrast for the selected
body/metadata colours against both message backgrounds in light and dark. This
limited palette check is not a complete accessibility audit.

[Unsigned preview 43571570894](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43571570894)
passes at revision `fecefde`: 206 Swift tests (eighteen opt-in server tests
explicitly skipped), unsigned Release device compilation and 24 UI tests with
zero failures/skips. Twelve scenarios run on each iPhone 16 Pro and iPad Pro
11-inch M4 simulator, iOS 18.5, with portrait and landscape-left transitions.
Draft/history/background-return and full latest-bubble geometry assertions remain
in place. The new TC layout scenario is an explicitly fictional Debug-only
presentation with no tracks, media capture or ready RTT; it verifies panes, the
top symbol menu and red hangup remain reachable across rotation, not that a live
call works. Release fixture-exclusion checks and the separate four synthetic
same-host native media profiles pass too, within their existing limited scope.

Twenty-six selected fictional screenshots and sanitized reports are downloaded
to ignored `artifacts/native-selected-evidence-43571570894/`. Contacts, compact
chat with keyboard, settings/upload and TC views were visually inspected. This is
not an automated pixel-diff against a browser, nor a physical-device assessment.
Manual dark mode, larger text, VoiceOver and actual iPhone/iPad/web side-by-side
review remain required before claiming complete visual parity or release.

Earlier runs `43564006318` and `43568369221` failed iOS 16 API availability checks;
popover adaptation is now availability-gated and the RTT prompt uses compatible
text colouring. Runs `43564766043` and `43569031070` exposed header/accessibility
and rotation regressions and are not counted as green. The brand bar now has its
own layout above split navigation rather than overlapping content, its child
identifiers remain separate, and connection status lives in the compact chat
header without an extra row. Message context-menu hit regions are explicit.
XCTest uses the actually visible centre of a contact row because UIKit can expose
an offscreen extended activation frame after split-view rotation; it still verifies
navigation/draft preservation, and non-row controls keep normal hit testing.
Superseded cancelled previews are not pass evidence. No timeouts or complete-bubble
geometry assertions were relaxed. No TestFlight upload, live APNs/server activation
or production credentials were involved.

## Attachments, account settings and extended MUC increment (2026-11-14)

These four requested areas are implemented together in the isolated native
preview, not silently substituted for the signed TestFlight application:

- Explicit document/photo selection, review, authenticated upload in 256 KiB
  chunks (20 MB maximum), actual server-confirmed chunk progress and a separate
  action to place the resulting link in a draft. Uploading never sends a chat
  automatically. The existing web XMPP format, a plain filename and absolute
  file URL, works in direct and room messages. Received same-server file URLs
  offer an explicit download/export; foreign URLs are never fetched by this
  component, cookies are not forwarded on downloads and redirects are refused.
  Photos selected through either picker are limited to 64 megapixels, converted
  to JPEG up to 2048 pixels and stripped of original metadata. These exports
  intentionally do not preserve original photo resolution or metadata.
- Account profile read/update: display name, phone number, profile language and
  avatar colour, plus access to existing translation preferences. The authenticated
  server session determines the account; the native API cannot edit JIDs, provider
  identities, passwords, roles, backend addresses or other accounts. Profile
  language is not an implementation of a translated application interface.
- MUC discovery, explicit creation of new members-only/non-public rooms where
  server policy permits it, subject display/update, detailed occupant roles,
  owner configuration, membership/admin/ban lists and changes, and moderation
  (speaking permissions, moderator promotion, removal). Changes require an
  explicit confirmation and correlated server IQ result; timeouts are not proof
  of rejection and never trigger automatic retries. A new room cannot send text
  until private configuration is acknowledged. Joining an existing room never
  creates one implicitly. If creation/configuration is interrupted, an owner or
  server administrator may need to inspect a leftover locked room; it is not
  silently destroyed by the client.
- Session-local group message search and private own/remote group translation
  using the existing off/manual/automatic settings and sharing consent. Attachment
  links are excluded from group translation. Original group messages remain
  unchanged; translated text is not broadcast back to the room.

Deploy `api/native-profile.php`, `api/native-upload.php`, the matching
`NativeProfileService.php`/`NativeUploadPolicy.php` libraries and updated
`api/upload.php` together with the native client. No database migration is needed:
they use existing `account_profiles` and `uploaded_files` tables. The profile API
uses a session CSRF token and a four-field whitelist instead of resubmitting the
old account editor's password/connection fields. Native chunk identifiers are
server-derived per account/session. Native completed uploads are MIME-checked;
DOCX structure/uncompressed-size limits reject macro containers. This is not
antivirus scanning or a guarantee that a document is harmless. Legacy web upload
behaviour remains unchanged apart from finally cleaning failed chunk assemblies.

File links are existing bearer URLs, not recipient ACLs or end-to-end encryption.
The UI warns that anyone with a link can open it, even for a private room.
Cancellation prevents late UI/draft updates but cannot recall bytes already
stored on the server. Stored completed uploads need the existing server retention
policy; this increment does not pretend to delete orphaned uploads automatically.
Do not use these ordinary chat attachments for confidential intake documents.

The actual ejabberd 26.09 management scenarios pass in isolated run
[43546982709](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43546982709)
at revision `ff4c617`: owner configuration, non-owner denial, member list, visitor
speaking prohibition/restoration, ban list, subject echo and explicit private room
creation, alongside the previous login, TLS, Jingle, archive and invitation cases.
Only one random fictional account may create rooms in this disposable fixture;
no local/production server configuration, provider registration, APNs or keys are
changed. Session release and temporary CA revocation/removal also pass.

[Isolated PHP/MySQL run 43547946697](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43547946697)
passes actual profile GET/POST, CSRF rejection, immutable account identity,
second-account isolation, multipart assembly, exact downloaded bytes, cross-account
chunk separation, active-content rejection and blocked-session rejection. It uses
a disposable MySQL 8.4 service and the actual PHP endpoint scripts. Only the two
fictional web sessions are seeded by a hosted-runner/loopback-only test router;
this is not another claim to have tested provider login. Temporary session/chunk
files are removed and the disposable runner/container owns all test database
state. The workflow has no production secrets or server connection.

Local validation passes profile isolation/field-preservation/CSRF and upload MIME/
DOCX policy PHP tests, plus 122 Node checks (four macOS-only checks skipped).
Swift HTTP tests separately exercise the Apple URLSession adapter with fictional
protocol responses. A complete signed-device-to-deployed-server transfer, actual
photo/document pickers and metadata/capture checks remain release gates.
[Unsigned preview 43559158536](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43559158536)
passes at revision `e422ffe`: 206 passed Swift tests (224 total, eighteen opt-in
server tests skipped), unsigned device Release compilation, exclusion of Debug
fixtures from Release, and 22 UI tests with no skips or failures. Eleven run on
iPhone 16 Pro and eleven on iPad Pro 11-inch (M4), both iOS 18.5, including portrait
and landscape-left keyboard/complete-latest-message checks. New scenarios save a
profile without changing its JID, upload/stage an attachment without sending it
until explicit Send, and discover/manage/search a group. The four same-host native
media profiles pass too, with synthetic VP8/T140 and the microphone disabled;
this is not physical-camera, audible-speech, APNs or public-network evidence.
Fourteen selected screenshots and sanitized reports are retained locally under
ignored `artifacts/native-selected-evidence-43559158536/`. Profile, upload,
management and compact/landscape chat screenshots were visually checked. No
TestFlight upload, signing keys or local/production server change was involved.

Earlier previews `43546980164`, `43547571768`, `43550463074`, `43551138488`
and `43556335038`
were not green and are not treated as release evidence. Simulator diagnostics
identified compact-chat clipping, feedback/controls outside the keyboard viewport,
an incorrect test query for SwiftUI's combined account-identity label, and a
search field inset outside the test's usable viewport. The final iPhone-only
failure also used a covered, underlying navigation bar to calculate that
viewport; the helper now selects the last hittable foreground bar. Preview
`43559136756` stopped at its source guard for the old helper spelling, corrected
in `e422ffe`; it supplies no runtime pass evidence. The fixes keep errors in
scrollable chat content, avoid empty translation layout, reveal virtualized form
controls, give the immutable identity a stable accessible label and inset the
explicitly focused search field. Full latest-message geometry assertions remain
in place; timeouts were not enlarged to conceal failures.

Still deliberately outside this increment: password/security-provider changes,
registration/recovery UI, federated/custom/password MUC services, bookmarks,
owner transfer, room destruction, room MAM, group media calls, durable offline
storage, public-network interoperability and full web-feature parity. Relevant
protocol: [XEP-0045](https://xmpp.org/extensions/xep-0045.html). The existing PHP
upload adapter is **not** claimed as an implementation of XEP-0363 slot requests.

## Mediated group invitations increment (2026-11-14)

The native preview now adds room-mediated XEP-0045 invitations, explicit accept,
decline and local hide actions, and a joined-room contact picker for sending.
Invites are a separate inbox, never ordinary direct-chat messages. Only the
configured `conference.<account-domain>` service and known roster contacts are
accepted. Direct XEP-0249 invites, occupant-alias inviters, custom/federated MUC
services, password entry and APNs/offline invitation delivery are not implemented
in this increment. Password markers are shown as unsupported without retaining
the supplied password. Room addresses, sender/recipient, action namespace and
ambiguous duplicate payloads are checked before presentation.

Receiving an invite never joins a room or opens the keyboard. Accepting needs an
explicit action, a valid nickname, a known inviter and an invitation received
within ten minutes; room self-presence still controls whether joining succeeds.
Inviting is restricted to a joined speaking room and an explicitly chosen roster
contact. The UI warns that inviting may grant private-room membership; the server
decides permission. A submitted WebSocket write does not prove receipt or access.
Declining does not revoke membership that the server may already have granted.
Where multiple invites could match a decline, the UI does not fabricate which
particular send was declined.

Inbox/early-event bounds are sixteen; outgoing attempts are limited to sixteen
and concurrent actions to eight. Background/logout/account changes invalidate
callbacks and pending actions; nothing is persisted to a local invitation file.
Already-submitted network actions cannot be undone by cancellation. Existing
room privacy/membership policies are not changed by this client. The isolated
test harness adds a second temporary private room with a fictional owner, so the
actual server can test invite delivery, declines and explicit joining without
changing any existing local or production room.

[Isolated ejabberd run 43537900852](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43537900852)
passes at revision `671f33e`: the real room mediates an invite, forwards a decline,
and admits a different contact only after explicit joining. Receiving an invite
does not join, the declined contact gets no room text, and invitation/group text
does not enter the direct-chat callback. All previous TLS, login-contract, Jingle,
MAM and private-MUC scenarios pass too, with released sessions, temporary-file
cleanup and post-revocation TLS rejection verified on disposable ejabberd 26.09.

The first invitation server run (`43537028408`) passed the invitation exchange
but failed the final released-session assertion; it is not counted as green.
Online cancellation now sends the RFC 7395 framing `close` before cancelling the
WebSocket, stops callbacks/pending actions immediately, and awaits closure for at
most two seconds before a forced cleanup. Continuations are completed once, not
replayed after logout. The original five-second server-release assertion remains
unchanged, and a failed assertion records the fictional remaining session IDs.
The passing rerun proves session release in these scenarios, not every possible
network-loss or suspended-device case.

[Unsigned preview run 43542653163](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43542653163)
passes at app revision `0fa887b`: Release device compilation, Debug fixture
exclusion, 198 passed Swift tests and sixteen UI tests (eight each on iPhone 16
Pro and iPad Pro 11-inch M4, iOS 18.5). Eighteen opt-in server tests are explicitly
skipped in that preview, not counted as passes. The isolated server run above
provides separate actual-transport evidence; the later app revision only clears
an old own-join status before sending a new invitation and adds regression tests.

The UI scenario receives two fictional invites, declines one, explicitly accepts
the other, waits for self-presence, selects a known contact and verifies the honest
submitted state. The older own-join confirmation no longer appears under that new
send, where it could be mistaken for the recipient joining. An earlier green
preview (`43537904167`) exposed that confusing status during visual inspection;
the final Swift/UI assertions and rechecked screenshots cover its removal.
Existing direct/group rotation and complete-latest-bubble checks still pass.
The four same-host native WebRTC profiles also pass within their synthetic-media
scope: not real camera capture, audible speech, public-network or APNs proof.
Fourteen fictional screenshots are retained in the workflow evidence and copied
locally to ignored `artifacts/native-ui-43542653163/`.

Local Windows validation passes 119 Node checks with four macOS-only checks
explicitly skipped. Manual VoiceOver, large text, dark mode and signed physical
iPhone/iPad checks remain release gates. No TestFlight upload, provider changes,
live APNs activation or local/production server configuration is included.
Protocol reference: [XEP-0045](https://xmpp.org/extensions/xep-0045.html).

## Existing MUC room participation increment (2026-11-14)

The native main menu now opens a separate Groups screen. Enter an existing
`room@conference.<account-domain>` address and a screen name; this limited preview
does not discover/bookmark rooms or create/configure them. The transport checks
room disco information before directed join presence and requires XEP-0045
self-presence (110) before enabling sends. A racing newly-created room (201) is
left without configuration. At that baseline, custom/federated MUC services,
passwords, invitations, administration, room MAM, group translation, attachments
and group calls remained separate work; direct-chat translation and history must
not be confused with them.

Group text uses `type=groupchat` and separate room/nickname identities, not the
direct chat store. Known participants, correct room/recipient, body bounds and
role-based speaking permission are checked. Nick conflicts, removal, visitors,
server-assigned names, eight-room/128-participant/200-message limits and bounded
join timeouts have explicit handling. Server errors mark the correlated own send
rejected; transport uncertainty is not read/delivery proof. Leaving/backgrounding
removes participation and keeps session text/drafts; rejoining is explicit.
Logout/account changes clear group state and invalidate stale callbacks.

An isolated ejabberd fixture creates a private members-only room for random test
accounts, denies ordinary room creation, and includes a non-member rejection test.
No local/production server or existing room is configured. Groups currently use
a separate native sheet; a unified contact/group sidebar and full web-feature
parity are not claimed.
Protocol reference: [XEP-0045](https://xmpp.org/extensions/xep-0045.html).

Validation of app revision `1ca383e`:
[unsigned run 43529259443](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43529259443)
passed Release device compilation, Debug fixture exclusion, 189 Swift tests and
fourteen UI tests (seven each on iPhone 16 Pro and iPad Pro 11-inch M4). Seventeen
opt-in network tests were explicitly skipped here, not counted as passes. The
four same-host native WebRTC profiles also passed within their existing synthetic
media scope, not physical capture, audible speech, APNs or public-network testing.
The new UI case opens a fictional group through the main menu, joins, receives,
sends, rotates with the keyboard open and leaves; sending is then disabled.

[Isolated server run 43524015538](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43524015538)
passed seven TLS/session checks, seven native HTTP/XMPP login checks, Jingle,
direct MAM and the new private MUC scenario on actual ejabberd 26.09, plus the
post-revocation TLS rejection check. Its core revision is unchanged in the later
UI-only commits. Two members exchange fictional room text; a third non-member
cannot join or receive it, an unknown room cannot be created through the client,
group text does not enter the direct-chat callback, and sending after leaving
fails. The run verifies released sessions, temporary-file cleanup and temporary
CA revocation/removal. It contacts no production server.

The first server attempt (`43523485644`) failed because the affiliation CLI needs
separate user/host arguments; two preview attempts (`43524606603`, `43525297403`)
retained SwiftUI type-check failures. The command was corrected and the group
screen/bubble split into smaller components before passing. Visual inspection of
the first green preview (`43525844287`) additionally found the latest iPhone
landscape bubble clipped despite the original weak geometry assertion. Compact
status/composer spacing and a stricter top/bottom visibility assertion fixed it;
the final green run was visually rechecked and confirms the complete bubble.
Twelve fictional chat/contact/group screenshots are available in workflow
evidence and locally under ignored `artifacts/native-ui-43529259443/`.
Local Windows validation passes 40 Node checks with two macOS-only checks skipped.
No TestFlight upload, provider registration, APNs activation or server changes
are included. Manual VoiceOver, large text, dark mode and signed physical-device
checks remain release gates, not inferred from these simulator tests.

## Recent direct-chat server history increment (2026-11-13)

The native preview now requests the latest 50 archived stanzas for the selected
roster contact using [XEP-0313 MAM 2](https://xmpp.org/extensions/xep-0313.html).
This is read-only access to the signed-in user's archive, not a change to server
archiving preferences. History appears only if that server already retains it.
There is no local plaintext chat file, legacy PHP history migration, room archive
support or older-page navigation in this increment. The session remains bounded
to 200 messages; rejected, uncertain and pending sends are not silently evicted.

Query IDs, IQ IDs, archive sender/recipient, direct peer pairs, namespaces, final
RSM cursors, timestamps and byte/result limits are checked before importing a
completed page. Unsupported, unstable, malformed or timed-out history produces a
history-specific status without claiming that XMPP itself disconnected. Logout,
account changes and stale requests cannot repopulate the next account's history.
Original message IDs and owner-attributed XEP-0359 archive IDs deduplicate within
peer/direction boundaries. These IDs are not cryptographic authentication: the
authenticated server must implement XEP-0359's own-ID sanitization. Archived
outgoing text is at most submitted, never evidence of delivery or reading.

The isolated ejabberd harness enables MAM only on its disposable loopback server
and exchanges fictional text between two random accounts. Its Mnesia archive is
test-only; [ejabberd recommends SQL for deployed MAM storage](https://docs.ejabberd.im/admin/configuration/modules/#mod-mam).
No local/production server, retention policy, APNs service or TestFlight build is
changed.

Validation of revision `1d5b3fc`:
[unsigned preview run 43515284136](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43515284136)
passed Release device compilation, Debug fixture exclusion, 182 Swift tests and
all twelve UI tests (six each on iPhone 16 Pro and iPad Pro 11-inch M4). Sixteen
opt-in network tests were skipped in this preview run, not counted as passes.
The four native same-host WebRTC profiles passed with synthetic VP8 and
bidirectional T.140; no physical capture, APNs or public-network claim is made.
The UI tests verify the fictional archived message, rotation/background draft
preservation and the latest outgoing bubble above the landscape keyboard.
Four chat screenshots were visually inspected in portrait/landscape on both
families; eight chat/contact screenshots are included in the workflow evidence.

[Isolated ejabberd run 43514381108](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43514381108)
passed on the same core revision (`3ecb256`; the later commit only fixes the
standalone media test source list and its regression guard). Its actual ejabberd
26.09 server passed seven TLS/session checks, seven native HTTP/XMPP login checks,
one Jingle exchange test, and the new two-account MAM test, with no skips. The
MAM test sends fictional text both ways, fetches by peer, requests an earlier
cursor, checks an unrelated peer returns no history, reconnects and imports the
same archive twice without duplicates or manufactured read receipts. A separate
post-revocation TLS rejection test also passed; sessions and fixture files were
removed and the temporary CA was revoked/removed on the disposable runner.

The first full preview attempt (`43514376915`) retained a real failure: the
standalone media compiler's explicit source list missed `NativeArchive.swift`.
The dependency and a regression check were added before the green rerun; that
failure is not counted as successful coverage. Local Windows validation passes
38 Node checks with two macOS-only checks explicitly skipped.

## Web-style UI, provider login and private translation increment (2026-11-13)

This is still the isolated native preview, not the existing signed TestFlight app.
The current increment adds native Google/Facebook SDK adapters, the existing
server's native provider challenge/complete contract, an account-bound HTTP session,
and the server translation API. No production endpoint or provider registration is
changed and no provider credentials are embedded in the repository.

Provider SDKs are pinned to GoogleSignIn 9.0.0 and Facebook 18.1.1, matching the
existing application dependency versions. Facebook uses Limited Login with the
server nonce and disables automatic analytics/advertiser collection. Server client
identities must match the explicitly configured native build. Cancellation and
account switching invalidate pending callbacks. Provider success alone does not
mark XMPP online; account identity and resource binding are still required, and
authenticator challenges remain mandatory when returned by the server.

Provider configuration is deliberately absent from unsigned CI. To prepare an
isolated native build with explicitly registered preview clients, pass a local
JSON path as the second CLI argument after the staging name:
`node scripts/prepare-ios-native.js ios-native-provider-check /path/to/local-provider-config.json`.
The JSON schema is `bundleId` (must be `com.tiedragon.teletyptel.nativepreview`),
optional `google` (`clientId`, `serverClientId`), and optional `facebook` (`appId`,
`clientToken`). Keep that file outside the repository. Existing production OAuth
registrations must not be silently relabelled as preview registrations. The
unsigned tests compile SDK integration and use fictional protocol fixtures; they
do not prove real provider login, SDK callback routing or signed-device operation.

The native chat now reuses the web wallpaper assets, green outgoing bubbles,
incoming avatars, single submitted tick, symbol composer, emoji palette, TC button,
message context menu and compact translation caption. The tick remains submitted,
not read/delivered. Contacts use a split view on iPad and native compact navigation
on iPhone. Translation is local presentation only: results are never sent as chat
stanzas. Off/revoked consent clears results and pending tasks, same-language
detection suppresses captions, and live own/peer RTT needs separate consent. Live
results are keyed to the call ID, debounced, bounded and invalidated on logout.

Historical parity checkpoint, before the 2026-11-14 interaction/history/dialer
and online-history additions. The newer sections at the top supersede this
table; it is retained as a migration record, not the current readiness list.
Do not confuse a visible layout with protocol support.

| Web feature | Native preview status |
| --- | --- |
| Password login, XMPP binding, authenticator 2FA | Implemented; previous unsigned validation recorded below |
| Face ID/Touch ID opt-in | Implemented; real-device verification still required |
| Google/Facebook login | SDK/server adapters implemented; preview registration, signing and real-provider tests required |
| Contacts/presence, direct text, drafts, emoji/copy | Implemented; fictional iPhone/iPad UI scenarios pass, including rotation and background return |
| Private ordinary/live RTT translation | API/UI implementation; fictional contract tests, not a production translation claim |
| Audio/video/RTT/TC | Existing constrained native engine; public-network/physical-device tests remain |
| Recent direct-chat MAM history | Read-only latest page, 50 stanzas per selected peer; server retention required; no older-page UI or legacy-history migration |
| Durable local history, carbons, receipts/read markers | Not yet implemented in this native target; archive presence does not prove delivery/read state |
| Existing MUC room text chat | Manual same-domain room entry, membership/self-presence, participants, roles, sending/receiving and leaving implemented; separate room state |
| Room-mediated invitations | Known-contact inbox, explicit accept/decline/hide and joined-room contact picker implemented; same-domain MUC service only |
| MUC discovery, private creation, roles/membership and configuration | Implemented with explicit actions and actual server authority; custom/federated/password services, bookmarks and group calls remain |
| File/photo upload and download | Explicit bounded document/photo upload, draft-link staging and same-server download/export; existing bearer-URL storage, not recipient ACLs |
| Message actions | Last own direct-message correction, session-local hiding, author-scoped retraction requests and confirmed original-only direct forwarding; room-wide retraction requires server capabilities/stable author IDs |
| Reactions | Not yet implemented in this native target |
| Profile/account management | Four editable profile fields, account-bound API and translation settings; passwords/providers remain separate |
| Add contacts and group bookmarks | Not yet implemented in the new native interface; explicit room creation/participation are available |
| Registration and password recovery | Not yet connected in the native interface |
| Application language selection/localized UI | Dutch native interface; additional UI languages are not yet migrated. Translation target selection does not change the application language |
| Interpreter/SIP/DTMF, push/background calls | Separate incomplete integration work |

Remaining parity gates at that historical checkpoint:

1. Extend recent MAM restoration with older-page navigation and, only with an explicit storage design, protected account-isolated offline history. Carbons and independently verified delivery/read states remain separate protocol work.
2. Extend implemented MUC discovery/administration with bookmarks, direct/federated/password invitation variants, group archives and protected group media. Group translation now has a private, consent-gated native presentation path.
3. Validate deployed PHP/MySQL multipart transfers and real document/photo pickers; design recipient ACLs and orphan/retention controls before confidential-file use. Inline media previews and XEP-0363 interoperability are not implemented by the PHP upload adapter.
4. Reactions, persistent local hiding, room corrections and contact/security-profile management; expand cross-client/physical-device validation of the new author-scoped message actions.
5. Localized application strings and remaining web-style presentation, checked in both orientations, large text, dark mode and manual VoiceOver use. Message translation preferences remain separate from UI language.
6. Explicit native provider registration and signed physical-device validation. Live APNs, production server changes and TestFlight distribution remain separate authorization/release gates.

No TestFlight upload, live APNs activation or production configuration changes are
included. The earlier validated baseline remains available in Git history.

Validation of revision `5ed7f01`:
[unsigned run 43463479659](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43463479659)
passed Release device compilation/fixture exclusion, 169 Swift tests and all twelve
UI tests on iPhone 16 Pro and iPad Pro 11-inch (M4), portrait and landscape-left.
Fifteen opt-in real-server Swift tests were skipped. The four-profile same-host
WebRTC loopback also passed, with synthetic VP8 and bidirectional T.140; this does
not prove physical capture, audible speech, push or public-network interoperability.
Local validation passed 36 Node checks (two macOS-only checks skipped on Windows)
and the existing native Google/Facebook/translation PHP suites (422 checks), all
without real provider credentials or external translation requests.

The UI evidence includes eight fictional-account screenshots. Rotation now waits
for the screen geometry, screenshots use the complete simulator display, and the
chat test explicitly checks that the most recent outgoing bubble remains visible
above the keyboard in landscape. Visual inspection found and fixed duplicate back
buttons, the initially hidden iPad sidebar, incorrect TC artwork, stale resize
position and content drawing behind the header. The CI harness now selects the
host simulator architecture and collects both families even when one fails. A
simulator initialization failure and a later compile-plus-test command timeout
were retained as failures, not reclassified as passes. The bounded per-family
command budget is now twenty minutes; individual UI assertions remain bounded and
the overall workflow remains capped at forty-five minutes. The final run above
completed successfully with those assertions unchanged.

This is not full web parity or proof of real Google/Facebook login. Preview client
registration, signed physical-device testing and the remaining parity gates above
are still required. There was no TestFlight upload or live server/APNs change.

## Current increment: authenticator second-factor login (2026-11-13)

The native preview now has a second-factor screen for the existing account API's
`authenticator` challenge. This supersedes the older statements below that native
two-factor login is unsupported. Google/Facebook, account registration and password
recovery are still separate migration work.

- A challenge is not an authenticated account. XMPP, chat and calling stay closed
  until a successful verification returns the expected account and XMPP resource
  binding subsequently succeeds. An account change in the verification response
  is rejected.
- The login attempt uses its own ephemeral HTTPS session. Its PHP session cookie
  stays in memory for `verify_login_two_factor` on that same origin; it is not
  shared with Safari, WebViews or other login attempts. Redirects are rejected.
  Automatic cookie storage is disabled. A single bounded, Secure `PHPSESSID` with
  an exact matching host and API-compatible path is explicitly retained and sent
  only to the same account API. Missing, foreign or insecure cookies are rejected.
- Codes are six ASCII digits, explicitly submitted, never persisted and cleared
  after submission, cancellation and background entry. There is no automatic
  focus or automatic code submission. Invalid codes can be retried, but the
  challenge is capped at five verification requests and five minutes locally.
  Unsupported email-code challenges fail closed; no security setting is disabled.
- Logout, account/server changes, expiry and background entry close the challenge
  session and invalidate late results. Biometric login does not bypass the server's
  second-factor requirement. Opt-in credential saving still waits for actual XMPP
  connection.
- Tests include a private URLProtocol HTTP fixture for challenge/cookie continuity,
  retry, cancellation, invalid responses and attempt limits, model tests that keep
  XMPP closed before verification, and a Debug-only iPhone/iPad flow that enters an
  invalid and then valid fictional code. Real PHP/TOTP operation and physical
  device testing are not proven by these fixtures.

No production PHP, authentication policy, APNs configuration or TestFlight release
is changed by this increment.

Validation of revision `7d7e40a`:
[unsigned run 43431351085](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43431351085)
passed Release device compilation/fixture exclusion, 163 Swift tests including ten
second-factor tests, and all twelve iPhone/iPad UI tests in portrait and
landscape-left. Fifteen opt-in real-server tests were skipped. The four-profile
same-host WebRTC loopback remained green. The second-factor UI scenario now checks
both a rejected fictional code and successful connection after a valid fictional
code. The initial HTTP fixture exposed missing automatic cookie continuity; this
was fixed with explicit, origin-bound cookie handling rather than weakening the
verification test. Real PHP/TOTP and physical-device validation remain required.

## Current increment: opt-in biometric saved login (2026-11-13)

The native preview now includes an optional Face ID/Touch ID login path. This
section supersedes the older statements below about Keychain/cold-start login.
It does not make background calling operational.

- Remembering is off by default. The user must select the biometric-login option
  during manual login; credentials are saved only after the matching XMPP account
  is actually connected, not after HTTP authentication alone.
- iOS biometric authentication is required before saving and unlocking. The
  Keychain item uses `biometryCurrentSet`,
  `kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly`, and no iCloud synchronization.
  Changed biometric enrollment invalidates access. No unprotected password fallback
  or biometric data is stored by the app.
- On a later cold launch, an existing saved item starts biometric unlocking.
  Only after success does the normal HTTPS/account/XMPP login chain run, including
  certificate verification and server availability checks. Cancellation leaves
  manual login available; failed unlocks do not loop or silently send credentials.
- Disconnect/logout removes the saved login. A separate removal button is also
  available. A failed removal remains visible rather than claiming success.
  Automatic restore is disabled before deletion, even if Keychain deletion fails.
  Only a nonsecret consent boolean uses preferences; all credentials stay in
  Keychain. An existing Keychain item alone does not authorize automatic login
  after reinstall or loss of the consent preference.
  Configuration changes, background entry and cancellation invalidate pending
  operations; stale results cannot log in or update the UI.
- Preview credentials use a separate Keychain service. Debug UI fixtures disable
  the real vault and cannot save or automatically restore test credentials.
- Swift tests cover payload validation/redaction, opt-in, confirmed matching login,
  cancellation, successful/failed unlocking, deletion and late results. Source
  checks are not proof of real Keychain or Face ID operation. Actual enrollment,
  permission denial, lockout, reboot, logout/relaunch and cancellation require
  physical iPhone/iPad validation before a signed release. No TestFlight upload,
  APNs activation or server changes are included.

This foreground-only biometric item must not be reused to bypass authentication
for locked-screen background calls. That requires a separate scoped and revocable
call authorization design and server integration.

Validation of revision `92f0755`:
[unsigned run 43424813510](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43424813510)
passed device Release compilation and fixture exclusion, 153 Swift tests (including
eight saved-login tests), and all twelve UI tests across iPhone 16 Pro and iPad Pro
11-inch (M4), portrait and landscape-left. Fifteen opt-in network tests were skipped;
no new real-server test is claimed. The existing same-host WebRTC loopback also
passed all four profiles. UI fixtures keep the biometric vault disabled: these
results do not prove real Keychain access or Face ID/Touch ID authentication.

Reference: [Apple Keychain accessibility](https://developer.apple.com/documentation/security/restricting-keychain-item-accessibility).

## Implemented in this first stage

### Concrete native media engine and call lifecycle

The isolated target now includes `NativeMediaPeer`, `NativeJingleSession` and
`NativeIncomingPeerNegotiator`. These connect the earlier strict description
converter to actual native WebRTC peers and the authenticated Jingle transport.
This does **not** yet connect calls to the login UI or enable background push.

- Offers use explicitly selected PCMU/VP8 codecs and independent UDP ICE/DTLS
  transports. Optional local BUNDLE, RTP header extensions and transport-wide
  congestion feedback are removed before setting the local description. Remote
  bundled offers remain unsupported; arbitrary browser interoperability is not
  claimed. ICE gathering and asynchronous operations have bounded deadlines.
- Native RTCP extended round-trip reports remain unchanged in the SDK's local
  description. The Jingle projection does not advertise this optional, unmapped
  capability; unsupported XR forms fail closed. This avoids overriding the SDK's
  SDP-munging guard. Audio NACK is mapped using XEP-0293. RTCP round-trip reporting
  is unrelated to the T.140 real-time text channel.
- The session state machine binds each call to the authorized full JID, SID and
  connection binding. IQ acknowledgement is distinct from negotiated media and
  from an actually connected peer. Invalid profiles, foreign calls, duplicate
  session transitions and late results after cancellation cannot open media.
  Preparation/answering expire after 20 seconds and unanswered calls after 45
  seconds; stale timers cannot terminate an established call.
- Incoming offers are validated and acknowledged without creating capture
  tracks. Only preparation after answering obtains the injected tracks. Local
  and remote hangup close the peer, stop prepared capture and release signalling.
  The CallKit media driver still waits for the required tracks and, when used,
  the reliable T.140 channel before reporting readiness.
- The new macOS loopback test exercises four profiles using two actual WebRTC
  peers and the real Jingle IQ parser/state machine over an in-memory wire.
  Synthetic VP8 frames must be decoded in both directions; RTT must carry
  Unicode, edits and deletion. Microphones remain disabled: negotiated audio
  tracks are not evidence of audible audio. The incoming provider is also tested
  for deferred capture and hangup cleanup.

The unsigned workflow now fails when this media test fails, rather than relying
only on successful compilation or description round-tripping. Initial runs
exposed a mismatch between native SDP and the constrained converter; runtime
validation is being completed. Do not treat a compiled app as an operational
calling app. The results and remaining gates below must be updated with actual
successful run evidence before declaring this stage validated.

Still required: native capture/rendering and call controls, authenticated call
discovery and login-lifecycle wiring, push registration/revocation, APNs delivery,
TURN/public-network and physical-device tests, native group/translation/history
and OAuth feature parity. No TestFlight, live APNs or server configuration was
changed by this stage.

### Native media description conversion (unsigned validation completed)

`NativeJingleMedia` adds native SDP/Jingle description conversion for audio,
audio/video, audio/RTT and Total Conversation. This is a **restricted negotiation
format**; the historical validation below tested the converter, not an operational
call engine. It uses PCMU audio, VP8 video, mandatory
SHA-256 DTLS fingerprints, complete UDP ICE candidates and negotiated, reliable,
ordered T.140 datachannel 0. RTT remains conversational media, not a chat message.
Answers must preserve the offered SID, profile, ordered media IDs and payloads;
they cannot silently remove RTT/video or add unoffered feedback.

The XML parser's existing 64 KiB, 128-node and depth limits are unchanged. Each
content accepts up to 24 candidates so a full TC description, including its IQ
envelope, fits that parser. Malformed candidates, duplicate IDs, unsupported
codecs, insecure transport, partial-reliability RTT and XML/SDP injection are
rejected. Debug descriptions redact ICE credentials and addresses.

This first profile deliberately rejects BUNDLE and session-level security
attributes rather than silently losing them. It is **not yet compatible with
arbitrary default WebRTC offers**, which commonly advertise bundled media and
multiple codecs. Native peer configuration/codec selection or explicit grouping
support must be implemented and tested before connecting it to live calls.
It does not implement RTP/T.140 (RFC 4103), SIP interworking, trickle ICE, ICE
restart, media capture/rendering or a full Jingle session state machine.

Fourteen new Swift tests cover all four profiles in both directions, answer
matching, parser/transport bounds and negative security cases. Validation of
revision `9e50fb4` on 2026-11-07:

- Local Node source/generator/fixture checks: 22 passed, one macOS-only Swift
  invocation skipped on Windows.
- [Unsigned run 42366475598](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42366475598):
  117 Swift tests passed, including all fourteen new media description tests;
  fifteen opt-in network tests skipped, zero failures. This run did not repeat
  the earlier isolated ejabberd integration test.
- Unsigned iOS device Release compilation and test-fixture exclusion passed.
  All twelve UI tests passed: six on iPhone 16 Pro and six on iPad Pro 11-inch
  (M4), in portrait and landscape-left, with no failures or skips.
- Evidence is retained under `artifacts/ios-native-evidence-42366475598/`.
  Initial test runs exposed an XCTest property-name collision and an incorrect
  ICE-fragment boundary fixture; both were corrected before the successful run.
  The test harness now retains Swift assertion output even when the initial
  generator check fails.

These tests exercise description conversion and existing UI, **not actual
audio/video media exchange, camera capture, background calls or APNs delivery**.
Physical-device tests and the concrete native peer-negotiation provider are
still required. No TestFlight, APNs or server changes are included.

References: [Jingle RTP (XEP-0167)](https://xmpp.org/extensions/xep-0167.html),
[DTLS-SRTP (XEP-0320)](https://xmpp.org/extensions/xep-0320.html), and
[experimental synchronized RTT (XEP-0517)](https://xmpp.org/extensions/xep-0517.html).
The constrained implementation is not a claim of complete XEP conformance.

### Native Jingle signalling transport (unsigned validation completed)

The authenticated WSS connection now exposes a separate Jingle channel after
SASL authentication and resource binding. A caller must explicitly bind an
authorized **full peer JID and call SID** before sending or receiving requests.
Each binding belongs to one connection; replacing/closing it invalidates pending
exchanges and response capabilities. Nothing in a push payload alone authorizes
that peer. The normal chat API remains separate.

Outgoing IQs finish on a matching peer response, not on WebSocket write success.
Incoming IQs require an explicit handler decision; an IQ result acknowledges
signalling only and never marks media connected or enables a microphone/camera.
Unknown calls are rejected, not automatically accepted. Eight concurrent inbound
and outbound requests, eight-second monotonic deadlines, and 256 retained inbound
IQ results per binding bound resource usage. Duplicate requests reuse their
reply without re-delivery. Once the replay cache is full, new requests are refused
until the binding is released. Cancellation does not retry an uncertain request.

Tests cover routing after authenticated resource binding, exact peer/resource,
recipient and SID validation, rejection, cancellation, duplicate/late responses,
logout/replacement, XML limits and bounded replay memory. An opt-in integration
test connects two resources of one fictional account to the disposable ejabberd,
checks actual bidirectional IQ exchange and rejection, then cancellation,
timeout, unbinding and disconnection. This is **not** a two-person media test.

This stage validates Jingle envelopes, **not complete RTP/ICE/DTLS/SDP content or
the Jingle session state machine**. The native `NativePeerNegotiating` provider,
verified incoming-call/peer resolution, native capture/rendering, login lifecycle
integration and authenticated push registration still need implementation.
Neither this transport nor the earlier CallKit adapter makes background calls
operational yet. Push remains disabled; no TestFlight or live server changes.

Protocol reference: [XEP-0166 Jingle](https://xmpp.org/extensions/xep-0166.html).
Validation of revision `b86cc09` on 2026-11-07:

- Local validation: 22 Node source/generator/fixture checks passed; the macOS-only
  Swift invocation was skipped on Windows, not counted as runtime proof.
- [Unsigned iOS run 42362990199](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42362990199)
  passed 103 Swift tests, including fourteen new Jingle/routing tests. Fifteen
  opt-in network tests were skipped in this run. Unsigned device Release
  compilation and Release fixture-exclusion checks passed. All twelve UI tests
  passed: six on iPhone 16 Pro and six on iPad Pro 11-inch (M4), covering portrait
  and landscape-left. No UI failures or skips were reported.
- [Isolated ejabberd run 42362992332](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42362992332)
  executed those fifteen network tests: seven WSS/server checks, seven native
  HTTPS/XMPP login-contract checks and one new bidirectional Jingle test. All
  passed against temporary ejabberd 26.09. Jingle acknowledgement, rejection,
  cancellation, timeout, unbinding and disconnect were exercised over actual
  Apple WebSocket transport. Sessions were released, temporary certificate trust
  was revoked and checked, and test-environment cleanup completed.

Evidence is downloaded under `artifacts/ios-native-evidence-42362990199/` and
`artifacts/ios-native-evidence-42362992332/`. These results do not cover physical
devices, actual PHP account authentication, complete audio/video/RTT negotiation
or APNs delivery. The UI tests exercise the existing native interface, not a
complete CallKit call. No signing, TestFlight upload, production secrets or live
server changes were involved.

- Independent SwiftUI entry point; no HTML, JavaScript, Capacitor or WKWebView.
- Native scrollable startup form, bounded width on iPad, portrait/landscape support,
  system fonts, native keyboard dismissal and no automatic text-field focus.
- One status area for checking, reachable, certificate/TLS failure, timeout,
  protocol failure, redirect rejection and cancellation. No separate error page.
- A real unauthenticated XMPP WebSocket reachability check on the configured
  origin's `/xmpp-websocket` route. It checks the `xmpp` subprotocol, server stream
  opening and SASL mechanisms, rather than treating an HTTP response as online.
- WSS only, normal system certificate verification, no cross-server redirects,
  no cookies/credentials/cache, eight-second deadline, bounded XML parsing.
- Cancelling, editing settings or backgrounding cancels the probe. Attempt IDs
  prevent old responses from overwriting newer startup state.
- Separate `com.tiedragon.teletyptel.nativepreview` bundle identity and unsigned
  build only. No credentials, account data, push configuration or production
  endpoints are embedded. No server is contacted automatically on a cold launch.

The probe closes its connection after checking. **Reachable is not authenticated
or continuously connected.** After a successful probe, the native UI now offers
an explicit account/password login using the connection foundation below. It
never treats a successful probe as a logged-in session. Initial login is manual;
foreground return can now reconnect an already authenticated in-memory session,
as described below.
The configured domain is the XMPP virtual host, not necessarily the HTTPS host.
For local testing it may still be `localhost`. The placeholder public hostname is
not evidence of a deployed service. This initial UI is Dutch; other languages are
part of migration parity, not implemented here.

## Direct chat and bounded background lifecycle (unsigned tests passed)

Published and tested on 2026-11-07 in the isolated native preview only.
Unsigned compilation, unit tests and iPhone/iPad simulator tests passed.
**No physical-device validation or TestFlight upload is claimed.**
The working Capacitor app and server configuration are unchanged.

- Selecting a roster contact opens a native one-to-one chat sheet with incoming
  and outgoing text, accessible send control and no automatic keyboard focus.
  This is direct XMPP messaging, not TC RTT, group chat, translation or a bot.
- Chat stanzas use the authenticated WSS session and XML-escaped text. Only
  direct `chat`/`normal` messages addressed to this account/resource are accepted.
  Groupchat, nested forwarding/carbons and self echoes are not consumed. Messages
  from contacts outside the loaded roster are ignored in this preview. Up to 32
  early events wait for the initial roster; overflow or roster failure drops
  these events. This is not reliable offline delivery or history synchronization.
- Each contact has an in-memory draft. Rotating, dismissing the chat sheet and
  background/foreground return preserve drafts and session messages. Ending the
  app process, account/configuration changes, a new login or explicit disconnect
  erase them. There is no database, Keychain session or cold-start auto-login yet.
- Limits: 8 KiB UTF-8 text, 100 drafts, 200 messages across the session and eight
  in-flight writes. Old received/submitted messages may be evicted with a visible
  history-limit notice. Uncertain/rejected writes are retained; if they fill the
  history, new sends are refused without clearing the draft. Duplicate detection
  uses sender plus stanza ID within retained incoming history, not globally.
- A completed socket write means **submitted, not delivered or read**. Errors
  with matching peer and stanza ID mark rejection. Timeout, cancellation or
  connection loss mark in-flight messages uncertain, preserving their text.
  They are never automatically resent. A late socket callback cannot convert an
  uncertain or rejected write into a success. Domain-only server error senders
  are not mapped to a conversation in this initial direct-chat codec.
- On background entry, new sends are disabled. Only already initiated writes
  receive a finite UIKit background task, capped locally at five seconds and
  subject to earlier OS expiration. The session is then closed and presence
  cleared. The task is always ended; no silent audio, background-mode entitlement
  or permanent socket workaround is added.
- Returning to the foreground cancels a still-running completion window or
  rechecks WSS availability and authenticates a fresh XMPP connection with the
  already approved account credentials held only in RAM. It does not replay the
  HTTP login, bypass an initial 2FA challenge, restore a stream with XEP-0198,
  fetch MAM/history or retry failed sends. Explicit logout, a failed reconnect,
  configuration change or process termination discards those credentials.
  No reconnect loop runs in the background. Repeated foreground events cannot
  start concurrent reconnects, and previous-generation events are ignored.

**Still required for background incoming calls/messages:** integrate the
PushKit/CallKit call engine with this target, authorize its actual app identity,
connect authenticated push registration/server delivery, and test APNs on real
locked iPhones. Ordinary message notifications require their own notification
flow; VoIP pushes are not a generic background-chat transport. This step does
not promise ringing, vibration, message reception or continued calls while the
app is suspended or terminated.

Added tests: ten chat codec/store tests, four model chat/lifecycle tests, one
session-routing test and one iPhone/iPad UI scenario covering receive/send,
rotation, draft retention, sheet reopening and foreground return. Existing
isolated ejabberd tests still cover the earlier login/roster chain; two-account
chat interoperability and background timing/expiration are not yet validated.
The Debug UI fixture is explicitly fictional and never reaches a server.

Validation evidence:

- Feature commit `a77e9fc4e1e1ad6d08d2f519a41e8dec23f23d7d`; test-helper fixes
  `abd7594` and `6c8a58598011b47ee53b0fc442b6da40edf3f4b9`. Only scoped native
  preview sources, tests, generator and this documentation were published.
- [Unsigned simulator run 42343322052](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42343322052)
  passed on `6c8a585`: 67 Swift tests passed, 14 opt-in network tests skipped in
  that suite; unsigned device Release compilation passed and Debug fixtures
  were absent from the Release binary. Six UI tests passed without skips on
  each of iPhone 16 Pro and iPad Pro 11-inch (M4), both iOS 18.5 simulators.
  These include portrait/landscape, fictional send/receive, draft/history
  retention, background/foreground return and explicit disconnect.
- [Isolated ejabberd run 42341137558](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42341137558)
  passed on `a77e9fc`: seven WSS tests and seven native login HTTP-contract
  tests against disposable loopback ejabberd 26.09 and a fictional account API.
  Session cleanup, temporary CA removal and trust revocation were verified.
  This is regression evidence for authentication/roster, not two-peer chat
  interoperability or validation of the production PHP API.
- Earlier runs `42340983130` and `42342207540` failed UI automation. The first
  queried an offscreen label's tap point after rotation. The second exposed
  ineffective full-window scroll gestures and a failed termination during an
  unnecessary launch/terminate/relaunch sequence. The helper now checks visible
  geometry before hittability, uses bounded drags and launches each fixture
  once. Assertions remain enabled; these failures were not ignored or retried
  automatically into a green result. Application code was unchanged by these
  test-helper fixes.
- Local validation: 19 Node harness/source/fixture checks passed, with the Swift
  runner skipped on Windows. Project generation includes all three new sources
  byte-for-byte; scoped whitespace checks passed.
- Downloaded reports are retained locally under
  `artifacts/ios-native-evidence-42343322052/` and
  `artifacts/ios-native-evidence-42341137558/`; the two failed runs have separate
  evidence directories. GitHub artifacts have limited retention. The reports
  record `unsigned: true` and `uploaded: false`; no production/local server,
  signing key or TestFlight deployment was used.

Remaining acceptance gates before release:
isolated two-account ejabberd send/receive including offline and rejection cases;
real-device Home/lock/rapid-return/network-loss tests while writes are in flight;
VoiceOver, Dynamic Type and rotation/keyboard checks. Verify that return preserves
drafts, never resends uncertain text and never exposes another account's messages.

References: [RFC 6121 direct messaging](https://www.rfc-editor.org/rfc/rfc6121.html#section-5),
[Apple finite background tasks](https://developer.apple.com/documentation/uikit/extending-your-app-s-background-execution-time),
and [Apple VoIP notification handling](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit).

## Incoming-call lifecycle foundation (unsigned validation passed)

This isolated step adds `NativeIncomingCall.swift` and ten Swift unit tests.
It does **not** yet connect PushKit, CallKit, media, registration or the UI. The
successful chat runs above predate this change; the separate run below validates
this new source. No APNs entitlement, secret, backend change or TestFlight upload
is part of this step.

Local validation on 2026-11-07: 20 Node/source/fixture checks passed; one Swift
runner check was skipped because Windows has no macOS Swift test environment.

Unsigned GitHub validation on 2026-11-07:
[run 42358499938](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42358499938)
passed at revision `a827872212d98303521bc19a527e2dc34fc14e2f`.

- Swift: 77 passed, including all ten new incoming-call lifecycle tests; 14
  opt-in network integration tests skipped; no failures. This run does not
  establish live call or server interoperability.
- UI regression tests: six passed on iPhone 16 Pro and six on iPad Pro 11-inch
  (M4), both iOS Simulator 18.5, including portrait/landscape checks; no failures
  or skips. These exercise the existing native UI/chat, not a new call UI.
- Unsigned device Release compilation passed and the Debug login fixture was
  confirmed excluded. No signing, push activation or TestFlight upload occurred.
- Downloaded evidence is retained locally under
  `artifacts/ios-native-evidence-42358499938/ios-native-check-1794042602646/reports/`.
  The lifecycle remains unit-tested groundwork; physical-device background
  calls and APNs/CallKit/media integration still require the gates below.

- Decode the existing incoming-call JSON contract with typed booleans, UUID,
  bounded session identifier, four media profiles and a maximum 60-second
  invitation lifetime; payloads are limited to 4 KiB.
- Consent/account context and a per-registration generation are required before
  admitting an invitation. Reconfiguration/logout invalidate previous handles.
  The future authenticated registration layer must establish that context;
  this local state machine is not push authentication or token storage.
- One admitted call at a time, explicit reporting/ringing/answering/connected
  phases, a maximum 15-second answer deadline and bounded replay suppression.
  Old completion callbacks cannot end or revive another call. Expiry processing
  must be scheduled by the future adapter; this value type starts no timer.
- Total Conversation cannot be marked connected with audio alone or without a
  ready RTT channel. Negotiated profile and the full unique set of ready media
  must match the invitation. Audio-only calls remain supported.
- New Swift tests cover malformed/expired payloads, consent, registration/account
  changes, report failure, duplicate calls, exact media readiness and deadlines.
  Node checks verify project inclusion and compatibility with the existing media
  profile definitions, but do not execute Swift behavior on Windows.

Historical integration gates for the lifecycle-only step: implement a CallKit adapter that reports incoming VoIP pushes
promptly, maps lifecycle endings to system calls, and completes each pending
answer once; wire authenticated registration/revocation and secure call-control
credentials; connect native Jingle/WebRTC/RTT before fulfilling an answer. A
rejected payload here does **not** authorize silently dropping a PushKit callback:
the adapter must follow Apple's CallKit reporting requirements, including stale
or invalid incoming-call handling. No arbitrary chat messages may use VoIP pushes.
Then validate real APNs delivery and calls on locked physical devices.

Reference: [Apple's VoIP push handling requirements](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit).

## CallKit, PushKit and media adapters (unsigned validation passed)

The next isolated step connects the lifecycle to actual Apple framework adapters
and the existing pinned WebRTC/T.140 implementation. It does **not** turn on live
background calls. The SwiftUI login screen does not construct this runtime yet;
`NativeCallRuntime(negotiation:)` requires an authenticated Jingle/media provider.
There is deliberately no fake provider that declares a call connected.

- `NativeCallCoordinator` reports pushes before starting media, handles exactly-once
  push/answer completions, expires ringing/answering calls, and cancels stale work
  after logout or a new registration. Rejected or duplicate pushes are reported
  with a separate UUID and ended, never ending an existing call by mistake.
- `NativeCallPlatform` forwards PushKit callbacks to CallKit, including invalid
  invitations; routes answer/end/mute/reset and audio activation to the coordinator;
  and gates registration on consent and an explicit build flag. Tokens are handed
  to a supplied registration callback, never printed or stored in defaults.
  Disable/logout requires authenticated server revocation confirmation before
  another account can register within this runtime.
- `NativeWebRTCCallMedia` creates the existing negotiated T.140 channel before
  accepting the peer negotiation. It waits for connected ICE/DTLS peer state,
  live negotiated audio/video tracks and an open RTT channel as requested. It
  keeps WebRTC audio manual until CallKit activation, supports system mute, and
  closes peer/channel and the signaling/capture owner on end. A disconnected
  connected peer gets a bounded ten-second recovery window.
- The generated unsigned project includes WebRTC at the same fixed revision as
  the existing native media experiments, plus unchanged copies of
  `NativeT140Session.swift` and `NativeWebRTCChannel.swift`. No new vendor or
  floating dependency is introduced. SwiftPM verifies the binary package checksum.
- Twelve coordinator tests use fake system/media ports and a controllable clock.
  These test ordering, invalid/duplicate pushes, delayed completion, TC readiness,
  timeouts, logout, mute and stale callbacks. They do not prove APNs delivery,
  CallKit system UI or live audio/video on physical devices.

The `NativePeerNegotiating` contract must be implemented by the native authenticated
Jingle layer: bind the verified remote peer, SID and call ID to the handle; obtain
microphone/camera permission before capture; create and retain the peer/delegate
and capture owner in `prepare`; forward peer/track changes on the main actor;
negotiate only after the RTT channel is attached; return the exact negotiated
profile from `accept`; and stop capture/signaling in `close`. Readiness does not
wait for CallKit audio activation, which follows successful answer fulfillment.
Remote termination must be routed using the matching current call handle.

Remaining release gates: implement that live Jingle provider and authenticated
token registration/revocation, persist a revocation-safe account/control context
in Keychain, restore it during cold launch before registering PushKit, and attach
the runtime to the native app login/logout lifecycle. Add microphone/camera usage
descriptions, signed APNs entitlement and appropriate background capabilities only
for an explicitly authorized signed build. The APNs topic/key scope must match
that build's bundle identity; the separate `.nativepreview` identifier is not the
existing production topic. Current Info.plist has none of these
and no `TeleTypTelNativeCallPushEnabled` flag, so `enable` refuses activation.
No APNs key, server setting, existing TestFlight target or production UI is changed.

Validation on 2026-11-07:

- Local Node/source/fixture checks: 21 passed, one macOS Swift runner skipped on
  Windows. Source checks are not Apple-framework runtime tests.
- [Unsigned run 42360587888](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42360587888)
  passed at revision `c8de38fa31c75ae58ca11f4d0605d48a8415669e`.
  Swift: 89 passed, including all twelve coordinator tests; 14 opt-in network
  tests skipped; no failures. Device Release compilation with Apple frameworks
  and pinned WebRTC passed, and the Debug fixture was excluded.
- Existing UI/chat regression tests: six passed on iPhone 16 Pro and six on iPad
  Pro 11-inch (M4), both Simulator 18.5, with no skips or failures. These are not
  real CallKit UI, camera, APNs delivery or background-call acceptance tests.
- The initial run `42360391265` passed the Swift tests but failed device compilation
  on two WebRTC audio category/mode argument types. The API takes typed Apple
  values, not raw strings; the correction is included in the successful revision.
- Evidence is retained locally under
  `artifacts/ios-native-evidence-42360587888/ios-native-check-1794044365489/reports/`.
  No TestFlight upload, live push registration, keys or server changes were used.

References: [Apple CallKit lifecycle](https://developer.apple.com/documentation/callkit/making-and-receiving-voip-calls),
[Apple PushKit reporting](https://developer.apple.com/documentation/pushkit/responding-to-voip-notifications-from-pushkit),
[WebRTC audio activation API](https://webrtc.googlesource.com/src/+/refs/heads/main/sdk/objc/components/audio/RTCAudioSession.h).

## Contact presence step (runtime validation pending)

Historical preparation notes below predate the chat validation above. The
current unsigned run now also passes the presence unit tests and fictional UI
status checks. Real-device and multi-resource interoperability remain untested.

The next step adds XMPP contact availability to the read-only native list.
Initially prepared locally only, this step was subsequently approved for GitHub
publication on 2026-11-07. The publication commit skips automatic CI; no GitHub
tests, TestFlight upload or live server changes are part of this publication.

- Each contact starts with "Status onbekend", not an assumed offline status.
  Available, away, extended-away, do-not-disturb and explicit unavailable presence
  are displayed as text, not color alone. These are server-reported indications,
  not delivery/read receipts or a guarantee that a person can answer.
- Only contacts in a loaded roster with subscription `to` or `both` are updated.
  Unknown contacts, subscription requests, errors, malformed show values and
  presence addressed to another account/resource do not update availability.
- Resource availability is tracked separately: one device disconnecting does not
  hide another connected device. Bare-JID unavailable clears all resources.
  Aggregation prefers online, then away, extended-away and busy; this is a UI
  policy, not message routing. Presence priority is not used for routing here.
- Renaming preserves availability. Subscription revocation, removal, account
  switch, disconnect and background suspension discard it. Existing generation
  checks reject late callbacks from old sessions.
- Up to 64 resources per contact are retained. Overflow reports unknown until
  bare-JID unavailable, subscription reset, removal or a new session; it never
  converts incomplete resource knowledge into an offline claim. Presence before
  the first roster snapshot is ignored, not buffered. Directed presence from
  non-subscribed contacts, status messages and presence publishing controls are
  outside this step. JID normalization remains subject to the roster limitations.

Reference: [RFC 6121, presence](https://www.rfc-editor.org/rfc/rfc6121.html#section-4).
Eight new presence unit tests and a session-routing test are prepared; existing
model tests now include online contacts when checking lifecycle cleanup. The UI
fixture checks the textual online status before and after rotation. The existing
real-server roster test permits asynchronous presence changes but does **not**
test resource availability transitions. macOS Swift compilation, simulator tests,
real-server presence transitions and physical iPhone/iPad tests remain pending.
Earlier passing runs below do not validate this presence implementation.

Local validation on 2026-11-07: the three Node suites
`ios-native-foundation.test.js`, `ios-native-ejabberd.test.js` and
`native-login-http-fixture.test.js` passed 17 checks, with the macOS Swift test
skipped on Windows. Project generation includes the updated roster source
unchanged; scoped `git diff --check` also passed. These are harness/source and
fixture checks, not execution of the new Swift presence tests or live ejabberd.

## Authenticated XMPP foundation

### Read-only native contacts (2026-11-07)

The isolated native target now requests the XMPP roster after resource binding.
It shows contact names, bare JIDs and roster categories, with distinct loading,
empty and unavailable states. Categories are **not MUC chat rooms**. Contact
editing, phone address-book access and avatars are not implemented in that step.
Presence and opening direct chats are subsequent changes described above.

Roster results are correlated with the pending request. Pushes accept only an
absent sender or the authenticated account's bare JID, require one valid item,
and acknowledge accepted updates. Logout, account change, background suspension
and connection failure clear the list and invalidate previous callbacks. A
ten-second roster timeout shows unavailable without declaring XMPP disconnected.
Retry currently requires disconnecting and signing in again.

This bounded preview supports up to 100 contacts and 16 categories per contact;
the existing 64-KiB / 128-element XML-frame limits also apply. Oversize or invalid
data is rejected, never silently truncated. Exceeding the shared XML-frame limit
closes the session; exceeding roster-specific limits reports unavailable or an
IQ error. Pushes before a valid initial snapshot are rejected, not buffered.
Roster versioning, full JID normalization and extension-element interoperability
remain future work; this is not a full RFC 6121 conformance claim.

Unit tests cover correlation, spoofed senders, updates/removals, malformed data,
limits, timeout and stale account callbacks. The existing isolated HTTPS/XMPP
integration scenario now also checks a seeded fictional roster contact and
clearing on logout. The five-case UI suite now verifies a fictional contact in
portrait and landscape-left, and its disappearance on logout. The runtime
results for this step are recorded below, separately from earlier-stage evidence.

Protocol reference: [RFC 6121, roster management](https://www.rfc-editor.org/rfc/rfc6121.html#section-2).
The disposable loopback-only ejabberd fixture enables `mod_roster` and
`mod_admin_extra` and seeds a fictional entry through
[add_rosteritem](https://docs.ejabberd.im/developer/ejabberd-api/admin-api/#add_rosteritem).
No live server, user contacts, signing keys or TestFlight uploads are involved.

#### Roster validation evidence

[Isolated ejabberd run 42316644793](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42316644793)
passed on revision `53940c9`: seven real-transport tests and seven native
HTTPS-account-contract/XMPP tests, including the fictional roster entry and
clearing it on disconnect. A separate post-cleanup certificate rejection test
also passed. All sessions were released, the temporary CA was denied and removed,
and cleanup completed. This is ejabberd 26.09 plus a controlled HTTPS fixture,
**not the production PHP account API or a physical iPhone/iPad test**.

The first preview run
[42316644486](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42316644486)
passed 43 Swift unit tests and unsigned Release compilation, but failed two of
five iPhone UI tests: contact identification and locating the failure status.
The parent contact-container identifier was removed so it does not interfere
with per-contact identifiers; the UI helper now reveals status before checking
its text. The next run
[42317874080](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42317874080)
passed four of five iPhone UI tests. Its saved accessibility hierarchy confirms
the contact and connected status were present, but the helper scrolled downward
while the status was below the landscape viewport. Revision `09ef2c3` chooses
scroll direction from element and viewport geometry instead of a fixed direction.
Neither failed run reached the iPad suite; their failures must not be described
as a successful iPhone/iPad regression. The protocol/model code is unchanged
since the passing ejabberd run.

The final [preview run 42319989504](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42319989504)
passed on revision `09ef2c3`: 43 Swift unit tests, unsigned device Release
compilation and release-fixture exclusion. All five UI tests passed on iPhone
16 Pro and all five on iPad Pro 11-inch (M4), both with iOS 18.5 simulators,
including portrait and landscape-left. There were no UI failures or skips.
The 14 opt-in network tests were skipped in this preview run; their separate
passing ejabberd evidence is recorded above. Reports confirm `unsigned: true`
and `uploaded: false`. Physical-device validation remains pending; the working
TestFlight application and existing servers are unchanged.

Evidence is saved locally under `artifacts/ios-native-evidence-42316644793/`,
`artifacts/ios-native-evidence-42316644486/` and
`artifacts/ios-native-evidence-42317874080/`, with the final passing preview under
`artifacts/ios-native-evidence-42319989504/`. No test timeout was increased and no
assertion was removed to address these UI failures.

Added and published after the first-stage validation:

- `NativeAccountClient` performs a bounded HTTPS POST to the configured origin's
  existing `/api/account.php` login action, using normal system TLS and refusing
  redirects. It does not contact a production endpoint automatically.
- Only a successful account response with credentials for the configured XMPP
  domain produces the account value used by `NativeXMPPConnection`. An account
  rejection or `twoFactorRequired` never falls through to direct XMPP login.
  **The 2FA entry/verification flow is still pending**; accounts requiring it
  currently stop with a typed error. Google/Facebook/Apple login is also pending.
- Native RFC 7395 WebSocket framing, TLS-only SASL PLAIN (matching the current web
  client), stream restart and RFC 6120 resource binding. No custom cryptography,
  unencrypted fallback or implicit SASL mechanism downgrade. Servers without
  PLAIN stop with `unsupportedAuthentication`; SCRAM support is not implemented.
- The session reports connected only after a matching bind response, validation
  of the returned full JID and successful sending of initial presence. A reachable
  endpoint or HTTP login alone is never reported as an authenticated XMPP session.
- Foreground XEP-0199 heartbeat every 25 seconds with a ten-second response
  deadline. Matching IQ results or errors from the server count as responses;
  unrelated traffic and responses from other contacts do not keep it alive.
- Serialized connection state, bounded XML/messages, ten-second handshake
  deadline, cancellation and terminal cleanup. No credential persistence or
  authentication-frame logging; account debug descriptions are redacted.
- Account HTTP requests deliberately retain no cookies. This is not persistent
  backend session support and does not enable authenticated profile/history APIs.
  Backend login can create its usual expiring server session; this target does not
  retain that session cookie. Persistent backend sessions and explicit server
  logout remain pending, without bypassing 2FA. The preview button deliberately
  says "Verbinding verbreken": it closes native XMPP, not other backend sessions.

At this foundation revision the connection supplied readiness/loss detection only,
not a chat API. Roster, presence and direct-chat/foreground-return handling were
added subsequently as described above. Receipts, MUC, XEP-0198 resume and background
incoming calls are still not delivered by this preview. No existing TestFlight
screen or server has been changed. The native UI adapter added next cancels old
tasks and rejects old-generation callbacks before starting a new connection.

New Swift fixtures cover authentication order/encoding, failed authentication,
binding identity/correlation, ping correlation/spoofed responses, XML bounds,
2FA fail-closed behavior and pre-start cancellation. These are protocol fixtures,
not live ejabberd evidence. This stage was validated on 2026-11-06 at revision
`ca4c250517c52c7796ef27b2be9b19420ff6ee51` in
[unsigned native run 42291914885](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42291914885):

- Four Node source/project guardrails passed locally and on macOS.
- All 23 Swift unit tests passed, including the 11 new account/session fixtures.
- Unsigned iOS device Release compilation passed with Xcode 26.3.
- Two startup UI tests passed on iPhone 16 Pro simulator and two on iPad Pro
  11-inch (M4), covering portrait and landscapeLeft. These tests exercise the
  existing startup form, not authenticated login UI or a real ejabberd session.
- Evidence reports `unsigned: true`, `uploaded: false`; no TestFlight upload,
  signing keys or server changes were involved.

Local evidence:
`artifacts/ios-native-evidence-42291914885/ios-native-check-1793998355272/reports/`.
At that revision, real-server login/TLS/heartbeat interoperability and 2FA
completion remained unverified or unimplemented. This run predates the UI adapter
and the isolated transport evidence below.

## Native login UI adapter (published and unsigned-tested)

- After checking the entered HTTPS origin/domain, the form offers an explicitly
  labelled XMPP account field and a native `SecureField`. No autofocus, credential
  persistence, cold-start automatic login or production server defaults are introduced.
- Pressing login clears the password field, rechecks server availability, invokes
  the account API and only then starts XMPP. The existing single status panel
  distinguishes checking, account verification, XMPP negotiation and connected.
- The API account must match the requested JID and configuration; the connected
  callback must match that same account. Cancellation, account/server edits and
  connection loss invalidate the generation so stale callbacks cannot restore
  an online status or start the next step of an obsolete login.
- The connection can be explicitly cancelled or disconnected. At this adapter
  revision backgrounding stopped the connection and required manual re-login.
  The later bounded background/foreground-return step above supersedes that
  behavior. Neither implementation is background-call support.
- A 2FA challenge remains fail-closed and explains how to use the existing app;
  it never suggests disabling 2FA. Calls remain pending; the later contact list
  and direct-chat implementation are documented above.
- Nine new model tests use injected probe/account/connection actors. Three new
  UI scenarios cover simulated login/disconnect across rotation, a 2FA challenge
  and connection loss, in addition to the two original startup UI tests.
- UI simulations require an explicit Debug-only launch environment and show
  `TESTSCENARIO — geen echte serververbinding`. They use only `.invalid` and
  fictitious credentials, never a network service. Release compilation excludes
  the fixture implementation; the check script also rejects its environment
  marker or fixture password in the Release executable.

Verified on 2026-11-06 at revision
`972473ebf0a2a222abce11dc063577467ac1934d` in
[unsigned native run 42296708099](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42296708099):

- Five Node source/project checks passed locally and on macOS.
- All 32 Swift tests passed, including nine native login lifecycle tests.
- Unsigned iOS device Release compilation passed with Xcode 26.3. The Release
  binary check found neither the fixture launch marker nor the fixture password.
- All five UI tests passed on iPhone 16 Pro and all five passed on iPad Pro
  11-inch (M4), including login/disconnect with rotation, fail-closed 2FA and
  visible connection loss without automatic re-login. No failures were recorded.
- Report records `unsigned: true`, `uploaded: false` and
  `releaseFixtureExcluded: true`. No TestFlight or server changes were made.

Evidence is stored locally under
`artifacts/ios-native-evidence-42296708099/ios-native-check-1794000412641/reports/`.
These login UI tests use injected fixtures, not real accounts. The isolated
transport evidence below separately exercises ejabberd authentication. End-to-end
account API login, real-device accessibility checks and the remaining migration
stages still require verification.

References: [RFC 7395](https://www.rfc-editor.org/rfc/rfc7395),
[RFC 6120](https://www.rfc-editor.org/rfc/rfc6120),
[SASL PLAIN / RFC 4616](https://www.rfc-editor.org/rfc/rfc4616),
[XEP-0199](https://xmpp.org/extensions/xep-0199.html).

## Build and tests

Windows can prepare and inspect the independent project:

```powershell
node --test tests/ios-native-foundation.test.js
node scripts/prepare-ios-native.js ios-native-manual-1
```

The generator writes only a new directory under `artifacts/ios-native-*`, refuses
overwrites and copies an explicit source/resource allowlist. It does not modify
`ios/App`, TestFlight staging, existing release workflows or server settings.
Open the generated `TeleTypTelNative.xcodeproj` on a Mac. The preview minimum is
iOS/iPadOS 16; the existing app's deployment target is unchanged.

On macOS with Xcode and available iPhone and iPad simulators:

```sh
node scripts/check-ios-native.js
```

This runs Swift unit tests, unsigned iOS device compilation and simulator UI tests
for both device families. UI tests use invalid configuration and Debug-only
injected fixtures, never real accounts or a server. Test results are written under the generated `reports`
directory; missing device families fail instead of being silently skipped.
The separate `ios-native-preview.yml` workflow runs on scoped native changes on
the development branch, or by manual dispatch. It has no secrets, signing,
TestFlight job or production deployment. Publishing/running it needs permission.

Verified on 2026-11-06 for code revision
`12358ea96ed7c363f6425f057be77c2016ed92db` in
[unsigned native run 42287643817](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42287643817):

- Three Node project/source guardrails passed, locally and on macOS.
- Twelve Swift unit tests passed on macOS, with zero failures.
- Standalone native iOS device Release compilation passed without signing.
- Two UI tests passed on iPhone 16 Pro simulator and the same two passed on
  iPad Pro 11-inch (M4) simulator, with zero failures. They cover initial keyboard
  absence, configuration retained through portrait/landscape rotation and an
  inline invalid-address error rather than a separate alert.
- Report explicitly records `unsigned: true` and `uploaded: false`.

Evidence was downloaded to
`artifacts/ios-native-evidence-42287643817/ios-native-check-1793996530363/reports/`.
That initial run did not verify live TLS/XMPP probe interoperability. See the
later isolated transport evidence below. Physical-device accessibility and the
remaining native app features are still unverified. Unit/source checks are not
proof of complete protocol interoperability or accessibility conformance.

## Migration inventory and acceptance gates

### Real-ejabberd transport tests (passed, including cleanup verification)

The next interoperability gate is now implemented separately in
`scripts/check-ios-native-ejabberd.js` and `NativeXMPPIntegrationTests`.
The ordinary Swift suite skips these seven network tests unless the isolated
fixture explicitly enables them. A skipped network test is not a passed network
test. No application or production TLS handling is changed by this addition.

The separate `ios-native-ejabberd.yml` workflow installs Homebrew ejabberd on an
ephemeral GitHub-hosted macOS runner. It starts its own named instance with a
temporary database, random fictional account, one loopback-only WSS listener,
and no federation, HTTP administration or public account registration. It records
the installed ejabberd version rather than claiming an exact match to the local
Docker server. Homebrew dependency versions are not pinned in this initial test.

Seven tests exercise the actual Apple networking implementation, not injected
XMPP responses: reachability; SASL/bind and a session surviving the heartbeat
deadline before cancellation; wrong-password rejection; untrusted TLS rejection
by the probe and authenticated transport; hostname mismatch; pre-start
cancellation. The harness also checks that ejabberd has no remaining connected
users after the tests. No test message is sent to an existing user.

Only on that disposable runner, a generated two-day test CA is temporarily
trusted by macOS. A separate loopback Node TLS listener uses a certificate that
is deliberately not trusted; it does not simulate XMPP or account acceptance.
Keeping this listener separate prevents ejabberd's global certificate selection
from sharing the trusted localhost certificate with the negative test.
Cleanup explicitly denies trust for this generated CA, removes its certificate,
and starts a fresh Swift process to verify that the formerly trusted WSS endpoint
now fails with a certificate error (not merely a stopped-server error). It then
stops the owned listeners and deletes the temporary database, credentials and
private keys. This replaces the hanging full administrator trust-settings import.
It does not change authorization policies or other certificates. A deny-only
record remains until disposal of the hosted VM; this is reported explicitly and
is not restoration of the original trust settings. This lifecycle is validated
by the successful hosted run below, not intended for persistent machines.
Cleanup errors fail the run. Forced runner termination relies on disposal of
the hosted VM. The harness refuses Windows, local Macs and self-hosted runners;
it must not be adapted to bypass application certificate checks.

Scoped publication starts this unsigned test workflow; manual dispatch is also
available. It has no deployment/signing secrets or upload-to-store step. Only
sanitized reports under `artifacts/ios-native-ejabberd-*/reports/` are collected;
the temporary server directory is never uploaded. The existing unsigned iOS
preview workflow separately compiles the new Swift test target and retains its
iPhone/iPad UI regression checks.

Published and executed with explicit permission on 2026-11-06:

- [Run 42304267061](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42304267061),
  revision `d2b50b5`, is **successful**. All seven transport tests passed against
  ejabberd 26.09, with zero failures and no skips. After CA trust was explicitly
  denied and its certificate removed, a fresh Swift process repeated the probe
  against the still-running endpoint and correctly rejected its certificate.
  The additional one-test revocation phase passed. The report records
  `passed`, `sessionsReleased`, `caTrustDenied`, `caCertificateRemoved`,
  `caTrustRevocationVerified` and `cleanupCompleted` as true. The residual deny
  record and reliance on disposable VM teardown remain explicitly reported.
  Downloaded evidence: `artifacts/ios-native-evidence-42304267061/`.
- [Unsigned preview run 42304266979](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42304266979)
  at the same revision `d2b50b5` also succeeded: 32 Swift unit tests passed,
  seven opt-in network tests were skipped in this separate suite, unsigned iOS
  Release compilation passed, and all ten simulator UI tests passed (five each
  on iPhone 16 Pro and iPad Pro 11-inch M4, portrait and landscapeLeft). The
  Release fixture-exclusion check passed. Reports record `unsigned: true` and
  `uploaded: false`. Evidence: `artifacts/ios-native-evidence-42304266979/`.
- [Run 42302927918](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42302927918),
  revision `0d9aa6d`, ran all seven integration tests against ejabberd 26.09 with
  zero failures and no skips. Trusted WSS availability, SASL authentication,
  resource binding, heartbeat and cancellation passed; wrong passwords,
  untrusted certificates and hostname mismatches were rejected as expected.
- The heartbeat session remained connected for 40 seconds and ejabberd reported
  no connected users after cancellation. This is short-run transport evidence,
  not a stability soak test or complete XMPP interoperability certification.
- **That earlier workflow failed:** restoring the runner's
  previous administrator trust settings times out. The temporary certificate
  itself was removed successfully, but `cleanupCompleted` remains false. The
  workflow deliberately failed rather than hiding the cleanup error. The newer
  run replaces full trust restoration with targeted, verified CA denial as
  described above; it does not claim full restoration of the runner trust store.
  Only the disposable GitHub-hosted VM was affected; no local trust store or
  production server was accessed. VM disposal is the remaining cleanup boundary.
- Earlier run 42301960672 also passed all seven networking tests but failed
  certificate cleanup. The first run 42300479410 timed out before providing
  passing test evidence; its negative TLS fixture was subsequently separated
  from ejabberd's global certificate selection.
- [Unsigned preview run 42300479292](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42300479292)
  at revision `0749a96` passed 32 Swift unit tests, unsigned device Release
  compilation and ten simulator UI tests (five on iPhone and five on iPad,
  including rotation). Its seven opt-in network tests were skipped as intended,
  not counted as passes. Later commits changed only the test harness and docs.

Downloaded evidence is under `artifacts/ios-native-evidence-42302927918/` and
`artifacts/ios-native-evidence-42300479292/`. Reports contain no signing keys or
fictional account passwords. No TestFlight upload occurred.

These macOS transport tests do not test the PHP account API, production WAMP
routing/certificates, a physical iPhone/iPad, messaging or TC. The test account
is constructed inside the test target only; the application continues to require
its HTTP account gate. Next gates are end-to-end account authentication and
device testing, followed by native messaging parity.

### Native HTTPS account-contract to XMPP chain (hosted-tested)

`NativeLoginIntegrationTests` adds seven opt-in tests using the actual
`NativeLoginModel`, `NativeAccountClient`, reachability probe and XMPP transport,
without injected Swift network doubles. A separate loopback HTTPS fixture exposes
the account JSON contract and proxies WebSocket upgrades to the disposable real
ejabberd. Both TLS legs validate certificates; the native client retains normal
system trust. Only the generated successful test account exists in ejabberd.

The new tests cover account HTTP acceptance followed by actual XMPP binding and
disconnect, HTTP credential rejection, a two-factor challenge even with account
fields present, an unexpected returned identity, a refused HTTP redirect, an
HTTP-accepted identity rejected by ejabberd, and cancellation during a delayed
HTTP response. Server-side counters require exactly one request for each case
and nine WebSocket upgrades: seven availability probes, one successful login and
one rejected XMPP login. Additional connections, followed redirects, unexpected
HTTP requests or proxy errors fail the harness.

**This is a client integration/HTTP contract test, not a real PHP/MySQL backend
test.** The fixture supplies controlled API responses and does not run
`php/public/api/account.php`. Evidence therefore keeps `accountAPITested: false`
and separately records `accountHTTPContractTested` only after the new assertions
pass. It does not verify backend session cookies, access control, 2FA completion,
OAuth, biometric login or any physical device. Ordinary Swift unit runs skip all
fourteen opt-in integration tests unless explicitly enabled by the hosted harness.

Local Node tests validate fixture scenarios, isolation and request checks.
[Isolated run 42308604385](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42308604385)
at revision `0996458` passed all seven native login-chain tests and all seven
existing transport tests against ejabberd 26.09. Each account scenario ran once;
the fixture recorded nine WebSocket upgrades, zero unexpected requests and zero
proxy errors. All authenticated sessions were released. The additional fresh
process certificate-revocation test passed, with temporary CA denial and
certificate removal verified. The deny-only trust record remains until the
disposable VM is discarded, as described above.

Sanitized evidence is under `artifacts/ios-native-evidence-42308604385/`.
The result records `accountHTTPContractTested: true`, `accountAPITested: false`,
`physicalDevicesTested: false`, `unsigned: true` and `uploaded: false`.
No production application code was changed for this step; the additional fixture
is not bundled in the native app. No local/production server was contacted and
no TestFlight upload occurred.

The companion [unsigned preview run 42308604255](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42308604255)
at the same revision is **not green**. Both attempts passed 32 Swift unit tests
(46 total, with 14 opt-in integration tests skipped), unsigned device Release
compilation and the check excluding UI fixture markers from the Release binary.
The first attempt failed the iPhone simulator test command; the second reached
its 900-second limit (`xcodebuild ETIMEDOUT`, `SIGTERM`). Neither produced a
completed iPhone UI suite, and iPad UI testing was not reached. This does not
establish whether the cause is simulator infrastructure or an application/UI-test
defect; the saved failure output does not identify the failing assertion.
Do not carry forward the earlier revision's green UI results as current evidence.
Downloaded artifacts are in `artifacts/ios-native-evidence-42308604255/` and
`artifacts/ios-native-evidence-42308604255-attempt2/`.

### Simulator diagnostics and subsequent passing run (2026-11-07)

Revision `1650777` changes only the test runner and its Node regression tests.
The runner now retains command stdout, stderr and exit/timeout metadata on
failure instead of losing XCTest assertion output. It also exports structured
test summaries and test trees from each available `.xcresult`, including after a
failed test command. Export errors are recorded separately and never replace
the original command failure. This uses Apple's
[xcresulttool test-results commands](https://developer.apple.com/documentation/xcode-release-notes/xcode-16_3-release-notes).
Four new local Node tests cover successful output, assertion failure, timeout
diagnostics and incomplete result-bundle exports.

[Unsigned preview run 42313158516](https://github.com/edwtie/Teletyptel-messenger/actions/runs/42313158516)
passed 32 Swift unit tests (14 opt-in network tests skipped), unsigned device
Release compilation, Release fixture-exclusion checks, and all ten UI tests:
five on iPhone 16 Pro and five on iPad Pro 11-inch (M4), both with iOS 18.5.
Portrait and landscape-left scenarios passed; both exported summaries report
zero failures and zero UI-test skips. Evidence is downloaded under
`artifacts/ios-native-evidence-42313158516/`.

The earlier simulator failure was not reproduced in this run. Neither app code,
UI-test assertions nor command timeouts were changed, so this is **not proof of
a root-cause fix** or of consistently reliable simulator runs. Preserve the
earlier failed evidence; use the new diagnostics if it recurs. This run confirms
the current unsigned preview regression suite, not real-device or complete app
feature parity. No TestFlight upload, signing credentials or production server
changes were involved.

Setup references: [ejabberd Homebrew installation](https://docs.ejabberd.im/admin/install/homebrew/)
and [ejabberd listener options](https://docs.ejabberd.im/admin/configuration/listen-options/).
Certificate lifecycle uses Apple's documented `add-trusted-cert -r deny` and
`delete-certificate -Z` commands, without changing authorization policies:
[Apple security tool manual](https://github.com/apple-oss-distributions/Security/blob/main/SecurityTool/macOS/security.1).

| Stage | Existing behavior/source to preserve | Native work and acceptance gate |
| --- | --- | --- |
| 1. Startup | `scripts/ios-testflight/LanViewController.swift`, `ServerBridge.swift`, `php/public/xmpp-availability.js` | This isolated foundation; pass Swift and iPhone/iPad UI tests, verify real trusted/untrusted TLS and offline cancellation. |
| 2. Account/session | `php/public/api/account.php`, native Google/Facebook plugins, `BiometricSession.swift` | Extract SDK integration from Capacitor; native login, 2FA, opt-in Keychain/Face ID, account recovery and logout. Never equate HTTP login with XMPP readiness. Cancellation and account switching must invalidate pending callbacks and old credentials. |
| 3. Messaging | `php/public/chat-client.js`, history/group APIs, current XMPP tests | Authenticated native XMPP session, roster/presence, reconnect/resume, receipts, MAM/history and MUC. Per-conversation drafts, no duplicate sends on reconnect; two independent real accounts tested. |
| 4. Native interface | `chat.html`, `mobile-navigation.js`, `chat-tablet.css`, dialer | Native contact/chat split navigation on iPad and navigation stack on iPhone, optional sidebar, symbols with accessible labels, normal number pad, safe-area/rotation/keyboard regression tests. Preserve drafts and scroll position. |
| 5. Total Conversation | `CallMediaProfile.swift`, `NativeT140Session.swift`, `NativeWebRTCChannel.swift`, `NativeJingleRtt.swift`, JS Jingle session/media code | Reuse audited logic without duplicating the protocol implementation. Add authenticated Jingle session adapter, native audio/video capture/rendering and TC RTT views. Bind every event to account, peer and call SID; no silent media downgrade or previous-call text leakage. Test audio, video, audio+RTT and TC independently. |
| 6. Background incoming calls | `VoipCallPlugin.swift`, `NativeCallControl.swift`, push endpoints | Extract CallKit/PushKit engine from plugin, integrate audio activation, cancellation and actual media-ready completion. APNs and locked-screen calls require authorized server work and physical iPhone tests; not solved by this startup target. |
| 7. Remaining parity | translation, interpreter, uploads, contacts, settings | Private opt-in translation of own/remote chat and RTT; no same-language translation or translation after opt-out. Consent-based address book, file/photo sending, staff/interpreter permissions and actual three-party media. External SIP/interpreter/112 connections remain separately gated. |
| 8. Release migration | current TestFlight workflow and production bundle | Only replace existing app after feature parity, migration/rollback tests and physical iPhone/iPad approval. Existing identities/sessions must not be copied into this unsigned preview. Separate permission for signing and TestFlight. |

## Camera-off RTT layout (2026-11-15)

Native TC now gives the two RTT panes the available call area only when both
local and remote cameras are known to be off and no interpreter session/video
needs to remain visible. Portrait stacks the panes; landscape places them next
to each other. Both panes expand and scroll independently. Incoming text follows
the latest update; the local editor has no five-line cap in the expanded layout.
Re-enabling video restores the video layout without replacing the call, clearing
RTT text, sending a chat message or changing the negotiated media profile.

Remote video state comes from authenticated, exact-session
[XEP-0167 mute/unmute information](https://xmpp.org/extensions/xep-0167.html#info-mute),
not black pixels, lost packets or a missing first frame. Native peers now send
their camera state after negotiation and subsequent changes, including background
camera suspension. Sender role and negotiated RTP content names are checked;
an audio mute never hides video or mutes RTT. An unknown/legacy peer state or
an active interpreter conservatively keeps video space visible. This does not
implement interpreter camera-state signaling or establish physical-device results.

Evidence at `f29b43b`: the
[unsigned SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43729271123)
passed 209 selected Swift tests, native RTT tests and iOS compilation in both jobs.
The [focused TC simulator matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43729273852)
passed both UI cases on iPhone 16 Pro and iPad Pro 11-inch (M4), including portrait,
landscape, expanded pane bounds, accessible pane/scroll identifiers, no startup
keyboard, control reachability and the on/unknown camera guard. Screenshots were
visually inspected. These use fictional media state, not real remote cameras,
an interpreter call or a signed TestFlight installation; those remain device tests.

## Warm-memory CallKit answer integration (2026-11-15)

`NativeCallController` now routes CallKit answering through `NativeCallMediaGate`
and `NativeWarmCallSession`, not just an isolated recovery helper. It uses an
already authenticated RAM-only lease and separate call-focused XMPP connection;
main chat stays suspended. Logout or switching accounts invalidates the lease.
This is not limited-purpose server credentials and does not recover a terminated
process. Registry consent/device generation and authoritative full caller/recipient
JIDs are checked before proceed. A fresh Jingle offer must reach the real native
incoming negotiator before capture starts. HTTP reservation alone cannot fulfill
the CallKit answer; actual media/ICE/RTT readiness still governs it.

The microphone requires actual CallKit audio activation. Camera capture remains
paused in background; previously granted permissions are required without hidden
prompts. Decline, cancellation, account revocation and failed recovery tear down
the dedicated connection and attempt authenticated call cleanup. No APNs flag,
server capability, provisioning or TestFlight upload is enabled by this increment.
Cold-launch bootstrap, the remaining server lifecycle work and signed physical-device
background tests are still release gates. See `services/call-push/README.md`.

## Native call-intent routing and privacy acknowledgement (2026-11-15)

For supported local accounts the call buttons now propose to a bare recipient
using the bounded XEP-0353 transport. A verified proceed selects one full resource;
only then does the real outgoing Jingle negotiator bind and the media gate permit
capture. Incoming foreground proposals report to CallKit before answering;
answering binds the exact caller/SID, sends proceed and requires a fresh matching
Jingle offer before installing the real incoming negotiator. The requested
audio/video/RTT profile and selected audio/video codecs are preserved. Actual
ICE, negotiated contents and RTT readiness still determine connected state.
The invitation window is bounded to 45 seconds, followed by a separate media
deadline; cancellation and changed login generations cannot revive an old call.
The explicit private Asterisk echo route remains a separately validated full-JID
gateway route, limited to extension 600; it is not converted into a bare proposal.

Native block/mute/DND preferences now feed an independently correlated, bounded
server-policy IQ. Calls wait for acknowledgement; coalesced privacy changes stay
closed until the latest value is acknowledged. More than 256 combined local
blocked/muted peers disables the policy instead of silently truncating it.
An initial explicit unsupported response allows the existing online/full-resource
foreground route. Timeout, rejection or failure after a successful policy exchange
does not downgrade. Foreign-domain foreground calls retain the legacy route only
when policy is usable. Queued proposals are age-limited and removed on retraction.
Live ejabberd messages can carry a legacy `urn:xmpp:mam:tmp` archive marker. An
empty, bounded marker belonging to the recipient does not mean archive replay and
is accepted. Actual MAM wrappers, delay elements, carbons and foreign/malformed
markers remain excluded from live call initiation.

Push-consenting devices continue to wait for the authoritative APNs/registry UUID
rather than creating a competing foreground call identity. This does not enable
push: the server capability, native flag, provisioning and deployment remain off.
The implementation is a local-domain subset, not full XEP-0353 interoperability:
archive catch-up, carbon-based multi-device ring cancellation and simultaneous-call
tie breaking still need explicit implementation and interoperability coverage.

No ordinary account password, general web session or biometric bypass is added to
background-accessible storage. A terminated app still needs CallKit bootstrap and
a server-enforced, call/device/SID-limited authentication mechanism. The existing
status/end-only control credential must not become a general login credential.
The producer's pending-offer lease is not a complete accepted/active-call lifecycle.
These are software release blockers, not checks that can be replaced by an iPhone
test or a switch in configuration.

Validation of the production-source changes at `ed1b681`: the
[unsigned iPhone/iPad SDK matrix](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43735553134)
passed 227 selected Swift unit tests, native RTT tests and actual iOS SDK compilation
in each job. This mode does not run simulator UI, cameras or real device tests.
The [isolated signaling check](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43733882551)
passed 86 selected Swift recovery/policy/routing tests and the existing real
ejabberd-to-PHP journal/resource-proof checks. Neither run enabled live APNs.
The [actual Apple WSS interoperability run](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43735548931)
also passed the new two-account native propose/proceed/fresh-Jingle/finish test,
existing login, archive, group and invitation tests, session cleanup and temporary
CA revocation. Its unmodified ejabberd 26.09 fixture explicitly rejects the custom
policy IQ; the producer/journal checks are a separate fixture, not proof of a
single native-to-APNs-to-media chain. The real live-message archive marker found
in this test is covered by the new parser regression. No existing server, ordinary
user account, APNs credential or signed TestFlight build was used.

## Required evidence before replacing the existing app

- iPhone and iPad, portrait and landscape, Dynamic Type, VoiceOver, hardware
  keyboard, safe areas and no unwanted focus/keyboard at startup or after login.
- Real account authentication, logout/relogin, account switching, token expiry,
  disabled accounts and trustworthy certificate failures without bypasses.
- Two-device messaging, delivery vs read receipts, group chat, disconnect/recovery,
  upload failure and drafts preserved across navigation/rotation.
- TC simultaneous audio/video/RTT, camera switch, mute states, separate local and
  remote text, Unicode edits, translation consent, call replacement and third party.
- Background/locked-screen APNs/CallKit and network changes on actual hardware.
- Security and accessibility re-audit; no blanket standards/compliance claim.

## Native login presentation compared with 16.9 (2026-11-16)

The login screen now follows the existing web/16.9 arrangement: account and
password fields, password recovery, circular Google/Facebook marks, explicit
account-saving consent and bottom-anchored Sign in / New user / gear actions.
The actual brand SVG paths are reused from the existing web UI at build time;
there is no external asset request or generic person icon standing in for a
provider. An unavailable/unconfigured provider remains disabled.

Server address, XMPP domain, interface language and explanatory privacy/provider
details move to the separate gear sheet. Server edits are drafts: Cancel discards
them, Save validates and stores only the chosen non-secret address/domain. No
password or account identifier is added to UserDefaults. A manual connection
check uses the draft, does not save it and does not send credentials. Sign in
no longer requires a separate manual check first: the existing NativeLoginModel
still checks HTTPS/XMPP before every authentication attempt. Invalid or missing
server configuration keeps sign-in disabled. Biometric storage stays opt-in.

No field receives programmatic focus on launch or dismissal. Explicit focus
bindings are only cleared before settings/sign-in; they are never assigned a
field automatically. Simulator assertions cover the separate gear, save/cancel,
portrait/landscape, no keyboard on launch and the existing real login workflow
with fictitious accounts. Source/generator checks alone are not iOS compilation,
visual acceptance or device testing; the focused iPhone/iPad simulator run is
the next validation gate. This presentation change is not yet a TestFlight build.

Validation evidence for source `95ce9e4`: local checks passed 70 tests, with one
macOS-only test skipped. In [focused unsigned run 43938573255](https://github.com/edwtie/Teletyptel-messenger/actions/runs/43938573255),
the iPad Pro 11-inch (M4), iOS 18.5 simulator passed all 11 selected UI tests.
Exported portrait and landscape login screenshots were visually inspected: the
account fields remain on the login page, server fields are absent, and the gear
and bottom actions remain visible. No startup keyboard appeared. The initial
iPhone job never acquired a hosted runner; GitHub reported macOS arm64 capacity
constraints, not a compilation or app assertion failure. A separate iPhone job
retry was requested; iPhone validation remains pending until it actually runs.
The evidence does not cover real Google/Facebook authentication, physical devices
or a new signed TestFlight upload.

## Native workflow action runtimes (2026-11-16)

The published native workflow uses immutable commits for checkout
v5.1.0, setup-node v6.5.0 and upload-artifact v6.0.0. Each upstream `action.yml`
was checked at its exact commit and declares `runs.using: node24`. Merely changing
`node-version` does not upgrade an action's embedded runtime: the existing Node
22 build toolchain stays unchanged. No warning-suppression override, signing
permission, release gate, secret or artifact overwrite is added. Legacy workflows
are outside this focused change. A running workflow uses its original source;
this patch neither restarts it nor changes its upload outcome.

Sources: [checkout v5.1.0](https://github.com/actions/checkout/releases/tag/v5.1.0),
[setup-node v6.5.0](https://github.com/actions/setup-node/releases/tag/v6.5.0), and
[upload-artifact v6.0.0](https://github.com/actions/upload-artifact/releases/tag/v6.0.0).

## Native chat/menu layout correction (2026-11-16)

Direct and group chats now own one header row instead of distributing the back
button, avatar/title and action cluster over independent system navigation-bar
placements. Identity text may truncate visually; its full accessibility label
remains available. Symbol actions keep separate 44-point targets with 8-point
spacing. The TC shortcut and conversation menu stay separate from the main menu.
Group invitation remains a shortcut; leaving a group moves into the group menu
as a destructive action instead of a third competing header button.

Message menus occupy space in the first content row rather than overlaying the
body and timestamp. Copy, reply, forward, edit, translation, reaction and deletion
permissions are unchanged. This is a presentation correction, not a claim of
complete feature or pixel parity with web/16.9; system menu styling remains native.

The initial unsigned `focused-ui` / `menus` scope selected four simulator tests, including
long contact names, nonintersecting button/identity rectangles, minimum touch
targets, short-message metadata clearance, menu actions, group leave and
portrait/landscape rotation. The broader regression scope retains the login and
save/cancel settings tests. The menu scope explicitly uses the existing Intel macOS runner
label used for archive checks, avoiding the arm64 acquisition failures seen in
the previous login run. Other validation modes, signing/upload gates and server
configuration are unchanged. Local source/generator checks pass; actual simulator
results and screenshot review remain a separate validation gate. No TestFlight
upload is requested by this scope.

The first Intel iPhone menu build in run `43948799088` hit the existing ten-minute
build-process timeout while compiling sources, without reporting a Swift error.
For this menu-only scope the build-process budget is now explicitly twenty
minutes; the existing test and job time limits remain bounded and unchanged.
This timeout is not counted as a passed compile or UI test.
In that run the iPad overlap and main-menu checks passed individually, but group
visibility still expected a message container itself to be hittable. The exported
hierarchy showed its complete rectangle inside the viewport; the visibility check
now also requires the actual message-menu button to be hittable instead. It still
requires the whole message to fit above the composer. The first test process
timed out before completion, so the run is not reported as passing. The focused
menu scope excludes repeated login checks to stay within the unchanged test
budget; they remain selected by the broader regression scope.

Run `43954488583` exposed an iPhone login regression before the menu checks: the
bottom safe-area inset covered the password field when the keyboard was visible.
The action bar now participates in the root vertical layout below the scrolling
form, rather than overlaying it. Fixture sign-in checks the password/action-bar
rectangles before typing. The iPad header, group and main-menu assertions passed
individually in that run. Its message-deletion assertion reused a label-based
locator although the failure hierarchy no longer contained the deleted UUID; the
assertion now re-queries that exact UUID. The interrupted run remains failed and
is not counted as complete simulator evidence.

In run `43961195165` the iPhone test runner was killed before establishing its
XCTest connection; no iPhone app assertion ran. The iPad chat-overlap and main-menu
checks again passed individually. The remaining iPad checks stopped in the shared
status waiter; its failure hierarchy already showed the expected connected label.
That waiter now re-queries the current status element across the login-to-messenger
view replacement, with a thirty-second UI-only deadline for the slow hosted
runner. No application authentication/network timeout is changed. A further
unsigned validation run is required; these failed runs do not establish full
iPhone/iPad acceptance.

## Startup activity and visual baseline (2026-11-17)

The requested visual baseline remains the legacy 16.9 interface. Feedback ZIP 5
contained a 16.3 screenshot and is not used as a new design specification.

The native startup/sign-in header now reserves a four-point activity strip.
It is blue while the view prepares, an explicit server check runs, credentials
are authenticated, XMPP connects, or biometric restoration is pending. The
existing status text remains on the same page. Idle, cancellation, certificate
failure and waiting for user input stop the indicator. Settings show their own
separately identified strip during an explicit server check.

This is indeterminate activity, not a guessed percentage or a delayed login.
The blue segment moves without changing layout; Reduce Motion keeps it still.
It cannot intercept taps and does not add a server request, startup wait, extra
error page or automatic field focus. The OS-managed launch image itself is not
an animated app view. See [Apple's progress-indicator guidance](https://developer.apple.com/design/human-interface-guidelines/progress-indicators).

Local source/generator checks pass 67 tests, with one macOS-only check skipped.
The new unsigned `focused-ui` / `startup` scope selects three startup-only tests,
including checking, cancellation, certificate failure, rotation and no automatic
keyboard. Its slow/failing checker is DEBUG-only and restricted to
`example.invalid` / `localhost`; it never probes a real server. Simulator evidence
is still required. The earlier menu run `43966885233` was not green (the iPhone
runner timed out loading Accessibility); it is not reported as acceptance proof.
No new TestFlight upload is authorized by this test scope.

## Menu references from build 16.9 (2026-11-17)

Feedback ZIPs 6, 7 and 8 identify build 16.9 and now provide the actual menu/icon
baseline. The screenshots themselves, account names and feedback metadata are
not committed. The main menu is a separate, symbol-only three-column popover:
phone/news/support, history/archive/appearance, profile/settings/do-not-disturb,
then logout. Existing native group and translation shortcuts use the remaining
two cells of the last row rather than disappearing. Symbols retain localized
VoiceOver names, help text, 48-point tile heights and an explicit selected state.
News and support are disabled and labelled unavailable because there is no native
implementation to connect them to yet.

The chat header has TC, interpreter and vertical ellipsis in one bounded row.
The TC shortcut uses the reference's rounded blue treatment. The separate chat
popover offers Audio, Audio + video and Audio + RTT as full-width symbol/text
rows, with translation and a secondary contact-management menu. It scrolls in
short landscape layouts. Rename, mute, archive, history, block and removal keep
their existing capabilities and permission checks. Read markers are suppressed
while these menus or their explanatory dialogs cover the conversation.

The interpreter shortcut explains the existing consent-based call flow; it does
not call a private Tolkcontact service or pretend to be a staff workspace.
Likewise no inactive-call RTT reset is invented solely to copy an old screenshot.
Green/red in-call controls, signalling, media and the startup activity strip are
unchanged by this visual correction. This is not a claim of complete 16.9 parity.

The `menus` scope now selects just the two visual menu/header tests. They check
grid order, nonoverlapping 44-point-or-larger targets, disabled placeholders,
separate popovers, short-message clearance and portrait/landscape chat layout.
Message edit/forward/delete and group join/leave remain in the existing broader
regression scope; they are not rerun just to compare this menu presentation.
Local source/generator checks pass 68 tests, with one macOS-only check skipped.
Simulator execution and review of its real screenshots remain required: earlier
run `43993143666` failed and is not evidence of acceptance. Only unsigned checks
are requested; there is no TestFlight upload, APNs activation or server change.

Run `44047631143` compiled the app for both simulator families. The iPad chat
header/menu geometry test passed, including portrait/landscape rotation; its
exported screenshots were reviewed. They also showed that the keyboard could
remain underneath the menu, so opening a menu now releases only the relevant
draft/search focus without erasing text or focusing anything automatically.
Changing contacts cancels a pending conversation-menu action. The iPad main-menu
test failed at an additional sign-in status-string wait before opening the menu,
even though the failure hierarchy contained the connected messenger. That
unnecessary wait is removed; the test still requires the authenticated main-menu
button and asserts the grid's actual hit targets and order. The iPhone UI runner
was killed before establishing its test connection. These outcomes are not an
overall simulator pass; the focused checks need a new run.

Follow-up [run 44051521857](https://github.com/edwtie/Teletyptel-messenger/actions/runs/44051521857)
at source commit `7dcc9f9` built both families. The iPhone 16 Pro / iOS 18.6
simulator passed both focused menu tests (2 passed, 0 failed), including the
three-column grid, account-sheet navigation, minimum targets, nonoverlap,
portrait/landscape conversation menus and keyboard dismissal. Its actual grid,
portrait and landscape screenshots were exported and visually reviewed.
The iPad Pro 11-inch (M4) / iOS 18.6 runner failed to initialize with
`Timed out waiting for AX loaded notification` before the UI assertions ran.
This is an outstanding simulator-validation limitation, not a passed iPad check
or an observed app/menu assertion failure. The overall workflow is therefore
not green. No TestFlight upload, signing change or server activation took place.

## Additional visual matrix follow-up

### Native message-button popover (2026-11-18)

The normalized activation-point attempt did not fix iPhone direct/group menu
activation in run `44203686211`. The next candidate replaces that `Menu` trigger
with an ordinary 44-point Button and an app-owned native SwiftUI popover. It
retains the existing message actions, nested reactions and long-press context
menus, and adds an explicit localized close button. The bounded popover scrolls
in landscape; action rows keep 44-point targets and destructive actions stay red.

Opening releases only the relevant draft focus and suppresses read markers while
the menu covers messages. Actions dismiss the popover before opening edit,
forward or delete UI. Queued actions are cancelled when reopening, closing,
leaving the row or backgrounding, rather than executing later in another screen.
Existing send, correction, retraction, reaction and translation consent guards
are unchanged. This change does not send a message, grant consent or enable a
provider by itself.

The unsigned `message-actions` scope checks the real direct-message trigger,
rotation/overlap, copy access, edit/forward/both delete choices, reactions and the
group-message Copy action. Direct-menu captures are explicitly light-themed and
named for both orientations; the importer does not infer dark-theme evidence.
Local checks pass 116 tests, skip one macOS-only check and fail none. Compilation,
the simulator actions and screenshot review are still required before calling
the iPhone defect resolved. No TestFlight upload or server change is included.

### Additional matrix states (2026-11-18)

The real web reference now also opens the application's authenticator challenge,
reaction picker and own-message editor. The editor check verifies both the real
editing-message identity and the unchanged input text; its developer-only status
label is hidden by the web UI and is not used as a visibility requirement. All
24 added phone/tablet, portrait/landscape, light/dark captures passed locally in
Chromium. These are reference captures only, not 24 proven native matches.

The separate unsigned `visual-startup` scope prepares captures of checking,
offline, certificate failure, ordinary login, advanced login settings and a
pending two-factor challenge in both themes and orientations for each family.
It checks that these states do not open the keyboard or bypass authentication.
The importer accepts only their explicit scenario/orientation/theme names.
Simulator execution and the actual exported screenshots are still required;
adding the test or importer does not count any of these cases as completed.

The corrected local baseline review is
`artifacts/native-visual-mobile-review-20261118/index.html`: 240 verified real
web captures, the 50 retained iPad captures at `f7f4039`, 46 diagnostic pairs,
194 web-only cases, four native-only cases and 108 cases with neither image in
that set. It reports **0/352 accepted**, with 112 web and 302 native counterparts
missing. The report and its three-image chat comparison were opened headlessly,
checked for decoded evidence images and visually reviewed. It supersedes the old
desktop-class reference review; it is a pre-fix native baseline, not validation
of the later colour/header corrections.

An additional 44 distinct iPhone captures from `f728039` are retained separately
under `artifacts/native-visual-iphone-44203690577/`. That run passed TC and form
inventory capture but failed the palette test on the stopped-app rotation helper
(two of three tests passed). Its source differs from the retained iPad baseline,
so the two are not silently merged into a single-revision acceptance matrix.
The full review still requires one coherent native revision and shared fixture.

The rotation helper requests device orientation between launches without trying
to measure a nonexistent app window. With the app running it still waits for
both the real scene bounds/orientation and compositor screenshot before asserting
the accessibility window aspect. This fixes a test-lifecycle defect; it does not
remove active-app rotation checks or establish physical-device performance.

### Selected-contact colour follow-up (2026-11-18)

The correctly classified tablet web reference exposed another real difference:
the native selected-contact asset followed `--selection-bg`, but the actual web
button is overridden by the more specific themed `button.selected` rule. Native
asset generation now reads that rule's background and foreground for each theme
instead of the overridden variables. The existing selected border is unchanged.
Source tests cover both themes, CSS changes and missing rules. Web captures now
also retain the actual selected row and sidebar's computed styles and geometry,
so this mapping can be checked against rendered output. This is one colour fix,
not evidence that other screens or the complete matrix are pixel-identical.

The tablet brand header also had three duplicate actions that are absent from
the actual tablet web header. Number calling, account settings and logout now
stay in the existing main menu on both iOS families, rather than being repeated
beside the logo. Their menu actions, authorization and session cleanup are
unchanged. The focused menu test checks that the duplicate header actions are
absent while all existing main-menu destinations remain available.

## Primary references

- [RFC 7395: XMPP over WebSocket](https://www.rfc-editor.org/rfc/rfc7395.html):
  subprotocol and framed XML stream. This probe implements only pre-authentication
  availability, not the full protocol.
- [Apple: URLSessionWebSocketTask maximumMessageSize](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask/maximummessagesize):
  per-message buffer limit; this probe also limits cumulative XML bytes.
- [Apple: Adopting SwiftUI navigation split view](https://developer.apple.com/documentation/technotes/tn3154-adopting-swiftui-navigation-split-view):
  reference for the upcoming adaptive contact/chat navigation, not yet built here.
