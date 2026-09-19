param(
  [Parameter(Mandatory = $true)][string]$FilePath,
  [string]$Thumbprint,
  [string]$TimestampUrl = "http://timestamp.digicert.com",
  [switch]$VerifyOnly
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $FilePath)) {
  throw "File to sign was not found: $FilePath"
}

function Find-SignTool {
  $fromPath = Get-Command signtool.exe -ErrorAction SilentlyContinue
  if ($fromPath) { return $fromPath.Source }

  $kitsRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'
  if (Test-Path $kitsRoot) {
    $candidate = Get-ChildItem $kitsRoot -Directory -ErrorAction SilentlyContinue |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName 'x64\signtool.exe' } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1
    if ($candidate) { return $candidate }
  }

  throw 'signtool.exe was not found. Install the Windows SDK on the build machine.'
}

$resolvedFile = (Resolve-Path $FilePath).Path
$signtool = Find-SignTool

if (-not $VerifyOnly) {
  if ([string]::IsNullOrWhiteSpace($Thumbprint)) {
    throw 'Certificate thumbprint is required when signing.'
  }

  Write-Host "Signing $resolvedFile" -ForegroundColor Cyan
  & $signtool sign /sha1 $Thumbprint /fd SHA256 /tr $TimestampUrl /td SHA256 $resolvedFile
  if ($LASTEXITCODE -ne 0) {
    throw "signtool failed to sign $resolvedFile"
  }
}

Write-Host "Verifying Authenticode signature: $resolvedFile" -ForegroundColor Cyan
& $signtool verify /pa /v $resolvedFile
if ($LASTEXITCODE -ne 0) {
  throw "Authenticode verification failed for $resolvedFile"
}

$signature = Get-AuthenticodeSignature $resolvedFile
if ($signature.Status -ne 'Valid') {
  throw "PowerShell signature verification returned '$($signature.Status)' for $resolvedFile"
}

Write-Host "Valid signature: $($signature.SignerCertificate.Subject)" -ForegroundColor Green
