param([Parameter(Mandatory = $true)][string]$PhpPath)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $PhpPath -PathType Leaf)) { throw 'PHP executable not found.' }
& $PhpPath (Join-Path $PSScriptRoot 'admin-worker.php')
exit $LASTEXITCODE
