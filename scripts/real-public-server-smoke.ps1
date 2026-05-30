param(
    [switch]$NoBuild,
    [switch]$TlsOnly,
    [switch]$Register,
    [switch]$DirectTls,
    [switch]$DiscoverDirectTls,
    [switch]$DiscoverBosh,
    [switch]$BoshOnly,
    [switch]$MucAdmin,
    [switch]$Socks5Smoke,
    [switch]$IbbSmoke,
    [switch]$MamSmoke,
    [switch]$MucMamSmoke,
    [switch]$CorrectionSmoke,
    [string]$Configuration = "Release"
)

$ErrorActionPreference = "Stop"

function Get-Setting {
    param(
        [string[]]$Names,
        [string]$Default = ""
    )

    foreach ($name in $Names) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            return $value
        }
    }

    return $Default
}

function Add-ValueArgument {
    param(
        [System.Collections.Generic.List[string]]$Arguments,
        [string]$Name,
        [string]$Value
    )

    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        $Arguments.Add($Name)
        $Arguments.Add($Value)
    }
}

function Add-SwitchArgument {
    param(
        [System.Collections.Generic.List[string]]$Arguments,
        [string]$Name,
        [bool]$Enabled
    )

    if ($Enabled) {
        $Arguments.Add($Name)
    }
}

$account1 = Get-Setting @("TELETYPTEL_XMPP_ACCOUNT1", "TELETYPTEL_ACCOUNT1", "TT_XMPP_ACCOUNT1")
$password1Env = Get-Setting -Names @("TELETYPTEL_XMPP_PASSWORD1_ENV", "TT_XMPP_PASSWORD1_ENV") -Default "TELETYPTEL_XMPP_PASSWORD1"
$password1 = [Environment]::GetEnvironmentVariable($password1Env)
if ([string]::IsNullOrWhiteSpace($password1)) {
    $password1 = Get-Setting @("TELETYPTEL_PASSWORD1", "TT_XMPP_PASSWORD1")
    if (-not [string]::IsNullOrWhiteSpace($password1)) {
        [Environment]::SetEnvironmentVariable($password1Env, $password1)
    }
}

if ([string]::IsNullOrWhiteSpace($account1) -or [string]::IsNullOrWhiteSpace($password1)) {
    throw "Set TELETYPTEL_XMPP_ACCOUNT1 and TELETYPTEL_XMPP_PASSWORD1 before running this script."
}

$account2 = Get-Setting @("TELETYPTEL_XMPP_ACCOUNT2", "TELETYPTEL_ACCOUNT2", "TT_XMPP_ACCOUNT2")
$password2Env = Get-Setting -Names @("TELETYPTEL_XMPP_PASSWORD2_ENV", "TT_XMPP_PASSWORD2_ENV") -Default "TELETYPTEL_XMPP_PASSWORD2"
$password2 = [Environment]::GetEnvironmentVariable($password2Env)
if ([string]::IsNullOrWhiteSpace($password2)) {
    $password2 = Get-Setting @("TELETYPTEL_PASSWORD2", "TT_XMPP_PASSWORD2")
    if (-not [string]::IsNullOrWhiteSpace($password2)) {
        [Environment]::SetEnvironmentVariable($password2Env, $password2)
    }
}
if (-not [string]::IsNullOrWhiteSpace($account2) -and [string]::IsNullOrWhiteSpace($password2)) {
    throw "Set $password2Env before running the two-account smoke."
}

