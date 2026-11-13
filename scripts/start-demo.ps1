# 本地演示站启动器（Windows）
# 机制：先把启动参数写成纯 ASCII 的 .cmd（相对路径，不落中文），再用 WMI 创建进程 ——
#       父进程是 WmiPrvSE，脱离当前终端/任务进程组，终端关闭或后台任务回收都不会杀掉它。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\start-demo.ps1 [-Port 3901]
param(
  [int]$Port = 3901
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$data = Join-Path $root '.zcode-site\test\data'
$log  = Join-Path $data 'demo.log'
$cmdFile = Join-Path $data 'run-demo.cmd'

foreach ($d in @($data, (Join-Path $data 'uploads'), (Join-Path $data 'backups'))) {
  New-Item -ItemType Directory -Force -Path $d | Out-Null
}

# 已有实例在跑就不重复拉起
# Web Push demo VAPID: generate on first run (untracked data dir), inject into env below
$vapidFile = Join-Path $data 'vapid.json'
if (-not (Test-Path $vapidFile)) { & node (Join-Path $root 'scripts\gen-vapid.mjs') $vapidFile | Out-Null }
$vapid = $null
if (Test-Path $vapidFile) { try { $vapid = Get-Content $vapidFile -Raw | ConvertFrom-Json } catch { $vapid = $null } }

$busy = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($busy) {
  Write-Host "[demo] 端口 $Port 已在监听（PID $($busy[0].OwningProcess)），无需重启"
  exit 0
}

# 关键：set 每行一个，绝不写成 "set A=B && set C=D"（cmd 会把 && 前的空格并进变量值，
# 导致 NODE_ENV="production " 校验失败）。全部用相对路径，文件内容保持 ASCII。
$lines = @(
  '@echo off',
  'cd /d "%~dp0..\..\.."',
  'set NODE_ENV=production',
  "set PORT=$Port",
  'set HOST=127.0.0.1',
  'set DB_PATH=.zcode-site\test\data\campus.db',
  'set UPLOAD_DIR=.zcode-site\test\data\uploads',
  'set STORAGE_LOCAL_ROOT=.zcode-site\test\data\uploads',
  'set BACKUP_DIR=.zcode-site\test\data\backups',
  'set JWT_SECRET=dev-local-secret-0123456789abcdef0123456789abcdef',
  'set ADMIN_INITIAL_PASSWORD=admin123',
  'set TRUST_PROXY=1',
  'set LOG_TO_FILE=0',
  "set CORS_ORIGIN=http://127.0.0.1:$Port",
  'node api\server.bundle.mjs >> ".zcode-site\test\data\demo.log" 2>&1'
)
if ($vapid -and $vapid.publicKey -and $vapid.privateKey) {
  # keep the node line LAST: cmd runs top-down, env vars must be set before node starts
  $lines = @($lines[0..($lines.Count - 2)]) + @(
    "set VAPID_PUBLIC_KEY=$($vapid.publicKey)"
    "set VAPID_PRIVATE_KEY=$($vapid.privateKey)"
    'set VAPID_SUBJECT=mailto:demo@campus-wall.local'
  ) + @($lines[-1])
}
Set-Content -Path $cmdFile -Value $lines -Encoding ASCII

$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = "cmd.exe /c `"$cmdFile`"" }
if ($r.ReturnValue -ne 0) { Write-Host "[demo] 启动失败 ReturnValue=$($r.ReturnValue)"; exit 1 }
Write-Host "[demo] 已拉起 PID $($r.ProcessId)（父进程 WmiPrvSE，不受终端回收影响），等待就绪…"

for ($i = 0; $i -lt 30; $i++) {
  Start-Sleep -Seconds 1
  try {
    $h = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
    if ($h.data.status -eq 'ok') {
      Write-Host "[demo] 就绪：http://127.0.0.1:$Port  (db=$($h.data.db.driver) storage=$($h.data.storage.mode))"
      exit 0
    }
  } catch { }
}
Write-Host "[demo] 30 秒未就绪，日志尾部："
Get-Content $log -Tail 15 -ErrorAction SilentlyContinue
exit 1
