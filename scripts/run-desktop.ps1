param(
  [switch]$Build,
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $root "frontend"

& (Join-Path $PSScriptRoot "build-desktop-backend.ps1") -Python $Python

Push-Location $frontendDir
try {
  Write-Host "Installing frontend/Tauri dependencies..." -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

  Write-Host "Generating desktop icons..." -ForegroundColor Cyan
  npm run tauri -- icon src-tauri/app-icon.svg
  if ($LASTEXITCODE -ne 0) { throw "Tauri icon generation failed." }

  $package = Get-Content (Join-Path $frontendDir "package.json") -Raw | ConvertFrom-Json
  $env:VITE_API_BASE_URL = "http://127.0.0.1:8765"
  $env:VITE_APP_VERSION = [string]$package.version

  if ($Build) {
    Write-Host "Building Windows installer..." -ForegroundColor Cyan
    npm run desktop:build
  } else {
    Write-Host "Starting Tauri desktop development mode..." -ForegroundColor Cyan
    npm run desktop:dev
  }

  if ($LASTEXITCODE -ne 0) { throw "Tauri command failed." }
} finally {
  Pop-Location
}
