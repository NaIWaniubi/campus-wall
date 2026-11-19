/**
 * RAG 检索质量离线评估：recall@k / nDCG@k / MRR
 *
 * 用法：
 *   npx tsx scripts/eval-rag.ts            # markdown 记分卡
 *   npx tsx scripts/eval-rag.ts --gate     # 回归门（CI 用，低于阈值非 0 退出）
 *
 * 标注集：每条 (query, relevant_source_ids[]) —— relevant = 应被检索到的高相关块。
 * 全部离线纯函数，不调网关。
 */
import { retrieve } from '../api/rag/retrieve.js';
import { upsertChunks, deleteBySource } from '../api/rag/store.js';
import { hashEmbed } from '../api/rag/embedder.js';
import { contentHash } from '../api/rag/chunker.js';
import fs from 'fs';
import path from 'path';

interface EvalItem {
  query: string;
  /** 期望被检索到的 sourceId 列表 */
  relevantIds: number[];
}

// ── 内置标注集（10 条校园高频问题） ──
const CASES: EvalItem[] = [
  { query: '校园卡丢失后怎么补办', relevantIds: [1] },
  { query: '二手交易发帖要写什么信息', relevantIds: [2] },
  { query: '图书馆开放时间是什么时候', relevantIds: [3] },
  { query: '宿舍漏水报修找谁', relevantIds: [4] },
  { query: '考研自习室怎么预约', relevantIds: [5] },
  { query: '英语四级报名时间', relevantIds: [6] },
  { query: '毕业论文查重用什么系统', relevantIds: [7] },
  { query: '奖学金评定结果什么时候公布', relevantIds: [8] },
  { query: '新生报到需要带哪些材料', relevantIds: [9] },
  { query: '食堂二楼有什么好吃的推荐', relevantIds: [10] },
];

// ── 构造测试库（与标注集 sourceId 对应） ──
const TEST_DOCS = [
  { id: 1, text: '校园卡丢失后请前往一卡通服务中心，携带学生证进行挂失并补办新卡，当天可取。' },
  { id: 2, text: '发布二手交易帖需要标注商品价格、成色描述和联系方式，以便买家了解详情。' },
  { id: 3, text: '图书馆开放时间为周一至周日早上八点至晚上十点，考试周延长至十一点。' },
  { id: 4, text: '宿舍设施报修请联系宿管阿姨或拨打后勤维修热线，工作时间内两小时内响应。' },
  { id: 5, text: '考研自习室可通过教务系统在线预约，每学期初开放名额，先到先得。' },
  { id: 6, text: '英语四级考试报名一般在每年三月和九月，通过教务处网站在线提交。' },
  { id: 7, text: '毕业论文查重使用知网或维普系统，学校规定重复率不超过百分之二十五为合格。' },
  { id: 8, text: '奖学金评定结果通常在每学期末由辅导员在班级群内公布，也可在学工系统查询。' },
  { id: 9, text: '新生报到需要携带录取通知书、身份证、户口本复印件、一寸照片和团组织关系介绍信。' },
  { id: 10, text: '食堂二楼新开了一家麻辣烫窗口，推荐尝试，午间高峰需排队十分钟左右。' },
];

async function setup() {
  for (const d of TEST_DOCS) {
    upsertChunks([{
      sourceType: 'test-eval',
      sourceId: d.id,
      title: d.text.slice(0, 12),
      content: d.text,
      contentHash: contentHash(d.text + '-eval-rag'),
      embedding: hashEmbed(d.text),
    }]);
  }
}

function cleanup() {
  for (const d of TEST_DOCS) deleteBySource('test-eval', d.id);
}

/** recall@k：在 topK 结果中命中 relevantIds 的比例 */
function recallAtK(retrieved: number[], relevant: number[], k: number): number {
  const top = retrieved.slice(0, k);
  let hits = 0;
  for (const r of relevant) if (top.includes(r)) hits++;
  return hits / Math.max(relevant.length, 1);
}

/** nDCG@k：归一折损累积增益（对首位命中的高价值排序敏感） */
function ndcgAtK(retrieved: number[], relevant: number[], k: number): number {
  const top = retrieved.slice(0, k);
  // DCG：每位 2^rel - 1 / log2(i+2)，rel=1 表示相关
  let dcg = 0;
  for (let i = 0; i < top.length; i++) {
    if (relevant.includes(top[i])) dcg += 1 / Math.log2(i + 2);
  }
  // IDCG：理想排序（全相关在前）
  const idealHits = Math.min(relevant.length, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
  // 浮点保险：nDCG 理论上界 1.0
  const ndcg = idcg ? dcg / idcg : 0;
  return Math.min(ndcg, 1);
}

/** MRR：首个正确结果的排名倒数均值 */
function mrr(retrieved: number[], relevant: number[]): number {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.includes(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
}

async function main() {
  const gate = process.argv.includes('--gate');
  await setup();

  const K = 5;
  const results = [];
  for (const c of CASES) {
    const sources = await retrieve(c.query, { topK: K });
    const retrieved = sources.map((s) => s.sourceId).filter((id) => id > 0);
    const r = recallAtK(retrieved, c.relevantIds, K);
    const n = ndcgAtK(retrieved, c.relevantIds, K);
    const m = mrr(retrieved, c.relevantIds);
    results.push({ query: c.query, retrieved: retrieved.slice(0, K), recall: r, ndcg: n, mrr: m });
  }

  cleanup();

  const avgRecall = results.reduce((s, r) => s + r.recall, 0) / results.length;
  const avgNdcg = results.reduce((s, r) => s + r.ndcg, 0) / results.length;
  const avgMrr = results.reduce((s, r) => s + r.mrr, 0) / results.length;

  console.log('RAG 检索质量评估');
  console.log(`  recall@${K}   ${avgRecall.toFixed(3)}`);
  console.log(`  nDCG@${K}     ${avgNdcg.toFixed(3)}`);
  console.log(`  MRR          ${avgMrr.toFixed(3)}`);

  if (gate && avgRecall < 0.7) {
    console.error(`gate 失败：recall@${K}=${avgRecall.toFixed(3)} < 0.7`);
    process.exit(1);
  }

  // 写 markdown 明细
  const outDir = path.join(process.cwd(), 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  const lines = ['# RAG 检索质量评估', '', `> ${new Date().toISOString()}`, '', '| 问题 | 命中 | recall@${K} | nDCG@${K} | MRR |', '|---|---|---|---|---|'];
  for (const r of results) {
    lines.push(`| ${r.query} | ${r.retrieved.join(',')} | ${r.recall.toFixed(2)} | ${r.ndcg.toFixed(2)} | ${r.mrr.toFixed(2)} |`);
  }
  lines.push('', `**均值** recall@${K}=${avgRecall.toFixed(3)} nDCG@${K}=${avgNdcg.toFixed(3)} MRR=${avgMrr.toFixed(3)}`);
  fs.writeFileSync(path.join(outDir, 'rag-eval-report.md'), lines.join('\n'), 'utf-8');
  console.log('  明细 → docs/rag-eval-report.md');
}

main().catch((e) => { console.error(e); process.exit(1); });