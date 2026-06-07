# Getting Started

This guide lets a reviewer evaluate Teletyptel 2.0 Alpha 2 on a local machine.
It does not require a public XMPP account.

## Requirements

- .NET 10 SDK
- PHP 8.1 or newer
- A modern browser
- Optional: MySQL or MariaDB for account profile storage
- Optional on Windows: WAMP, when you want the PHP web client and MySQL under
  one local stack

## Build And Test

```powershell
dotnet build Tiedragon.XmppMessenger.slnx
dotnet run --project tests/Tiedragon.XmppMessenger.Tests
```

Expected test ending:

```text
All RTT tests passed.
```

These tests exercise the shared `Tiedragon.XmppMessenger.Core` library. The
same library is used by the WinForms demo, AI bot console, local XMPP server
smoke path and real-server smoke tool. That means the server checks below are
not separate sample scripts; they validate the library's XMPP stream, TLS/SASL,
resource binding, registration, roster and message code.

## Build The Release Zip

Package requirements:

- Windows PowerShell 5.1 or PowerShell 7;
- .NET 10 SDK on the build machine;
- repository checkout with `php`, `docs`, `samples`, `tools` and `src`;
- internet access for NuGet restore the first time, unless packages are already
  restored locally;
- no WAMP installation is required to create the zip.

The zip recipe uses these source folders:

- `php/public` for browser HTML, CSS, JavaScript, language files and smileys;
- `php/lib` for PHP server-side helper code;
- `php/rtt-websocket-server.php` for the local relay;
- `php/schema.sql` and `php/config.example.php` for MySQL setup;
- `tools/Tiedragon.XmppMessenger.LocalServer`;
- `tools/Tiedragon.XmppMessenger.RealServerSmoke`;
- `samples/Tiedragon.XmppMessenger.AiBotConsole`;
- `samples/Tiedragon.XmppMessenger.WebSocketConsole`;
- `samples/Tiedragon.XmppMessenger.WinFormsDemo` for the Windows app package;
- root documentation and release notes.

Create the WAMP-ready zip with:

```powershell
.\scripts\package-alpha1.ps1
```

The script name still contains `alpha1` because it is the existing release
recipe. It now packages the current Alpha 2 web client, LocalServer and smoke
tools until the packaging script is renamed.

The package script publishes the .NET tools and verifies that the zip contains:

- `wamp\www\teletyptel\public` for the browser client;
- `wamp\www\teletyptel\lib\Database.php` for the PHP account API;
- `wamp\www\teletyptel\rtt-websocket-server.php` for the local relay;
- `wamp\bin\teletyptel\LocalServer` and `RealServerSmoke` binaries;
- `wamp\bin\teletyptel\AiBotConsole`, `WebSocketConsole` and `WindowsApp`
  binaries.

The zip is written to:

```text
artifacts\teletyptel-0.1.0-alpha1-web-demo.zip
```

After extracting the zip, the target machine needs:

- WAMP or another Apache/PHP/MySQL stack for `wamp\www\teletyptel`;
- PHP 8.1 or newer for the WebSocket relay;
- a browser for `public/chat.html`;
- .NET runtime 10 for the published tools under `wamp\bin\teletyptel`, unless
  the package is rebuilt later as self-contained.

The package script fails when required files are missing. In particular it
checks for `lib\Database.php`, `public\api\account.php`, the relay script and
the published `.exe`/`.dll` files for the smoke tools.

Optional parameters:

```powershell
.\scripts\package-alpha1.ps1 -Version 0.1.0-alpha1 -Configuration Release -Target All
```

Supported targets:

- `Windows` builds the WAMP layout only;
- `Linux` builds the Linux x64 layout only;
- `All` builds both layouts in one zip.

Use `-Configuration Debug` only for local developer diagnostics, not public
release assets.

Linux setup is documented separately: [Linux Setup](LINUX_SETUP.md).
Windows setup is documented separately: [Windows Setup](WINDOWS_SETUP.md).

## Deployment Lines

Teletyptel Alpha 2 currently has three practical deployment lines:

