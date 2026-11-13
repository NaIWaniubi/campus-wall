# retry-push.ps1 — loop git push until success or 30 tries (ASCII only)
Set-Location 'E:\' + [char]0x6821 + [char]0x56ed + [char]0x5899
$i = 0
while ($i -lt 30) {
  $i++
  $out = (& git -c http.version=HTTP/1.1 push cs621 master 2>&1) -join "`n"
  if ($out -match 'master -> master' -or $out -match 'Everything up-to-date') {
    Write-Output ("OK try" + $i + ": " + $out)
    exit 0
  }
  Write-Output ("fail try" + $i + ": " + ($out -replace "`n", ' | '))
  $sleep = 60 + [Math]::Min(240, $i * 20)
  Start-Sleep $sleep
}
Write-Output 'GIVEUP after 30 tries'
exit 1
