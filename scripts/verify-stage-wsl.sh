#!/usr/bin/env bash
# WSL2 真机验收：把部署包拷到 ext4 跑一次完整冷启动
#   1. 空 DATA_DIR 冷启动 → 自动建库 + 灌种子
#   2. /api/health 就绪
#   3. /api/ai/digest（今日简报）+ 登录 + /api/ai/draft（AI 成稿）+ /api/ai/summarize（划重点）
#   4. 打印日志与结论；失败非零退出
set -uo pipefail

SRC="/mnt/e/校园墙/.zcode-site/stage"
DEST="$HOME/src/campus-stage-v3"
PORT=3999
LOG=/tmp/campus-stage-v3.log

echo "== 1) 同步部署包到 ext4 =="
rm -rf "$DEST"
cp -r "$SRC" "$DEST"
cd "$DEST"
du -sh . | awk '{print "stage size: "$1}'
rm -rf "$DEST/data"

echo "== 2) 冷启动（空数据目录）=="
PORT=$PORT CORS_ORIGIN="http://localhost:$PORT" bash start.sh > "$LOG" 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT

for i in $(seq 1 40); do
  if curl -fsS -m 2 "http://127.0.0.1:$PORT/api/health" > /tmp/health.json 2>/dev/null; then break; fi
  sleep 1
done
if ! curl -fsS -m 3 "http://127.0.0.1:$PORT/api/health" > /tmp/health.json; then
  echo "FAIL: health 未就绪"; tail -40 "$LOG"; exit 1
fi
echo "health: $(head -c 160 /tmp/health.json)"

echo "== 3) 首屏与 API =="
curl -fsS -m 5 "http://127.0.0.1:$PORT/" -o /tmp/index.html && echo "index: $(wc -c < /tmp/index.html) bytes"
curl -fsS -m 10 "http://127.0.0.1:$PORT/api/posts?page=1&pageSize=1" -o /tmp/posts.json && \
  echo "posts: $(node -e "const d=require('/tmp/posts.json');console.log('total='+d.data.total+' first='+JSON.stringify(d.data.list[0].title))")"

echo "-- digest --"
curl -fsS -m 20 "http://127.0.0.1:$PORT/api/ai/digest" | head -c 420; echo

echo "-- login --"
TOKEN=$(curl -fsS -m 10 -X POST "http://127.0.0.1:$PORT/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"studentId":"23770001","password":"demo1234"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s).data.token)}catch{console.log('')}})")
if [ -z "$TOKEN" ]; then echo "FAIL: 登录失败"; tail -30 "$LOG"; exit 1; fi
echo "token: ok"

echo "-- ai/draft --"
curl -fsS -m 40 -X POST "http://127.0.0.1:$PORT/api/ai/draft" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"raw":"出一个九成新 iPad Air，1500 元，可小刀，东门当面交易"}' | head -c 500; echo

echo "-- ai/summarize (风险样例) --"
curl -fsS -m 40 -X POST "http://127.0.0.1:$PORT/api/ai/summarize" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"低价出手机","content":"先交押金200元锁定，加微信扫码转账"}' | head -c 400; echo

echo "-- 上传目录 / 缩略图 --"
ls -la "$DEST/data/uploads" | head -4

echo "== 4) 5xx 计数与结论 =="
ERR=$(grep -c '"statusCode":5' "$LOG" || true)
echo "5xx responses: $ERR"
echo "runtime: $(node -v) / $(grep -m1 'PRETTY_NAME' /etc/os-release 2>/dev/null || echo linux)"
[ "$ERR" = "0" ] && echo "STAGE VERIFY: OK" || { echo "STAGE VERIFY: 有 5xx"; exit 2; }