| Line | Use When | Main Layout |
| --- | --- | --- |
| Windows desktop / WAMP | Quick local test on a developer machine. | `C:\wamp64\www\teletyptel` and `C:\wamp64\bin\teletyptel` |
| Windows Server | IIS or Apache hosting on a Windows server. | `C:\inetpub\teletyptel` and `C:\Program Files\Teletyptel\bin` |
| Linux server | Apache/Nginx, PHP, MySQL/MariaDB and systemd. | `/var/www/teletyptel` and `/opt/teletyptel/bin` |

The browser/PHP files are the same in all lines. The platform difference is
mainly where files are installed, how PHP is hosted, and whether .NET tools are
started as Windows `.exe` files or Linux apphosts/`.dll` files.

## Run The Web Chat Demo

Start the PHP relay:

```powershell
php php/rtt-websocket-server.php
```

Open the full Alpha 2 web client in two browser windows through localhost.
Do not open `php/public/chat.html` directly from `C:\...`; the login and
account API require HTTP/PHP.

```text
http://127.0.0.1:8090/chat.html
```

When the web client is served through PHP or WAMP, use separate browser
profiles for two different local accounts:

```text
http://127.0.0.1:8090/chat.html?profile=edward
http://127.0.0.1:8090/chat.html?profile=tester
```

The `profile` value selects a separate local account store and a separate
generated XMPP resource. You can also create the second window from the
Connection panel with **Open second session**.

Connect both windows to:

```text
ws://127.0.0.1:8787
```

Type in one window. The other window should show live RTT text while typing and
then a final message bubble after Enter.

## Run The Windows App

Start the same PHP relay, then run the WinForms client:

```powershell
dotnet run --project samples/Tiedragon.XmppMessenger.WinFormsDemo/Tiedragon.XmppMessenger.WinFormsDemo.csproj
```

The WAMP package publishes this client to `wamp\bin\teletyptel\WindowsApp`.

Use the Relay room for shared-room testing with browser windows. For directed
one-to-one tests, choose the other participant from the contact list or enter
the other participant's bare or full JID in the account/settings panel.

## Run Under WAMP On Windows

WAMP is useful when you want Apache, PHP and MySQL/MariaDB running like a small
local server. Keep web files and .NET binaries separate:

```text
C:\wamp64\www\teletyptel\        PHP project root served by Apache
C:\wamp64\www\teletyptel\public\ browser files
C:\wamp64\www\teletyptel\lib\    PHP server library files
C:\wamp64\bin\teletyptel\        local .NET tools, not served by Apache
```

Copy the PHP application into the WAMP web root:

```powershell
New-Item -ItemType Directory -Force C:\wamp64\www\teletyptel | Out-Null
New-Item -ItemType Directory -Force C:\wamp64\www\teletyptel\lib | Out-Null
Copy-Item -Recurse -Force php\public C:\wamp64\www\teletyptel\
Copy-Item -Recurse -Force php\lib C:\wamp64\www\teletyptel\
Copy-Item -Force php\schema.sql C:\wamp64\www\teletyptel\schema.sql
Copy-Item -Force php\config.example.php C:\wamp64\www\teletyptel\config.php
Copy-Item -Force php\rtt-websocket-server.php C:\wamp64\www\teletyptel\rtt-websocket-server.php
```

Import the database in phpMyAdmin or MySQL:

```sql
SOURCE C:/wamp64/www/teletyptel/schema.sql;
```

Then edit:

```text
C:\wamp64\www\teletyptel\config.php
```

The default database settings are:

```text
database: teletyptel
user:     teletyptel
password: empty in the example
```

Create the MySQL user if needed:

```sql
CREATE USER IF NOT EXISTS 'teletyptel'@'localhost' IDENTIFIED BY '';
GRANT ALL PRIVILEGES ON teletyptel.* TO 'teletyptel'@'localhost';
FLUSH PRIVILEGES;
```

Open the web client through Apache:

```text
http://localhost/teletyptel/public/chat.html
```

Start the WebSocket relay from a separate terminal. Apache does not start this
long-running socket process automatically:

```powershell
$php = (Get-ChildItem C:\wamp64\bin\php\php*\php.exe | Sort-Object FullName -Descending | Select-Object -First 1).FullName
& $php C:\wamp64\www\teletyptel\rtt-websocket-server.php
```

Adjust the PHP version folder to your WAMP installation. The browser should
connect to:

```text
ws://127.0.0.1:8787
```

Publish local .NET tools into the WAMP binary area:

```powershell
dotnet publish tools\Tiedragon.XmppMessenger.LocalServer -c Release -o C:\wamp64\bin\teletyptel\LocalServer
dotnet publish tools\Tiedragon.XmppMessenger.RealServerSmoke -c Release -o C:\wamp64\bin\teletyptel\RealServerSmoke
dotnet publish samples\Tiedragon.XmppMessenger.AiBotConsole -c Release -o C:\wamp64\bin\teletyptel\AiBotConsole
```

Run the local XMPP server from the published binary:

```powershell
C:\wamp64\bin\teletyptel\LocalServer\Tiedragon.XmppMessenger.LocalServer.exe `
  --listen 127.0.0.1 `
  --port 55222 `
  --upload-listen 127.0.0.1 `
  --upload-port 58088 `
  --domain localhost `
  --data-dir C:\wamp64\bin\teletyptel\LocalServerData `
  --account edward:secret `
  --account anna:secret
```

Copy the printed certificate fingerprint and test it:

```powershell
C:\wamp64\bin\teletyptel\RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.exe `
  --host 127.0.0.1 `
  --port 55222 `
  --account1 edward@localhost/desktop `
  --password1 secret `
  --account2 anna@localhost/desktop `
  --password2 secret `
  --external-services `
  --external-service localhost `
  --external-service-type turn `
  --cert-sha256 <printed fingerprint>
```

This WAMP binary smoke runs `Tiedragon.XmppMessenger.RealServerSmoke`, which
uses the compiled `Tiedragon.XmppMessenger.Core` library from the published
output. The expected result is the same as the source-tree command below:

```text
PASS TLS certificate accepted for configured host.
PASS External service discovery smoke completed.
PASS Two-account chat message delivered.
```

## Run The STARTTLS Local XMPP Server

For the repeatable server compliance smoke, let the script start the local
server, read the printed certificate fingerprint and run the real client smoke
against it:

```powershell
.\scripts\local-xmpp-server-smoke.ps1
```

The smoke covers STARTTLS, hostname rejection, SASL login, resource binding,
roster, XEP-0157 service contacts, XEP-0191 blocking, XEP-0215 STUN/TURN
discovery, XEP-0313 message archive, XEP-0363 upload service discovery, direct
chat and XEP-0045 MUC.

To run the pieces manually, start the local development XMPP server:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.LocalServer -- `
  --listen 127.0.0.1 `
  --port 55222 `
  --upload-listen 127.0.0.1 `
  --upload-port 58088 `
  --domain localhost `
  --data-dir .tmp/local-xmpp-data
```

Copy the printed `Certificate SHA-256` value and run:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.RealServerSmoke -- `
  --host 127.0.0.1 `
  --port 55222 `
  --account1 edward@localhost/desktop `
  --password1 secret `
  --account2 anna@localhost/desktop `
  --password2 secret `
  --register `
  --external-services `
  --external-service localhost `
  --external-service-type turn `
  --cert-sha256 <printed fingerprint>
```

Expected result:

```text
PASS TLS certificate accepted for configured host.
PASS Registration accepted for edward@localhost.
PASS Registration accepted for anna@localhost.
PASS External service discovery smoke completed.
PASS Two-account chat message delivered.
```

This is the main local server validation. `LocalServer` supplies the controlled
STARTTLS/XMPP endpoint; `RealServerSmoke` connects through the real client
library and proves that the client can register accounts, negotiate TLS/SASL,
bind a resource, discover local STUN/TURN services and deliver a normal chat
message between two accounts.

When you want to test the in-band registration CAPTCHA path, add
`--registration-captcha true` to LocalServer. The server then returns an
XEP-0077 data form with `captcha-fallback-url`, hidden challenge key and
required `ocr`; the PNG image is served by the local HTTP endpoint configured
with `--upload-port`.

## Optional MySQL Account Profile

Create the schema:

```sql
SOURCE php/schema.sql;
```

Copy:

```text
php/config.example.php -> php/config.php
```

Then edit `php/config.php` for your local database. The web client still works
without MySQL by using browser storage.

## What This Alpha Proves

- Live real-time text UX in a browser client.
- Repeatable local relay demo.
- XMPP core models and negotiation code in C#.
- Mandatory TLS path with local STARTTLS XMPP server smoke.
- Local server registration, roster, upload, MUC and message archive smoke
  paths.
- A public evaluation shape that can be tested by other developers.
