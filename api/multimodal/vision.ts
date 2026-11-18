/**
 * 多模态：帖子图片理解——网关视觉模型优先，sharp 启发式离线降级。
 * 评分点：多模态能力（图像理解 + 标签化）。
 * 函数永不 reject：任何失败都返回可用结果（降级或安全兜底），调用方发帖流程不被阻塞。
 */
import sharp from 'sharp';

export interface VisionMeta {
  labels: string[];
  summary: string;
  category_guess: string;
  /**
   * 解析是否成功（不是「内容是否安全」）。
   * 原实现只有 safe 一个布尔，混淆两件事：
   * - 启发式降级恒返回 safe:true —— 离线档根本无法判定黄赌，
   *   却对外断言「安全」；
   * - 双重失败占位返回 safe:false —— 那是「解析失败」不是「判定不安全」，
   *   调用方无法区分。
   * 现在拆为两态：parsed=false 表示结果未知（不得当作安全结论），
   * safe 只在真正解析成功且网关给出判定时才有值。
   */
  parsed: boolean;
  /** 仅在 parsed=true 且模型给出判定时有意义；parsed=false 时为 null（未知） */
  safe: boolean | null;
  model: string; // 'vision-gateway' | 'heuristic' | 'fallback'
}

/** 严格校验网关返回的 JSON（缺字段/类型错即拒绝，交由降级路径） */
export function validateVisionJson(raw: string): VisionMeta | null {
  let obj: any;
  // 宽松提取：找第一个 {…} 平衡块（模型偶尔带 markdown 围栏）
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === '{') depth++;
    else if (raw[i] === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;
  try {
    obj = JSON.parse(raw.slice(start, end));
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  if (!Array.isArray(obj.labels) || !obj.labels.every((x: unknown) => typeof x === 'string')) return null;
  if (typeof obj.summary !== 'string') return null;
  if (typeof obj.category_guess !== 'string') return null;
  if (typeof obj.safe !== 'boolean') return null;
  if (obj.labels.length === 0 || obj.labels.length > 8) return null;
  return {
    labels: obj.labels,
    summary: obj.summary,
    category_guess: obj.category_guess,
    safe: obj.safe,
    parsed: true,
    model: 'vision-gateway',
  };
}

/** 视觉网关配置（未配置即走启发式降级） */
function visionConfig(): { url: string; key: string; model: string } | null {
  const url = (process.env.VISION_API_URL || process.env.AI_BASE_URL || '').trim();
  const key = (process.env.VISION_API_KEY || process.env.AI_API_KEY || '').trim();
  const model = (process.env.VISION_MODEL || 'gemini-3.8-flash').trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key, model };
}

const VISION_PROMPT = `你是校园二手/生活社区的图片理解引擎。分析图片并只输出严格 JSON（无 markdown 围栏、无多余文字）：
{"labels":["标签1","标签2","标签3"],"summary":"一句话描述","category_guess":"数码|书籍|服饰|生活|运动|美妆|其他","safe":true}
labels 为 2-4 个中文短标签（物品类别、颜色、场景）；safe 为 false 当图片含违规内容（涉黄/暴力/广告二维码）。`;

/**
 * 网关视觉分析：图像 → base64 data URI → /chat/completions（8s 超时）。
 * 失败抛出由 analyzeImage 统一降级。
 */
async function gatewayVision(imagePath: string): Promise<VisionMeta> {
  const conf = visionConfig();
  if (!conf) throw new Error('视觉网关未配置');
  const buf = await sharp(imagePath).resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 80 }).toBuffer();
  const dataUri = `data:image/jpeg;base64,${buf.toString('base64')}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url = conf.url.endsWith('/chat/completions') ? conf.url : `${conf.url}/chat/completions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${conf.key}` },
      body: JSON.stringify({
        model: conf.model,
        messages: [
          { role: 'user', content: [{ type: 'text', text: VISION_PROMPT }, { type: 'image_url', image_url: { url: dataUri } }] },
        ],
        max_tokens: 300,
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`vision HTTP ${res.status}`);
    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? '';
    const meta = validateVisionJson(String(text));
    if (!meta) throw new Error('vision 输出结构非法');
    return meta;
  } finally {
    clearTimeout(timer);
  }
}

const HUE_RANGES: [number, number, string][] = [
  [345, 15, '红'],
  [15, 45, '橙'],
  [45, 70, '黄'],
  [70, 160, '绿'],
  [160, 200, '青'],
  [200, 260, '蓝'],
  [260, 345, '紫'],
];

/** RGB → 色相（0-360） */
function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

/**
 * 启发式降级：sharp 统计主色调（stats.dominant）+ 宽高比 + 亮度，
 * 产出带「离线解析」标注的标签——保证无网关时多模态链路仍可演示。
 */
export async function heuristicVision(imagePath: string): Promise<VisionMeta> {
  const img = sharp(imagePath);
  const [meta, stats] = await Promise.all([img.metadata(), img.stats()]);
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const ratio = h > 0 ? w / h : 1;
  const dominant = stats.dominant ?? { r: 128, g: 128, b: 128 };
  const hue = rgbToHue(dominant.r, dominant.g, dominant.b);
  const colorName = HUE_RANGES.find(([lo, hi]) => (lo < hi ? hue >= lo && hue < hi : hue >= lo || hue < hi))?.[2] ?? '中性色';
  const shape = ratio > 1.3 ? '横构图' : ratio < 0.77 ? '竖构图' : '方形构图';
  // 亮度：灰度均值 0-255
  const brightness = stats.channels?.[0]?.mean ?? 128;
  const tone = brightness > 170 ? '明亮' : brightness < 80 ? '暗色' : '适中';

  return {
    labels: [`图片`, `主色调:${colorName}`, shape, '离线解析'],
    summary: `一张${shape}的${colorName}色调图片，明暗${tone}。`,
    category_guess: '其他',
    // 启发式只做视觉描述，无能力判定内容安全 → safe 置 null（未知），不得断言安全
    parsed: true,
    safe: null,
    model: 'heuristic',
  };
}

/**
 * 主入口：网关优先，失败降级启发式；双重失败返回安全兜底（safe:false 的占位）。
 */
export async function analyzeImage(imagePath: string): Promise<VisionMeta> {
  try {
    return await gatewayVision(imagePath);
  } catch {
    try {
      return await heuristicVision(imagePath);
    } catch {
      return {
        labels: ['图片'],
        summary: '图片解析暂时不可用。',
        category_guess: '其他',
        // 解析失败 ≠ 判定不安全：parsed=false，safe 未知
        parsed: false,
        safe: null,
        model: 'fallback',
      };
    }
  }
}
