# Restart the local demo: kill listener on $Port, relaunch start-demo.ps1 detached, wait for port up.
# ASCII-only on purpose (see AGENTS.md: .ps1 with non-ASCII needs UTF-8 BOM; this avoids the trap).
param([int]$Port = 3901)
$ErrorActionPreference = 'SilentlyContinue'
Get-NetTCPConnection -LocalPort $Port -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep -Milliseconds 700
$start = Join-Path $PSScriptRoot 'start-demo.ps1'
Start-Process -WindowStyle Hidden powershell -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $start)
$up = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  if (Get-NetTCPConnection -LocalPort $Port -State Listen) { $up = $true; break }
}
Write-Output ("PORT {0} UP: {1}" -f $Port, $up)
if (-not $up) { exit 1 }
