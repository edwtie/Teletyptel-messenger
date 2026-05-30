param(
    [string[]]$Domains = @("uuxo.net", "conversations.im", "jabber.at"),
    [string]$DomainsFile = "",
    [switch]$IncludeBoshDiscovery,
    [switch]$NoBuild,
    [int]$TimeoutSeconds = 20,
    [string]$BadHost = "wrong.example.org",
    [string]$Configuration = "Release",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $repoRoot "tools\Tiedragon.XmppMessenger.RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.csproj"

function Normalize-Domain {
    param([string]$Value)

    $text = ""
    if ($null -ne $Value) {
        $text = $Value.Trim()
    }
    if ($text.Length -eq 0 -or $text.StartsWith("#", [StringComparison]::Ordinal)) {
        return ""
    }

    $commentIndex = $text.IndexOf("#", [StringComparison]::Ordinal)
    if ($commentIndex -ge 0) {
        $text = $text.Substring(0, $commentIndex).Trim()
    }

    if ($text.StartsWith("xmpp:", [StringComparison]::OrdinalIgnoreCase)) {
        $text = $text.Substring(5)
    }

    if ($text.IndexOf("://", [StringComparison]::Ordinal) -ge 0) {
        $uri = [Uri]$text
        $text = $uri.Host
    }

    if ($text.IndexOf("/", [StringComparison]::Ordinal) -ge 0) {
        $text = $text.Split("/")[0]
    }

    return $text.Trim().ToLowerInvariant()
}

function New-DotnetRunArguments {
    param(
        [string]$Domain,
        [bool]$Bosh
    )

    $arguments = [System.Collections.Generic.List[string]]::new()
    $arguments.Add("run")
    $arguments.Add("--no-build")
    $arguments.Add("--configuration")
    $arguments.Add($Configuration)
    $arguments.Add("--project")
    $arguments.Add($projectPath)
    $arguments.Add("--")

    if ($Bosh) {
        $arguments.Add("--discover-bosh")
        $arguments.Add("--bosh-discovery-only")
    } else {
        $arguments.Add("--discover-direct-tls")
        $arguments.Add("--tls-only")
        $arguments.Add("--bad-host")
        $arguments.Add($BadHost)
    }

    $arguments.Add("--account1")
    $arguments.Add("smoke@$Domain/teletyptel")
    $arguments.Add("--password1")
    $arguments.Add("dummy")
    $arguments.Add("--timeout-seconds")
    $arguments.Add([string]$TimeoutSeconds)
    return $arguments
}

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

function Invoke-SmokeProbe {
    param(
        [string]$Domain,
        [bool]$Bosh
    )

    $arguments = New-DotnetRunArguments -Domain $Domain -Bosh $Bosh
    $stdoutFile = New-TemporaryFile
    $stderrFile = New-TemporaryFile
    try {
        $process = Start-Process `
            -FilePath "dotnet" `
            -ArgumentList (ConvertTo-ProcessArgumentString $arguments) `
            -Wait `
            -PassThru `
            -NoNewWindow `
            -RedirectStandardOutput $stdoutFile `
            -RedirectStandardError $stderrFile
        $exitCode = $process.ExitCode
        $stdout = Get-Content -LiteralPath $stdoutFile -Raw
        $stderr = Get-Content -LiteralPath $stderrFile -Raw
        $text = ($stdout + $stderr).TrimEnd()
    } finally {
        Remove-Item -LiteralPath $stdoutFile -Force -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $stderrFile -Force -ErrorAction SilentlyContinue
    }

    [pscustomobject]@{
        Domain = $Domain
        Kind = if ($Bosh) { "BOSH" } else { "TLS" }
        Passed = $exitCode -eq 0
        ExitCode = $exitCode
        Output = $text
    }
}

$allDomains = [System.Collections.Generic.List[string]]::new()
foreach ($domain in $Domains) {
    $normalized = Normalize-Domain $domain
    if ($normalized.Length -gt 0) {
        $allDomains.Add($normalized)
    }
}

if (-not [string]::IsNullOrWhiteSpace($DomainsFile)) {
    $domainFilePath = Resolve-Path -LiteralPath $DomainsFile
    foreach ($line in Get-Content -LiteralPath $domainFilePath) {
        $normalized = Normalize-Domain $line
        if ($normalized.Length -gt 0) {
            $allDomains.Add($normalized)
        }
    }
}

$uniqueDomains = @($allDomains | Select-Object -Unique)
if ($uniqueDomains.Count -eq 0) {
    throw "No provider domains supplied."
}

if (-not $NoBuild.IsPresent) {
    dotnet build $projectPath --configuration $Configuration
    if ($LASTEXITCODE -ne 0) {
        throw "RealServerSmoke build failed with exit code $LASTEXITCODE."
    }
}

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path $repoRoot "artifacts\public-server-probes\public-provider-probe-$stamp.md"
}

$outputDirectory = Split-Path -Parent $OutputPath
if (-not [string]::IsNullOrWhiteSpace($outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$started = Get-Date
$results = [System.Collections.Generic.List[object]]::new()

Write-Host "Probing public XMPP provider candidates..." -ForegroundColor Cyan
foreach ($domain in $uniqueDomains) {
    Write-Host "TLS probe: $domain" -ForegroundColor Cyan
    $tls = Invoke-SmokeProbe -Domain $domain -Bosh $false
    $results.Add($tls)
    $tlsStatus = if ($tls.Passed) { "PASS" } else { "FAIL" }
    $tlsColor = if ($tls.Passed) { "Green" } else { "Red" }
    Write-Host ("  {0}" -f $tlsStatus) -ForegroundColor $tlsColor

    if ($IncludeBoshDiscovery.IsPresent) {
        Write-Host "BOSH discovery: $domain" -ForegroundColor Cyan
        $bosh = Invoke-SmokeProbe -Domain $domain -Bosh $true
        $results.Add($bosh)
        $boshStatus = if ($bosh.Passed) { "PASS" } else { "FAIL" }
        $boshColor = if ($bosh.Passed) { "Green" } else { "Yellow" }
        Write-Host ("  {0}" -f $boshStatus) -ForegroundColor $boshColor
    }
}

$finished = Get-Date
$generatedText = $finished.ToString("yyyy-MM-dd HH:mm:ss zzz")
$startedText = $started.ToString("yyyy-MM-dd HH:mm:ss zzz")
$finishedText = $finished.ToString("yyyy-MM-dd HH:mm:ss zzz")
$report = [System.Text.StringBuilder]::new()
[void]$report.AppendLine("# Public XMPP Provider Probe")
[void]$report.AppendLine()
[void]$report.AppendLine("Generated: $generatedText")
[void]$report.AppendLine()
[void]$report.AppendLine("This report is candidate evidence for Teletyptel public-server testing. It is not an endorsement of a provider.")
[void]$report.AppendLine()
[void]$report.AppendLine("| Domain | TLS | BOSH |")
[void]$report.AppendLine("| --- | --- | --- |")

foreach ($domain in $uniqueDomains) {
    $tls = $results | Where-Object { $_.Domain -eq $domain -and $_.Kind -eq "TLS" } | Select-Object -First 1
    $bosh = $results | Where-Object { $_.Domain -eq $domain -and $_.Kind -eq "BOSH" } | Select-Object -First 1
    $tlsText = if ($tls.Passed) { "PASS" } else { "FAIL" }
    $boshText = if ($null -eq $bosh) { "not checked" } elseif ($bosh.Passed) { "PASS" } else { "FAIL" }
    [void]$report.AppendLine("| $domain | $tlsText | $boshText |")
}

[void]$report.AppendLine()
[void]$report.AppendLine("## Details")
[void]$report.AppendLine()

foreach ($result in $results) {
    $status = if ($result.Passed) { "PASS" } else { "FAIL" }
    [void]$report.AppendLine("### $($result.Domain) - $($result.Kind) - $status")
    [void]$report.AppendLine()
    [void]$report.AppendLine('```text')
    [void]$report.AppendLine($result.Output)
    [void]$report.AppendLine('```')
    [void]$report.AppendLine()
}

[void]$report.AppendLine("Started: $startedText")
[void]$report.AppendLine("Finished: $finishedText")

Set-Content -LiteralPath $OutputPath -Value $report.ToString() -Encoding UTF8

Write-Host "Probe report written to $OutputPath" -ForegroundColor Green
