param(
    [string]$Version = "0.1.0-alpha1",
    [string]$Configuration = "Release",
    [ValidateSet("Windows", "Linux", "All")]
    [string]$Target = "All"
)

# Requirements:
# - Windows PowerShell 5.1 or PowerShell 7.
# - .NET 10 SDK for dotnet publish.
# - Repository checkout with php, docs, samples, tools and src.
# - NuGet packages restored locally, or internet access for first restore.
#
# Output:
# - artifacts/teletyptel-<version>-web-demo.zip
# - Windows/WAMP layout with web/PHP files under wamp/www/teletyptel and
#   published .NET smoke tools under wamp/bin/teletyptel.
# - Linux layout with web/PHP files under linux/var/www/teletyptel and
#   published linux-x64 .NET smoke tools under linux/opt/teletyptel/bin.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$artifacts = Join-Path $repo "artifacts"
$stage = Join-Path $artifacts "teletyptel-$Version"
$zip = Join-Path $artifacts "teletyptel-$Version-web-demo.zip"

function Assert-UnderRepo([string]$path) {
    $resolved = [System.IO.Path]::GetFullPath($path)
    if (-not $resolved.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to modify path outside repository: $resolved"
    }
}

Assert-UnderRepo $artifacts
Assert-UnderRepo $stage
Assert-UnderRepo $zip

