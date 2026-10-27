param([string]$BaseUrl = 'https://dev.teletyptel.nl')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.CookieContainer = [System.Net.CookieContainer]::new()
$client = [System.Net.Http.HttpClient]::new($handler)
$checks = 0
function Assert-Intake([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
    $script:checks++
}
function Get-Intake([string]$Route) {
    $response = $client.GetAsync($BaseUrl.TrimEnd('/') + $Route).GetAwaiter().GetResult()
    $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    Assert-Intake $response.Headers.CacheControl.NoStore "Missing no-store: $Route"
    return @{ Status = [int]$response.StatusCode; Body = $body; Response = $response }
}
function Post-Intake([string]$Route, [hashtable]$Payload, [string]$Token = '') {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, $BaseUrl.TrimEnd('/') + $Route)
    if ($Token) {
        $request.Headers.Add('X-CSRF-Token', $Token)
        $request.Headers.Add('X-TeleTypTel-CSRF', $Token)
    }
    $request.Content = [System.Net.Http.StringContent]::new(($Payload | ConvertTo-Json -Compress), [System.Text.Encoding]::UTF8, 'application/json')
    try {
        $response = $client.SendAsync($request).GetAwaiter().GetResult()
        $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        Assert-Intake $response.Headers.CacheControl.NoStore "Missing no-store: $Route"
        return @{ Status = [int]$response.StatusCode; Body = $body }
    } finally { $request.Dispose() }
}
try {
    $result = Get-Intake '/admin/'
    Assert-Intake ($result.Status -eq 200) 'Admin page available'
    Assert-Intake ($result.Body -match 'id="staffNavLink"' -and $result.Body -match 'href="#staff"') 'Staff sidebar link rendered'
    Assert-Intake ($result.Body -match 'id="staffRows"' -and $result.Body -match 'id="staffActionForm"') 'Staff list and management dialog rendered'
    Assert-Intake ($result.Body -match 'id="userDetailsPanel"' -and $result.Body -match 'id="userAccountForm"') 'User management detail page rendered'
    Assert-Intake ($result.Body -notmatch 'userDetailsDialog') 'User management no longer uses a nested dialog'
    Assert-Intake ($result.Body -match 'id="selectAllUsers"' -and $result.Body -match 'id="userBulkBar"' -and $result.Body -match 'id="userBulkTrash"') 'User selection and contextual actions rendered'
    Assert-Intake ($result.Body -match 'id="userBulkDialog"' -and $result.Body -match 'id="userBulkPassword"') 'Bulk action confirmation rendered'
    foreach ($route in @('/aanmelden/', '/admin/aanmeldingen.php')) {
        $result = Get-Intake $route
        Assert-Intake ($result.Status -eq 200) "Page failed: $route"
        Assert-Intake ($result.Response.Headers.Contains('Content-Security-Policy')) "Missing CSP: $route"
        Assert-Intake ($result.Response.Headers.Contains('X-Frame-Options')) "Missing frame protection: $route"
    }
    $result = Get-Intake '/aanmelden/api.php?accountId=fixture-only'
    $data = $result.Body | ConvertFrom-Json
    Assert-Intake ($result.Status -eq 200 -and $null -eq $data.account -and $null -eq $data.application -and -not $data.fresh) 'Guest cannot choose a target account'
    foreach ($action in @('start', 'save_details', 'upload', 'submit', 'withdraw', 'reveal_bsn', 'document')) {
        $result = Post-Intake '/aanmelden/api.php' @{ action = $action; accountId = 'fixture-only'; id = ('0' * 32); version = 1 } $data.csrfToken
        Assert-Intake ($result.Status -eq 403) "Guest POST not denied: $action"
        Assert-Intake (-not ($result.Body | ConvertFrom-Json).ok) "Guest action unexpectedly successful: $action"
    }
    $result = Post-Intake '/aanmelden/api.php' @{ action = 'start' }
    Assert-Intake ($result.Status -eq 403) 'CSRF-free POST denied'
    $result = Get-Intake '/admin/api.php?action=session'
    $session = $result.Body | ConvertFrom-Json
    Assert-Intake ($null -eq $session.admin) 'Fresh HTTP client is not an administrator'
    foreach ($action in @('intake_list', 'intake_view', 'intake_config', 'intake_members')) {
        $result = Get-Intake ("/admin/api.php?action=$action&id=" + ('0' * 32))
        Assert-Intake ($result.Status -eq 403) "Guest admin GET not denied: $action"
    }
    foreach ($action in @('intake_rule', 'intake_team', 'intake_staff', 'intake_staff_status', 'intake_review', 'intake_bsn', 'intake_document', 'bulk_accounts')) {
        $result = Post-Intake '/admin/api.php' @{ action = $action; id = ('0' * 32) } $session.csrfToken
        Assert-Intake ($result.Status -eq 403) "Guest admin POST not denied: $action"
    }
    Write-Output "Live HTTPS intake: $checks checks passed; guests only, no accounts or documents created."
} finally {
    $client.Dispose()
    $handler.Dispose()
}
