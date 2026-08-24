$ErrorActionPreference = 'Continue'
$B = 'http://localhost:3001'
function Req($method, $url, $token, $bodyObj) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $bytes = $null
  if ($bodyObj) { $bytes = [Text.Encoding]::UTF8.GetBytes(($bodyObj | ConvertTo-Json -Compress)) }
  try {
    $r = Invoke-WebRequest -Uri "$B$url" -Method $method -Headers $headers -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 15
    return @{ s = [int]$r.StatusCode; raw = $r.Content; j = (ConvertFrom-Json $r.Content) }
  } catch {
    $code = 0; $raw = ''; $json = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    try { $rd = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $raw = $rd.ReadToEnd(); $json = ConvertFrom-Json $raw } catch {}
    return @{ s = $code; raw = $raw; j = $json }
  }
}
$ok = 0; $fail = 0
function A($n, $c) { if ($c) { $script:ok++; Write-Host "PASS $n" } else { $script:fail++; Write-Host "FAIL $n -> $($script:lastraw)" } }

$stamp = Get-Random -Maximum 9000
$sidS = "2399$($stamp.ToString('0000'))"
$sidB = "2399$(($stamp+1).ToString('0000'))"

# 注册卖家与买家
$rs = Req POST '/api/auth/register' $null @{ studentId = $sidS; password = 'test1234'; nickname = "测试卖家$stamp"; college = '计算机学院'; grade = '2023级' }
A "注册卖家($sidS)" ($rs.j.code -eq 200)
$tS = $rs.j.data.token; $idS = [int]$rs.j.data.user.id
$rb = Req POST '/api/auth/register' $null @{ studentId = $sidB; password = 'test1234'; nickname = "测试买家$stamp"; college = '外语学院'; grade = '2023级' }
$tB = $rb.j.data.token; $idB = [int]$rb.j.data.user.id
A "注册买家($sidB)" ($rb.j.code -eq 200)

# 学号 lookup（双向）
$r2 = Req GET "/api/users/lookup?studentId=$sidB" $tS $null
A "卖家lookup买家 昵称=$($r2.j.data.nickname)" ($r2.j.code -eq 200 -and [int]$r2.j.data.id -eq $idB)
$r404 = Req GET '/api/users/lookup?studentId=88888888' $tS $null
A "lookup 未注册返回404/契约码(s=$($r404.s),code=$($r404.j.code))" (($r404.s -eq 404) -or ($r404.j.code -eq 404))

# 卖家发布二手帖
$rp = Req POST '/api/posts' $tS @{ sectionId = 1; title = "验证测试二手书$stamp"; content = '高数教材，九成新，验证用'; extraFields = @{ price = 15; tradeType = '出售'; condition = '九成新' }; isAnonymous = $false }
A "发布二手帖 id=$($rp.j.data.id)" ($rp.j.code -eq 200)
$newPid = [int]$rp.j.data.id

# 标记完成带买家
$r3 = Req POST "/api/trades/$newPid/complete" $tS @{ buyerId = $idB }
$global:lastraw = $r3.raw
A "complete soldTo=$($r3.j.data.soldTo)" ($r3.j.code -eq 200 -and [int]$r3.j.data.soldTo -eq $idB)

# 买家视角 my-rating
$m4 = (Req GET "/api/trades/$newPid/my-rating" $tB $null).j.data
A "my-rating hasRated=false isSold=true" ($m4.hasRated -eq $false -and $m4.isSold -eq $true)

# 双向互评
A "买家评卖家5星" ((Req POST "/api/trades/$newPid/rate" $tB @{ rating = 5; comment = '很靠谱' }).j.code -eq 200)
A "hasRated 翻转" ((Req GET "/api/trades/$newPid/my-rating" $tB $null).j.data.hasRated -eq $true)
$r6 = Req POST "/api/trades/$newPid/rate" $tS @{ rating = 4 }
$global:lastraw = $r6.raw
A "卖家无targetUserId凭soldTo自动评买家" ($r6.j.code -eq 200)
A "重复评价拦截" ((Req POST "/api/trades/$newPid/rate" $tS @{ rating = 3 }).j.message -match '已评价')

# 信誉分联动：买家被好评+2
$lB = Req POST '/api/auth/login' $null @{ studentId = $sidB; password = 'test1234' }
$creditB = if ($lB.j.data.user.credit_score) { [int]$lB.j.data.user.credit_score } else { [int]$lB.j.data.user.creditScore }
A "买家信誉分=$creditB(100+2)" ($creditB -eq 102)

# 清理：管理员删测试帖
$adm = Req POST '/api/auth/login' $null @{ studentId = 'admin'; password = 'admin123' }
Req DELETE "/api/posts/$newPid" $tS $null | Out-Null
A "清理测试帖" ((Req GET "/api/posts/$newPid" $null $null).j.code -eq 404)

Write-Host "== 全链路: PASS=$ok FAIL=$fail =="
