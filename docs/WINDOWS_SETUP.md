# Windows Setup

This guide describes the Windows deployment line. It covers both a local WAMP
developer setup and a Windows Server setup.

## Two Windows Modes

Use WAMP when you want the quickest local evaluation:

```text
C:\wamp64\www\teletyptel\        PHP project root
C:\wamp64\www\teletyptel\public\ browser files
C:\wamp64\www\teletyptel\lib\    PHP server library files
C:\wamp64\bin\teletyptel\        .NET protocol and smoke-test tools
```

Use Windows Server when the machine is a real server:

```text
C:\inetpub\teletyptel\           PHP project root for IIS
C:\inetpub\teletyptel\public\    browser files served by IIS
C:\Program Files\Teletyptel\bin\ .NET protocol and smoke-test tools
C:\ProgramData\Teletyptel\       local configuration and logs direction
```

The current Alpha zip uses the WAMP-style staging folder. For Windows Server,
copy the same contents into the IIS layout manually.

## Build Package

Build the Windows package from the repository root:

```powershell
.\scripts\package-alpha1.ps1 -Target Windows
```

The package contains:

```text
wamp\www\teletyptel\public
wamp\www\teletyptel\lib
wamp\www\teletyptel\rtt-websocket-server.php
wamp\www\teletyptel\schema.sql
wamp\www\teletyptel\config.example.php
wamp\bin\teletyptel\LocalServer
wamp\bin\teletyptel\RealServerSmoke
wamp\bin\teletyptel\AiBotConsole
wamp\bin\teletyptel\WebSocketConsole
```

The `.exe` files are Windows apphosts. The `.dll` files can also be started
with `dotnet ToolName.dll` when the .NET runtime is installed.

## WAMP Local Setup

Copy:

```powershell
New-Item -ItemType Directory -Force C:\wamp64\www\teletyptel | Out-Null
New-Item -ItemType Directory -Force C:\wamp64\bin\teletyptel | Out-Null
Copy-Item -Recurse -Force .\wamp\www\teletyptel\* C:\wamp64\www\teletyptel\
Copy-Item -Recurse -Force .\wamp\bin\teletyptel\* C:\wamp64\bin\teletyptel\
```

Open:

```text
http://localhost/teletyptel/public/chat.html
```

Start the relay:

```powershell
$php = (Get-ChildItem C:\wamp64\bin\php\php*\php.exe | Sort-Object FullName -Descending | Select-Object -First 1).FullName
& $php C:\wamp64\www\teletyptel\rtt-websocket-server.php
```

## Windows Server With IIS

Install:

- IIS;
- PHP 8.1 or newer through PHP Manager, FastCGI or another supported IIS PHP
  setup;
- MySQL or MariaDB;
- .NET runtime 10.

Copy:

```powershell
New-Item -ItemType Directory -Force C:\inetpub\teletyptel | Out-Null
New-Item -ItemType Directory -Force "C:\Program Files\Teletyptel\bin" | Out-Null
Copy-Item -Recurse -Force .\wamp\www\teletyptel\* C:\inetpub\teletyptel\
Copy-Item -Recurse -Force .\wamp\bin\teletyptel\* "C:\Program Files\Teletyptel\bin\"
```

Create an IIS site or application that serves:

```text
C:\inetpub\teletyptel\public
```

Keep `config.php`, `schema.sql`, `lib` and the relay script outside the public
document root. The browser should only receive files under `public`.

Example URL:

```text
https://server.example.org/teletyptel/chat.html
```

## Database

Import:

```powershell
mysql -u root -p < C:\inetpub\teletyptel\schema.sql
```

Create:

```text
C:\inetpub\teletyptel\config.php
```

Use `config.example.php` as the starting point. Do not place database passwords
inside `public`.

## RTT Relay On Windows Server

For Alpha testing, start manually:

```powershell
php C:\inetpub\teletyptel\rtt-websocket-server.php
```

For longer-running testing, use Task Scheduler or a service wrapper such as
NSSM to run the same command at startup. In production, put IIS, Apache or
another reverse proxy in front of the WebSocket relay and terminate TLS there.

The relay listens on:

```text
ws://127.0.0.1:8787
```

## .NET Smoke Tools

Run the local server:

```powershell
& "C:\Program Files\Teletyptel\bin\LocalServer\Tiedragon.XmppMessenger.LocalServer.exe" `
  --listen 127.0.0.1 `
  --port 55222 `
  --upload-listen 127.0.0.1 `
  --upload-port 58088 `
  --domain localhost `
  --data-dir "C:\ProgramData\TeleTypTel\LocalServer" `
  --account edward:secret `
  --account anna:secret
```

`--data-dir` stores local test accounts, roster items and the XEP-0313 message
archive. Use a ProgramData folder for a Windows service, or omit the option for
the current user's local application data folder.
Add `--registration-captcha true` when testing XEP-0077 CAPTCHA registration;
that option uses the local HTTP endpoint configured with `--upload-port`.

Run the smoke tool with the printed certificate fingerprint:

```powershell
& "C:\Program Files\Teletyptel\bin\RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.exe" `
  --host 127.0.0.1 `
  --port 55222 `
  --account1 edward@localhost/desktop `
  --password1 secret `
  --account2 anna@localhost/desktop `
  --password2 secret `
  --cert-sha256 <printed fingerprint>
```

Expected result:

```text
PASS TLS certificate accepted for configured host.
PASS Two-account chat message delivered.
```

## Production Notes

- Use HTTPS/WSS on public Windows Server deployments.
- Keep only `public` web-accessible.
- Keep `config.php` and logs outside the public document root.
- Use firewall rules so the local relay and local server are not exposed by
  accident.
- The PHP relay is still an Alpha development bridge, not the final production
  XMPP server.
