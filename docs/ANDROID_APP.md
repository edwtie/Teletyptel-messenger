# Android LAN test app

This is an installable **debug test app**, not a Play Store release. It opens the
existing TeleTypTel Messenger over HTTPS on a WAMP computer on the same Wi-Fi
network. The PHP backend and ejabberd remain on that computer. The APK contains
only the native shell, an offline connection page and a public test CA certificate;
it does not bundle PHP, server credentials, account profiles or the PostNL demo.

## Build

The current test APK is version `1.0.1-lan-test` (version code `2`). It loads the
current WAMP Messenger, including number-keypad letters, TC button spacing and
XMPP recovery. The iOS native Google sign-in and one-time contact picker are not
Android features yet; use ordinary account sign-in for this test build.

Requirements: Node.js, JDK 21, Android SDK platform/build-tools 36 and the SDK
licences accepted by the developer. Set `JAVA_HOME` and `ANDROID_HOME` when the
tools are not at the helper's Windows defaults. A working JDK under
`%LOCALAPPDATA%/TeleTypTel/tools/jdk-21*` is also detected.

1. Run `npm ci`.
2. Copy `mobile/android/local.config.example.json` to
   `mobile/android/local.config.json` (ignored by Git).
3. Set `serverUrl` to the computer's reachable HTTPS URL ending in `/chat.html`.
   Never use `localhost` for the computer from a phone.
4. Set `caCertificate` to the **public** test CA certificate. Never supply a
   private key, an API key or a PEM file containing a private key.
5. Run `npm run android:check`, then `npm run android:build`.

Output: `artifacts/android/TeleTypTel-Android-test.apk`.
The installed name is **TeleTypTel Test**, with application ID
`com.tiedragon.teletyptel.debug`. `npm run android:sync` refreshes native assets;
`npm run android:open` opens Android Studio. Do not run an unqualified `cap sync`:
the existing iOS configuration uses a different web directory.

The build validates the HTTPS certificate and server response before compiling.
Only the configured hostname trusts the supplied test CA, only in the debug
resource set. Other hosts retain system trust. Cleartext, mixed content and the
native HTTP proxy are disabled. Release tasks are intentionally blocked until a
production server, signing and deployment configuration have been reviewed.
App storage is excluded from cloud backup and device transfer, including the
Android 12+ extraction rules, to avoid migrating WebView sessions inadvertently.

## WAMP and XMPP

The Android client uses `wss://<same-host>/xmpp-websocket` for XMPP, keeping the
phone connection on the same trusted HTTPS host. Desktop/browser defaults are
unchanged. Apache must forward WebSocket upgrades to ejabberd. If ejabberd is
bound to loopback, do not expose its ports just to enable this app.

Example inside the existing HTTPS virtual host, with `mod_proxy`,
`mod_proxy_http`, `mod_proxy_wstunnel` and `mod_ssl` enabled:

```apache
SSLProxyEngine On
SSLProxyVerify require
SSLProxyCheckPeerName On
SSLProxyCheckPeerExpire On
SSLProxyCACertificateFile "C:/path/to/ejabberd-public-ca-or-self-signed-certificate.crt"
ProxyPass "/xmpp-websocket" "wss://localhost:5443/websocket/"
ProxyPassReverse "/xmpp-websocket" "wss://localhost:5443/websocket/"
<Location "/xmpp-websocket">
    ProxyPreserveHost Off
    <RequireAny>
        Require local
        Require ip 192.168.0.0/24
    </RequireAny>
</Location>
```

The upstream certificate must cover `localhost` and be trusted by that public
certificate file. Do not disable upstream verification.
Host preservation must be disabled for this route so the upstream TLS hostname
matches ejabberd, rather than the phone's LAN destination address. Adjust the
allowed subnet to your LAN. Keep the existing
`/rtt-relay` route for RTT/call signalling. Check Apache configuration and restart
Apache after editing it. A route added to disk is not active until the restart.

## Install and test

- Transfer the APK to an Android phone, open it and temporarily permit installation
  from that file app if Android asks. Disable that permission again afterwards.
- Connect phone and WAMP computer to the same non-isolated Wi-Fi. Keep Apache,
  ejabberd and the relay running. Use a fixed/reserved LAN address; rebuild after
  changing the configured address or CA.
- The debug app trusts its scoped test CA itself; installing it as a system CA
  on the phone is not required. Never bypass a certificate warning in a browser.
- Sign in with an existing ordinary Messenger account. Google sign-in inside the
  embedded WebView is not implemented/validated as a native OAuth flow.
- Verify two-account text, RTT, attachments, unread/read markers, translation,
  audio/video calls, microphone/camera permission denial and reconnect after
  minimising. Media/location requests are limited to the configured HTTPS origin.
- This first version is for **foreground testing**. Push notifications,
  background ringing and native call integration are not implemented. Camera,
  microphone and background behaviour require real-device testing.

## Automated checks

```powershell
npm run test:android
npm run android:check
cd android
.\gradlew.bat --no-daemon testDebugUnitTest lintDebug
```

The Node tests cover configuration and asset boundaries; JVM tests cover origin
matching. Successful compilation or these tests do not prove calls work on an
actual phone. Do not advertise this test build as a production Android release.

## Initial validation — 2026-10-30

- The debug APK builds and its APK v2 signature verifies.
- The configuration tests and JVM origin-policy test pass. Android lint completes
  without errors; scaffold/dependency advisories remain.
- HTTPS Messenger, the XMPP WebSocket stream opening and the RTT relay upgrade
  were checked against the LAN server with certificate verification enabled.
- APK assets were inspected: no PHP, PostNL demo, private key, account profile or
  local build configuration is included. The public debug CA is host-scoped.
- The offline page's retry link and layout were checked in a Pixel 7 browser
  viewport. This is not an installed-app or physical-device test.
- The broader receipt regression passes its Android browser checks but currently
  fails the iPhone/WebKit focused-visible-marker assertion. That separate issue
  remains open; this build is not evidence of iPhone correctness.
- No Android device was connected: installation, login, camera/microphone,
  two-account RTT, calls, attachment handling and app switching still need a
  real-device acceptance test. Push/background calls remain out of scope.
