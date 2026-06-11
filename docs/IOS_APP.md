# TeleTypTel iOS app

TeleTypTel uses a Capacitor iOS shell around the existing web client in
`php/public`. This keeps the web, desktop WebView and future mobile apps on the
same UI and protocol code.

## Requirements

- macOS with Xcode installed.
- Apple Developer account for device signing and TestFlight/App Store builds.
- Node.js dependencies installed with `npm install`.
- A reachable TeleTypTel/XMPP environment over HTTPS/WSS for real device tests.

The iOS app bundles the static web client. PHP files are copied as files but are
not executed by iOS. Account, upload and history APIs therefore need to be
served by a real web server.

## Commands

From the repository root:

```bash
npm run ios:sync
npm run ios:open
```

In Xcode:

1. Select the `App` target.
2. Set the signing team.
3. Use bundle identifier `com.tiedragon.teletyptel`.
4. Run on an iPhone/iPad or create an archive for TestFlight.

## iOS permissions

`ios/App/App/Info.plist` contains permission text for:

- camera, for video and total conversation;
- microphone, for audio/video calls;
- location while in use, for explicit XEP-0080 location sharing;
- photo library, for selecting or saving shared media.

The Capacitor web view is configured as `capacitor://localhost`. Keep the
`localhost` host for the bundled iOS client because WebKit treats camera,
microphone and similar browser APIs as secure-context features. Do not replace
the local iOS scheme with a product-specific scheme such as `teletyptel://`
unless media capture is retested on a real iPhone.

## Server notes

For real iOS tests, avoid `127.0.0.1` in app settings because that points to the
iPhone itself. Use a LAN host name/IP during development, or a public HTTPS/WSS
server for external testing.
