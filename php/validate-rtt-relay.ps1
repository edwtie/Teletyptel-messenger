$ErrorActionPreference = 'Stop'

$candidates = @()
$phpCommand = Get-Command php -ErrorAction SilentlyContinue
if ($phpCommand) {
    $candidates += $phpCommand.Source
}

$wampCandidates = Get-ChildItem 'C:\wamp64\bin\php' -Recurse -Filter php.exe -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -ExpandProperty FullName

$candidates += $wampCandidates
$php = $null

foreach ($candidate in $candidates | Select-Object -Unique) {
    $versionOutput = & $candidate -v 2>&1
    if ($LASTEXITCODE -eq 0 -and -not ($versionOutput -match 'Failed loading')) {
        $php = $candidate
        break
    }
}

if (-not $php) {
    throw 'PHP was not found. Install PHP or WAMP, then run this script again.'
}

$relay = Join-Path $PSScriptRoot 'rtt-websocket-server.php'

Write-Host "PHP: $php"
& $php -l $relay
if ($LASTEXITCODE -ne 0) {
    throw "PHP syntax validation failed with exit code $LASTEXITCODE."
}

Write-Host 'PHP RTT relay validation passed.'
