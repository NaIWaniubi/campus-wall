/**
 * 发布时相似帖检测阈值标定与回归门（V3-P1）
 *
 * 用法：npx tsx scripts/eval-similar-posts.ts [--gate]
 *
 * 构造三类标注对：
 *   D 真重复   —— 同文 / 小改字 / 只改标点大小写（原样重发、改几个字重发）
 *   S 同主题异文 —— 都在卖 iPad、都在问补办卡，但措辞价格完全不同
 *   U 无关     —— 互不相干的两个话题
 * 在候选阈值阶梯上找「D 全高于、T 与 S/U 全低于」的可行区间，取区间中点作为
 * 生产阈值并回写 api/utils/similarity.ts 的默认值建议；--gate 时分离失败非 0 退出。
 *
 * 与雷达/RAG 评估同款纪律：这是「为什么是 0.45」的证据，不是口头参数。
 */
import { postSimilarity } from '../api/utils/similarity.js';
import fs from 'fs';
import path from 'path';

interface Pair {
  group: 'D 真重复' | 'S 同主题异文' | 'U 无关';
  a: { title: string; content: string };
  b: { title: string; content: string };
  note: string;
}

const CASES: Pair[] = [
  // ── D 真重复（应全部 ≥ 阈值）──
  {
    group: 'D 真重复',
    note: '完全相同重发',
    a: { title: '出九成新 iPad Air 五代', content: '出九成新 iPad Air，五代，64G，1450 元，可小刀，当面交易自取。' },
    b: { title: '出九成新 iPad Air 五代', content: '出九成新 iPad Air，五代，64G，1450 元，可小刀，当面交易自取。' },
  },
  {
    group: 'D 真重复',
    note: '改两三个字重发',
    a: { title: '出九成新 iPad Air 五代', content: '出九成新 iPad Air，五代，64G，1450 元，可小刀，当面交易自取。' },
    b: { title: '出九成新iPad Air 五代 急出', content: '出九成新 iPad Air，五代，64G，1450元，可小刀，当面交易。' },
  },
  {
    group: 'D 真重复',
    note: '只动标点与大小写',
    a: { title: '考研数学全套资料含真题解析', content: '数学英语政治全套复习资料，含近十年真题解析，成色九成新，低价转让。' },
    b: { title: '考研数学全套资料含真题解析！', content: '数学、英语、政治，全套复习资料，含近十年真题解析，成色九成新，低价转让！！' },
  },
  {
    group: 'D 真重复',
    note: '标题正文都几乎照抄',
    a: { title: '捡到一张校园卡 请失主联系', content: '在图书馆二楼捡到一张校园卡，卡号尾号 8812，丢了请联系宿管阿姨转交。' },
    b: { title: '捡到一张校园卡 请失主联系', content: '在图书馆二楼捡到校园卡，卡号尾号 8812，丢失请联系宿管阿姨转交。' },
  },
  // ── S 同主题异文（必须低于阈值，防误报）──
  {
    group: 'S 同主题异文',
    note: '同卖 iPad 但措辞价格全不同',
    a: { title: '出九成新 iPad Air 五代', content: '出九成新 iPad Air，五代，64G，1450 元，可小刀，当面交易自取。' },
    b: { title: '低价转让闲置平板', content: '用了一年多的平板，无磕碰，送保护壳，900 元包邮，急出。' },
  },
  {
    group: 'S 同主题异文',
    note: '同问补办卡但说法不同',
    a: { title: '校园卡丢了怎么补办', content: '校园卡丢失后去哪里补办，需要带什么证件，多久能拿到新卡？' },
    b: { title: '一卡通遗失补办流程咨询', content: '请教一下，饭卡弄丢了之后该走什么手续，服务中心周末上班吗？' },
  },
  {
    group: 'S 同主题异文',
    note: '同吐槽食堂角度不同',
    a: { title: '食堂二楼米饭太硬', content: '今天打的米饭硬得嚼不动，希望厨师改进一下火候。' },
    b: { title: '关于饭菜分量的建议', content: '菜量越来越少，两荤一素根本不够吃，希望可以恢复以前的分量。' },
  },
  // ── U 无关 ──
  {
    group: 'U 无关',
    note: '二手 vs 失物',
    a: { title: '出九成新自行车 200 元', content: '毕业出九成新山地车，变速正常，200 元，自行车锁送。' },
    b: { title: '捡到一把宿舍钥匙', content: '在篮球场边捡到一串钥匙，看起来是宿舍门的，丢的同学速联系。' },
  },
  {
    group: 'U 无关',
    note: '活动 vs 拼车',
    a: { title: '十佳歌手大赛报名', content: '校园十佳歌手大赛开始报名了，详情看海报，截止本周五晚。' },
    b: { title: '周五拼车回市区', content: '周五下午从学校拼车回万达，两人还有两个座位，平摊高速费。' },
  },
];

