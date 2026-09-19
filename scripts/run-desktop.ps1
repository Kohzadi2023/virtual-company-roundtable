param(
  [switch]$Build,
  [string]$Python = "python",
  [switch]$SkipToolchainInstall
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $root "frontend"
$rustTarget = "x86_64-pc-windows-msvc"
$rustupInstallerUrl = "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe"

function Refresh-ProcessPath {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
  $parts = @($machinePath, $userPath, $cargoBin) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  $env:Path = ($parts -join ";")
}

function Test-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Install-RustupDirect {
  $installerPath = Join-Path $env:TEMP "rustup-init-x86_64-pc-windows-msvc.exe"

  Write-Host "winget is unavailable. Downloading Rustup directly from the official Rust distribution host..." -ForegroundColor Yellow
  try {
    Invoke-WebRequest -Uri $rustupInstallerUrl -OutFile $installerPath -UseBasicParsing
    if (-not (Test-Path $installerPath)) {
      throw "Rustup installer download did not produce a file."
    }

    & $installerPath -y --default-toolchain stable --default-host $rustTarget
    if ($LASTEXITCODE -ne 0) {
      throw "rustup-init failed with exit code $LASTEXITCODE."
    }
  } finally {
    Remove-Item $installerPath -Force -ErrorAction SilentlyContinue
  }
}

function Install-Rustup {
  if (Test-Command "winget") {
    Write-Host "Rust/Cargo was not found. Installing Rustup with winget..." -ForegroundColor Yellow
    winget install --id Rustlang.Rustup --exact --silent --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -eq 0) {
      return
    }

    Write-Warning "winget could not install Rustup (exit code $LASTEXITCODE). Falling back to the official rustup-init installer."
  }

  Install-RustupDirect
}

function Ensure-RustToolchain {
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
  if ((Test-Path (Join-Path $cargoBin "cargo.exe")) -and -not (Test-Command "cargo")) {
    $env:Path = "$cargoBin;$env:Path"
  }

  if (-not (Test-Command "cargo") -or -not (Test-Command "rustup")) {
    if ($SkipToolchainInstall) {
      throw "Rust/Cargo is required for Tauri. Install Rustup, reopen PowerShell, and run this script again."
    }

    Install-Rustup
    Refresh-ProcessPath
  }

  if (-not (Test-Command "rustup")) {
    $rustupExe = Join-Path $cargoBin "rustup.exe"
    if (Test-Path $rustupExe) {
      $env:Path = "$cargoBin;$env:Path"
    }
  }

  if (-not (Test-Command "rustup")) {
    throw "Rustup was installed but is not available in this PowerShell session. Close PowerShell, open a new window, and run .\scripts\run-desktop.ps1 again."
  }

  Write-Host "Ensuring Rust stable + MSVC target..." -ForegroundColor Cyan
  rustup default stable
  if ($LASTEXITCODE -ne 0) { throw "rustup default stable failed." }

  rustup target add $rustTarget
  if ($LASTEXITCODE -ne 0) { throw "Failed to install Rust target $rustTarget." }

  Refresh-ProcessPath
  if (-not (Test-Command "cargo")) {
    throw "Cargo is still unavailable after Rustup setup. Close PowerShell, open a new window, and run the script again."
  }

  $cargoVersion = (& cargo --version)
  $rustcVersion = (& rustc --version)
  Write-Host "Rust toolchain ready: $cargoVersion / $rustcVersion" -ForegroundColor Green
}

Ensure-RustToolchain

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
    npm run desktop:build -- --target $rustTarget
  } else {
    Write-Host "Starting Tauri desktop development mode..." -ForegroundColor Cyan
    npm run desktop:dev -- --target $rustTarget
  }

  if ($LASTEXITCODE -ne 0) { throw "Tauri command failed." }
} finally {
  Pop-Location
}
