#!/usr/bin/env bash
# 模拟 Render 构建：从「全新检出」走一遍 render.yaml 的 buildCommand，
# 然后启动 stage 服务并冒烟，证明仓库根 render.yaml 真的能部署（不依赖任何本机残留物）。
# 用法：bash scripts/simulate-render-build.sh [PORT]
set -uo pipefail

PORT="${1:-3998}"
REPO_WIN="/mnt/e/校园墙"
SIM="$HOME/src/render-sim"
LOG=/tmp/render-sim.log

echo "== 0) 从 git 归档导出全新检出（只含被跟踪的文件）=="
rm -rf "$SIM" && mkdir -p "$SIM"
cd "$REPO_WIN" && git archive HEAD | tar -x -C "$SIM"
cd "$SIM"
echo "files: $(find . -type f | wc -l)  (stage/ 与 api/*.bundle.mjs 不应出现)"
for f in render.yaml .zcode-site/build/sqlite-compat.ts; do
  [ -f "$f" ] && echo "  ok $f" || { echo "  MISSING $f"; exit 1; }
done
[ -f .zcode-site/stage/start.sh ] && { echo "  ! stage 不该出现在检出里"; exit 1; } || echo "  ok stage 未入库（由构建脚本生成）"

echo "== 1) npm install（≈Render build 第一步）=="
npm install --no-audit --no-fund 2>&1 | tail -3

echo "== 2) vite build =="
npx vite build 2>&1 | tail -3

echo "== 3) 打后端单文件 + 组装 stage =="
node scripts/build-site-bundle.mjs 2>&1 | tail -4

echo "== 4) stage 内装 linux sharp（Render 第三步）=="
cd .zcode-site/stage
npm install --omit=dev --no-audit --no-fund --os=linux --cpu=x64 --libc=glibc 2>&1 | tail -3
node -e "import('sharp').then(m=>console.log('sharp bindings:', !!m.default)).catch(e=>console.log('sharp degraded:', e.message.slice(0,60)))"

echo "== 5) bash start.sh 冷启动 =="
rm -rf ./data
PORT=$PORT CORS_ORIGIN="http://localhost:$PORT" bash start.sh > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -fsS -m 2 "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1 && break; sleep 1; done
curl -fsS -m 5 "http://127.0.0.1:$PORT/api/health" -o /dev/null -w "  health=%{http_code}\n" || { echo "FAIL"; tail -30 "$LOG"; exit 1; }
curl -fsS -m 5 "http://127.0.0.1:$PORT/" -o /dev/null -w "  index=%{http_code}\n"
curl -fsS -m 10 "http://127.0.0.1:$PORT/api/posts?page=1&pageSize=1" -o /tmp/p.json -w "  posts=%{http_code}\n"
TOKEN=$(curl -fsS -m 10 -X POST "http://127.0.0.1:$PORT/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"studentId":"23770001","password":"demo1234"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.token)}catch{console.log('')}})")
[ -n "$TOKEN" ] && echo "  login=ok" || { echo "  login=FAIL"; exit 1; }
curl -fsS -m 30 -X POST "http://127.0.0.1:$PORT/api/ai/draft" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"raw":"出九成新 iPad Air，1500 元，可小刀"}' -o /tmp/d.json -w "  ai/draft=%{http_code}\n"
node -e "const d=require('/tmp/d.json').data;console.log('  draft ->', d.sectionName, d.price, JSON.stringify(d.tags))"
curl -fsS -m 10 "http://127.0.0.1:$PORT/api/ai/digest" -o /tmp/g.json -w "  ai/digest=%{http_code}\n"
node -e "const d=require('/tmp/g.json').data;console.log('  digest ->', d.window, d.stats.posts+' posts')"

ERR=$(grep -c '"statusCode":5' "$LOG" || true)
echo "== 结论：5xx=$ERR =="
[ "$ERR" = "0" ] && echo "RENDER BUILD SIM: OK" || { echo "RENDER BUILD SIM: 有 5xx"; exit 2; }
