/**
 * RAG 分块器：把知识库 markdown / 站内帖子 / 公告切成检索用 chunk。
 * 纯函数、无 IO——切分规则与来源元数据在这里统一收口，嵌入与入库只消费产出。
 *
 * 策略：标题+段落聚合，目标 300–500 字；超长段落按句子再切；来源元数据
 * {source, sourceId, title} 全程保留，供引用溯源 chips 跳转。
 */

export type RagSourceType = 'kb' | 'post' | 'announcement';

export interface RagChunkInput {
  source: RagSourceType;
  sourceId: number;
  title: string;
  content: string;
}

export interface RagChunk extends RagChunkInput {
  index: number;       // 同一来源内的块序号（0 起）
  total: number;       // 该来源切出的总块数
  contentHash: string; // 内容指纹（FNV-1a 32 位 hex），增量刷新用
}

/** 目标块长度（字符）：低于下限与相邻段合并，超过上限按句切分 */
const TARGET_MIN = 300;
const TARGET_MAX = 500;

/** FNV-1a 32 位内容指纹：不追求密码学强度，只为「变没变」的廉价判定 */
export function contentHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * markdown 结构化切分：按标题（#/##/###）聚合段落。
 * 标题行成为该段 chunk 的语义前缀（「# 二手交易规则」+ 段落正文），
 * 检索命中后展示与引用都带上出处小节。
 */
export function chunkMarkdown(md: string): { title: string; content: string }[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: { title: string; content: string }[] = [];
  let curTitle = '';
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join('\n').trim();
    buf = [];
    if (!body) return;
    // 段落聚合到目标区间；超过上限按句硬切
    for (const piece of splitBySentences(body, TARGET_MAX)) {
      out.push({ title: curTitle, content: piece });
    }
  };

  for (const line of lines) {
    const m = /^(#{1,4})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      curTitle = (m[2] ?? '').trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return out;
}

/** 按中文句号/问叹号/分号切句，聚合到 [min, max] 区间；单句超上限强制截断 */
function splitBySentences(text: string, max: number): string[] {
  const sentences = text
    .split(/(?<=[。！？；!?;])/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const s of sentences) {
    // 单句本身超上限：硬切成 max 大小的片
    if (s.length > max) {
      if (cur) { out.push(cur); cur = ''; }
      for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
      continue;
    }
    if (cur.length + s.length > max) {
      // 先看能否把当前缓冲补到下限再交卷
      if (cur.length >= TARGET_MIN / 2) { out.push(cur); cur = s; }
      else { cur += s; if (cur.length >= TARGET_MIN) { out.push(cur); cur = ''; } }
    } else {
      cur += s;
      if (cur.length >= TARGET_MIN) { out.push(cur); cur = ''; }
    }
  }
  if (cur) out.push(cur);
  return out.length ? out : [text.slice(0, max)];
}

/** 纯文本（帖子/公告）切分：无标题结构，按段落聚合 + 句切 */
export function chunkPlainText(content: string): string[] {
  const paras = content
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const merged: string[] = [];
  let buf = '';
  for (const p of paras) {
    if (!buf) { buf = p; continue; }
    if (buf.length + p.length <= TARGET_MAX) buf += '\n' + p;
    else { merged.push(buf); buf = p; }
  }
  if (buf) merged.push(buf);
  const out: string[] = [];
  for (const m of merged) {
    for (const piece of splitBySentences(m, TARGET_MAX)) out.push(piece);
  }
  return out.length ? out : [content.slice(0, TARGET_MAX)];
}

/** 统一入口：任意来源 → 带元数据的 chunk 数组 */
export function buildChunks(inputs: RagChunkInput[]): RagChunk[] {
  const chunks: RagChunk[] = [];
  for (const input of inputs) {
    const pieces =
      input.source === 'kb'
        ? chunkMarkdown(input.content).map((c) => (c.title ? `【${c.title}】${c.content}` : c.content))
        : chunkPlainText(input.content);
    const total = pieces.length;
    pieces.forEach((content, index) => {
      chunks.push({
        ...input,
        index,
        total,
        content,
        contentHash: contentHash(content),
      });
    });
  }
  return chunks;
}
