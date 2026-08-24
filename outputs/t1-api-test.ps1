$ErrorActionPreference = 'Stop'
$BASE = 'http://127.0.0.1:3102'
function Api($method, $path, $token, $body) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $req = @{ Uri = "$BASE$path"; Method = $method; Headers = $headers; ContentType = 'application/json; charset=utf-8' }
  if ($null -ne $body) { $req['Body'] = [Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Compress)) }
  try {
    $r = Invoke-RestMethod @req
    return @{ status = 200; body = $r }
  } catch {
    $resp = $_.Exception.Response
    $code = [int]$resp.StatusCode
    $reader = New-Object IO.StreamReader($resp.GetResponseStream(), [Text.Encoding]::UTF8)
    $txt = $reader.ReadToEnd() | ConvertFrom-Json
    return @{ status = $code; body = $txt }
  }
}
$ok = 0; $bad = 0
function Check($name, $cond, $detail) {
  if ($cond) { $script:ok++; Write-Output "PASS $name" }
  else { $script:bad++; Write-Output "FAIL $name => $detail" }
}

# login demo users
$A = (Api POST '/api/auth/login' $null @{ studentId='23770001'; password='demo1234' }).body.data
$B = (Api POST '/api/auth/login' $null @{ studentId='23770002'; password='demo1234' }).body.data
$Aid = $A.user.id; $Bid = $B.user.id
Check 'login A+B' ($A -and $B -and $A.token -and $B.token) 'tokens missing'

# ===== 1 conversations =====
$c1 = Api POST '/api/conversations' $A.token @{ peerId = $Bid }
Check 'A create conv with B' ($c1.body.code -eq 200 -and $c1.body.data.id -gt 0) ($c1.body | ConvertTo-Json -Compress)
$convId = $c1.body.data.id
$c2 = Api POST '/api/conversations' $B.token @{ peerId = $Aid }
Check 'B create conv idempotent' ($c2.body.data.id -eq $convId) "$($c2.body.data.id) vs $convId"
$self = Api POST '/api/conversations' $A.token @{ peerId = $Aid }
Check 'self conv rejected' ($self.body.code -eq 400) ($self.body | ConvertTo-Json -Compress)

$m1 = Api POST "/api/conversations/$convId/messages" $A.token @{ content = '同学你好，你丢的卡在我这' }
Check 'A send msg' ($m1.body.code -eq 200 -and $m1.body.data.id -gt 0) ($m1.body | ConvertTo-Json -Compress)
$m2 = Api POST "/api/conversations/$convId/messages" $A.token @{ content = ('x' * 501) }
Check 'msg >500 rejected' ($m2.body.code -eq 400) ($m2.body | ConvertTo-Json -Compress)

$listB = Api GET '/api/conversations' $B.token
$convB = $listB.body.data | Where-Object { $_.id -eq $convId }
Check 'B list shows peer+lastMsg+unread=1' ($convB -and $convB.unread -eq 1 -and $convB.peer.id -eq $Aid -and $convB.lastMessage -like '同学你好*' -and $convB.lastAt) ($listB.body | ConvertTo-Json -Compress -Depth 5)
$uc1 = Api GET '/api/conversations/unread-count' $B.token
Check 'B unread-count=1' ($uc1.body.data.count -eq 1) ($uc1.body | ConvertTo-Json -Compress)

$msgs = Api GET "/api/conversations/$convId/messages?page=1&pageSize=20" $B.token
Check 'B read msgs asc, isMine false' ($msgs.body.code -eq 200 -and $msgs.body.data.total -ge 1 -and $msgs.body.data.list[0].content -like '同学你好*' -and $msgs.body.data.list[0].isMine -eq $false -and $msgs.body.data.list[0].createdAt) ($msgs.body | ConvertTo-Json -Compress -Depth 5)
$hasMoreShape = ($msgs.body.data.PSObject.Properties.Name -join ',')
Check 'pagination shape' ($hasMoreShape -eq 'list,total,page,pageSize,hasMore') $hasMoreShape
$uc2 = Api GET '/api/conversations/unread-count' $B.token
Check 'B unread cleared after read' ($uc2.body.data.count -eq 0) ($uc2.body | ConvertTo-Json -Compress)