$hostName = Get-Setting @("TELETYPTEL_XMPP_HOST", "TT_XMPP_HOST")
$port = Get-Setting @("TELETYPTEL_XMPP_PORT", "TT_XMPP_PORT")
$badHost = Get-Setting -Names @("TELETYPTEL_XMPP_BAD_HOST", "TT_XMPP_BAD_HOST") -Default "wrong.example.org"
$timeout = Get-Setting -Names @("TELETYPTEL_XMPP_TIMEOUT_SECONDS", "TT_XMPP_TIMEOUT_SECONDS") -Default "45"
$mucService = Get-Setting @("TELETYPTEL_XMPP_MUC_SERVICE", "TT_XMPP_MUC_SERVICE")
$mucRoom = Get-Setting @("TELETYPTEL_XMPP_MUC_ROOM", "TT_XMPP_MUC_ROOM")
$mucNick1 = Get-Setting @("TELETYPTEL_XMPP_MUC_NICK1", "TT_XMPP_MUC_NICK1")
$mucNick2 = Get-Setting @("TELETYPTEL_XMPP_MUC_NICK2", "TT_XMPP_MUC_NICK2")
$uploadService = Get-Setting @("TELETYPTEL_XMPP_UPLOAD_SERVICE", "TT_XMPP_UPLOAD_SERVICE")
$uploadFile = Get-Setting @("TELETYPTEL_XMPP_UPLOAD_FILE", "TT_XMPP_UPLOAD_FILE")
$uploadRecipient = Get-Setting -Names @("TELETYPTEL_XMPP_UPLOAD_RECIPIENT", "TT_XMPP_UPLOAD_RECIPIENT") -Default $account2
$externalService = Get-Setting @("TELETYPTEL_XMPP_EXTERNAL_SERVICE", "TT_XMPP_EXTERNAL_SERVICE")
$externalServiceType = Get-Setting @("TELETYPTEL_XMPP_EXTERNAL_SERVICE_TYPE", "TT_XMPP_EXTERNAL_SERVICE_TYPE")
$boshUrl = Get-Setting @("TELETYPTEL_XMPP_BOSH_URL", "TT_XMPP_BOSH_URL")
$blockJid = Get-Setting @("TELETYPTEL_XMPP_BLOCK_JID", "TT_XMPP_BLOCK_JID")
$socks5Proxy = Get-Setting @("TELETYPTEL_XMPP_SOCKS5_PROXY", "TT_XMPP_SOCKS5_PROXY")
$socks5SmokeSetting = Get-Setting @("TELETYPTEL_XMPP_SOCKS5_SMOKE", "TT_XMPP_SOCKS5_SMOKE")
$ibbSmokeSetting = Get-Setting @("TELETYPTEL_XMPP_IBB_SMOKE", "TT_XMPP_IBB_SMOKE")
$mamSmokeSetting = Get-Setting @("TELETYPTEL_XMPP_MAM_SMOKE", "TT_XMPP_MAM_SMOKE")
$mucMamSmokeSetting = Get-Setting @("TELETYPTEL_XMPP_MUC_MAM_SMOKE", "TT_XMPP_MUC_MAM_SMOKE")
$correctionSmokeSetting = Get-Setting @("TELETYPTEL_XMPP_CORRECTION_SMOKE", "TT_XMPP_CORRECTION_SMOKE")
$directTlsSetting = Get-Setting @("TELETYPTEL_XMPP_DIRECT_TLS", "TT_XMPP_DIRECT_TLS")
$directTlsEnabled = $DirectTls.IsPresent -or $directTlsSetting -match '^(1|true|yes|ja)$'
$socks5SmokeEnabled = $Socks5Smoke.IsPresent -or ($socks5SmokeSetting -match '^(1|true|yes|ja)$') -or (-not [string]::IsNullOrWhiteSpace($socks5Proxy))
$ibbSmokeEnabled = $IbbSmoke.IsPresent -or ($ibbSmokeSetting -match '^(1|true|yes|ja)$')
$mamSmokeEnabled = $MamSmoke.IsPresent -or ($mamSmokeSetting -match '^(1|true|yes|ja)$')
$mucMamSmokeEnabled = $MucMamSmoke.IsPresent -or ($mucMamSmokeSetting -match '^(1|true|yes|ja)$')
$correctionSmokeEnabled = $CorrectionSmoke.IsPresent -or ($correctionSmokeSetting -match '^(1|true|yes|ja)$')

