# Linux Setup

This guide describes what to build and where to place files for a Linux test
host. It mirrors the WAMP layout, but uses normal Linux paths.

## Build Machine Requirements

- PowerShell 7, or Windows PowerShell when building from Windows;
- .NET 10 SDK;
- repository checkout with `php`, `docs`, `samples`, `tools` and `src`;
- internet access for the first NuGet restore;
- optional: Linux host or VM for runtime testing.

Build the package with Linux output:

```powershell
.\scripts\package-alpha1.ps1 -Target Linux
```

Build both Windows/WAMP and Linux output:

```powershell
.\scripts\package-alpha1.ps1 -Target All
```

The Linux .NET tools are published for `linux-x64` as framework-dependent
executables. The Linux target must have .NET runtime 10 installed.

## Target Machine Requirements

- Linux x64;
- Apache or Nginx;
- PHP 8.1 or newer with CLI support;
- MySQL or MariaDB;
- .NET runtime 10;
- systemd when using the included relay service file.

Recommended target layout:

```text
/var/www/teletyptel/             PHP/web application
/opt/teletyptel/bin/             .NET protocol and smoke-test tools
/etc/teletyptel/                 local configuration direction
/etc/systemd/system/             optional relay service
```

The zip contains a staged Linux layout:

```text
linux/var/www/teletyptel/
linux/opt/teletyptel/bin/
linux/etc/systemd/system/
```

Copy it onto the server:

```bash
sudo mkdir -p /var/www/teletyptel /opt/teletyptel/bin
sudo cp -a linux/var/www/teletyptel/. /var/www/teletyptel/
sudo cp -a linux/opt/teletyptel/bin/. /opt/teletyptel/bin/
sudo cp linux/etc/systemd/system/teletyptel-rtt-relay.service /etc/systemd/system/
sudo chown -R www-data:www-data /var/www/teletyptel
```

## Database

Create the database and account profile table:

```bash
mysql -u root -p < /var/www/teletyptel/schema.sql
```

Create or edit:

```text
/var/www/teletyptel/config.php
```

Use `config.example.php` as the starting point. Keep production secrets outside
Git and outside public web assets.

## Web Server

Apache example:

```apache
Alias /teletyptel /var/www/teletyptel/public

<Directory /var/www/teletyptel/public>
    Require all granted
    Options -Indexes
    AllowOverride None
</Directory>
```

Then open:

```text
http://localhost/teletyptel/chat.html
```

For Nginx, serve `/var/www/teletyptel/public` as the document root or as an
alias. PHP execution is only needed for `public/api/account.php`; static files
can be served directly.

## RTT Relay

Start manually:

```bash
php /var/www/teletyptel/rtt-websocket-server.php
```

Or use systemd:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now teletyptel-rtt-relay.service
sudo systemctl status teletyptel-rtt-relay.service
```

The browser connects to:

```text
ws://127.0.0.1:8787
```

For a public server, place TLS and reverse proxy configuration in Apache or
Nginx and proxy the WebSocket endpoint to `127.0.0.1:8787`.

## .NET Smoke Tools

Run the fake server:

```bash
/opt/teletyptel/bin/FakeServer/Tiedragon.XmppMessenger.FakeServer \
  --listen 127.0.0.1 \
  --port 55222 \
  --domain localhost \
  --account edward:secret \
  --account anna:secret
```

Then run the smoke tool with the printed certificate fingerprint:

```bash
/opt/teletyptel/bin/RealServerSmoke/Tiedragon.XmppMessenger.RealServerSmoke \
  --host 127.0.0.1 \
  --port 55222 \
  --account1 edward@localhost/desktop \
  --password1 secret \
  --account2 anna@localhost/desktop \
  --password2 secret \
  --cert-sha256 <printed fingerprint>
```

Expected result:

```text
PASS TLS certificate accepted for configured host.
PASS Two-account chat message delivered.
```

## What Is Not Production Yet

- The PHP relay is a local development bridge, not a full production XMPP
  server.
- The package is framework-dependent; install .NET runtime 10 on Linux.
- Authentication/session hardening is still an Alpha task.
- Public deployment should use TLS, firewall rules and reverse proxy
  hardening.
