# Linux Setup

This guide describes what to build and where to place files for a Linux test
host. It mirrors the WAMP layout, but uses normal Linux paths.

## Build Machine Requirements

- PowerShell 7, or Windows PowerShell when building from Windows;
- .NET 10 SDK;
- repository checkout with `php`, `docs`, `samples`, `tools` and `src`;
- internet access for the first NuGet restore;
- optional: Linux host or VM for runtime testing.

The .NET SDK is required for the full package build because the package includes
C# tools. A PHP-only web deployment does not need the .NET SDK.

Build the package with Linux output:

```powershell
.\scripts\package-alpha1.ps1 -Target Linux
```

Build both Windows/WAMP and Linux output:

```powershell
.\scripts\package-alpha1.ps1 -Target All
```

The Linux .NET tools are published for `linux-x64` as framework-dependent
executables. The Linux target must have .NET runtime 10 installed only when
those C# tools are used.

Each tool folder contains three useful entry points:

```text
Tiedragon.XmppMessenger.LocalServer          Linux apphost executable
Tiedragon.XmppMessenger.LocalServer.dll      cross-platform .NET assembly
run.sh                                      launcher that runs the dll with dotnet
```

The `.dll` files do work on Linux when started with `dotnet`. The apphost file
without `.exe` is Linux-specific. The `.exe` files in the WAMP layout are for
Windows and should not be used on Linux.

## Target Machine Requirements

For the PHP web application and PHP XMPP library:

- Linux x64;
- Apache or Nginx;
- PHP 8.1 or newer with CLI support;
- PHP extensions: `pdo_mysql`, `dom`, `mbstring`, `openssl` and `json`;
- MySQL or MariaDB;
- systemd when using the included relay service file.

For the optional C# tools:

- .NET runtime 10.

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

The web tree includes the PHP XMPP library:

```text
linux/var/www/teletyptel/lib/Xmpp/
```

That library is used by PHP account/API code and command-line smoke tools. It is
the Linux-friendly server-side protocol layer for hosting environments where
starting a long-running .NET process is not desirable. The .NET tools remain
useful for deeper protocol validation, local server testing and cross-platform
development.

If you deploy only the browser/PHP application, you can copy only
`linux/var/www/teletyptel` and skip `/opt/teletyptel/bin`. In that PHP-only
layout, the target server does not require .NET 10.

Copy it onto the server:

```bash
sudo mkdir -p /var/www/teletyptel /opt/teletyptel/bin
sudo cp -a linux/var/www/teletyptel/. /var/www/teletyptel/
sudo cp -a linux/opt/teletyptel/bin/. /opt/teletyptel/bin/
sudo cp linux/etc/systemd/system/teletyptel-rtt-relay.service /etc/systemd/system/
sudo chown -R www-data:www-data /var/www/teletyptel
sudo chmod +x /opt/teletyptel/bin/*/Tiedragon.XmppMessenger.* || true
```

If executable permissions are lost while unpacking the zip, use `dotnet
ToolName.dll` or `sh run.sh`. A zip created on Windows should not be trusted to
preserve Linux execute bits.

Install the typical Debian/Ubuntu PHP packages with:

```bash
sudo apt update
sudo apt install php-cli php-mysql php-xml php-mbstring
```

On other distributions, install the equivalent packages for PDO MySQL, DOM/XML,
multibyte string handling and OpenSSL-enabled stream sockets.

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

Keep `/var/www/teletyptel/lib`, `/var/www/teletyptel/config.php` and
`/var/www/teletyptel/schema.sql` outside the public document root. The browser
should only see files below `/var/www/teletyptel/public`.

## PHP XMPP Library

The PHP library lives at:

```text
/var/www/teletyptel/lib/Xmpp/
```

It mirrors the C# protocol core where practical, but runs directly inside the
PHP/Apache hosting model. Use it for server-side account flows, web XMPP
experiments and command-line smokes. Use the .NET tools when you need the local
test server, Windows tooling or deeper cross-platform protocol checks.

Important: the PHP XMPP library does not require .NET 10. It requires PHP 8.1+
and the PHP extensions listed above. .NET 10 is only for the C# library,
LocalServer, RealServerSmoke and desktop/console tools.

From a repository checkout, validate the PHP library with:

```bash
php php/tests/xmpp-library-smoke.php
```

Expected result:

```text
PHP XMPP library smoke OK
```

Run a real login smoke against a local or public XMPP server:

```bash
php php/tools/xmpp-login-smoke.php \
  --jid user@example.org \
  --password 'secret' \
  --host example.org \
  --resource php
```

Run a fuller client smoke with roster, discovery and a test message:

