param(
    [int]$Port = 0,
    [string]$Configuration = "Release",
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

function Get-FreeTcpPort {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start()
    try {
        return ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

if ($Port -le 0) {
    $Port = Get-FreeTcpPort
}
$UploadPort = Get-FreeTcpPort

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$logs = Join-Path $root "artifacts\logs"
New-Item -ItemType Directory -Path $logs -Force | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$serverOut = Join-Path $logs "local-xmpp-server-$stamp.out.log"
$serverErr = Join-Path $logs "local-xmpp-server-$stamp.err.log"
$uploadFile = Join-Path $logs "local-xmpp-upload-$stamp.txt"
Set-Content -LiteralPath $uploadFile -Value "Teletyptel local XEP-0363 upload smoke $stamp" -Encoding UTF8

Push-Location $root
try {
    if (-not $NoBuild.IsPresent) {
        dotnet build "tools\Tiedragon.XmppMessenger.LocalServer\Tiedragon.XmppMessenger.LocalServer.csproj" --configuration $Configuration
        if ($LASTEXITCODE -ne 0) { throw "LocalServer build failed with exit code $LASTEXITCODE." }

        dotnet build "tools\Tiedragon.XmppMessenger.RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.csproj" --configuration $Configuration
        if ($LASTEXITCODE -ne 0) { throw "RealServerSmoke build failed with exit code $LASTEXITCODE." }
    }

    $serverArgs = @(
        "run",
        "--no-build",
        "--configuration", $Configuration,
        "--project", "tools\Tiedragon.XmppMessenger.LocalServer\Tiedragon.XmppMessenger.LocalServer.csproj",
        "--",
        "--listen", "127.0.0.1",
        "--port", "$Port",
        "--upload-listen", "127.0.0.1",
        "--upload-port", "$UploadPort",
        "--domain", "localhost",
        "--account", "edward:secret",
        "--account", "anna:secret"
    )

    Write-Host "Starting local XMPP server on 127.0.0.1:$Port" -ForegroundColor Cyan
    $server = Start-Process -FilePath "dotnet" `
        -ArgumentList $serverArgs `
        -PassThru `
        -WindowStyle Hidden `
        -RedirectStandardOutput $serverOut `
        -RedirectStandardError $serverErr

    try {
        $fingerprint = $null
        $deadline = (Get-Date).AddSeconds(20)
        while ((Get-Date) -lt $deadline) {
            if ($server.HasExited) {
                $out = if (Test-Path $serverOut) { Get-Content -LiteralPath $serverOut -Raw } else { "" }
                $err = if (Test-Path $serverErr) { Get-Content -LiteralPath $serverErr -Raw } else { "" }
                throw "LocalServer exited before startup.`n$out`n$err"
            }

            if (Test-Path $serverOut) {
                $text = Get-Content -LiteralPath $serverOut -Raw
                if ($text -match "Certificate SHA-256:\s*([0-9a-fA-F]+)") {
                    $fingerprint = $Matches[1].ToLowerInvariant()
                    break
                }
            }

            Start-Sleep -Milliseconds 250
        }

        if ([string]::IsNullOrWhiteSpace($fingerprint)) {
            throw "LocalServer did not print a certificate fingerprint within the timeout."
        }

        Write-Host "Local server certificate SHA-256: $fingerprint" -ForegroundColor Cyan

        $smokeArgs = @(
            "run",
            "--no-build",
            "--configuration", $Configuration,
            "--project", "tools\Tiedragon.XmppMessenger.RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.csproj",
            "--",
            "--host", "127.0.0.1",
            "--port", "$Port",
            "--account1", "edward@localhost/desktop",
            "--password1", "secret",
            "--account2", "anna@localhost/desktop",
            "--password2", "secret",
            "--bad-host", "wrong.example.org",
            "--cert-sha256", $fingerprint,
            "--timeout-seconds", "30",
            "--external-services",
            "--external-service", "localhost",
            "--external-service-type", "turn",
            "--block-jid", "anna@localhost",
            "--upload-service", "localhost",
            "--upload-file", $uploadFile,
            "--upload-recipient", "anna@localhost/desktop",
            "--muc-service", "conference.localhost",
            "--muc-room", "team@conference.localhost",
            "--muc-admin"
        )

        Write-Host "Running local XMPP server compliance smoke" -ForegroundColor Cyan
        & dotnet @smokeArgs
        if ($LASTEXITCODE -ne 0) {
            throw "Local XMPP server smoke failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        if ($server -and -not $server.HasExited) {
            Stop-Process -Id $server.Id -Force
            $server.WaitForExit(5000) | Out-Null
        }
    }
}
finally {
    Pop-Location
}
