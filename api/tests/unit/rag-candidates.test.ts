/**
 * RAG 候选池双路合并 + extractKeywords 分配回归（第二轮工作流审查 P2）：
 *
 * 原问题：
 * 1. 混合检索候选池由纯向量决定 → 强关键词命中但低向量相似度的块永远进不了候选池，
 *    keywordScore 再怎么算也只是给已入选的块加分，被漏掉的块无机会参与融合
 * 2. extractKeywords：英文词先入 Set 且无独立上限 → 一句「How to use iPad」能占满 8 词位，
 *    中文 bigram 一位都没有，关键词路直接哑火
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { upsertChunks, searchByKeyword, deleteBySource } from '../../rag/store.js';
import { retrieve, extractKeywords } from '../../rag/retrieve.js';
import { EMBED_DIM } from '../../rag/embedder.js';
import bcrypt from 'bcryptjs';

let uid = 0;

/** 生成一个与 seed 无关的确定性单位向量 */
function unitVec(seed: number): number[] {
  const v = new Array(EMBED_DIM).fill(0);
  v[seed % EMBED_DIM] = 1;
  return v;
}

beforeAll(() => {
  const sid = 'ragcand' + String(Date.now()).slice(-6);
  uid = Number(
    db
      .prepare(
        "INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, ?, 'RAG候选测试', 'user', 'active', 100)"
      )
      .run(sid, bcrypt.hashSync('pass12345', 10)).lastInsertRowid
  );
});

afterAll(() => {
  db.prepare('DELETE FROM users WHERE id = ?').run(uid);
});

describe('extractKeywords 分配修复', () => {
  it('英文词不独占上限，中文 bigram 有独立配额', () => {
    // 中英混合句：旧实现英文占满 8 位后中文全被截断
    const kw = extractKeywords('How to reset iPad 校园卡密码 settings');
    expect(kw.length).toBeLessThanOrEqual(8);
    // 英文词有席位（但不独占全部）
    const englishCount = kw.filter((k) => /^[a-z0-9]+$/.test(k)).length;
    expect(englishCount).toBeGreaterThan(0);
    expect(englishCount).toBeLessThan(8); // 至少留位给中文
    // 中文 bigram 存在
    const hasChinese = kw.some((k) => /[\u4e00-\u9fff]{2}/.test(k));
    expect(hasChinese).toBe(true);
  });

  it('纯英文短句（不足4个词）也能补充中文', () => {
    const kw = extractKeywords('iPad settings');
    expect(kw).toContain('ipad');
    expect(kw.length).toBeGreaterThan(0);
  });

  it('常见功能 bigram 被过滤（停用词）', () => {
    const kw = extractKeywords('怎么可以用校园墙发帖');
    // 不应包含纯功能词
    expect(kw).not.toContain('可以');
    // 应包含有信息量的词
    expect(kw.some((k) => k.includes('校园') || k.includes('发帖'))).toBe(true);
  });
});

describe('searchByKeyword 关键词扫描检索', () => {
  it('关键词命中的块可被检索到（即使向量分数极低）', () => {
    // 用完全正交的向量确保余弦≈0 但关键词高度匹配
    const v = unitVec(999);
    upsertChunks([
      { sourceType: 'test-cand', sourceId: 201, title: '校园卡挂失流程详解', content: '校园卡丢失后请到一卡通中心挂失并补办新卡。', contentHash: 'h_cand_201_unique', embedding: v },
    ]);
    const hits = searchByKeyword(['校园卡', '挂失'], 5);
    expect(hits.some((h) => h.sourceId === 201)).toBe(true);
    deleteBySource('test-cand', 201);
  });

  it('标题命中权重高于正文命中', () => {
    const v = unitVec(888);
    upsertChunks([
      { sourceType: 'test-cand', sourceId: 202, title: '补办校园卡指南', content: '一些通用说明。', contentHash: 'h_cand_202_title', embedding: v },
      { sourceType: 'test-cand', sourceId: 203, title: '通用说明标题', content: '这里提到补办校园卡的步骤。', contentHash: 'h_cand_203_content', embedding: unitVec(887) },
    ]);
    const hits = searchByKeyword(['补办', '校园卡'], 5);
    const byId = new Map(hits.map((h) => [h.sourceId, h]));
    expect(byId.get(202)!.score).toBeGreaterThan(byId.get(203)!.score);
    deleteBySource('test-cand', 202);
    deleteBySource('test-cand', 203);
  });

  it('空关键词返回空数组', () => {
    expect(searchByKeyword([], 10)).toEqual([]);
  });
});

describe('retrieve 双路候选池', () => {
  it('强关键词但低向量分仍能被 retrieve 返回', async () => {
    // 在主帖子里创建两个帖子：一个高度相关，一个不相关
    const sid2 = 'ragcand2_' + Date.now();
    const uid2 = Number(
      db.prepare("INSERT INTO users (student_id, password, nickname, role, status, credit_score) VALUES (?, ?, '候选二用户', 'user', 'active', 100)")
        .run(sid2, bcrypt.hashSync('pass12345', 10)).lastInsertRowid
    );

    const livePostId = Number(db.prepare(
      "INSERT INTO posts (user_id, section_id, title, content, status, is_anonymous) VALUES (?, 2, '遗失校园卡补办方法', '校园卡丢失后请到一卡通中心挂失并携带学生证补办新卡，当天可取。', 'published', 0)"
    ).run(uid2).lastInsertRowid);

    // 写入一个与向量正交（几乎零余弦）但标题+正文关键词完全命中的 chunk
    upsertChunks([
      { sourceType: 'post', sourceId: livePostId, title: '遗失校园卡补办方法', content: '校园卡丢失后请到一卡通中心挂失并携带学生证补办新卡，当天可取。', contentHash: 'h_dual_201_live', embedding: unitVec(777) },
    ]);

    const sources = await retrieve('校园卡丢了怎么补办', { topK: 4 });
    expect(sources.length).toBeGreaterThan(0);
    const found = sources.find((s) => s.sourceId === livePostId);
    expect(found).toBeDefined();

    // 清理
    deleteBySource('post', livePostId);
    db.prepare('DELETE FROM posts WHERE id = ?').run(livePostId);
    db.prepare('DELETE FROM users WHERE id = ?').run(uid2);
  });
});