/**
 * VAPID 密钥对生成器（运维辅助，V5 落地）
 * 用法：node scripts/gen-vapid.mjs [输出路径]   默认 .zcode-site/test/data/vapid.json
 * 幂等：文件已存在则原样返回，绝不轮换（轮换会让已落库订阅的鉴权头失效）。
 * 密钥只落本地/部署机数据目录，永不进 git —— start-demo.ps1 首跑自动调用它给 demo 通电。
 */
import fs from 'node:fs'
import path from 'node:path'
import webpush from 'web-push'

const out = path.resolve(process.argv[2] || '.zcode-site/test/data/vapid.json')
if (fs.existsSync(out)) {
  console.log(out)
  process.exit(0)
}
const { publicKey, privateKey } = webpush.generateVAPIDKeys()
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify({ publicKey, privateKey, generatedAt: new Date().toISOString() }, null, 2) + '\n', 'utf8')
console.log(out)