$m3 = Api POST "/api/conversations/$convId/messages" $B.token @{ content = '太好了！在哪取？' }
Check 'B reply' ($m3.body.code -eq 200) ($m3.body | ConvertTo-Json -Compress)
$listA = Api GET '/api/conversations' $A.token
$convA = $listA.body.data | Where-Object { $_.id -eq $convId }
Check 'A unread=1 after reply' ($convA.unread -eq 1 -and $convA.lastMessage -eq '太好了！在哪取？') ($convA | ConvertTo-Json -Compress)
$other = Api GET "/api/conversations/$convId/messages" ((Api POST '/api/auth/login' $null @{ studentId='23770003'; password='demo1234' }).body.data.token)
Check 'outsider denied' ($other.body.code -eq 404) ($other.body | ConvertTo-Json -Compress)
$anon = Api GET '/api/conversations' $null
Check 'conversations need auth' ($anon.body.code -eq 401) ($anon.body | ConvertTo-Json -Compress)
# notification type chat created for B
$notif = Api GET '/api/messages?type=chat' $B.token
$chatNotif = $notif.body.data.list | Where-Object { $_.type -eq 'chat' -and $_.content -like '*陈小北*同学你好*' }
Check 'chat notification sent to B' ($null -ne $chatNotif) ($notif.body | ConvertTo-Json -Compress -Depth 5)

# ===== 2 follows =====
$f1 = Api POST "/api/users/$Bid/follow" $A.token
$f2 = Api POST "/api/users/$Bid/follow" $A.token
Check 'follow toggle on->off' ($f1.body.data.following -eq $true -and $f2.body.data.following -eq $false) "$($f1.body.data.following)/$($f2.body.data.following)"
$f3 = Api POST "/api/users/$Bid/follow" $A.token
$fSelf = Api POST "/api/users/$Aid/follow" $A.token
Check 'self-follow rejected' ($fSelf.body.code -eq 400) ($fSelf.body | ConvertTo-Json -Compress)
Api POST "/api/users/$Aid/follow" $B.token | Out-Null
$fw = Api GET "/api/users/$Aid/following?page=1" $A.token
Check 'A following list has B' ($fw.body.data.list.Count -eq 1 -and $fw.body.data.list[0].id -eq $Bid -and $fw.body.data.list[0].nickname -and $null -ne $fw.body.data.list[0].creditScore) ($fw.body | ConvertTo-Json -Compress -Depth 5)
$fr = Api GET "/api/users/$Bid/followers?page=1"
Check 'B followers list has A' ($fr.body.data.list.Count -eq 1 -and $fr.body.data.list[0].id -eq $Aid) ($fr.body | ConvertTo-Json -Compress -Depth 5)
$fs = Api GET "/api/users/$Bid/follow-status" $A.token
Check 'follow-status following=true count=1' ($fs.body.data.following -eq $true -and $fs.body.data.count -eq 1) ($fs.body | ConvertTo-Json -Compress)
$fsNoAuth = Api GET "/api/users/$Bid/follow-status" $null
Check 'follow-status needs auth' ($fsNoAuth.body.code -eq 401) ($fsNoAuth.body | ConvertTo-Json -Compress)

# ===== 3 direction filter =====
$secList = Api GET '/api/sections' $null
$lfSec = ($secList.body.data | Where-Object { $_.name -eq '失物招领' }).id
$allP = Api GET "/api/posts?sectionId=$lfSec&pageSize=50"
$lostP = Api GET "/api/posts?sectionId=$lfSec&direction=lost&pageSize=50"
$foundP = Api GET "/api/posts?sectionId=$lfSec&direction=found&pageSize=50"
$otherP = Api GET "/api/posts?direction=lost&pageSize=50"
Check "section id found ($lfSec)" ($lfSec -gt 0) "$lfSec"
Check "all lost-found posts = 4" ($allP.body.data.total -eq 4) "$($allP.body.data.total)"
Check "direction=lost -> 2 (校园卡急寻+丢失雨伞)" ($lostP.body.data.total -eq 2 -and -not ($lostP.body.data.list | Where-Object { $_.extraFields.direction -ne 'lost' })) "$($lostP.body.data.total): $(($lostP.body.data.list.title) -join '|')"
Check "direction=found -> 2" ($foundP.body.data.total -eq 2 -and -not ($foundP.body.data.list | Where-Object { $_.extraFields.direction -ne 'found' })) "$($foundP.body.data.total)"
Check "direction ignored outside lost-found section" ($otherP.body.data.total -gt 4) "$($otherP.body.data.total)"

# ===== 4 wx-login =====
$wx = Api POST '/api/auth/wx-login' $null @{ code = 'test-code-123' }
Check 'wx-login unconfigured -> 501' ($wx.status -eq 200 -and $wx.body.code -eq 501 -and $wx.body.message -eq '微信登录未配置') "http=$($wx.status) body=$($wx.body | ConvertTo-Json -Compress)"
$wxNoCode = Api POST '/api/auth/wx-login' $null @{}
Check 'wx-login missing code -> 400' ($wxNoCode.body.code -eq 400) ($wxNoCode.body | ConvertTo-Json -Compress)

Write-Output "`n==== RESULT: $ok passed, $bad failed ===="
