param([int]$ApiPort=8001,[int]$WebPort=5174)
$ErrorActionPreference = "SilentlyContinue"
function Get-Status([string]$Uri,[string]$Expected) { try { $r=Invoke-WebRequest -Uri $Uri -TimeoutSec 3 -UseBasicParsing; if($r.StatusCode -eq 200 -and $r.Content -match $Expected){return "online"} } catch {}; return "offline" }
$apiStatus=Get-Status "http://127.0.0.1:$ApiPort/health" "philosophyos-api"
$webStatus=Get-Status "http://127.0.0.1:$WebPort/" "PhilosophyOS"
Write-Host "API $ApiPort : $apiStatus"
Write-Host "Web $WebPort : $webStatus"
if($apiStatus -ne "online" -or $webStatus -ne "online"){exit 1}
