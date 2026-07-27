param(
    [int]$ApiPort = 8001,
    [int]$Port = 5174
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$WebDir = Join-Path $RepoRoot "apps\web"
$Corepack = "D:\nodejs\corepack.cmd"

if (-not (Test-Path -LiteralPath $Corepack)) {
    throw "corepack not found: $Corepack"
}

$env:VITE_API_BASE_URL = "http://127.0.0.1:$ApiPort"

Set-Location $WebDir
& $Corepack pnpm dev --port $Port
