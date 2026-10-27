param([Parameter(Mandatory = $true)][string]$PhpPath)
$ErrorActionPreference = 'Stop'
$phpExecutable = (Resolve-Path -LiteralPath $PhpPath).Path
$launcher = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'admin-worker.ps1')).Path
$worker = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'admin-worker.php')).Path
$taskName = 'TeleTypTel Admin Worker'
$legacyArguments = '-NoProfile -NonInteractive -WindowStyle Hidden -File "' + $launcher + '" -PhpPath "' + $phpExecutable + '"'
$nativeCommand = "& '" + $phpExecutable.Replace("'", "''") + "' '" + $worker.Replace("'", "''") + "'; exit " + '$LASTEXITCODE'
$arguments = '-NoProfile -NonInteractive -WindowStyle Hidden -Command "' + $nativeCommand + '"'
$action = New-ScheduledTaskAction -Execute (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -Argument $arguments -WorkingDirectory $PSScriptRoot
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Actions.Count -ne 1 -or $existing.Actions.Arguments -notin @($arguments, $legacyArguments)) { throw 'A different task already uses this name; inspect it before replacing it.' }
    if ($existing.Actions.Arguments -ne $arguments) {
        Stop-ScheduledTask -TaskName $taskName
        Set-ScheduledTask -TaskName $taskName -Action $action | Out-Null
    }
} else {
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
    $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'TeleTypTel scheduled subscription changes and recurring invoices; runs while this user is logged in.' | Out-Null
}
Start-ScheduledTask -TaskName $taskName
Write-Output 'TeleTypTel worker scheduled every minute while this Windows user is logged in.'
