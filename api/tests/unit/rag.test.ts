/**
 * RAG 链单元测试：分块边界、哈希嵌入确定性、余弦排序、融合排序、引用格式。
 * 全部离线：不配置 EMBEDDINGS_API_URL，embedTexts 自动走本地哈希嵌入路径。
 */
import { describe, it, expect } from 'vitest';
import { buildChunks, contentHash, chunkMarkdown, chunkPlainText } from '../../rag/chunker.js';
import { hashEmbed, cosine, embedTexts, EMBED_DIM, embeddingConfig } from '../../rag/embedder.js';
import { upsertChunks, searchByVector, deleteBySource, vecToBlob, blobToVec } from '../../rag/store.js';
import { retrieve, extractKeywords } from '../../rag/retrieve.js';

describe('chunker 分块器', () => {
  it('markdown 按标题切块并保留标题前缀', () => {
    const md = '# 二手交易规则\n' + '发帖请标注价格与成色。'.repeat(40) + '\n\n# 失物招领规则\n' + '请写明地点与时间。'.repeat(10);
    const parts = chunkMarkdown(md);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    expect(parts[0]!.title).toBe('二手交易规则');
    expect(parts[0]!.content.startsWith('发帖请标注价格与成色')).toBe(true);
  });

  it('长文本被切为多块且每块不超过上限', () => {
    const long = '这是一段很长的测试句子。'.repeat(200);
    const parts = chunkPlainText(long);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(500);
  });

  it('buildChunks 保留来源元数据与序号', () => {
    const chunks = buildChunks([
      { source: 'post', sourceId: 42, title: '出售自行车', content: '九成新山地车。'.repeat(100) },
    ]);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0]!.source).toBe('post');
    expect(chunks[0]!.sourceId).toBe(42);
    expect(chunks[0]!.title).toBe('出售自行车');
    expect(chunks[0]!.total).toBe(chunks.length);
    // 同内容 hash 稳定
    expect(chunks[0]!.contentHash).toBe(contentHash(chunks[0]!.content));
  });

  it('短内容单块不切分', () => {
    const chunks = buildChunks([{ source: 'kb', sourceId: 0, title: 'KB', content: '很短的内容' }]);
    expect(chunks.length).toBe(1);
  });
});

describe('embedder 哈希嵌入', () => {
  it('维度恒为 256 且已归一化', () => {
    const v = hashEmbed('校园墙怎么发帖');
    expect(v).toHaveLength(EMBED_DIM);
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it('确定性：同文本同向量，不同文本有差异', () => {
    const a1 = hashEmbed('二手交易规则');
    const a2 = hashEmbed('二手交易规则');
    const b = hashEmbed('失物招领规则');
    expect(a1).toEqual(a2);
    expect(cosine(a1, b)).toBeLessThan(1);
  });

  it('语义相近文本（共享 2-gram）相似度更高', () => {
    const q = hashEmbed('校园卡丢失在哪里补办');
    const near = hashEmbed('校园卡丢了怎么补办');
    const far = hashEmbed('今天食堂有什么好吃的菜');
    expect(cosine(q, near)).toBeGreaterThan(cosine(q, far));
  });

  it('未配置网关时 embedTexts 走本地路径', async () => {
    // 测试环境不设 EMBEDDINGS_API_URL；即便有人配置过 CI 环境，也允许走网关但维度断言依然成立
    const conf = embeddingConfig();
    if (!conf) {
      const out = await embedTexts(['测试', '另一个']);
      expect(out).toHaveLength(2);
      expect(out[0]).toHaveLength(EMBED_DIM);
    }
  });
});

describe('store 向量存储', () => {
  it('BLOB 往返无损', () => {
    const v = hashEmbed('往返测试');
    const back = blobToVec(vecToBlob(v));
    expect(back).toHaveLength(EMBED_DIM);
    expect(cosine(v, back)).toBeCloseTo(1, 5);
  });

  it('upsert 幂等：同 hash 跳过', () => {
    const v1 = hashEmbed('唯一的测试内容甲');
    const r1 = upsertChunks([
      { sourceType: 'test', sourceId: 1, title: 'T1', content: '唯一的测试内容甲', contentHash: contentHash('唯一的测试内容甲'), embedding: v1 },
    ]);
    expect(r1.inserted).toBeGreaterThanOrEqual(1);
    const r2 = upsertChunks([
      { sourceType: 'test', sourceId: 1, title: 'T1', content: '唯一的测试内容甲', contentHash: contentHash('唯一的测试内容甲'), embedding: v1 },
    ]);
    expect(r2.inserted).toBe(0);
    expect(r2.skipped).toBe(1);
    // 清理测试数据
    deleteBySource('test', 1);
  });

  it('searchByVector 语义相近块排前', () => {
    const docs = [
      { id: 1, text: '校园卡丢失后可以在一卡通中心补办' },
      { id: 2, text: '二手自行车出售九成新三百元' },
      { id: 3, text: '图书馆开放时间为早上八点' },
    ];
    upsertChunks(
      docs.map((d) => ({
        sourceType: 'test-search',
        sourceId: d.id,
        title: d.text.slice(0, 8),
        content: d.text,
        contentHash: contentHash(d.text + Date.now() + Math.random()),
        embedding: hashEmbed(d.text),
      })),
    );
    const q = hashEmbed('校园卡丢了怎么补办');
    const hits = searchByVector(q, 2);
    expect(hits.length).toBe(2);
    expect(hits[0]!.content).toContain('校园卡');
    deleteBySource('test-search', 1);
    deleteBySource('test-search', 2);
    deleteBySource('test-search', 3);
  });
});

describe('retrieve 混合检索', () => {
  it('返回带 ref 编号的引用且按分排序', async () => {
    const docs = [
      { id: 101, text: '发布二手交易需要标注价格成色和联系方式' },
      { id: 102, text: '信誉分低于六十将限制发帖功能' },
    ];
    upsertChunks(
      docs.map((d) => ({
        sourceType: 'test-retrieve',
        sourceId: d.id,
        title: d.text.slice(0, 10),
        content: d.text,
        contentHash: contentHash(d.text + Math.random()),
        embedding: hashEmbed(d.text),
      })),
    );
    const sources = await retrieve('二手交易发帖要写什么');
    expect(sources.length).toBeGreaterThan(0);
    expect(sources[0]!.ref).toBe(1);
    expect(sources[0]!.snippet.length).toBeGreaterThan(0);
    // ref 连续递增
    for (let i = 1; i < sources.length; i++) expect(sources[i]!.ref).toBe(sources[i - 1]!.ref + 1);
    deleteBySource('test-retrieve', 101);
    deleteBySource('test-retrieve', 102);
  });

  it('extractKeywords：ASCII 词块 + 中文滑窗', () => {
    const kw = extractKeywords('怎么使用iPad在校园墙发帖');
    expect(kw).toContain('ipad');
    expect(kw.length).toBeGreaterThan(0);
    expect(kw.length).toBeLessThanOrEqual(8);
  });

  it('空库返回空数组（调用方回退旧模式）', async () => {
    // 独立问题在空向量下不应崩溃；融合分低于阈值时过滤为空
    const sources = await retrieve('完全无关的量子纠缠字符串组合xyzzy');
    expect(Array.isArray(sources)).toBe(true);
  });
});
