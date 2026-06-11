param(
    [int]$Port = 8787,
    [string]$PhpExe = "",
    [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($RepoRoot)) {
    $RepoRoot = Split-Path -Parent $PSScriptRoot
}

$relay = Join-Path $RepoRoot "php\rtt-websocket-server.php"
if (-not (Test-Path -LiteralPath $relay)) {
    throw "Relay script not found: $relay"
}

$listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port } |
    Select-Object -First 1
if ($listener) {
    Write-Host "RTT relay already listening on port $Port (PID $($listener.OwningProcess))."
    exit 0
}

$phpCandidates = @()
if (-not [string]::IsNullOrWhiteSpace($PhpExe)) {
    $phpCandidates += $PhpExe
}
if ($env:PHP_EXE) {
    $phpCandidates += $env:PHP_EXE
}
$phpCandidates += @(
    "C:\wamp64\bin\php\php8.4.15\php.exe",
    "C:\wamp64\bin\php\php8.5.0\php.exe"
)

$wampPhpRoot = "C:\wamp64\bin\php"
if (Test-Path -LiteralPath $wampPhpRoot) {
    $phpCandidates += Get-ChildItem -LiteralPath $wampPhpRoot -Directory |
        Sort-Object Name -Descending |
        ForEach-Object { Join-Path $_.FullName "php.exe" }
}

$php = $phpCandidates |
    Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
    Select-Object -Unique |
    Select-Object -First 1

if (-not $php) {
    throw "No PHP CLI executable found. Set -PhpExe or PHP_EXE."
}

$logDir = Join-Path $RepoRoot "php\logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$outLog = Join-Path $logDir "rtt-websocket-server.out.log"
$errLog = Join-Path $logDir "rtt-websocket-server.err.log"

$env:RTT_RELAY_PORT = [string]$Port
Start-Process `
    -FilePath $php `
    -ArgumentList "-f `"$relay`"" `
    -WorkingDirectory (Join-Path $RepoRoot "php") `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog `
    -WindowStyle Hidden

Start-Sleep -Seconds 2
$listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port } |
    Select-Object -First 1

if (-not $listener) {
    $err = if (Test-Path -LiteralPath $errLog) { Get-Content -LiteralPath $errLog -Tail 20 | Out-String } else { "" }
    throw "RTT relay did not start on port $Port. $err"
}

Write-Host "RTT relay started on port $Port (PID $($listener.OwningProcess)) using $php."
