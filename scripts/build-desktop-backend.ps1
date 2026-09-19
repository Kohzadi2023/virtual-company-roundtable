param(
  [string]$Python = "python",
  [string]$TargetTriple = "x86_64-pc-windows-msvc"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$backendDir = Join-Path $root "backend"
$tauriDir = Join-Path $root "frontend\src-tauri"
$binariesDir = Join-Path $tauriDir "binaries"
$distDir = Join-Path $backendDir "dist"
$workDir = Join-Path $backendDir "build"
$specPath = Join-Path $backendDir "virtual-company-backend.spec"

Write-Host "Installing backend/PyInstaller dependencies..." -ForegroundColor Cyan
& $Python -m pip install -r (Join-Path $backendDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Backend dependency installation failed." }
& $Python -m pip install "pyinstaller>=6.10,<7"
if ($LASTEXITCODE -ne 0) { throw "PyInstaller installation failed." }

Write-Host "Building FastAPI sidecar..." -ForegroundColor Cyan
& $Python -m PyInstaller --noconfirm --clean --distpath $distDir --workpath $workDir $specPath
if ($LASTEXITCODE -ne 0) { throw "PyInstaller build failed." }

$source = Join-Path $distDir "virtual-company-backend.exe"
if (-not (Test-Path $source)) { throw "Expected sidecar was not produced: $source" }

New-Item -ItemType Directory -Force -Path $binariesDir | Out-Null
$destination = Join-Path $binariesDir "virtual-company-backend-$TargetTriple.exe"
Copy-Item $source $destination -Force

Write-Host "Sidecar ready: $destination" -ForegroundColor Green
