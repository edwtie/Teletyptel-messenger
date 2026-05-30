param(
    [Parameter(Mandatory = $true)]
    [string]$Account,

    [string]$PasswordEnv = "",
    [string]$Password = "",
    [switch]$DiscoverDirectTls,
    [string]$HostName = "",
    [int]$Port = 0,
    [string]$BadHost = "wrong.example.org",
    [int]$TimeoutSeconds = 180,
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($PasswordEnv) -and [string]::IsNullOrWhiteSpace($Password)) {
    throw "Pass -PasswordEnv or -Password."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repoRoot "tools\Tiedragon.XmppMessenger.RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.csproj"
$helperPath = Join-Path $PSScriptRoot "show-captcha-prompt.ps1"
$answerPath = Join-Path $repoRoot ("artifacts\secrets\captcha-answer-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt")
Remove-Item -LiteralPath $answerPath -Force -ErrorAction SilentlyContinue

function ConvertTo-ProcessArgumentString {
    param([System.Collections.Generic.List[string]]$Arguments)

    $quoted = foreach ($argument in $Arguments) {
        if ($argument.IndexOfAny([char[]]@(" ", "`t", "`n", '"')) -lt 0) {
            $argument
        } else {
            '"' + $argument.Replace('"', '\"') + '"'
        }
    }

    return ($quoted -join " ")
}

if ([string]::IsNullOrWhiteSpace($PasswordEnv)) {
    $PasswordEnv = "TELETYPTEL_REGISTRATION_PASSWORD"
    [Environment]::SetEnvironmentVariable($PasswordEnv, $Password, "Process")
}

$arguments = [System.Collections.Generic.List[string]]::new()
$arguments.Add("run")
$arguments.Add("--no-build")
$arguments.Add("--configuration")
$arguments.Add($Configuration)
$arguments.Add("--project")
$arguments.Add($projectPath)
$arguments.Add("--")
if ($DiscoverDirectTls.IsPresent) {
    $arguments.Add("--discover-direct-tls")
}

if (-not [string]::IsNullOrWhiteSpace($HostName)) {
    $arguments.Add("--host")
    $arguments.Add($HostName)
}

if ($Port -gt 0) {
    $arguments.Add("--port")
    $arguments.Add([string]$Port)
}

$arguments.Add("--register")
$arguments.Add("--registration-prompt")
$arguments.Add("--account1")
$arguments.Add($Account)
$arguments.Add("--password1-env")
$arguments.Add($PasswordEnv)
$arguments.Add("--bad-host")
$arguments.Add($BadHost)
$arguments.Add("--timeout-seconds")
$arguments.Add([string]$TimeoutSeconds)

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = "dotnet"
$startInfo.Arguments = ConvertTo-ProcessArgumentString $arguments
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardInput = $true
$startInfo.RedirectStandardOutput = $true
$startInfo.RedirectStandardError = $true
$startInfo.CreateNoWindow = $true

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo

Write-Host "Starting XEP-0077 registration for $Account" -ForegroundColor Cyan
[void]$process.Start()

$captchaAnswered = $false
while (-not $process.HasExited) {
    $line = $process.StandardOutput.ReadLine()
    if ($null -eq $line) {
        break
    }

    Write-Host $line
    if (-not $captchaAnswered -and $line -match 'value:\s*(https?://\S+/captcha/\S+)') {
        $captchaUrl = $Matches[1]
        Write-Host "Opening CAPTCHA helper: $captchaUrl" -ForegroundColor Cyan
        $helper = Start-Process `
            -FilePath "powershell.exe" `
            -ArgumentList @(
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-STA",
                "-File",
                $helperPath,
                "-ImageUrl",
                $captchaUrl,
                "-OutputPath",
                $answerPath,
                "-Title",
                "Teletyptel account registration"
            ) `
            -Wait `
            -PassThru
        if ($helper.ExitCode -ne 0) {
            $process.Kill()
            throw "CAPTCHA helper was cancelled or failed with exit code $($helper.ExitCode)."
        }

        $answer = (Get-Content -LiteralPath $answerPath -Raw).Trim()
        if ([string]::IsNullOrWhiteSpace($answer)) {
            $process.Kill()
            throw "CAPTCHA answer was empty."
        }

        $process.StandardInput.WriteLine($answer)
        $process.StandardInput.Flush()
        $captchaAnswered = $true
    }
}

$process.WaitForExit()
$stderr = $process.StandardError.ReadToEnd()
if (-not [string]::IsNullOrWhiteSpace($stderr)) {
    Write-Host $stderr.TrimEnd()
}

if ($process.ExitCode -ne 0) {
    throw "Registration failed with exit code $($process.ExitCode)."
}

Write-Host "Registration completed for $Account" -ForegroundColor Green
