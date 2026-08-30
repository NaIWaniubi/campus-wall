/**
 * 小程序静态断言（spec-D T6）：不运行小程序，仅对源文件做结构与契约断言。
 * 固守历史修复成果：
 * - Q17 cache.js 死代码已删不复生
 * - Q15 api.js 拆 4 文件 + facade 收敛
 * - Q20 一键封禁先填原因
 * - M-3 骨架屏接线 / lazyCodeLoading / 详情失败兜底
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MINI = path.join(ROOT, 'miniprogram');

const read = (p: string) => fs.readFileSync(path.join(MINI, p), 'utf-8');
const exists = (p: string) => fs.existsSync(path.join(MINI, p));
const readJson = (p: string) => JSON.parse(read(p));

describe('app.json 结构与页面完整性', () => {
  const app = readJson('app.json');
  const pages: string[] = app.pages;

  it('pages 数组非空且无重复', () => {
    expect(pages.length).toBeGreaterThan(20);
    expect(new Set(pages).size).toBe(pages.length);
  });

  it('每个页面 .js / .wxml / .json 三件套都在磁盘上', () => {
    for (const p of pages) {
      expect(exists(`${p}.js`), `${p}.js missing`).toBe(true);
      expect(exists(`${p}.wxml`), `${p}.wxml missing`).toBe(true);
      expect(exists(`${p}.json`), `${p}.json missing`).toBe(true);
    }
  });

  it('每个页面 .json 可解析且 usingComponents 引用的组件存在', () => {
    for (const p of pages) {
      const cfg = readJson(`${p}.json`);
      for (const [name, comp] of Object.entries<any>(cfg.usingComponents || {})) {
        const base = comp.startsWith('/') ? comp.slice(1) : path.join(path.dirname(p), comp);
        expect(exists(`${base}.js`), `${p} 的 ${name}(${comp}) 缺失`).toBe(true);
      }
    }
  });

  it('tabBar list 的 pagePath 都在 pages 中，且 custom tabBar 开启', () => {
    expect(app.tabBar?.custom).toBe(true);
    for (const t of app.tabBar?.list || []) {
      expect(pages).toContain(t.pagePath);
    }
  });

  it('lazyCodeLoading = requiredComponents（低端机按需注入，M-3 固守）', () => {
    expect(app.lazyCodeLoading).toBe('requiredComponents');
  });

  it('导航栏底色与 tokens.wxss 的 --color-bg-page 同源（#F5F6F8）', () => {
    expect(app.window.navigationBarBackgroundColor).toBe('#F5F6F8');
    expect(read('styles/tokens.wxss')).toContain('--color-bg-page: #F5F6F8');
  });
});

describe('skeleton 骨架屏组件与接线（M-3 固守）', () => {
  it('组件四件套齐全', () => {
    for (const f of ['js', 'json', 'wxml', 'wxss']) {
      expect(exists(`components/skeleton/skeleton.${f}`), `skeleton.${f} missing`).toBe(true);
    }
  });

  it('组件声明与 count 观察器就位', () => {
    expect(readJson('components/skeleton/skeleton.json').component).toBe(true);
    expect(read('components/skeleton/skeleton.js')).toContain('observers');
    expect(read('components/skeleton/skeleton.js')).toContain('count');
  });

  it('配色走 token（带 hex fallback 惯例）', () => {
    const wxss = read('components/skeleton/skeleton.wxss');
    expect(wxss).toContain('var(--color-bg-muted');
  });

  it('7 个页面 json 均注册 skeleton 组件', () => {
    const wired = [
      'pages/index/index',
      'pages/search/search',
      'pages/detail/detail',
      'pages/message/message',
      'pages/message/chat/chat',
      'pages/mine/myPosts/myPosts',
      'pages/mine/myFavorites/myFavorites',
    ];
    for (const p of wired) {
      expect(readJson(`${p}.json`).usingComponents.skeleton, `${p} 未注册 skeleton`).toBe(
        '/components/skeleton/skeleton'
      );
    }
  });

  it('首页骨架条件绑定 isLoading；详情页有 postLoadFailed 失败兜底', () => {
    expect(read('pages/index/index.wxml')).toContain('isLoading && !posts.length');
    expect(read('pages/detail/detail.wxml')).toContain('!post.id && !postLoadFailed');
    expect(read('pages/detail/detail.js')).toContain('postLoadFailed: true');
  });
});

describe('utils/api 拆分与死代码（Q15/Q17 固守）', () => {
  it('utils/cache.js 不复生', () => {
    expect(exists('utils/cache.js')).toBe(false);
  });

  it('api.js 为轻量 facade（≤40 行）且引出拆分模块', () => {
    const api = read('utils/api.js');
    expect(api.split('\n').length).toBeLessThanOrEqual(40);
    for (const mod of ['request', 'endpoints', 'legacy-adapter']) {
      expect(api).toContain(mod);
    }
  });

  it('拆分模块四件套在磁盘上', () => {
    for (const f of ['utils/api.js', 'utils/request.js', 'utils/endpoints.js', 'utils/auth.js', 'utils/legacy-adapter.js']) {
      expect(exists(f), `${f} missing`).toBe(true);
    }
  });

  it('endpoints 覆盖私信会话契约', () => {
    expect(read('utils/endpoints.js')).toContain('/conversations');
  });

  it('legacy-adapter 保留 snake/camel 双轨兼容（Q14 双轨期约定）', () => {
    const legacy = read('utils/legacy-adapter.js');
    expect(legacy).toMatch(/credit_score|student_id|created_at/);
  });
});

describe('管理端一键封禁流程（Q20 固守）', () => {
  const moderation = read('pages/admin/moderation/moderation.js');

  it('封禁前先弹原因输入（showModal editable）', () => {
    expect(moderation).toMatch(/showModal[\s\S]{0,200}(editable|placeholder|content)/);
  });

  it('代码顺序：先取原因、后执行 ban 动作（原因输入出现早于 action: ban）', () => {
    const reasonIdx = moderation.search(/editable\s*:\s*true|reason/);
    const banIdx = moderation.indexOf("'ban'");
    expect(reasonIdx).toBeGreaterThan(-1);
    expect(banIdx).toBeGreaterThan(reasonIdx);
  });
});

describe('共享工具导出契约（页面依赖）', () => {
  it('util.js 导出 timeAgo（message 依赖）', () => {
    expect(read('utils/util.js')).toMatch(/timeAgo/);
  });

  it('share.js 导出 buildPostShare（myPosts/myFavorites 依赖）', () => {
    expect(read('utils/share.js')).toMatch(/buildPostShare/);
  });

  it('constants.js 导出 getMessageTypeMeta（message 依赖）', () => {
    expect(read('utils/constants.js')).toMatch(/getMessageTypeMeta/);
  });

  it('post-card 图片带 lazy-load（低端机首屏带宽优化）', () => {
    expect(read('components/post-card/post-card.wxml')).toContain('lazy-load');
  });
});

describe('补充断言：高频页组件注册与关键契约', () => {
  it('首页注册 post-card/empty-state/load-more 三大基础组件', () => {
    const c = readJson('pages/index/index.json').usingComponents;
    for (const k of ['post-card', 'empty-state', 'load-more']) {
      expect(c[k], `首页缺 ${k}`).toBeTruthy();
    }
  });

  it('skeleton.wxml 三形态（post/detail/chat）分支齐全', () => {
    const wxml = read('components/skeleton/skeleton.wxml');
    for (const t of ["'post'", "'detail'", "'chat'"]) {
      expect(wxml).toContain(t);
    }
  });

  it('chat 页 loading 初始为 true（进入即骨架）', () => {
    expect(read('pages/message/chat/chat.js')).toMatch(/loading:\s*true/);
  });

  it('myPosts 骨架条件绑定 loading && !posts.length', () => {
    expect(read('pages/mine/myPosts/myPosts.wxml')).toContain('loading && !posts.length');
  });

  it('endpoints 覆盖帖子/搜索/点赞/收藏核心契约', () => {
    const ep = read('utils/endpoints.js');
    for (const route of ['/posts', '/search', '/like', '/favorite']) {
      expect(ep).toContain(route);
    }
  });

  it('endpoints 覆盖云草稿契约（Q4：GET/POST/PUT ?id=/DELETE）', () => {
    const ep = read('utils/endpoints.js');
    expect(ep).toContain('/drafts');
    expect(ep).toMatch(/const drafts = \{/);
    expect(ep).toMatch(/update: \(id, data\) => put\('\/drafts\?id='/);
  });

  it('发布页云端同步：云优先恢复 + 发布前上云 + 成功清理（Q4 固守）', () => {
    const publish = read('pages/publish/publish.js');
    expect(publish).toContain('hydrateCloudDraft');
    expect(publish).toContain('saveDraftToCloud');
    expect(publish).toContain('drafts.remove');
    expect(publish).toContain('publishDraftId');
  });

  it('草稿箱页面存在并注册（app.json + mine 入口）', () => {
    expect(readJson('app.json').pages).toContain('pages/mine/drafts/drafts');
    expect(read('pages/mine/mine.wxml')).toContain('onGoDrafts');
  });

  it('auth 模块覆盖登录态（token 存取与 wxLogin 字样）', () => {
    const auth = read('utils/auth.js');
    expect(auth).toMatch(/token/i);
    expect(auth).toMatch(/wxLogin|login/i);
  });

  it('request 底层封装导出 rawRequest/getToken 等基础件（动词在 legacy 层）', () => {
    const req = read('utils/request.js');
    for (const name of ['rawRequest', 'getToken', 'absUrl']) {
      expect(req).toContain(name);
    }
  });

  it('一键封禁含时长选择步骤（先原因、再时长、后执行）', () => {
    expect(read('pages/admin/moderation/moderation.js')).toMatch(/时长|duration|actionSheet/i);
  });

  it('发布页图片选择 UI 与处理器成对存在（防「处理器在、UI 丢失」回归）', () => {
    const wxml = read('pages/publish/publish.wxml');
    const js = read('pages/publish/publish.js');
    expect(wxml).toContain('onChooseImage');
    expect(wxml).toContain('onDeleteImage');
    expect(js).toContain('onChooseImage');
    expect(js).toContain('onDeleteImage');
  });

  it('详情页私信作者入口已接线（死文案「即将上线」不复生）', () => {
    const wxml = read('pages/detail/detail.wxml');
    expect(wxml).toContain('onContactAuthor');
    expect(wxml).not.toContain('私信功能即将上线');
  });
});