```bash
php php/tools/xmpp-client-smoke.php \
  --jid user@example.org \
  --password 'secret' \
  --host example.org \
  --resource php \
  --roster \
  --disco example.org \
  --to tester@example.org \
  --message 'Hallo vanaf PHP op Linux'
```

For an XMPP WebSocket endpoint:

```bash
php php/tools/xmpp-websocket-smoke.php \
  --url wss://example.org/xmpp-websocket \
  --domain example.org
```

For a BOSH endpoint:

```bash
php php/tools/xmpp-bosh-smoke.php \
  --url https://example.org/http-bind \
  --domain example.org
```

Use `--direct-tls` for direct TLS ports. Use `--no-tls` only on a protected
local lab server.

The release package contains the runtime library under `lib/Xmpp`. The
development smoke scripts under `php/tools` and `php/tests` are normally run
from a repository checkout.

## RTT Relay

Start manually:

```bash
php /var/www/teletyptel/rtt-websocket-server.php
```

For a Linux server, run it under systemd so it starts on boot and restarts after
crashes. Install the included service file:

```bash
sudo cp linux/etc/systemd/system/teletyptel-rtt-relay.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now teletyptel-rtt-relay.service
sudo systemctl status teletyptel-rtt-relay.service
```

The service runs:

```text
RTT_RELAY_HOST=127.0.0.1
RTT_RELAY_PORT=8787
/usr/bin/php /var/www/teletyptel/rtt-websocket-server.php
```

This is the recommended production shape: the PHP WebSocket process only listens
locally, and Apache or Nginx exposes it as HTTPS/WSS. Check that it is listening:

```bash
sudo ss -ltnp | grep 8787
journalctl -u teletyptel-rtt-relay.service -f
```

For a public server, place TLS and reverse proxy configuration in Apache or
Nginx and proxy the WebSocket endpoint to `127.0.0.1:8787`.

Apache example:

```apache
ProxyPass "/rtt-relay" "ws://127.0.0.1:8787"
ProxyPassReverse "/rtt-relay" "ws://127.0.0.1:8787"
```

Required Apache modules:

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel ssl
sudo systemctl reload apache2
```

Nginx example:

```nginx
location /rtt-relay {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}
```

If you want direct LAN testing without Apache/Nginx, override the service host:

```bash
sudo systemctl edit teletyptel-rtt-relay.service
```

Add:

```ini
[Service]
Environment=RTT_RELAY_HOST=0.0.0.0
```

Then reload:

```bash
sudo systemctl daemon-reload
sudo systemctl restart teletyptel-rtt-relay.service
```

The browser connects through the public reverse proxy:

```text
wss://example.org/rtt-relay
```

For local development without TLS, it can connect directly:

```text
ws://127.0.0.1:8787
```

## .NET Smoke Tools

These tools are still valuable on Linux, but they are no longer the only way to
exercise XMPP behavior. Use the PHP library smokes above for PHP-hosting checks;
use the .NET tools below for the local test server and cross-platform validation.

Run the local server:

```bash
/opt/teletyptel/bin/LocalServer/Tiedragon.XmppMessenger.LocalServer \
  --listen 127.0.0.1 \
  --port 55222 \
  --upload-listen 127.0.0.1 \
  --upload-port 58088 \
  --domain localhost \
  --data-dir /var/lib/teletyptel/localserver \
  --account edward:secret \
  --account anna:secret
```

Equivalent portable form:

```bash
dotnet /opt/teletyptel/bin/LocalServer/Tiedragon.XmppMessenger.LocalServer.dll \
  --listen 127.0.0.1 \
  --port 55222 \
  --upload-listen 127.0.0.1 \
  --upload-port 58088 \
  --domain localhost \
  --data-dir /var/lib/teletyptel/localserver \
  --account edward:secret \
  --account anna:secret
```

`--data-dir` stores local test accounts, roster items and the XEP-0313 message
archive. Use a directory owned by the service account when running it under
systemd.
Add `--registration-captcha true` when testing XEP-0077 CAPTCHA registration;
that option uses the local HTTP endpoint configured with `--upload-port`.

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

Equivalent portable form:

```bash
dotnet /opt/teletyptel/bin/RealServerSmoke/Tiedragon.XmppMessenger.RealServerSmoke.dll \
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

- The PHP relay is a local development bridge. The PHP XMPP library is the
  server-side protocol layer, but production hosting still needs a hardened real
  XMPP server and deployment policy.
- The optional C# tools are framework-dependent; install .NET runtime 10 only
  when you run those tools on Linux.
- Authentication/session hardening, abuse controls and monitoring are deployment
  work, not just code work.
- Public deployment should use TLS, firewall rules and reverse proxy
  hardening.
