param(
    [string]$Version = "0.1.0-alpha1",
    [string]$Configuration = "Release"
)

# Requirements:
# - Windows PowerShell 5.1 or PowerShell 7.
# - .NET 10 SDK for dotnet publish.
# - Repository checkout with php, docs, samples, tools and src.
# - NuGet packages restored locally, or internet access for first restore.
#
# Output:
# - artifacts/teletyptel-<version>-web-demo.zip
# - WAMP-style layout with web/PHP files under wamp/www/teletyptel and
#   published .NET smoke tools under wamp/bin/teletyptel.

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

$webRoot = Join-Path $stage "wamp\www\teletyptel"
$binRoot = Join-Path $stage "wamp\bin\teletyptel"
New-Item -ItemType Directory -Force $webRoot | Out-Null
New-Item -ItemType Directory -Force $binRoot | Out-Null

Copy-Item -Recurse -Force (Join-Path $repo "php\public") $webRoot
Copy-Item -Recurse -Force (Join-Path $repo "php\lib") $webRoot
Copy-Item -Force (Join-Path $repo "php\rtt-websocket-server.php") $webRoot
Copy-Item -Force (Join-Path $repo "php\schema.sql") $webRoot
Copy-Item -Force (Join-Path $repo "php\config.example.php") (Join-Path $webRoot "config.example.php")
Copy-Item -Force (Join-Path $repo "php\README.md") (Join-Path $webRoot "README.md")

$docsRoot = Join-Path $stage "docs"
New-Item -ItemType Directory -Force $docsRoot | Out-Null
Copy-Item -Force (Join-Path $repo "README.md") $stage
Copy-Item -Force (Join-Path $repo "CHANGELOG.md") $stage
Copy-Item -Force (Join-Path $repo "LICENSE") $stage
Copy-Item -Force (Join-Path $repo "docs\GETTING_STARTED.md") $docsRoot
Copy-Item -Force (Join-Path $repo "docs\USER_GUIDE.md") $docsRoot
Copy-Item -Force (Join-Path $repo "docs\REAL_SERVER_SETUP.md") $docsRoot
Copy-Item -Force (Join-Path $repo "docs\RELEASE_NOTES_ALPHA1.md") $docsRoot

$publishItems = @(
    @{ Project = "tools\Tiedragon.XmppMessenger.FakeServer"; Name = "FakeServer" },
    @{ Project = "tools\Tiedragon.XmppMessenger.RealServerSmoke"; Name = "RealServerSmoke" },
    @{ Project = "samples\Tiedragon.XmppMessenger.AiBotConsole"; Name = "AiBotConsole" },
    @{ Project = "samples\Tiedragon.XmppMessenger.WebSocketConsole"; Name = "WebSocketConsole" }
)

foreach ($item in $publishItems) {
    $output = Join-Path $binRoot $item.Name
    dotnet publish (Join-Path $repo $item.Project) -c $Configuration -o $output --nologo
}

$requiredFiles = @(
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
