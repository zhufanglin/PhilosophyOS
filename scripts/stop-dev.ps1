$ErrorActionPreference = "Stop"
$RepoRoot=Split-Path -Parent $PSScriptRoot
$StateFile=Join-Path $RepoRoot ".runtime\dev-services.json"
if(-not(Test-Path -LiteralPath $StateFile)){Write-Host "No PhilosophyOS service state was found.";exit 0}
$state=Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8|ConvertFrom-Json
foreach($service in @(@{Name="API";Pid=$state.apiPid;StartedAt=$state.apiStartedAt},@{Name="Web";Pid=$state.webPid;StartedAt=$state.webStartedAt})){
    if(-not $service.Pid -or -not $service.StartedAt){continue}
    $process=Get-Process -Id $service.Pid -ErrorAction SilentlyContinue
    if(-not $process){continue}
    $recorded=[DateTime]::Parse($service.StartedAt).ToUniversalTime()
    if([Math]::Abs(($process.StartTime.ToUniversalTime()-$recorded).TotalSeconds)-gt 2){Write-Warning "Skipped stale $($service.Name) PID $($service.Pid).";continue}
    & taskkill.exe /PID $service.Pid /T /F | Out-Null
    if($LASTEXITCODE -ne 0){throw "Could not stop $($service.Name) PID $($service.Pid)."}
    Write-Host "Stopped $($service.Name) (PID $($service.Pid))."
}
Remove-Item -LiteralPath $StateFile -Force
