param(
  [Parameter(Mandatory = $true)][string]$CertificateBase64,
  [Parameter(Mandatory = $true)][string]$CertificatePassword,
  [Parameter(Mandatory = $true)][string]$TauriConfigPath,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($CertificateBase64)) {
  throw "WINDOWS_CERTIFICATE_BASE64 is empty."
}
if ([string]::IsNullOrWhiteSpace($CertificatePassword)) {
  throw "WINDOWS_CERTIFICATE_PASSWORD is empty."
}
if (-not (Test-Path $TauriConfigPath)) {
  throw "Tauri config not found: $TauriConfigPath"
}

$normalizedBase64 = $CertificateBase64 -replace '\s', ''
try {
  $certificateBytes = [Convert]::FromBase64String($normalizedBase64)
} catch {
  throw "WINDOWS_CERTIFICATE_BASE64 is not valid Base64."
}

$tempPfx = Join-Path ([IO.Path]::GetTempPath()) ("virtual-company-codesign-{0}.pfx" -f [Guid]::NewGuid().ToString("N"))
[IO.File]::WriteAllBytes($tempPfx, $certificateBytes)

try {
  $securePassword = ConvertTo-SecureString -String $CertificatePassword -Force -AsPlainText
  $importArgs = @{
    FilePath = $tempPfx
    CertStoreLocation = 'Cert:\CurrentUser\My'
    Password = $securePassword
  }
  $importedCertificates = @(Import-PfxCertificate @importArgs)
  $certificate = $importedCertificates | Where-Object { $_.HasPrivateKey } | Select-Object -First 1

  if (-not $certificate) {
    throw "The PFX certificate could not be imported with a private key."
  }
  if ($certificate.NotAfter -le (Get-Date)) {
    throw "The imported code-signing certificate is expired."
  }

  $thumbprint = ($certificate.Thumbprint -replace '\s', '').ToUpperInvariant()
  Write-Host "Imported Windows signing certificate: $($certificate.Subject)" -ForegroundColor Green
  Write-Host "Certificate thumbprint: $thumbprint" -ForegroundColor DarkGray
  Write-Host "Certificate expires: $($certificate.NotAfter.ToString('u'))" -ForegroundColor DarkGray

  $config = Get-Content $TauriConfigPath -Raw | ConvertFrom-Json
  if (-not $config.bundle) { throw "Tauri bundle configuration is missing." }
  if (-not $config.bundle.windows) { throw "Tauri Windows bundle configuration is missing." }

  $config.bundle.windows | Add-Member -NotePropertyName certificateThumbprint -NotePropertyValue $thumbprint -Force
  $config.bundle.windows | Add-Member -NotePropertyName digestAlgorithm -NotePropertyValue "sha256" -Force
  $config.bundle.windows | Add-Member -NotePropertyName timestampUrl -NotePropertyValue $TimestampUrl -Force
  $config.bundle.windows | Add-Member -NotePropertyName tsp -NotePropertyValue $true -Force
  $config | ConvertTo-Json -Depth 40 | Set-Content $TauriConfigPath -Encoding utf8

  if ($env:GITHUB_ENV) {
    "WINDOWS_CERT_THUMBPRINT=$thumbprint" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
    "WINDOWS_TIMESTAMP_URL=$TimestampUrl" | Out-File -FilePath $env:GITHUB_ENV -Encoding utf8 -Append
  }

  if ($env:GITHUB_STEP_SUMMARY) {
    "### Windows Authenticode signing" | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
    "Certificate: ``$($certificate.Subject)``" | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
    "Expires: ``$($certificate.NotAfter.ToString('yyyy-MM-dd'))``" | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
    "Digest: ``SHA-256``" | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
    "Timestamp: ``$TimestampUrl``" | Out-File -FilePath $env:GITHUB_STEP_SUMMARY -Encoding utf8 -Append
  }
} finally {
  if (Test-Path $tempPfx) {
    Remove-Item $tempPfx -Force
  }
  if ($certificateBytes) {
    [Array]::Clear($certificateBytes, 0, $certificateBytes.Length)
  }
}
