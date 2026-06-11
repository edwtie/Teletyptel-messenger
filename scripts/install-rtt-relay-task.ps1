param(
    [string]$TaskName = "TeleTypTel RTT Relay",
    [int]$Port = 8787,
    [string]$PhpExe = "C:\wamp64\bin\php\php8.4.15\php.exe"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $PSScriptRoot "start-rtt-relay.ps1"

if (-not (Test-Path -LiteralPath $startScript)) {
    throw "Start script not found: $startScript"
}

$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$startScript`" -Port $Port -PhpExe `"$PhpExe`" -RepoRoot `"$repoRoot`""

try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $arguments
    $trigger = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description "Starts the TeleTypTel PHP RTT/WebSocket relay on port $Port." `
        -Force | Out-Null

    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Installed scheduled task '$TaskName'."
} catch {
    $startup = [Environment]::GetFolderPath("Startup")
    if ([string]::IsNullOrWhiteSpace($startup)) {
        throw
    }

    $cmdPath = Join-Path $startup "TeleTypTel RTT Relay.cmd"
    $cmd = @"
@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$startScript" -Port $Port -PhpExe "$PhpExe" -RepoRoot "$repoRoot"
"@
    Set-Content -LiteralPath $cmdPath -Value $cmd -Encoding ASCII
    Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WindowStyle Hidden
    Write-Host "Scheduled task registration failed: $($_.Exception.Message)"
    Write-Host "Installed user Startup fallback: $cmdPath"
}
Start-Sleep -Seconds 3

$listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Where-Object { $_.LocalPort -eq $Port } |
    Select-Object -First 1

if (-not $listener) {
    throw "Scheduled task was installed, but the RTT relay is not listening on port $Port."
}

Write-Host "RTT relay is listening on port $Port (PID $($listener.OwningProcess))."
