$ErrorActionPreference = 'Continue'
$B = 'http://localhost:3001'
function Req($method, $url, $token, $bodyObj) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $bytes = $null
  if ($bodyObj) { $bytes = [Text.Encoding]::UTF8.GetBytes(($bodyObj | ConvertTo-Json -Compress)) }
  try {
    $r = Invoke-WebRequest -Uri "$B$url" -Method $method -Headers $headers -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 15
    return @{ s = [int]$r.StatusCode; j = (ConvertFrom-Json $r.Content) }
  } catch {
    $code = 0; $json = $null
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    try { $rd = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream()); $json = ConvertFrom-Json $rd.ReadToEnd() } catch {}
    return @{ s = $code; j = $json }
  }
}
$ok = 0; $fail = 0
function A($n, $c) { if ($c) { $script:ok++; Write-Host "PASS $n" } else { $script:fail++; Write-Host "FAIL $n" } }

$l1 = Req POST '/api/auth/login' $null @{ studentId = '23770001'; password = 'demo1234' }
$t1 = $l1.j.data.token
$l2 = Req POST '/api/auth/login' $null @{ studentId = '23770002'; password = 'demo1234' }
$t2 = $l2.j.data.token
$id2 = [int]$l2.j.data.user.id
$uid1 = [int]$l1.j.data.user.id
A "双登录" ($t1 -and $t2)

# 1) authorId 公开列表
$r1 = Req GET "/api/posts?authorId=$uid1&pageSize=5" $null $null
A "authorId 列表 total=$($r1.j.data.total)" ($r1.j.code -eq 200 -and $r1.j.data.total -ge 1)
$salePid = [int]($r1.j.data.list[0].id)

# 2) 学号 lookup
$r2 = Req GET '/api/users/lookup?studentId=23770002' $t1 $null
A "lookup 昵称=$($r2.j.data.nickname)" ($r2.j.code -eq 200 -and [int]$r2.j.data.id -eq $id2)
A "lookup 未注册学号404" ((Req GET '/api/users/lookup?studentId=99999999' $t1 $null).j.code -eq 404)

# 3) 标记已售带买家
$r3 = Req POST "/api/trades/$salePid/complete" $t1 @{ buyerId = $id2 }
A "complete soldTo=$($r3.j.data.soldTo)" ($r3.j.code -eq 200 -and [int]$r3.j.data.soldTo -eq $id2)
A "重复标记拦截" ((Req POST "/api/trades/$salePid/complete" $t1 @{ buyerId = $id2 }).j.message -match '已标记')

# 4) my-rating（买家视角）
$m4 = (Req GET "/api/trades/$salePid/my-rating" $t2 $null).j.data
A "my-rating hasRated=false isSold=true" ($m4.hasRated -eq $false -and $m4.isSold -eq $true)

# 5) 买家评作者
A "买家评价成功" ((Req POST "/api/trades/$salePid/rate" $t2 @{ rating = 5; comment = '很靠谱' }).j.code -eq 200)
A "hasRated 翻转" ((Req GET "/api/trades/$salePid/my-rating" $t2 $null).j.data.hasRated -eq $true)

# 6) 作者无 targetUserId，凭登记的 soldTo 自动定向
$r6 = Req POST "/api/trades/$salePid/rate" $t1 @{ rating = 4 }
A "作者凭soldTo自动定向" ($r6.j.code -eq 200 -and $r6.j.message -match '评价成功')
A "作者重复评拦截" ((Req POST "/api/trades/$salePid/rate" $t1 @{ rating = 3 }).j.message -match '已评价')

Write-Host "== 遗留清零验证: PASS=$ok FAIL=$fail =="
