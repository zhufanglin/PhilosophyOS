param(
    [int]$Port = 8001
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot "apps\api"
$ApiEnvFile = Join-Path $ApiDir ".env"
$ApiPython = Join-Path $ApiDir ".venv\Scripts\python.exe"

function Import-EnvFile {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "API env file not found: $Path"
    }

    Get-Content -LiteralPath $Path -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) {
            return
        }

        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            return
        }

        $name = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()

        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            $singleQuote = [string][char]39
            $doubleQuote = [string][char]34
            if (
                ($first -eq $singleQuote -and $last -eq $singleQuote) -or
                ($first -eq $doubleQuote -and $last -eq $doubleQuote)
            ) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }

        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

Import-EnvFile -Path $ApiEnvFile

if (-not $env:OPENAI_API_KEY -or $env:OPENAI_API_KEY.Contains("<")) {
    throw "Edit apps\api\.env and replace OPENAI_API_KEY with your relay API key first."
}

Set-Location $ApiDir
& $ApiPython -m uvicorn app.main:app --port $Port
