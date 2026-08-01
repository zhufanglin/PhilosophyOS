param([int]$Port = 8001, [Parameter(Mandatory=$true)][string]$PythonPath)
$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot "apps\api"
$ApiEnvFile = Join-Path $ApiDir ".env"
if (Test-Path -LiteralPath $ApiEnvFile) {
    Get-Content -LiteralPath $ApiEnvFile -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $separator = $line.IndexOf("=")
        if ($separator -lt 1) { return }
        $name = $line.Substring(0,$separator).Trim()
        $value = $line.Substring($separator+1).Trim().Trim([char]34).Trim([char]39)
        [Environment]::SetEnvironmentVariable($name,$value,"Process")
    }
}
Set-Location $ApiDir
$venvSitePackages = Join-Path $ApiDir ".venv\Lib\site-packages"
$pythonPathParts = @($ApiDir)
if (Test-Path -LiteralPath $venvSitePackages) { $pythonPathParts += $venvSitePackages }
if ($env:PYTHONPATH) { $pythonPathParts += $env:PYTHONPATH }
$env:PYTHONPATH = ($pythonPathParts -join [IO.Path]::PathSeparator)
& $PythonPath -m uvicorn app.main:app --host 127.0.0.1 --port $Port
