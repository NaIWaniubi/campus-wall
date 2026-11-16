/**
 * RAG 嵌入器：双路径——网关 /v1/embeddings 优先，本地确定性哈希嵌入兜底。
 * 两条路径输出同为 256 维 L2 归一化向量，维度一致是混合检索排序的前提。
 * 本地路径用「字符 2-gram + TF 加权」：无需任何依赖、离线可测，
 * 中文 2-gram 对校园问答这种短查询与网关语义嵌入的排序行为足够接近。
 */

export const EMBED_DIM = 256;

/** 嵌入网关配置：未配置视为不可用，直接走本地路径 */
export function embeddingConfig(): { url: string; key: string } | null {
  const url = (process.env.EMBEDDINGS_API_URL || '').trim();
  const key = (process.env.EMBEDDINGS_API_KEY || '').trim();
  if (!url || !key) return null;
  return { url: url.replace(/\/+$/, ''), key };
}

/** FNV-1a：把 2-gram 映射到 0..255 桶 */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 本地哈希嵌入：字符 2-gram（ASCII 词块整体当一个 token）→ 桶计数（TF）→
 * L2 归一化。同一文本永远得到同一向量（确定性，测试友好）。
 */
export function hashEmbed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const cleaned = text.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!cleaned) return vec;

  // ASCII 词块与 CJK 2-gram 统一作为 token 计数
  const tokens: string[] = [];
  for (const w of cleaned.match(/[a-z0-9]+/g) ?? []) tokens.push(w);
  const cjk = cleaned.replace(/[a-z0-9\s]/g, '');
  for (let i = 0; i + 2 <= cjk.length; i++) tokens.push(cjk.slice(i, i + 2)!);

  for (const t of tokens) {
    const bucket = fnv1a(t) % EMBED_DIM;
    vec[bucket] = (vec[bucket] ?? 0) + 1;
  }

  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vec.map((v) => v / norm);
}

/** 余弦相似度：两条已归一化向量退化为点积，这里保留通用实现 */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

interface GatewayEmbedResponse {
  data?: { embedding?: number[] }[];
}

/**
 * 批量嵌入入口：网关可用 → /v1/embeddings（8s 超时，批量一次请求）；
 * 任何失败 → 全量回退本地路径（不做部分成功，保证向量空间一致）。
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];
  const conf = embeddingConfig();
  if (!conf) return texts.map(hashEmbed);

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`${conf.url}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conf.key}`,
      },
      body: JSON.stringify({ model: 'embedding', input: texts }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`embeddings HTTP ${res.status}`);
    const json = (await res.json()) as GatewayEmbedResponse;
    const data = json?.data;
    if (!Array.isArray(data) || data.length !== texts.length) {
      throw new Error('embeddings 响应数量不符');
    }
    const out: number[][] = [];
    for (const d of data) {
      const v = d?.embedding;
      if (!Array.isArray(v) || v.length !== EMBED_DIM) {
        throw new Error('embeddings 维度不符');
      }
      out.push(v);
    }
    return out;
  } catch {
    // 网关任何失败（未部署/超时/维度不符）→ 本地确定性嵌入兜底
    return texts.map(hashEmbed);
  }
}

/** 单条便捷封装（查询侧用） */
export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v ?? hashEmbed(text);
}
