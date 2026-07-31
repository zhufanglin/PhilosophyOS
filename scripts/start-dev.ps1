param(
    [int]$ApiPort = 8001,
    [int]$WebPort = 5174,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot "apps\api"
$RuntimeDir = Join-Path $RepoRoot ".runtime"
$StateFile = Join-Path $RuntimeDir "dev-services.json"
$ApiRunner = Join-Path $PSScriptRoot "run-api-dev.ps1"
$WebRunner = Join-Path $PSScriptRoot "run-web-dev.ps1"

function Test-PortInUse([int]$Port) {
    return [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains $Port
}

function Test-ApiReady([int]$Port) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 2
        return $health.status -eq "ok" -and $health.service -eq "philosophyos-api"
    } catch { return $false }
}

function Test-WebReady([int]$Port) {
    try {
        $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2 -UseBasicParsing
        return $response.StatusCode -eq 200 -and $response.Content -match "PhilosophyOS"
    } catch { return $false }
}

function Resolve-BasePython {
    $candidates = [System.Collections.Generic.List[string]]::new()
    foreach ($name in @("python", "python3")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { $candidates.Add($command.Source) }
    }
    $candidates.Add((Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe"))
    $codexPython = Get-ChildItem -Path (Join-Path $env:USERPROFILE ".cache\codex-runtimes") -Filter python.exe -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -like "*dependencies\python\python.exe" } | Select-Object -First 1
    if ($codexPython) { $candidates.Add($codexPython.FullName) }
    foreach ($candidate in $candidates | Select-Object -Unique) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        & $candidate --version *> $null
        if ($LASTEXITCODE -eq 0) { return $candidate }
    }
    throw "Python 3.12 was not found. Install it, then run scripts\start-dev.cmd again."
}

function Resolve-ApiPython {
    $venvPython = Join-Path $ApiDir ".venv\Scripts\python.exe"
    if (Test-Path -LiteralPath $venvPython) {
        & $venvPython --version *> $null
        if ($LASTEXITCODE -eq 0) { return $venvPython }
    }
    $basePython = Resolve-BasePython
    Write-Host "Repairing the local Python environment..." -ForegroundColor Yellow
    & $basePython -m venv --upgrade (Join-Path $ApiDir ".venv")
    if ($LASTEXITCODE -ne 0) { throw "The Python environment could not be repaired." }
    & $venvPython -c "import fastapi, sqlalchemy, uvicorn"
    if ($LASTEXITCODE -ne 0) { throw "Backend dependencies are missing. Run: apps\api\.venv\Scripts\python.exe -m pip install -e 'apps\api[dev]'" }
    return $venvPython
}

function Resolve-Pnpm {
    foreach ($name in @("pnpm.cmd", "pnpm")) {
        $command = Get-Command $name -ErrorAction SilentlyContinue
        if ($command) { return $command.Source }
    }
    foreach ($candidate in @("D:\nodejs\pnpm.cmd", (Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd"))) {
        if (Test-Path -LiteralPath $candidate) { return $candidate }
    }
    throw "pnpm was not found. Install Node.js and pnpm, then run scripts\start-dev.cmd again."
}

function Wait-Ready([scriptblock]$Probe, [string]$Name, [System.Diagnostics.Process]$Process) {
    foreach ($attempt in 1..40) {
        if (& $Probe) { return }
        if ($Process.HasExited) { throw "$Name stopped during startup. Check .runtime logs." }
        Start-Sleep -Milliseconds 250
    }
    throw "$Name did not become ready in 10 seconds. Check .runtime logs."
}

New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
$existingState = if (Test-Path -LiteralPath $StateFile) { Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json } else { $null }
$apiProcess = $null
$webProcess = $null
$apiReused = Test-ApiReady $ApiPort
$webReused = Test-WebReady $WebPort

if (-not $apiReused) {
    if (Test-PortInUse $ApiPort) { throw "Port $ApiPort is occupied by another program. Stop it or choose -ApiPort." }
    $apiPython = Resolve-ApiPython
    $apiProcess = Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RuntimeDir "api.log") -RedirectStandardError (Join-Path $RuntimeDir "api-error.log") -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $ApiRunner, "-Port", $ApiPort, "-PythonPath", $apiPython)
    Wait-Ready { Test-ApiReady $ApiPort } "API" $apiProcess
}
if (-not $webReused) {
    if (Test-PortInUse $WebPort) { throw "Port $WebPort is occupied by another program. Stop it or choose -WebPort." }
    $pnpm = Resolve-Pnpm
    $webProcess = Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $RuntimeDir "web.log") -RedirectStandardError (Join-Path $RuntimeDir "web-error.log") -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $WebRunner, "-ApiPort", $ApiPort, "-Port", $WebPort, "-PnpmPath", $pnpm)
    Wait-Ready { Test-WebReady $WebPort } "Web" $webProcess
}

@{
    apiPort=$ApiPort; webPort=$WebPort
    apiPid=if($apiProcess){$apiProcess.Id}elseif($apiReused -and $existingState -and $existingState.apiPort -eq $ApiPort){$existingState.apiPid}else{$null}
    webPid=if($webProcess){$webProcess.Id}elseif($webReused -and $existingState -and $existingState.webPort -eq $WebPort){$existingState.webPid}else{$null}
    apiStartedAt=if($apiProcess){$apiProcess.StartTime.ToUniversalTime().ToString("O")}elseif($apiReused -and $existingState){$existingState.apiStartedAt}else{$null}
    webStartedAt=if($webProcess){$webProcess.StartTime.ToUniversalTime().ToString("O")}elseif($webReused -and $existingState){$existingState.webStartedAt}else{$null}
} | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
Write-Host "PhilosophyOS is ready." -ForegroundColor Green
Write-Host "API: http://127.0.0.1:$ApiPort ($(if($apiReused){'reused'}else{'started'}))"
Write-Host "Web: http://127.0.0.1:$WebPort/#today ($(if($webReused){'reused'}else{'started'}))"
Write-Host "The services run in the background; this window may be closed."
Write-Host "Stop them with scripts\stop-dev.cmd."
if (-not $NoBrowser) { Start-Process "http://127.0.0.1:$WebPort/#today" }