New-Item -ItemType Directory -Force $artifacts | Out-Null
if (Test-Path $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
if (Test-Path $zip) {
    Remove-Item -LiteralPath $zip -Force
}

New-Item -ItemType Directory -Force $stage | Out-Null

function Copy-WebPayload([string]$webRoot) {
    New-Item -ItemType Directory -Force $webRoot | Out-Null
    Copy-Item -Recurse -Force (Join-Path $repo "php\public") $webRoot
    Copy-Item -Recurse -Force (Join-Path $repo "php\lib") $webRoot
    Copy-Item -Force (Join-Path $repo "php\rtt-websocket-server.php") $webRoot
    Copy-Item -Force (Join-Path $repo "php\schema.sql") $webRoot
    Copy-Item -Force (Join-Path $repo "php\config.example.php") (Join-Path $webRoot "config.example.php")
    Copy-Item -Force (Join-Path $repo "php\README.md") (Join-Path $webRoot "README.md")
}

$docsRoot = Join-Path $stage "docs"
New-Item -ItemType Directory -Force $docsRoot | Out-Null
Copy-Item -Force (Join-Path $repo "README.md") $stage
Copy-Item -Force (Join-Path $repo "CHANGELOG.md") $stage
Copy-Item -Force (Join-Path $repo "LICENSE") $stage
Copy-Item -Force (Join-Path $repo "docs\GETTING_STARTED.md") $docsRoot
Copy-Item -Force (Join-Path $repo "docs\USER_GUIDE.md") $docsRoot
Copy-Item -Force (Join-Path $repo "docs\LINUX_SETUP.md") $docsRoot
Copy-Item -Force (Join-Path $repo "docs\REAL_SERVER_SETUP.md") $docsRoot
Copy-Item -Force (Join-Path $repo "docs\RELEASE_NOTES_ALPHA1.md") $docsRoot

function Publish-DotNetTools([string]$binRoot, [string]$runtime = "") {
    New-Item -ItemType Directory -Force $binRoot | Out-Null
    foreach ($item in $publishItems) {
        $output = Join-Path $binRoot $item.Name
        $arguments = @(
            "publish",
            (Join-Path $repo $item.Project),
            "-c",
            $Configuration,
            "-o",
            $output,
            "--nologo"
        )

        if ($runtime -ne "") {
            $arguments += @("-r", $runtime, "--self-contained", "false", "-p:UseAppHost=true")
        }

        & dotnet @arguments
    }
}

$publishItems = @(
    @{ Project = "tools\Tiedragon.XmppMessenger.FakeServer"; Name = "FakeServer" },
    @{ Project = "tools\Tiedragon.XmppMessenger.RealServerSmoke"; Name = "RealServerSmoke" },
    @{ Project = "samples\Tiedragon.XmppMessenger.AiBotConsole"; Name = "AiBotConsole" },
    @{ Project = "samples\Tiedragon.XmppMessenger.WebSocketConsole"; Name = "WebSocketConsole" }
)

if ($Target -eq "Windows" -or $Target -eq "All") {
    $webRoot = Join-Path $stage "wamp\www\teletyptel"
    $binRoot = Join-Path $stage "wamp\bin\teletyptel"
    Copy-WebPayload $webRoot
    Publish-DotNetTools $binRoot
}

$requiredFiles = @()

if ($Target -eq "Linux" -or $Target -eq "All") {
    $linuxWebRoot = Join-Path $stage "linux\var\www\teletyptel"
    $linuxBinRoot = Join-Path $stage "linux\opt\teletyptel\bin"
    Copy-WebPayload $linuxWebRoot
    Publish-DotNetTools $linuxBinRoot "linux-x64"

    $systemdRoot = Join-Path $stage "linux\etc\systemd\system"
    New-Item -ItemType Directory -Force $systemdRoot | Out-Null
    @"
[Unit]
Description=Tiedragon Teletyptel RTT WebSocket relay
After=network.target

[Service]
Type=simple
WorkingDirectory=/var/www/teletyptel
ExecStart=/usr/bin/php /var/www/teletyptel/rtt-websocket-server.php
Restart=on-failure
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
"@ | Set-Content -Encoding UTF8 (Join-Path $systemdRoot "teletyptel-rtt-relay.service")
}

if ($Target -eq "Windows" -or $Target -eq "All") {
    $requiredFiles += @(
    "wamp\www\teletyptel\public\chat.html",
    "wamp\www\teletyptel\public\api\account.php",
    "wamp\www\teletyptel\lib\Database.php",
    "wamp\www\teletyptel\rtt-websocket-server.php",
    "wamp\www\teletyptel\schema.sql",
    "wamp\bin\teletyptel\FakeServer\Tiedragon.XmppMessenger.FakeServer.exe",
    "wamp\bin\teletyptel\FakeServer\Tiedragon.XmppMessenger.Core.dll",
    "wamp\bin\teletyptel\RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.exe",
    "wamp\bin\teletyptel\RealServerSmoke\Tiedragon.XmppMessenger.Core.dll",
    "wamp\bin\teletyptel\AiBotConsole\Tiedragon.XmppMessenger.AiBotConsole.exe",
    "wamp\bin\teletyptel\WebSocketConsole\Tiedragon.XmppMessenger.WebSocketConsole.exe"
    )
}

if ($Target -eq "Linux" -or $Target -eq "All") {
    $requiredFiles += @(
        "linux\var\www\teletyptel\public\chat.html",
        "linux\var\www\teletyptel\public\api\account.php",
        "linux\var\www\teletyptel\lib\Database.php",
        "linux\var\www\teletyptel\rtt-websocket-server.php",
        "linux\var\www\teletyptel\schema.sql",
        "linux\opt\teletyptel\bin\FakeServer\Tiedragon.XmppMessenger.FakeServer",
        "linux\opt\teletyptel\bin\FakeServer\Tiedragon.XmppMessenger.Core.dll",
        "linux\opt\teletyptel\bin\RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke",
        "linux\opt\teletyptel\bin\RealServerSmoke\Tiedragon.XmppMessenger.Core.dll",
        "linux\opt\teletyptel\bin\AiBotConsole\Tiedragon.XmppMessenger.AiBotConsole",
        "linux\opt\teletyptel\bin\WebSocketConsole\Tiedragon.XmppMessenger.WebSocketConsole",
        "linux\etc\systemd\system\teletyptel-rtt-relay.service"
    )
}

foreach ($relative in $requiredFiles) {
    $candidate = Join-Path $stage $relative
    if (-not (Test-Path $candidate)) {
        throw "Package is missing required file: $relative"
    }
}

Compress-Archive -Path (Join-Path $stage "*") -DestinationPath $zip -Force

$hash = Get-FileHash -Algorithm SHA256 $zip
$entries = [System.IO.Compression.ZipFile]::OpenRead($zip)
try {
    $count = $entries.Entries.Count
}
finally {
    $entries.Dispose()
}

Write-Host "Created $zip"
Write-Host "Entries: $count"
Write-Host "SHA-256: $($hash.Hash.ToLowerInvariant())"
