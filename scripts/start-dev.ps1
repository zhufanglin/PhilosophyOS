param(
    [int]$ApiPort = 8001,
    [int]$WebPort = 5174
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot "apps\api"
$WebDir = Join-Path $RepoRoot "apps\web"
$ApiEnvFile = Join-Path $ApiDir ".env"
$ApiPython = Join-Path $ApiDir ".venv\Scripts\python.exe"
$Corepack = "D:\nodejs\corepack.cmd"
$ApiRunner = Join-Path $PSScriptRoot "run-api-dev.ps1"
$WebRunner = Join-Path $PSScriptRoot "run-web-dev.ps1"

function Assert-FileExists {
    param(
        [string]$Path,
        [string]$Message
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw $Message
    }
}

Assert-FileExists -Path $ApiEnvFile -Message "API env file not found: $ApiEnvFile"
Assert-FileExists -Path $ApiPython -Message "API Python venv not found: $ApiPython"
Assert-FileExists -Path $Corepack -Message "corepack not found: $Corepack"
Assert-FileExists -Path $ApiRunner -Message "API runner script not found: $ApiRunner"
Assert-FileExists -Path $WebRunner -Message "Web runner script not found: $WebRunner"

Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-File",
    $ApiRunner,
    "-Port",
    $ApiPort
)
Start-Process -FilePath "powershell.exe" -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-File",
    $WebRunner,
    "-ApiPort",
    $ApiPort,
    "-Port",
    $WebPort
)

Start-Process "http://127.0.0.1:$WebPort/#today"

Write-Host "PhilosophyOS dev environment started."
Write-Host "API: http://127.0.0.1:$ApiPort"
Write-Host "Web: http://127.0.0.1:$WebPort/#today"
Write-Host "Keep the two new PowerShell windows open; closing them stops the services."
