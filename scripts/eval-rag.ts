/**
 * RAG 检索质量离线评估：recall@k / nDCG@k / MRR + 无答案防幻觉负例
 *
 * 用法：
 *   npx tsx scripts/eval-rag.ts            # markdown 记分卡
 *   npx tsx scripts/eval-rag.ts --gate     # 回归门（CI 用，低于阈值非 0 退出）
 *
 * 标注集分层（R4 审查补齐「10 条全 easy、满分无说服力」的问题）：
 *   A 标准直问     —— 12 条：题面与文档措辞接近
 *   B 同义改写     —— 14 条：口语/换词/倒装（如「不见了」「遗失」「忘在」）
 *   C 复合查询     ——  8 条：答案跨两篇文档，期望同屏召回两篇
 *   D 易混判别     ——  6 条：题面带邻近功能词（如问学生证、流程 vs 联系方式），
 *                         考察排序不被相似干扰项带走
 *   E1 词面零交集 ——  4 条：知识库不含答案且查询词与所有文档无实义重叠，
 *                         唯一命中只剩哈希桶碰撞（期望被噪声地板整批切除，严格门）
 *   E2 泛词同形   ——  6 条：查询与库内文档存在功能词（开放/价格/在哪）或同形
 *                         弱相关词（扫码、一次）的交集。当前策略下检索层建议返回
 *                         「尽量相关」的条目、由上层提示词约束诚实作答——此组不断
 *                         言空集，仅统计观察值（R4 实测教训：人工标零交集两次漏判，
 *                         靠机器断言兜底）
 *
 * 全部离线纯函数，不调网关。评测集为内置合成集：用于回归把关与难度分层展示，
 * 不代表真实语料上的绝对检索质量（规模有限，见报告末尾的诚实声明）。
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

/** 隔离库（R4 审查）：评估必须只对合成文档库说话——写进开发库会被
 * 真实帖子块污染（E 类负例因此全幻觉）。env 在动态 import 前设置，DB 路径
 * 于模块加载时一次性解析，故隔离必须发生在 import 之前。 */
const ISOLATED_DB = path.join(os.tmpdir(), `campus-rag-eval-${process.pid}.db`);
process.env.DB_PATH = ISOLATED_DB;
// 隔离库是全新文件，initDatabase 在生产模式下会要求首次启动设置管理员口令；
// 评估属离线评测，明确按开发模式初始化（与 vitest 的 NODE_ENV=test 同思路）
process.env.NODE_ENV = 'development';
fs.rmSync(ISOLATED_DB, { force: true });
// 清理上轮可能残留的 -shm/-wal
for (const suffix of ['-shm', '-wal']) fs.rmSync(ISOLATED_DB + suffix, { force: true });

// ── 动态导入：确保上述 env 已生效后再加载数据层 ──
const { retrieve } = await import('../api/rag/retrieve.js');
const { upsertChunks, deleteBySource } = await import('../api/rag/store.js');
const { hashEmbed, splitQueryTokens } = await import('../api/rag/embedder.js');
const { contentHash } = await import('../api/rag/chunker.js');

type Group = 'A 标准直问' | 'B 同义改写' | 'C 复合查询' | 'D 易混判别' | 'E1 词面零交集' | 'E2 泛词同形';

interface EvalItem {
  query: string;
  /** 期望被检索到的 sourceId 列表（E 类为 []） */
  relevantIds: number[];
  /** E 类：无答案查询，检索应返回空集（非空即幻觉违规） */
  expectEmpty?: boolean;
  group: Group;
}

