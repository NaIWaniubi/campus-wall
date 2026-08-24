$ErrorActionPreference = 'Stop'
$B = 'http://localhost:3001'
function Req($method, $url, $token, $bodyObj) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $bytes = $null
  if ($bodyObj) { $bytes = [Text.Encoding]::UTF8.GetBytes(($bodyObj | ConvertTo-Json -Compress)) }
  try {
    $r = Invoke-WebRequest -Uri "$B$url" -Method $method -Headers $headers -Body $bytes -ContentType 'application/json; charset=utf-8' -UseBasicParsing -TimeoutSec 15
    return ConvertFrom-Json $r.Content
  } catch {
    $resp = $_.Exception.Response
    $reader = New-Object IO.StreamReader($resp.GetResponseStream())
    return ConvertFrom-Json $reader.ReadToEnd()
  }
}
$ok = 0; $fail = 0
function A($n, $c) { if ($c) { $script:ok++; Write-Host "PASS $n" } else { $script:fail++; Write-Host "FAIL $n" } }

# 登录（苏沐橙 未消耗今日发帖额度）
$l4 = Req POST '/api/auth/login' $null @{ studentId = '23770004'; password = 'demo1234' }
A 'login 苏沐橙' ($l4.code -eq 200)
$t4 = $l4.data.token
$id4 = [int]$l4.data.user.id

# 私信信封结构验证（data 为裸数组）
$cl = Req GET '/api/conversations' $t4 $null
A 'conversations envelope' ($cl.code -eq 200)
$firstConv = @($cl.data)[0]
if ($firstConv) { A "conv peer=$($firstConv.peer.nickname)" ([int]$firstConv.peer.id -gt 0) } else { Write-Host 'INFO 无会话（苏沐橙未参与私信）'; $ok++ }

# 创建→漏传 direction 编辑→合并保留
$mk = Req POST '/api/posts' $t4 @{ title = '丢失黑色耳机一副'; content = '今天早上在图书馆四楼机房丢了一副黑色有线耳机，有同学捡到请联系我，谢谢！'; sectionId = 2; extraFields = @{ location = '图书馆四楼'; time = '今天早上'; itemType = '耳机'; direction = 'lost' } }
A "create code=$($mk.code)" ($mk.code -eq 200)
$newId = [int]$mk.data.id
A "create 返回 id=$newId" ($newId -gt 0)

$ed = Req PUT "/api/posts/$newId" $t4 @{ title = '丢失黑色耳机一副（改）'; content = '今天早上在图书馆四楼机房丢了一副黑色有线耳机，有同学捡到请联系我，谢谢！'; extraFields = @{ location = '图书馆四楼'; time = '今天早上'; itemType = '耳机' } }
A "edit(无direction) code=$($ed.code)" ($ed.code -eq 200)

$det = Req GET "/api/posts/$newId" $t4 $null
A "合并后 direction=$($det.data.extraFields.direction)" ($det.data.extraFields.direction -eq 'lost')

$lt = Req GET '/api/posts?sectionId=2&direction=lost&page=1&pageSize=20' $null $null
$ids = @($lt.data.list) | ForEach-Object { [int]$_.id }
A "lost tab 含新帖 (ids=$($ids -join ','))" ($ids -contains $newId)

# 显式改向可覆盖
$ed2 = Req PUT "/api/posts/$newId" $t4 @{ title = '捡到黑色耳机一副（改向）'; content = '今天早上在图书馆四楼机房捡到一副黑色有线耳机，有同学丢了请联系我，谢谢！'; extraFields = @{ location = '图书馆四楼'; time = '今天早上'; itemType = '耳机'; direction = 'found' } }
A "edit 改向 code=$($ed2.code)" ($ed2.code -eq 200)
$det2 = Req GET "/api/posts/$newId" $t4 $null
A "direction 已改 $($det2.data.extraFields.direction)" ($det2.data.extraFields.direction -eq 'found')
$ft = Req GET '/api/posts?sectionId=2&direction=found&page=1&pageSize=20' $null $null
$fids = @($ft.data.list) | ForEach-Object { [int]$_.id }
A "found tab 含该帖" ($fids -contains $newId)

# 清理测试帖
$del = Req DELETE "/api/posts/$newId" $t4 $null
A "cleanup code=$($del.code)" ($del.code -eq 200)

Write-Host "== FINAL: PASS=$ok FAIL=$fail =="
