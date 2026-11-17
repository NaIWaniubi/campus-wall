/**
 * 从小程序法律文本（miniprogram/pages/legal/*.wxml）确定性提取到 Web 端内容模块。
 *
 * 为什么要生成而不是手抄：两份文本必须逐字一致，手抄必然漂移；
 * 由本脚本产出 src/content/legal.ts 后，Vue 页面与小程序页同源。
 *
 * 用法：node scripts/gen-legal-web.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = [
  ['userAgreement', '用户服务协议', 'miniprogram/pages/legal/userAgreement.wxml'],
  ['privacyPolicy', '隐私政策', 'miniprogram/pages/legal/privacyPolicy.wxml'],
];

/** wxml → 结构化块：标题层级保留，缩进标签转全角空格 */
function extract(wxml) {
  const blocks = [];
  const re = /<text class="(legal-title|legal-update|section-title|sub-title|paragraph[^"]*)"[^>]*>([\s\S]*?)<\/text>/g;
  let m;
  while ((m = re.exec(wxml))) {
    const kind = { 'legal-title': 'h1', 'legal-update': 'meta', 'section-title': 'h2', 'sub-title': 'h3' }[m[1]] ?? 'p';
    blocks.push({ k: kind, v: m[2].replace('<text class="indent">', '\u3000\u3000').trim() });
  }
  return blocks;
}

const js = [];
js.push('/**');
js.push(' * Web 端法律文本（与小程序 pages/legal 同源，逐字一致）');
js.push(' * 由 scripts/gen-legal-web.mjs 从 miniprogram/pages/legal/*.wxml 确定性提取生成；');
js.push(' * 修改协议请同步两侧并重新运行本脚本，避免双端漂移。');
js.push(' */');
js.push('');
js.push('export type LegalBlock =');
js.push("  | { k: 'h1'; v: string }");
js.push("  | { k: 'meta'; v: string }");
js.push("  | { k: 'h2'; v: string }");
js.push("  | { k: 'h3'; v: string }");
js.push("  | { k: 'p'; v: string }");
js.push('');
js.push('export const LEGAL_DOCS = {');
for (const [key, title, rel] of DOCS) {
  const wxml = fs.readFileSync(path.join(root, rel), 'utf8');
  const blocks = extract(wxml);
  if (!blocks.length || blocks[0].k !== 'h1') throw new Error(`${rel} 缺少 legal-title`);
  js.push(`  ${key}: { title: ${JSON.stringify(title)}, blocks: [`);
  for (const b of blocks) {
    js.push(`    { k: ${JSON.stringify(b.k)}, v: ${JSON.stringify(b.v)} },`);
  }
  js.push('  ] },');
}
js.push('} as const');
js.push('');

const outDir = path.join(root, 'src', 'content');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'legal.ts'), js.join('\n'));
console.log(`[gen-legal-web] src/content/legal.ts（${DOCS.length} 份文档）已生成`);