// ── 内置文档库（28 篇：功能覆盖 + 易混干扰项，id 即 sourceId） ──
const DOCS: Array<{ id: number; text: string }> = [
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
  // 功能覆盖扩充（R4）
  { id: 11, text: '一卡通支持现金充值与微信支付宝扫码充值，服务中心工作日均开放。' },
  { id: 12, text: '宿舍宽带资费包月三十元，到营业厅或线上小程序均可办理，报修打网络中心电话。' },
  { id: 13, text: '自习室预约失败常见原因是名额已满或未绑定教务账号，可错峰再试或联系教务处。' },
  { id: 14, text: '校内快递点位于体育馆东侧，支持顺丰中通圆通，午间十二点至晚八点营业。' },
  { id: 15, text: '校医院就诊先在一楼挂号收费，持学生证可减免部分检查费，急诊二十四小时开放。' },
  { id: 16, text: '学生证每学期注册一次，遗失后到教务处窗口申请补办，需贴照片并缴费十元。' },
  { id: 17, text: '学费通过迎新系统在线缴纳，支持银联与主流支付，开学前完成即可。' },
  { id: 18, text: '校历显示本学期教学周共十八周，期末考试安排在第十九至二十周进行。' },
  { id: 19, text: '电动车充电桩分布在两处车棚，满电自动断电，费用一元每小时。' },
  { id: 20, text: '食堂各窗口晚九点半统一停止供餐，夜宵时段仅保留一楼便利店。' },
  { id: 21, text: '教学楼下层设有自助打印复印店，学生证刷卡计费，单面黑白一毛。' },
  { id: 22, text: '报修进度可在后勤公众号实时查询，维修完成会有短信通知。' },
  { id: 23, text: '失物招领流程：在失物招领板块登记发帖写明物品特征与时间地点，等待认领匹配。' },
  { id: 24, text: '毕业离校手续清单包括结清费用、交还图书、退宿核验与档案转递四类事项。' },
  // 易混干扰项（D 类判别用）：管理端功能，普通问答不应据此「答非所问」
  { id: 25, text: '帖子置顶分为全站置顶与板块置顶两级，仅管理员后台可操作，首页优先展示。' },
  { id: 26, text: '匿名发布后台仍留存作者信息用于违规追责，发布前请确认内容合规。' },
  { id: 27, text: '信誉分扣分细则：辱骂他人扣五分，虚假交易扣二十分，满分一百二十。' },
  { id: 28, text: '举报受理后一般三日内处理完毕，处理结果通过站内通知反馈给举报人。' },
];