function main() {
  const gate = process.argv.includes('--gate');
  const scores = CASES.map((c) => ({ ...c, score: postSimilarity(c.a, c.b) }));
  const dups = scores.filter((s) => s.group === 'D 真重复').map((s) => s.score);
  const nonDups = scores.filter((s) => s.group !== 'D 真重复').map((s) => s.score);
  const dupMin = Math.min(...dups);
  const nonMax = Math.max(...nonDups);

  console.log('相似帖检测阈值标定');
  for (const s of scores) console.log(`  [${s.group}] ${s.note}: ${s.score.toFixed(3)}`);
  console.log(`  真重复最低分 ${dupMin.toFixed(3)} / 非重复最高分 ${nonMax.toFixed(3)}`);

  // 可行阈值区间：(nonMax, dupMin)
  const feasible = dupMin > nonMax;
  const suggested = feasible ? Number(((nonMax + dupMin) / 2).toFixed(2)) : null;

  const lines = [
    '# 相似帖检测阈值标定（V3-P1）',
    '',
    `> 生成时间：${new Date().toISOString()}　·　模式：全离线（词面 Jaccard，无网关）`,
    '',
    '| 组 | 用例 | 得分 |',
    '|---|---|---|',
    ...scores.map((s) => `| ${s.group} | ${s.note} | ${s.score.toFixed(3)} |`),
    '',
    `- 真重复最低分 **${dupMin.toFixed(3)}**，非重复最高分 **${nonMax.toFixed(3)}**`,
    `- 可分离：${feasible ? '✅ 是' : '❌ 否'}；建议阈值 **${suggested ?? '—'}**（可行区间中点）`,
    `- 当前生产常量：SIMILAR_NOTIFY_THRESHOLD = ${process.env.SIMILAR_NOTIFY_THRESHOLD ?? '0.45（similarity.ts 默认）'}`,
    '',
  ];
  fs.mkdirSync(path.join(process.cwd(), 'docs'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'docs', 'similar-eval-report.md'), lines.join('\n'), 'utf-8');
  console.log('  明细 → docs/similar-eval-report.md');

  // --gate 语义与雷达/RAG 评估门一致：非门跑只出报告，门跑才强制退出码
  if (gate) {
    if (!feasible) {
      console.error('gate 失败：真重复与非重复分数区间重叠，需重新设计特征或标注');
      process.exit(1);
    }
    const current = Number((process.env.SIMILAR_NOTIFY_THRESHOLD ?? 0.45).toFixed(2));
    if (current <= nonMax || current >= dupMin) {
      console.error(
        `gate 失败：当前阈值 ${current} 不在可行区间 (${nonMax.toFixed(3)}, ${dupMin.toFixed(3)}) 内——按标定值修正 similarity.ts`,
      );
      process.exit(1);
    }
  } else if (!feasible) {
    console.error('分离失败（未传 --gate，仅告警）：真重复与非重复分数区间重叠');
  }
}

main();