$smokeArgs = [System.Collections.Generic.List[string]]::new()
Add-ValueArgument $smokeArgs "--account1" $account1
Add-ValueArgument $smokeArgs "--password1-env" $password1Env
Add-ValueArgument $smokeArgs "--account2" $account2
Add-ValueArgument $smokeArgs "--password2-env" $password2Env
Add-ValueArgument $smokeArgs "--host" $hostName
Add-ValueArgument $smokeArgs "--port" $port
Add-ValueArgument $smokeArgs "--bad-host" $badHost
Add-ValueArgument $smokeArgs "--timeout-seconds" $timeout
Add-ValueArgument $smokeArgs "--muc-service" $mucService
Add-ValueArgument $smokeArgs "--muc-room" $mucRoom
Add-ValueArgument $smokeArgs "--muc-nick1" $mucNick1
Add-ValueArgument $smokeArgs "--muc-nick2" $mucNick2
Add-ValueArgument $smokeArgs "--upload-service" $uploadService
Add-ValueArgument $smokeArgs "--upload-file" $uploadFile
Add-ValueArgument $smokeArgs "--upload-recipient" $uploadRecipient
Add-ValueArgument $smokeArgs "--external-service" $externalService
Add-ValueArgument $smokeArgs "--external-service-type" $externalServiceType
Add-ValueArgument $smokeArgs "--bosh-url" $boshUrl
Add-ValueArgument $smokeArgs "--block-jid" $blockJid
Add-ValueArgument $smokeArgs "--socks5-proxy" $socks5Proxy

Add-SwitchArgument $smokeArgs "--tls-only" $TlsOnly.IsPresent
Add-SwitchArgument $smokeArgs "--register" $Register.IsPresent
Add-SwitchArgument $smokeArgs "--direct-tls" $directTlsEnabled
Add-SwitchArgument $smokeArgs "--discover-direct-tls" ($DiscoverDirectTls.IsPresent -or [string]::IsNullOrWhiteSpace($hostName))
Add-SwitchArgument $smokeArgs "--discover-bosh" $DiscoverBosh.IsPresent
Add-SwitchArgument $smokeArgs "--bosh-only" $BoshOnly.IsPresent
Add-SwitchArgument $smokeArgs "--muc-admin" $MucAdmin.IsPresent
Add-SwitchArgument $smokeArgs "--external-services" (-not [string]::IsNullOrWhiteSpace($externalService) -or -not [string]::IsNullOrWhiteSpace($externalServiceType))
Add-SwitchArgument $smokeArgs "--socks5-smoke" $socks5SmokeEnabled
Add-SwitchArgument $smokeArgs "--ibb-smoke" $ibbSmokeEnabled
Add-SwitchArgument $smokeArgs "--mam-smoke" $mamSmokeEnabled
Add-SwitchArgument $smokeArgs "--muc-mam-smoke" $mucMamSmokeEnabled
Add-SwitchArgument $smokeArgs "--correction-smoke" $correctionSmokeEnabled

$dotnetArgs = [System.Collections.Generic.List[string]]::new()
$dotnetArgs.Add("run")
if ($NoBuild.IsPresent) {
    $dotnetArgs.Add("--no-build")
}

$dotnetArgs.Add("--configuration")
$dotnetArgs.Add($Configuration)
$dotnetArgs.Add("--project")
$dotnetArgs.Add("tools\Tiedragon.XmppMessenger.RealServerSmoke\Tiedragon.XmppMessenger.RealServerSmoke.csproj")
$dotnetArgs.Add("--")
foreach ($arg in $smokeArgs) {
    $dotnetArgs.Add($arg)
}

Write-Host "Running public-server smoke for $account1" -ForegroundColor Cyan
if (-not [string]::IsNullOrWhiteSpace($account2)) {
    Write-Host "Second account: $account2" -ForegroundColor Cyan
}

& dotnet @dotnetArgs
