# Getting Started

This guide lets a reviewer evaluate Teletyptel 2.0 Alpha 1 on a local machine.
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

## Run The Web Chat Demo

Start the PHP relay:

```powershell
php php/rtt-websocket-server.php
```

Open the full Alpha 1 web client in two browser windows:

```text
php/public/chat.html
```

Connect both windows to:

```text
ws://127.0.0.1:8787
```

Type in one window. The other window should show live RTT text while typing and
then a final message bubble after Enter.

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
dotnet publish tools\Tiedragon.XmppMessenger.FakeServer -c Release -o C:\wamp64\bin\teletyptel\FakeServer
dotnet publish tools\Tiedragon.XmppMessenger.RealServerSmoke -c Release -o C:\wamp64\bin\teletyptel\RealServerSmoke
dotnet publish samples\Tiedragon.XmppMessenger.AiBotConsole -c Release -o C:\wamp64\bin\teletyptel\AiBotConsole
```

Run the local fake XMPP server from the published binary:

```powershell
C:\wamp64\bin\teletyptel\FakeServer\Tiedragon.XmppMessenger.FakeServer.exe `
  --listen 127.0.0.1 `
  --port 55222 `
  --domain localhost `
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
  --cert-sha256 <printed fingerprint>
```

## Run The STARTTLS Fake XMPP Server

Start the local protocol harness:

```powershell
dotnet run --project tools/Tiedragon.XmppMessenger.FakeServer -- `
  --listen 127.0.0.1 `
  --port 55222 `
  --domain localhost
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
  --cert-sha256 <printed fingerprint>
```

Expected result:

```text
PASS TLS certificate accepted for configured host.
PASS Registration accepted for edward@localhost.
PASS Registration accepted for anna@localhost.
PASS Two-account chat message delivered.
```

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
- Mandatory TLS path with local STARTTLS server smoke.
- A first public release shape that can be tested by other developers.