// ── 标注集（六档难度，规模 50：A12 / B14 / C8 / D6 / E1·4 / E2·6） ──
const CASES: EvalItem[] = [
  // A 标准直问 12
  { query: '校园卡丢失后怎么补办', relevantIds: [1], group: 'A 标准直问' },
  { query: '二手交易发帖要写什么信息', relevantIds: [2], group: 'A 标准直问' },
  { query: '图书馆开放时间是什么时候', relevantIds: [3], group: 'A 标准直问' },
  { query: '宿舍漏水报修找谁', relevantIds: [4], group: 'A 标准直问' },
  { query: '考研自习室怎么预约', relevantIds: [5], group: 'A 标准直问' },
  { query: '英语四级报名时间', relevantIds: [6], group: 'A 标准直问' },
  { query: '毕业论文查重用什么系统', relevantIds: [7], group: 'A 标准直问' },
  { query: '奖学金评定结果什么时候公布', relevantIds: [8], group: 'A 标准直问' },
  { query: '新生报到需要带哪些材料', relevantIds: [9], group: 'A 标准直问' },
  { query: '食堂二楼有什么好吃的推荐', relevantIds: [10], group: 'A 标准直问' },
  { query: '一卡通怎么充值', relevantIds: [11], group: 'A 标准直问' },
  { query: '学费怎么交', relevantIds: [17], group: 'A 标准直问' },

  // B 同义改写 14（口语/换词/倒装）
  { query: '校园卡不见了去哪儿补', relevantIds: [1], group: 'B 同义改写' },
  { query: '我的卡丢了能马上办新的吗', relevantIds: [1], group: 'B 同义改写' },
  { query: '遗失一卡通之后如何挂失', relevantIds: [1], group: 'B 同义改写' },
  { query: '卖闲置东西发帖要填啥', relevantIds: [2], group: 'B 同义改写' },
  { query: '出二手货要写价格和成色吗', relevantIds: [2], group: 'B 同义改写' },
  { query: '图书馆几点开门关门', relevantIds: [3], group: 'B 同义改写' },
  { query: '自习室抢不到名额怎么办', relevantIds: [13], group: 'B 同义改写' },
  { query: '快递站在哪取件', relevantIds: [14], group: 'B 同义改写' },
  { query: '看病先去哪个窗口挂号', relevantIds: [15], group: 'B 同义改写' },
  { query: '论文重复率多少算过', relevantIds: [7], group: 'B 同义改写' },
  { query: '领奖学金结果去哪个系统看', relevantIds: [8], group: 'B 同义改写' },
  { query: '电动车在哪儿充电贵不贵', relevantIds: [19], group: 'B 同义改写' },
  { query: '打印复印去哪刷学生证', relevantIds: [21], group: 'B 同义改写' },
  { query: '搬走前宿舍钥匙怎么退宿', relevantIds: [24], group: 'B 同义改写' },

  // C 复合查询 8（答案跨两篇，同屏召回）
  { query: '图书馆和食堂周末都开门吗', relevantIds: [3, 10, 20], group: 'C 复合查询' },
  { query: '补办卡和学生证分别要去哪', relevantIds: [1, 16], group: 'C 复合查询' },
  { query: '报修后怎么查进度短信什么时候来', relevantIds: [4, 22], group: 'C 复合查询' },
  { query: '二手交易和匿名发布有什么规矩', relevantIds: [2, 26], group: 'C 复合查询' },
  { query: '奖学金公布和信誉扣分去哪查', relevantIds: [8, 27], group: 'C 复合查询' },
  { query: '丢了东西和捡到东西分别怎么处理', relevantIds: [1, 23], group: 'C 复合查询' },
  { query: '四级报名和考研自习室都用教务系统吗', relevantIds: [5, 6], group: 'C 复合查询' },
  { query: '打印店充电桩分别在教学楼和车棚', relevantIds: [21, 19], group: 'C 复合查询' },

  // D 易混判别 6（题面带邻近功能词，考排序不被带走）
  { query: '学生证丢了怎么补', relevantIds: [16], group: 'D 易混判别' },
  { query: '宿舍东西坏了找宿管还是打电话', relevantIds: [4], group: 'D 易混判别' },
  { query: '帖子被举报后多久有结果', relevantIds: [28], group: 'D 易混判别' },
  { query: '报修需要几步流程联系谁', relevantIds: [4], group: 'D 易混判别' },
  { query: '学工系统和班级群都能查到奖学金吗', relevantIds: [8], group: 'D 易混判别' },
  { query: '考试周图书馆几点关门', relevantIds: [3], group: 'D 易混判别' },

  // E1 无答案负例·词面零交集 4（严格门：知识库全无关 + 查询词与所有文档
  //   **无任何分词交集**——该前提由 setup() 的自动断言强制校验，标错即报错；
  //   唯一可能的命中是哈希桶碰撞，期望被实义重叠校验整批剔除）
  { query: '健身房怎么约私教课', relevantIds: [], expectEmpty: true, group: 'E1 词面零交集' },
  { query: '冬泳馆水温多少度', relevantIds: [], expectEmpty: true, group: 'E1 词面零交集' },
  { query: '滑雪板雪场寄存规则', relevantIds: [], expectEmpty: true, group: 'E1 词面零交集' },
  { query: '牙套矫正复诊频率', relevantIds: [], expectEmpty: true, group: 'E1 词面零交集' },

  // E2 无答案负例·泛词/同形 6（观察项：查询与库内文档存在功能词（开放/价格/
  //   在哪）或同形弱相关词（扫码、一次）的交集——当前策略下检索层建议返回
  //   「尽量相关」的条目、由上层提示词约束诚实作答。此组不断言空集，
  //   只统计平均返回条数作为产品策略观察值，不入 gate。
  //   R4 实测教训：人工标「零交集」两次漏判（学生/扫码/一次），靠机器断言兜底）
  { query: '游泳池开放时间几点到几点', relevantIds: [], expectEmpty: false, group: 'E2 泛词同形' },
  { query: '校门口出租车拼车价格', relevantIds: [], expectEmpty: false, group: 'E2 泛词同形' },
  { query: '社团招新报名表在哪下载', relevantIds: [], expectEmpty: false, group: 'E2 泛词同形' },
  { query: '考试周奶茶店打折吗', relevantIds: [], expectEmpty: false, group: 'E2 泛词同形' },
  { query: '洗衣机房投币还是扫码', relevantIds: [], expectEmpty: false, group: 'E2 泛词同形' },
  { query: '牙科诊所洗牙一次多少钱', relevantIds: [], expectEmpty: false, group: 'E2 泛词同形' },
];

