$ErrorActionPreference = 'Stop'
$BASE = 'http://127.0.0.1:3102'
function Api($method, $path, $token, $body) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $req = @{ Uri = "$BASE$path"; Method = $method; Headers = $headers; ContentType = 'application/json; charset=utf-8' }
  if ($null -ne $body) { $req['Body'] = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress)) }
  try { return @{ status = 200; body = Invoke-RestMethod @req } } catch {
    $resp = $_.Exception.Response
    $reader = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
    return @{ status = [int]$resp.StatusCode; body = ($reader.ReadToEnd() | ConvertFrom-Json) }
  }
}
$ok = 0; $bad = 0
function Check($name, $cond, $detail) {
  if ($cond) { $script:ok++; Write-Output "PASS $name" }
  else { $script:bad++; Write-Output "FAIL $name => $detail" }
}

Start-Sleep -Seconds 2
$ready = $false
for ($i = 0; $i -lt 15; $i++) {
  try { Invoke-RestMethod -Uri "$BASE/api/health" -TimeoutSec 2 | Out-Null; $ready = $true; break } catch { Start-Sleep -Seconds 2 }
}
if (-not $ready) { Write-Output 'SERVER NOT READY'; exit 1 }
$A = (Api POST '/api/auth/login' $null @{ studentId='23770001'; password='demo1234' }).body.data
Check 'login A' ($A.token) 'no token'

# 建失物帖：extraFields 含 direction:'lost'
$mk = Api POST '/api/posts' $A.token @{
  sectionId = 2; title = '丢失黑色长柄雨伞一把'; content = '昨天傍晚在教学楼B栋自习室丢了一把黑色长柄雨伞，伞柄有挂饰，捡到的同学请联系我。'
  extraFields = @{ direction = 'lost'; location = '教学楼B栋'; time = '昨天傍晚'; itemType = '雨伞' }
}
Check 'create lost post' ($mk.body.code -eq 200) ($mk.body | ConvertTo-Json -Compress)
$postId = $mk.body.data.id

$d0 = (Api GET "/api/posts/$postId" $A.token).body.data
Check 'initial direction=lost' ($d0.extraFields.direction -eq 'lost') ($d0.extraFields | ConvertTo-Json -Compress)

# 复现原 bug：编辑不传 direction
$ed1 = Api PUT "/api/posts/$postId" $A.token @{
  title = '丢失黑色长柄雨伞一把'; content = '昨天傍晚在教学楼B栋自习室丢了一把黑色长柄雨伞，伞柄有挂饰，捡到的同学请联系我。'
  extraFields = @{ location = '图书馆三楼'; time = '昨天晚上'; itemType = '雨伞' }
}
Check 'edit without direction accepted' ($ed1.body.code -eq 200) ($ed1.body | ConvertTo-Json -Compress)
$d1 = (Api GET "/api/posts/$postId" $A.token).body.data
Check 'direction preserved after edit' ($d1.extraFields.direction -eq 'lost') ($d1.extraFields | ConvertTo-Json -Compress)
Check 'location updated by edit' ($d1.extraFields.location -eq '图书馆三楼') ($d1.extraFields | ConvertTo-Json -Compress)

# direction=lost 列表仍能检索到该帖（用新库 seed 前列表只有此帖 + 无种子；total 应 >=1 且含 pid）
$lst = Api GET '/api/posts?sectionId=2&direction=lost&pageSize=50'
Check 'lost tab still finds post' (($lst.body.data.list | Where-Object { $_.id -eq $postId }) -ne $null) "total=$($lst.body.data.total)"

# 覆盖语义：编辑显式改 direction → 生效
$ed2 = Api PUT "/api/posts/$postId" $A.token @{
  title = '丢失黑色长柄雨伞一把'; content = '昨天傍晚在教学楼B栋自习室丢了一把黑色长柄雨伞，伞柄有挂饰，捡到的同学请联系我。'
  extraFields = @{ location = '图书馆三楼'; time = '昨天晚上'; itemType = '雨伞'; direction = 'found' }
}
$d2 = (Api GET "/api/posts/$postId" $A.token).body.data
Check 'explicit direction override works' ($d2.extraFields.direction -eq 'found') ($d2.extraFields | ConvertTo-Json -Compress)

# 不传 extraFields 编辑 → 原值全保留
$ed3 = Api PUT "/api/posts/$postId" $A.token @{
  title = '丢失黑色长柄雨伞一把'; content = '今天上午在图书馆三楼丢失黑色长柄雨伞一把，伞柄有校运会挂饰，有线索请联系。'
}
$d3 = (Api GET "/api/posts/$postId" $A.token).body.data
Check 'edit w/o extraFields keeps all keys' ($d3.extraFields.direction -eq 'found' -and $d3.extraFields.location -eq '图书馆三楼') ($d3.extraFields | ConvertTo-Json -Compress)

Write-Output "`n==== RESULT: $ok passed, $bad failed ===="
