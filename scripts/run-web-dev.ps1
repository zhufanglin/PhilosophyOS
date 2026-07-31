param([int]$ApiPort=8001,[int]$Port=5174,[Parameter(Mandatory=$true)][string]$PnpmPath)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$env:VITE_API_BASE_URL = "http://127.0.0.1:$ApiPort"
Set-Location (Join-Path $RepoRoot "apps\web")
& $PnpmPath dev --host 127.0.0.1 --port $Port --strictPort
