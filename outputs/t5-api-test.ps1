# t5 权限矩阵 + 新端点验证（临时实例；HttpClient 统一处理非2xx与UTF-8）
$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:3199/api'
Add-Type -AssemblyName System.Net.Http

function InvokeJson($method, $url, $body, $token) {
  $client = New-Object System.Net.Http.HttpClient
  try {
    if ($token) {
      $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $token)
    }
    $req = New-Object System.Net.Http.HttpRequestMessage((New-Object System.Net.Http.HttpMethod($method)), $url)
    if ($null -ne $body) {
      $bytes = [System.Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json))
      $content = New-Object System.Net.Http.ByteArrayContent(, $bytes)
      $content.Headers.TryAddWithoutValidation('Content-Type', 'application/json') | Out-Null
      $req.Content = $content
    }
    $resp = $client.SendAsync($req).GetAwaiter().GetResult()
    $text = $resp.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return ($text | ConvertFrom-Json)
  } finally { $client.Dispose() }
}
function PostJson($u,$b,$t){ InvokeJson 'POST' $u $b $t }
function GetJson($u,$t){ InvokeJson 'GET' $u $null $t }
function PutJson($u,$b,$t){ InvokeJson 'PUT' $u $b $t }

$super = (PostJson "$base/auth/login" @{ studentId='admin'; password='admin123' }).data.token
$sec   = (PostJson "$base/auth/login" @{ studentId='sec_admin'; password='sec123456' }).data.token
Write-Output "LOGIN super=$([bool]$super) section=$([bool]$sec)"

$pass = 0; $failCount = 0
function Expect($name, $code, $wantCode) {
  if ($code -eq $wantCode) { $script:pass++ } else { $script:failCount++; Write-Output "FAIL $name got=[$code] want=[$wantCode]" }
}

# ---- section_admin 矩阵：应放行 ----
Expect 'sec GET /admin/posts'    (GetJson "$base/admin/posts?page=1&pageSize=5" $sec).code 200
Expect 'sec GET /admin/posts?status=deleted 显式放行' (GetJson "$base/admin/posts?status=deleted&page=1" $sec).code 200
Expect 'sec GET /admin/comments' (GetJson "$base/admin/comments?page=1&pageSize=5" $sec).code 200
Expect 'sec GET /admin/reports'  (GetJson "$base/admin/reports?page=1&pageSize=5" $sec).code 200

# ---- section_admin 矩阵：应 403 ----
Expect 'sec GET /admin/stats'     (GetJson "$base/admin/stats" $sec).code 403
Expect 'sec GET /admin/users'     (GetJson "$base/admin/users?page=1" $sec).code 403
Expect 'sec GET /admin/feedbacks' (GetJson "$base/admin/feedbacks?page=1" $sec).code 403
Expect 'sec GET /announcements 管理列表' (GetJson "$base/announcements" $sec).code 403
Expect 'sec POST /admin/sections' (PostJson "$base/admin/sections" @{ name='x-sec-test' } $sec).code 403
$postId = ((GetJson "$base/admin/posts?page=1&pageSize=50" $sec).data.list | Where-Object { $_.title -eq 't5-matrix-post' } | Select-Object -First 1).id
Expect 'sec PUT /posts/:id/top 超管专属' (PutJson "$base/admin/posts/$postId/top" @{ action='top'; topType='global' } $sec).code 403

# ---- 超管抽查 / 未登录 ----
Expect 'super GET /admin/stats'     (GetJson "$base/admin/stats" $super).code 200
Expect 'super GET /admin/users'     (GetJson "$base/admin/users?page=1" $super).code 200
Expect 'super GET /admin/feedbacks' (GetJson "$base/admin/feedbacks?page=1" $super).code 200
Expect 'anon GET /admin/stats'      (GetJson "$base/admin/stats").code 401

# ---- 反馈闭环 ----
$fb = ((GetJson "$base/admin/feedbacks?status=open&page=1" $super).data.list | Select-Object -First 1)
Expect 'PUT feedback status=closed' (PutJson "$base/admin/feedbacks/$($fb.id)/status" @{ status='closed' } $super).code 200
if (((GetJson "$base/admin/feedbacks?status=closed&page=1" $super).data.total) -ge 1) { $script:pass++ } else { $script:failCount++; Write-Output 'FAIL closed tab empty' }
Expect 'PUT feedback 非法状态→400' (PutJson "$base/admin/feedbacks/$($fb.id)/status" @{ status='bogus' } $super).code 400
Expect 'PUT feedback 不存在→404' (PutJson "$base/admin/feedbacks/999999/status" @{ status='closed' } $super).code 404
Expect 'PUT feedback reopen' (PutJson "$base/admin/feedbacks/$($fb.id)/status" @{ status='open' } $super).code 200

# ---- 公告 targetUserId（标题用 ASCII 规避控制台编码干扰）----
Expect 'POST 公告 定向用户不存在→400' (PostJson "$base/announcements" @{ title='t-x'; content='c'; targetUserId=999999 } $super).code 400
$me = GetJson "$base/auth/me" $sec
Expect 'POST 公告 定向成功' (PostJson "$base/announcements" @{ title='t5-targeted-ann'; content='only sec_admin'; targetUserId=$me.data.id } $super).code 200
if ((GetJson "$base/announcements/active" $sec).data.title -eq 't5-targeted-ann') { $script:pass++ } else { $script:failCount++; Write-Output 'FAIL target user cannot see targeted announcement' }
$otherActive = (GetJson "$base/announcements/active" $super)
if ($null -eq $otherActive.data -or $otherActive.data.title -ne 't5-targeted-ann') { $script:pass++ } else { $script:failCount++; Write-Output 'FAIL targeted announcement leaked to others' }

Write-Output "== RESULT pass=$pass fail=$failCount =="
