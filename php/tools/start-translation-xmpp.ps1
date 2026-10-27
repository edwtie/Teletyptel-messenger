param(
    [string]$PhpPath = 'C:\wamp64\bin\php\php8.5.0\php.exe',
    [switch]$InstallAtLogon
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$worker = Join-Path $root 'php/tools/translation-xmpp-worker.php'
if (-not (Test-Path -LiteralPath $PhpPath)) { throw 'PHP executable not found.' }
if ($InstallAtLogon) {
    $launcher = Join-Path $PSScriptRoot 'start-translation-xmpp.ps1'
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $launcher + '" -PhpPath "' + $PhpPath + '"') -WorkingDirectory $root
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName 'TeleTypTel Translation XMPP' -Action $action -Trigger $trigger -Settings $settings -Description 'Private XEP-0171 translation service; no group membership.' -Force | Out-Null
}
if (Get-CimInstance Win32_Process -Filter "Name='php.exe'" | Where-Object { $_.CommandLine -like '*translation-xmpp-worker.php*' }) { return }
Start-Process -FilePath $PhpPath -ArgumentList ('"' + $worker + '"') -WorkingDirectory $root -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $root 'php/storage/translation-worker.out.log') `
    -RedirectStandardError (Join-Path $root 'php/storage/translation-worker.err.log')