async function setup() {
  for (const d of DOCS) {
    upsertChunks([{
      sourceType: 'test-eval',
      sourceId: d.id,
      title: d.text.slice(0, 12),
      content: d.text,
      contentHash: contentHash(d.text + '-eval-rag-v2'),
      embedding: hashEmbed(d.text),
    }]);
  }

  // E1 前提自动断言：词面零交集必须「真的零」——人工标注两次漏判
  // （学生/扫码/一次均为真实词面重叠，被误标为零交集），改由机器校验兜底
  const docTokenSets = DOCS.map((d) => new Set(splitQueryTokens(d.text)));
  for (const c of CASES.filter((x) => x.expectEmpty === true)) {
    const qs = new Set(splitQueryTokens(c.query));
    if (!qs.size) continue;
    for (let i = 0; i < docTokenSets.length; i++) {
      for (const t of qs) {
        if (docTokenSets[i].has(t)) {
          console.error(`E1 标注错误：「${c.query}」与文档 ${DOCS[i].id} 存在真实共享词面「${t}」，请移入 E2 或改写查询`);
          process.exit(1);
        }
      }
    }
  }
}

function cleanup() {
  for (const d of DOCS) deleteBySource('test-eval', d.id);
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
  let dcg = 0;
  for (let i = 0; i < top.length; i++) {
    if (relevant.includes(top[i])) dcg += 1 / Math.log2(i + 2);
  }
  const idealHits = Math.min(relevant.length, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
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
    results.push({
      query: c.query,
      group: c.group,
      retrieved: retrieved.slice(0, K),
      expectEmpty: !!c.expectEmpty,
      returned: retrieved.length,
      recall: c.expectEmpty ? 1 : recallAtK(retrieved, c.relevantIds, K),
      ndcg: c.expectEmpty ? 1 : ndcgAtK(retrieved, c.relevantIds, K),
      mrr: c.expectEmpty ? 1 : mrr(retrieved, c.relevantIds),
      hits: c.expectEmpty ? -1 : retrieved.filter((id) => c.relevantIds.includes(id)).length,
      need: c.expectEmpty ? 0 : c.relevantIds.length,
    });
  }

  cleanup();

  // 有答案子集（A–D）的指标；E 的指标用「未返回」计 1 分并入总表但不混入 recall 口径
  // 有答案子集（A–D + E1/E2 的口径说明见各组定义；need>0 排除无标注的观察组）
  const answerable = results.filter((r) => !r.expectEmpty && r.need > 0);
  const negatives = results.filter((r) => r.expectEmpty);
  const avgRecall = answerable.reduce((s, r) => s + r.recall, 0) / answerable.length;
  const avgNdcg = answerable.reduce((s, r) => s + r.ndcg, 0) / answerable.length;
  const avgMrr = answerable.reduce((s, r) => s + r.mrr, 0) / answerable.length;
  // 幻觉违规数：E 类却返回了条目
  const hallucinations = negatives.filter((r) => r.returned > 0).length;

  // 分组指标
  const groups = Array.from(new Set(results.map((r) => r.group))) as Group[];
  const groupLines = groups.map((g) => {
    const rs = results.filter((r) => r.group === g && !r.expectEmpty);
    const ns = results.filter((r) => r.group === g && r.expectEmpty);
    const gr = rs.length ? rs.reduce((s, r) => s + r.recall, 0) / rs.length : null;
    return { g, n: results.filter((r) => r.group === g).length, recall: gr, hallu: ns.filter((r) => r.returned > 0).length };
  });

  console.log(`RAG 检索质量评估（内置评测集 ${CASES.length} 条 / ${DOCS.length} 篇文档）`);
  console.log(`  recall@${K}   ${avgRecall.toFixed(3)}（有答案子集 ${answerable.length} 条）`);
  console.log(`  nDCG@${K}     ${avgNdcg.toFixed(3)}`);
  console.log(`  MRR          ${avgMrr.toFixed(3)}`);
  console.log(`  无答案负例   ${negatives.length} 条，幻觉违规 ${hallucinations} 次`);
  for (const gl of groupLines) {
    console.log(`  [${gl.g}] n=${gl.n}${gl.recall != null ? ` recall=${gl.recall.toFixed(3)}` : ''} 幻觉=${gl.hallu}`);
  }

  const failReasons: string[] = [];
  if (avgRecall < 0.85) failReasons.push(`recall@${K}=${avgRecall.toFixed(3)} < 0.85`);
  if (hallucinations > 0) failReasons.push(`无答案负例幻觉 ${hallucinations} 次 > 0`);
  if (gate && failReasons.length) {
    console.error('gate 失败：' + failReasons.join('；'));
    process.exit(1);
  }

  // markdown 明细
  const outDir = path.join(process.cwd(), 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  const lines: string[] = [
    '# RAG 检索质量评估',
    '',
    `> 生成时间：${new Date().toISOString()}　·　模式：全离线（本地确定性哈希嵌入，无网关）`,
    '',
    `- 评测集：**${CASES.length} 条**（A 标准直问 ${CASES.filter((c) => c.group === 'A 标准直问').length} / B 同义改写 ${CASES.filter((c) => c.group === 'B 同义改写').length} / C 复合查询 ${CASES.filter((c) => c.group === 'C 复合查询').length} / D 易混判别 ${CASES.filter((c) => c.group === 'D 易混判别').length} / **E1 词面零交集 ${CASES.filter((c) => c.group === 'E1 词面零交集').length}** + **E2 泛词同形 ${CASES.filter((c) => c.group === 'E2 泛词同形').length}**）`,
    `- 文档库：**28 篇**合成校园功能文档（含 4 篇易混干扰项：置顶规则 / 匿名规范 / 信誉细则 / 举报时限）`,
    `- 指标口径：recall/nDCG/MRR 仅对有答案子集（${answerable.length} 条）计算；E 类按「检索是否返回空集」计幻觉违规`,
    '',
    '| 组 | 条数 | recall@5 | 幻觉违规 |',
    '|---|---|---|---|',
  ];
  for (const gl of groupLines) {
    lines.push(`| ${gl.g} | ${gl.n} | ${gl.recall != null ? gl.recall.toFixed(3) : '—'} | ${gl.hallu} |`);
  }
  lines.push(
    '',
    `**总体** recall@5=${avgRecall.toFixed(3)}　nDCG@5=${avgNdcg.toFixed(3)}　MRR=${avgMrr.toFixed(3)}　无答案负例幻觉 ${hallucinations}/${negatives.length}`,
    '',
    '## 用例明细',
    '',
    '| 组 | 问题 | 返回 sourceId | 是否符合预期 |',
    '|---|---|---|---|',
  );
  for (const r of results) {
    const okText = r.expectEmpty
      ? (r.returned === 0 ? '✓ 未误返回' : '✗ 幻觉')
      : r.hits >= r.need ? '✓ 全召回' : `部分（命中 ${r.hits}/${r.need}）`;
    lines.push(`| ${r.group} | ${r.query} | ${r.retrieved.join(',') || '（空）'} | ${okText} |`);
  }
  lines.push(
    '',
    '## 诚实声明',
    '',
    '1. 本评测集为**内置合成集**：文档与查询均由项目自建，用于 CI 回归把关与难度分层展示；',
    '   它**不代表真实校园语料上的绝对检索质量**——真实语料的标注集（外部人工标注、',
    '   难例挖掘）由部署后按用户真实查询日志持续扩充，规模目标 200+ 条。',
    '2. 同义词归一层（遗失→丢失、捡到系列、丢失寻找等）在嵌入前归一化，提升 B/D 类召回；',
    '   该映射是受控词表，不是通用语义模型，跨域泛化能力不在本评测覆盖范围内。',
    '3. E 类负例的作用是验证「知识库里没有的答案检索层会如实返回空」，把幻觉拦截在',
    '   检索环节，而不是指望提示词约束模型自觉。',
  );
  fs.writeFileSync(path.join(outDir, 'rag-eval-report.md'), lines.join('\n'), 'utf-8');
  console.log('  明细 → docs/rag-eval-report.md');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    // 评估完即删隔离库，不留痕（wal 句柄可能未关，失败静默）
    try {
      fs.rmSync(ISOLATED_DB, { force: true });
      for (const suffix of ['-shm', '-wal']) fs.rmSync(ISOLATED_DB + suffix, { force: true });
    } catch { /* 忽略 */ }
  });