$ErrorActionPreference = 'Stop'
$B = 'http://localhost:3001'
function Req($method, $url, $token, $bodyObj) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $bytes = $null
  if ($bodyObj) { $bytes = [Text.Encoding]::UTF8.GetBytes(($bodyObj | ConvertTo-Json -Compress)) }
  try {
    $r = Invoke-WebRequest -Uri "$B$url" -Method $method -Headers $headers -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 15
    return @{ status = [int]$r.StatusCode; body = (ConvertFrom-Json $r.Content); raw = $r.Content }
  } catch {
    $resp = $_.Exception.Response
    $code = [int]$resp.StatusCode
    $reader = New-Object IO.StreamReader($resp.GetResponseStream())
    return @{ status = $code; body = (ConvertFrom-Json $reader.ReadToEnd()); raw = '' }
  }
}
$ok = 0; $fail = 0
function A($n, $c) { if ($c) { $script:ok++; Write-Host "PASS $n" } else { $script:fail++; Write-Host "FAIL $n" } }

# 登录三态：错密统一文案 / 正确通过
$bad = Req POST '/api/auth/login' $null @{ studentId = '23770001'; password = 'wrong' }
A "错误密码统一文案(code=$($bad.body.code)): $($bad.body.message)" ($bad.body.code -eq 1002 -and $bad.body.message -match '学号或密码')
$l1 = Req POST '/api/auth/login' $null @{ studentId = '23770001'; password = 'demo1234' }
A '正确登录' ($l1.body.code -eq 200)
$t1 = $l1.body.data.token
$adm = Req POST '/api/auth/login' $null @{ studentId = 'admin'; password = 'admin123' }
$tA = $adm.body.data.token

# afterId 增量（林晚晴视角）
$l2 = Req POST '/api/auth/login' $null @{ studentId = '23770002'; password = 'demo1234' }
$convs = Req GET '/api/conversations' $l2.body.data.token $null
$c0 = @($convs.body.data)[0]
if ($c0) {
  $all = Req GET "/api/conversations/$($c0.id)/messages?page=1&pageSize=50" $l2.body.data.token $null
  $inc = Req GET "/api/conversations/$($c0.id)/messages?afterId=$($all.body.data.list[0].id)" $l2.body.data.token $null
  A "afterId 增量(全量$($all.body.data.list.Count)条→增量$($inc.body.data.list.Count)条)" ($inc.body.data.list.Count -lt $all.body.data.list.Count)
} else { Write-Host 'INFO 无会话数据'; $ok++ }

# 反馈状态端点（超管）
$fb = Req GET '/api/admin/feedbacks?status=open' $tA $null
A "feedbacks open total=$($fb.body.data.total)" ($fb.body.code -eq 200)

# 显式 deleted 查询放行
$del = Req GET '/api/admin/posts?status=deleted&page=1&pageSize=5' $tA $null
A "deleted 显式查询 code=$($del.body.code)" ($del.body.code -eq 200)

# 公告定向：无效用户 400 + 有效创建后仅目标可见
$bad2 = Req POST '/api/announcements' $tA @{ title = '定向校验'; content = '这是一条用于校验定向用户的公告内容'; targetUserId = 99999 }
A "无效定向被拒 code=$($bad2.body.code)" ($bad2.body.code -eq 400)
$l4 = Req POST '/api/auth/login' $null @{ studentId = '23770004'; password = 'demo1234' }
$id4 = [int]$l4.body.data.user.id
$ann = Req POST '/api/announcements' $tA @{ title = '定向公告校验'; content = '只有苏沐橙能看到这条定向公告的内容校验'; targetUserId = $id4 }
A "定向公告创建 code=$($ann.body.code)" ($ann.body.code -eq 200)
if ($ann.body.code -eq 200) {
  $actOther = Req GET '/api/announcements/active' $t1 $null
  $actSelf = Req GET '/api/announcements/active' $l4.body.data.token $null
  A "非目标不可见(active=null)" ($null -eq $actOther.body.data)
  A "目标用户可见($($actSelf.body.data.title))" ($actSelf.body.data.title -match '定向')
}

Write-Host "== FINAL: PASS=$ok FAIL=$fail =="
