param(
  [switch]$Build,
  [string]$Python = "python",
  [switch]$SkipToolchainInstall
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$frontendDir = Join-Path $root "frontend"
$rustTarget = "x86_64-pc-windows-msvc"

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

function Ensure-RustToolchain {
  $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
  if ((Test-Path (Join-Path $cargoBin "cargo.exe")) -and -not (Test-Command "cargo")) {
    $env:Path = "$cargoBin;$env:Path"
  }

  if (-not (Test-Command "cargo") -or -not (Test-Command "rustup")) {
    if ($SkipToolchainInstall) {
      throw "Rust/Cargo is required for Tauri. Install Rustup, reopen PowerShell, and run this script again."
    }

    Write-Host "Rust/Cargo was not found. Installing Rustup..." -ForegroundColor Yellow

    if (Test-Command "winget") {
      winget install --id Rustlang.Rustup --exact --silent --accept-package-agreements --accept-source-agreements
      if ($LASTEXITCODE -ne 0) { throw "Rustup installation failed with exit code $LASTEXITCODE." }
    } else {
      Write-Host "winget is unavailable. Downloading Rustup directly from the official Rust distribution host..." -ForegroundColor Yellow
      $rustupInstaller = Join-Path $env:TEMP "rustup-init.exe"
      Invoke-WebRequest -Uri "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe" -OutFile $rustupInstaller -UseBasicParsing
      & $rustupInstaller -y --default-host $rustTarget --default-toolchain stable
      $rustupExit = $LASTEXITCODE
      Remove-Item $rustupInstaller -Force -ErrorAction SilentlyContinue
      if ($rustupExit -ne 0) { throw "Rustup installation failed with exit code $rustupExit." }
    }

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

function Get-VisualStudioInstallPath {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
  if (Test-Path $vswhere) {
    $path = (& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null | Select-Object -First 1)
    if (-not [string]::IsNullOrWhiteSpace($path)) {
      return $path.Trim()
    }
  }

  $vsRoot = Join-Path $env:ProgramFiles "Microsoft Visual Studio"
  if (Test-Path $vsRoot) {
    $devCmd = Get-ChildItem -Path $vsRoot -Filter "VsDevCmd.bat" -File -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($devCmd) {
      return $devCmd.Directory.Parent.Parent.FullName
    }
  }

  return $null
}

function Import-VisualStudioEnvironment([string]$InstallPath) {
  if ([string]::IsNullOrWhiteSpace($InstallPath)) { return $false }

  $vsDevCmd = Join-Path $InstallPath "Common7\Tools\VsDevCmd.bat"
  if (-not (Test-Path $vsDevCmd)) { return $false }

  Write-Host "Loading Visual Studio C++ developer environment..." -ForegroundColor Cyan
  $cmdLine = "call `"$vsDevCmd`" -arch=x64 -host_arch=x64 >nul && set"
  $envLines = & $env:ComSpec /d /s /c $cmdLine
  if ($LASTEXITCODE -ne 0) { return $false }

  foreach ($line in $envLines) {
    if ($line -match '^([^=]+)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
    }
  }

  return $true
}

function Find-Kernel32Lib {
  if (-not [string]::IsNullOrWhiteSpace($env:LIB)) {
    foreach ($entry in ($env:LIB -split ';')) {
      if ([string]::IsNullOrWhiteSpace($entry)) { continue }
      $candidate = Join-Path $entry "kernel32.lib"
      if (Test-Path $candidate) { return $candidate }
    }
  }

  $kitsRoots = @(
    (Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\Lib"),
    (Join-Path ${env:ProgramFiles(x86)} "Windows Kits\11\Lib")
  )

  foreach ($kitsRoot in $kitsRoots) {
    if (-not (Test-Path $kitsRoot)) { continue }
    $candidate = Get-ChildItem -Path (Join-Path $kitsRoot "*\um\x64\kernel32.lib") -File -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($candidate) { return $candidate.FullName }
  }

  return $null
}

function Install-WindowsNativeToolchain([string]$InstallPath) {
  if ($SkipToolchainInstall) {
    throw "Microsoft C++ Build Tools and a Windows SDK are required. Open Visual Studio Installer and add 'Desktop development with C++', then run this script again."
  }

  $installer = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\setup.exe"
  if ((Test-Path $installer) -and -not [string]::IsNullOrWhiteSpace($InstallPath)) {
    Write-Host "Windows SDK libraries were not found. Adding the Visual Studio Desktop development with C++ workload..." -ForegroundColor Yellow
    Write-Host "A Windows UAC prompt may appear. Approve it to continue." -ForegroundColor Yellow

    $arguments = @(
      "modify",
      "--installPath", "`"$InstallPath`"",
      "--add", "Microsoft.VisualStudio.Workload.NativeDesktop",
      "--includeRecommended",
      "--passive",
      "--norestart"
    )

    $process = Start-Process -FilePath $installer -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) {
      throw "Visual Studio Installer failed with exit code $($process.ExitCode)."
    }
    if ($process.ExitCode -eq 3010) {
      Write-Warning "Visual Studio Installer requested a restart. The script will verify the SDK now; restart Windows if verification still fails."
    }
    return
  }

  Write-Host "Visual Studio C++ Build Tools were not found. Downloading the official Visual Studio Build Tools bootstrapper..." -ForegroundColor Yellow
  Write-Host "A Windows UAC prompt may appear. Approve it to continue." -ForegroundColor Yellow
  $bootstrapper = Join-Path $env:TEMP "vs_buildtools.exe"
  Invoke-WebRequest -Uri "https://aka.ms/vs/stable/vs_buildtools.exe" -OutFile $bootstrapper -UseBasicParsing

  try {
    $arguments = @(
      "--add", "Microsoft.VisualStudio.Workload.VCTools",
      "--includeRecommended",
      "--passive",
      "--wait",
      "--norestart",
      "--nocache"
    )
    $process = Start-Process -FilePath $bootstrapper -ArgumentList $arguments -Verb RunAs -Wait -PassThru
    if ($process.ExitCode -notin @(0, 3010)) {
      throw "Visual Studio Build Tools installation failed with exit code $($process.ExitCode)."
    }
  } finally {
    Remove-Item $bootstrapper -Force -ErrorAction SilentlyContinue
  }
}

function Ensure-WindowsNativeToolchain {
  $installPath = Get-VisualStudioInstallPath
  if ($installPath) {
    [void](Import-VisualStudioEnvironment $installPath)
  }

  $kernel32 = Find-Kernel32Lib
  if ($kernel32) {
    Write-Host "Windows native toolchain ready: $kernel32" -ForegroundColor Green
    return
  }

  Install-WindowsNativeToolchain $installPath

  $installPath = Get-VisualStudioInstallPath
  if ($installPath) {
    [void](Import-VisualStudioEnvironment $installPath)
  }

  $kernel32 = Find-Kernel32Lib
  if (-not $kernel32) {
    throw "Windows SDK installation completed but kernel32.lib is still unavailable. Restart Windows, then run .\scripts\run-desktop.ps1 again."
  }

  Write-Host "Windows native toolchain ready: $kernel32" -ForegroundColor Green
}

Ensure-RustToolchain
Ensure-WindowsNativeToolchain

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
