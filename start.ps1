[CmdletBinding()]
param(
    [switch]$SkipTests,
    [switch]$SkipBuild,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoDir = $PSScriptRoot
$BackendPort = 8001
$FrontendPort = 5173
$BackendUrl = "http://127.0.0.1:$BackendPort"
$FrontendUrl = "http://localhost:$FrontendPort"

function Write-Step([string]$Text) {
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = "$machinePath;$userPath"
}

function Ensure-Command {
    param(
        [Parameter(Mandatory)] [string]$Command,
        [Parameter(Mandatory)] [string]$WingetId,
        [Parameter(Mandatory)] [string]$DisplayName
    )

    if (Get-Command $Command -ErrorAction SilentlyContinue) {
        Write-Host "[OK] $DisplayName" -ForegroundColor Green
        return
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw "$DisplayName is missing and winget is not available. Install $DisplayName manually, then run start.ps1 again."
    }

    Write-Host "[INSTALL] $DisplayName" -ForegroundColor Yellow
    winget install --id $WingetId --exact --accept-package-agreements --accept-source-agreements
    if ($LASTEXITCODE -ne 0) {
        throw "Failed to install $DisplayName with winget."
    }

    Refresh-Path
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "$DisplayName was installed but is not visible in this PowerShell session. Close PowerShell, reopen it, and run .\start.ps1 again."
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory)] [scriptblock]$Command,
        [Parameter(Mandatory)] [string]$FailureMessage
    )

    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw $FailureMessage
    }
}

function Stop-DevPort {
    param([Parameter(Mandatory)] [int]$Port)

    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($listener in $listeners) {
        $pidToStop = $listener.OwningProcess
        if (-not $pidToStop -or $pidToStop -eq $PID) { continue }

        $process = Get-Process -Id $pidToStop -ErrorAction SilentlyContinue
        if (-not $process) { continue }

        if ($process.ProcessName -match '^(python|pythonw|node|uvicorn)$') {
            Write-Host "Stopping previous dev process on port $Port (PID $pidToStop, $($process.ProcessName))..." -ForegroundColor Yellow
            Stop-Process -Id $pidToStop -Force -ErrorAction Stop
        }
        else {
            throw "Port $Port is already used by '$($process.ProcessName)' (PID $pidToStop). Close that application or free the port, then run start.ps1 again."
        }
    }
}

function Wait-Http {
    param(
        [Parameter(Mandatory)] [string]$Url,
        [int]$Attempts = 40
    )

    for ($i = 0; $i -lt $Attempts; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2 -ErrorAction Stop
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
                return $true
            }
        }
        catch { }
        Start-Sleep -Seconds 1
    }

    return $false
}

Write-Host ''
Write-Host '==============================================' -ForegroundColor Blue
Write-Host ' Virtual Company Roundtable - Update & Start ' -ForegroundColor Blue
Write-Host '==============================================' -ForegroundColor Blue

if (-not (Test-Path (Join-Path $RepoDir '.git'))) {
    throw "start.ps1 must be run from a cloned Git repository. Expected .git under: $RepoDir"
}

Write-Step 'Checking system prerequisites'
Ensure-Command -Command 'git' -WingetId 'Git.Git' -DisplayName 'Git'
Ensure-Command -Command 'python' -WingetId 'Python.Python.3.13' -DisplayName 'Python'
Ensure-Command -Command 'node' -WingetId 'OpenJS.NodeJS.LTS' -DisplayName 'Node.js'

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Refresh-Path
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw 'npm is not available. Reopen PowerShell after Node.js installation and run .\start.ps1 again.'
}

Write-Host "Git    : $(git --version)"
Write-Host "Python : $(python --version 2>&1)"
Write-Host "Node   : $(node --version)"
Write-Host "npm    : $(npm --version)"

