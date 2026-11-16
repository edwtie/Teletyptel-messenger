[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$KeyFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (-not $IsWindows) { throw 'This local key installer requires Windows PowerShell 7.' }
$source = (Resolve-Path -LiteralPath $KeyFile).Path
if ([IO.Path]::GetFileName($source) -ne 'AuthKey_P23DMHKUQW.p8') { throw 'Unexpected APNs key identifier.' }
$directory = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'TeleTypTel\call-push'
$owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
$system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
if (-not (Test-Path -LiteralPath $directory)) {
    $permissions = [Security.AccessControl.DirectorySecurity]::new()
    $permissions.SetOwner($owner)
    $permissions.SetAccessRuleProtection($true, $false)
    foreach ($identity in @($owner, $system)) {
        $permissions.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($identity, 'FullControl',
            'ContainerInherit, ObjectInherit', 'None', 'Allow'))
    }
    $null = New-Item -ItemType Directory -Path $directory
    Set-Acl -LiteralPath $directory -AclObject $permissions
}
$permissions = Get-Acl -LiteralPath $directory
if (-not $permissions.AreAccessRulesProtected) { throw 'APNs directory inheritance must be protected.' }
foreach ($rule in $permissions.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow' -and $rule.IdentityReference.Value -notin @($owner.Value, $system.Value)) {
        throw 'APNs directory permits unexpected access.'
    }
}
$target = Join-Path $directory 'AuthKey_P23DMHKUQW.p8'
$privateBytes = [IO.File]::ReadAllBytes($source)
$private = $null
$public = $null
try {
    $private = [Security.Cryptography.ECDsa]::Create()
    $private.ImportFromPem([Text.Encoding]::UTF8.GetString($privateBytes))
    if ($private.KeySize -ne 256 -or $private.ExportParameters($false).Curve.Oid.Value -ne '1.2.840.10045.3.1.7') {
        throw 'APNs requires a P-256 signing key.'
    }
    $public = [Security.Cryptography.ECDsa]::Create($private.ExportParameters($false))
    $challenge = [Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
    $signature = $private.SignData($challenge, [Security.Cryptography.HashAlgorithmName]::SHA256)
    if (-not $public.VerifyData($challenge, $signature, [Security.Cryptography.HashAlgorithmName]::SHA256)) { throw 'APNs signing self-test failed.' }
    if (Test-Path -LiteralPath $target) {
        if ((Get-Item -LiteralPath $target).LinkType) { throw 'APNs key cannot be a link.' }
        if ((Get-FileHash -LiteralPath $target).Hash -ne (Get-FileHash -LiteralPath $source).Hash) { throw 'Existing APNs key differs; review rotation explicitly.' }
    } else { [IO.File]::WriteAllBytes($target, $privateBytes) }
    $config = Join-Path $directory 'apns-production.json'
    $settings = [ordered]@{ version = 1; environment = 'production'; keyId = 'P23DMHKUQW'; teamId = 'H29RTRBD9D'; keyFile = $target }
    if (Test-Path -LiteralPath $config) {
        $existing = Get-Content -LiteralPath $config -Raw | ConvertFrom-Json
        foreach ($name in $settings.Keys) { if ($existing.$name -ne $settings[$name]) { throw 'Existing APNs configuration differs.' } }
    } else { [IO.File]::WriteAllText($config, ($settings | ConvertTo-Json), [Text.UTF8Encoding]::new($false)) }
    [pscustomobject]@{ ConfigurationPath = $config; SigningVerified = $true; Environment = 'production'; PrivateKeyUploaded = $false; PushSent = $false }
} finally {
    [Array]::Clear($privateBytes, 0, $privateBytes.Length)
    if ($null -ne $private) { $private.Dispose() }
    if ($null -ne $public) { $public.Dispose() }
}
