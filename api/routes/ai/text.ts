/**
 * 轻量文本抽取（draft / summarize 路由共用）：规则版标签 + 价格识别。
 *
 * 从 routes/ai.ts 抽出：词表、停用词与两个纯函数，让路由文件只管请求链，
 * 抽取逻辑独立可测。全部无 IO、无状态。
 */
/**
 * 校园词表：规则版标签的第一优先级。
 * 之前直接拿 3~4 字滑窗会切出「出一个九」「成新元可」这种半截词，
 * 换成「先认词表里的高频校园短语，再退到滑窗」才有可用标签。
 */
/** 基础停用词：标签提取时剔除（长度不足 2 的候选也会被 push 挡掉） */
const STOP_WORDS = new Set(['我们', '你们', '这个', '那个', '什么', '怎么', '可以', '有没有', '一个', '就是', '但是', '因为', '所以', '现在', '今天', '同学', '大家']);

/** 从文本里识别价格（¥1500 / 1500 元 / 1500 块），仅用于标签与成稿字段 */
export function extractPrice(raw: string): number | null {
  const m = raw.match(/(\d+(?:\.\d+)?)\s*(?:元|块|r|rmb)|¥\s*(\d+(?:\.\d+)?)/i);
  if (!m) return null;
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? n : null;
}

export const TAG_LEXICON = [
  '全新', '九成新', '八成新', '七成新', '可小刀', '可议价', '当面交易', '包邮', '低价', '急出', '闲置',
  '求购', '代取', '快递', '宿舍', '东门', '西门', '南门', '图书馆', '食堂', '校园卡', '身份证', '钥匙',
  '耳机', '自行车', '电动车', '笔记本', '手机', '平板', '显示器', '考研', '四级', '六级', '选课', '实习',
  '兼职', '家教', '搭子', '开黑', '拼车', '返校', '机场', '高铁', '演唱会', '讲座', '社团', '招新',
  '志愿', '竞赛', '自习', '表白', '寻人', '失物招领', '二手交易',
];

/** 从文本里抽标签：seeds（调用方给的干净词）→ 校园词表 → ASCII 词块 → 价格 → 中文滑窗兜底 */
export function extractTags(raw: string, limit = 4, seeds: string[] = []): string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  const push = (t: string) => {
    if (!t || t.length < 2 || STOP_WORDS.has(t) || seen.has(t)) return;
    seen.add(t);
    tags.push(t);
  };

  // 0) 调用方种子（如套版抽出的物品/地点）优先级最高
  for (const sd of seeds) push(sd);
  // 1) 校园词表命中（最像标签）
  for (const w of TAG_LEXICON) if (raw.includes(w)) push(w);
  // 2) ASCII 词块（iPad / Air / GTX…）
  for (const w of raw.match(/[A-Za-z][A-Za-z0-9+#.]{1,11}/g) ?? []) push(w);
  // 3) 价格：¥1500
  const price = extractPrice(raw);
  if (price) push(`¥${price}`);

  // 4) 兜底：中文 3~4 字块滑窗——仅在前面一个标签都没抽到时才用（宁可少标签，不出「到一张校」式半截词）
  if (tags.length === 0) {
    const cjk = raw.replace(/[^\u4e00-\u9fa5]/g, '');
    for (const m of cjk.match(/[\u4e00-\u9fa5]{3,4}/g) ?? []) {
      if (/[了的 是在我你他也就都很多吗呢把被给和与]/.test(m)) continue;
      push(m);
      if (tags.length >= limit) break;
    }
  }
  return tags.slice(0, limit);
}