Write-Step 'Updating repository from origin/main'
Set-Location $RepoDir
Invoke-Checked -FailureMessage 'git fetch failed.' -Command { git fetch origin }
Invoke-Checked -FailureMessage 'Could not switch to main.' -Command { git checkout main }
Invoke-Checked -FailureMessage 'git pull failed. Resolve any Git conflict and run start.ps1 again.' -Command { git pull --rebase --autostash origin main }

Write-Step 'Preparing Python backend'
$VenvDir = Join-Path $RepoDir '.venv'
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'

if (-not (Test-Path $VenvPython)) {
    Invoke-Checked -FailureMessage 'Could not create Python virtual environment.' -Command { python -m venv $VenvDir }
}

Invoke-Checked -FailureMessage 'pip upgrade failed.' -Command { & $VenvPython -m pip install --upgrade pip }
Invoke-Checked -FailureMessage 'Backend dependency installation failed.' -Command { & $VenvPython -m pip install -r (Join-Path $RepoDir 'backend\requirements.txt') }

if (-not $SkipTests) {
    Write-Step 'Running backend tests'
    $env:PYTHONPATH = Join-Path $RepoDir 'backend'
    Invoke-Checked -FailureMessage 'Backend tests failed. Servers were not started.' -Command { & $VenvPython -m pytest (Join-Path $RepoDir 'backend\tests') -q }
}

Write-Step 'Preparing frontend'
$FrontendDir = Join-Path $RepoDir 'frontend'
Set-Location $FrontendDir

if (Test-Path (Join-Path $FrontendDir 'package-lock.json')) {
    Invoke-Checked -FailureMessage 'npm ci failed.' -Command { npm ci }
}
else {
    Invoke-Checked -FailureMessage 'npm install failed.' -Command { npm install }
}

if (-not $SkipTests) {
    Write-Step 'Running frontend tests and TypeScript checks'
    Invoke-Checked -FailureMessage 'Frontend tests failed. Servers were not started.' -Command { npm run test:run }
    Invoke-Checked -FailureMessage 'TypeScript typecheck failed. Servers were not started.' -Command { npm run typecheck }
}

if (-not $SkipBuild) {
    Write-Step 'Checking production frontend build'
    Invoke-Checked -FailureMessage 'Frontend production build failed. Servers were not started.' -Command { npm run build }
}

Write-Step 'Starting backend and frontend'
Stop-DevPort -Port $BackendPort
Stop-DevPort -Port $FrontendPort

$ShellExe = if (Get-Command pwsh -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

$backendCommand = "Set-Location '$RepoDir'; & '$VenvPython' -m uvicorn backend.app:app --reload --host 127.0.0.1 --port $BackendPort"
$frontendCommand = "Set-Location '$FrontendDir'; npm run dev -- --host 127.0.0.1 --port $FrontendPort"

Start-Process $ShellExe -WorkingDirectory $RepoDir -ArgumentList '-NoExit', '-Command', $backendCommand | Out-Null
Start-Process $ShellExe -WorkingDirectory $FrontendDir -ArgumentList '-NoExit', '-Command', $frontendCommand | Out-Null

Write-Step 'Waiting for services'
$backendReady = Wait-Http -Url "$BackendUrl/docs" -Attempts 40
$frontendReady = Wait-Http -Url $FrontendUrl -Attempts 40

Write-Host ''
if ($backendReady) {
    Write-Host "[OK] Backend  $BackendUrl" -ForegroundColor Green
}
else {
    Write-Host "[WARN] Backend did not answer yet. Check the backend PowerShell window." -ForegroundColor Yellow
}

if ($frontendReady) {
    Write-Host "[OK] Frontend $FrontendUrl" -ForegroundColor Green
}
else {
    Write-Host "[WARN] Frontend did not answer yet. Check the frontend PowerShell window." -ForegroundColor Yellow
}

Write-Host "[INFO] Repo     $RepoDir" -ForegroundColor Cyan
Write-Host ''

if ($frontendReady -and -not $NoBrowser) {
    Start-Process $FrontendUrl
}

if (-not ($backendReady -and $frontendReady)) {
    exit 1
}
