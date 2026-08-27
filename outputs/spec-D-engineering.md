# 方向 D：工程治理与可观测性 — 实施规范

> 适用范围：`E:\校园墙`（Express 5 + Vue 3 + 原生小程序三端）
> 文档版本：v1.0 / 评审基线
> 风格：**可立即执行**的工程规范，**每条配置/代码都可直接落地**

---

## 1. 目标与成功标准

| # | 目标 | 度量 | 验收门槛 |
|---|------|------|----------|
| 1 | 前端单元测试覆盖核心 utils / stores / composables | Vitest 覆盖率（`%stmts`） | `src/utils/**` ≥ 80%，`src/stores/**` ≥ 70% |
| 2 | 后端单元测试覆盖 utils / services / middleware | Vitest 覆盖率 | `api/utils/**` ≥ 85%，`api/services/**` ≥ 70% |
| 3 | E2E 关键流程 10 条全绿 | Playwright 全通过 | 注册/登录/发帖/评论/点赞/关注/私信/管理 4 操作 |
| 4 | 小程序静态自检 ≥ 30 用例 | Node test runner | 现有 1 份扩到 30+ 用例，`npm run check` 全绿 |
| 5 | CI 全绿 | GitHub Actions | lint + typecheck + unit + e2e + build + lighthouse ≤ 12 min |
| 6 | Preview 部署 | Vercel + 微信预览 | 每个 PR 自动得预览 URL |
| 7 | Lighthouse Performance ≥ 85 | LHCI 趋势 | 主入口 `/` 在桌面 + 移动端均 ≥ 85 |
| 8 | 错误可观测 | Sentry | 前后端 DSN 接入，source map 上传，unhandled 100% 落库 |

---

## 2. 范围与不做项

### 范围内（In-Scope）
- 前端 Vitest 单元测试 + 后端 Vitest 单元测试
- Playwright E2E（Chromium / Firefox / WebKit 三引擎）
- 小程序 Node 静态自检扩展到 30+ 用例
- GitHub Actions 三件套：`ci.yml` / `preview.yml` / `lighthouse.yml`
- Sentry（前后端 DSN + source map + 用户上下文）
- Lighthouse CI（`lighthouserc.json` + 预算 + 趋势持久化）
- VitePress 文档站（`docs-site/` + GitHub Pages 部署）

### 不做项（Out-of-Scope）
- ❌ 不做 k6 / Artillery 压力测试（独立 spec 治理）
- ❌ 不做 ELK / Loki 日志聚合（Sentry 够用）
- ❌ 不做 OpenTelemetry / Prometheus（Sentry 已覆盖前端 + 后端）
- ❌ 不改 Vercel 部署本身的 `vercel.json` 关键字段
- ❌ 不做小程序 E2E（小程序 E2E 用 miniprogram-test 单独治理，依赖 IDE）
- ❌ 不动后端数据库 schema 与已有业务逻辑

---

## 3. 关键技术决策

| # | 决策 | 备选 | 理由 |
|---|------|------|------|
| D1 | Vitest 3.x 单测框架 | Jest 29 | 共享 Vite/esbuild 配置，Vue 3 组件可同测，启动快 3× |
| D2 | Playwright 1.49 E2E | Cypress 14 | 真多标签页 + 真多浏览器，WebKit 一行加，覆盖更广 |
| D3 | `@playwright/test` 内置 runner | 自封装 Mocha | 官方 trace viewer + screenshot + video 失败回看 |
| D4 | Sentry JS SDK 8 + Node SDK 9 | Rollbar / Bugsnag | Vue / Express 官方支持好，source map 自动关联 release |
| D5 | LHCI 0.14 + `@lhci/cli` | 自写 Puppeteer | 官方预算 + 趋势 + 断言三件套 |
| D6 | VitePress 1.6 | Docusaurus / Storybook | Vue 生态同源，体积小，部署=静态站 |
| D7 | GitHub Actions `ubuntu-24.04` runner | self-hosted | 免费、cache 命中率高、Playwright 三浏览器预装 |
| D8 | pnpm 9 workspaces | npm workspaces | 安装快 2×，hoist 严，monorepo 友好（暂不切，先用 npm scripts） |
| D9 | coverage 报告 v8 provider | istanbul | 性能好 10×，与 Vitest 默认同源 |
| D10 | E2E 不依赖真实后端，本地起 `api` 子进程 + SQLite 内存库 | 远程 staging | CI 自包含，PR 早期就能跑 |

---

## 4. 依赖项

### 4.1 npm 包（生产 + 开发）

```jsonc
// 顶层 package.json devDependencies 增量
{
  "vitest": "^3.0.5",
  "@vitest/coverage-v8": "^3.0.5",
  "@vue/test-utils": "^2.4.6",
  "happy-dom": "^15.11.7",
  "@playwright/test": "^1.49.1",
  "@sentry/vue": "^8.47.0",
  "@sentry/node": "^9.19.0",
  "@sentry/vite-plugin": "^3.3.1",
  "@lhci/cli": "^0.14.0",
  "vitepress": "^1.6.3",
  "vue-tsc": "^3.0.0",
  "concurrently": "^9.1.0",
  "dotenv": "^16.4.7"
}
```

### 4.2 系统依赖

- Node 20 LTS（GitHub Actions 自带）
- Chromium / Firefox / WebKit（`npx playwright install --with-deps`）
- Chrome Stable（LHCI 跑桌面用）
- SQLite（已有，Vitest 用 `better-sqlite3` 内存模式）

### 4.3 外部服务

- Sentry（free tier 5k events/月够用）
- Vercel（已有）
- GitHub Pages（文档站）
- GitHub Actions 免费额度

---

## 5. 详细 task 清单

> 编号沿用题面 1-10。每 task 给出：文件清单 / 关键配置 / 关键代码 / 接口 / 验收。

### Task 1：Vitest 配置 + 骨架

**文件清单**
- 新增 `vitest.config.ts`
- 新增 `src/tests/unit/setup.ts`
- 新增 `src/tests/unit/.gitkeep`
- 修改 `package.json` 加 scripts
- 修改 `tsconfig.json` 加 `vitest/globals` types

**为什么**：先建测试基础设施，给后续单测提供 runner；用 workspace 单根 config 比每端各开一份好维护。

**`vitest.config.ts`（完整）**

```ts
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/tests/unit/setup.ts'],
    include: [
      'src/**/*.{test,spec}.ts',
      'api/**/*.{test,spec}.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**', 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/utils/**',
        'src/stores/**',
        'src/composables/**',
        'api/utils/**',
        'api/services/**',
        'api/middleware/**',
      ],
      exclude: ['**/*.d.ts', '**/types.ts', '**/__tests__/**'],
      thresholds: {
        'src/utils/**': { lines: 80, functions: 80, statements: 80, branches: 70 },
        'src/stores/**': { lines: 70, functions: 70, statements: 70, branches: 65 },
        'api/utils/**': { lines: 85, functions: 85, statements: 85, branches: 75 },
      },
    },
    pool: 'threads',
    poolOptions: { threads: { singleThread: false } },
  },
});
```

**`src/tests/unit/setup.ts`**

```ts
import { afterEach, beforeAll, vi } from 'vitest';

// happy-dom 兜底
beforeAll(() => {
  globalThis.matchMedia ??= vi.fn().mockImplementation((q) => ({
    matches: false, media: q, onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});
```

**package.json scripts（增量）**

```jsonc
{
  "test": "vitest run",
  "test:watch": "vitest",
  "test:coverage": "vitest run --coverage",
  "test:unit": "vitest run src/** api/**"
}
```

**验收**
- `npm run test` 跑通 0 个用例（绿色）
- `npm run test:coverage` 生成 `coverage/lcov.info`
- `tsconfig.json` 加 `"types": ["vitest/globals"]` 不报错

---

### Task 2：前端核心单测

**文件清单**
- 新增 `src/utils/api.spec.ts`
- 新增 `src/utils/request.spec.ts`
- 新增 `src/utils/helpers.spec.ts`
- 新增 `src/stores/user.spec.ts`（如有 user store）
- 新增 `src/composables/useDebounce.spec.ts`

**为什么**：utils 是高频复用 + 业务边界；stores 状态机是回归高发区；先打这两块覆盖。

**`src/utils/request.spec.ts`（示例，60 行）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { request, RequestError } from './request';

describe('request', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  it('GET 成功返回 JSON', async () => {
    (fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: 1 }), {
        status: 200, headers: { 'content-type': 'application/json' },
      }),
    );
    const r = await request<{ ok: boolean; data: number }>('/x');
    expect(r.ok).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/x', expect.objectContaining({ method: 'GET' }));
  });

  it('401 自动刷新一次 token', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 't2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    localStorage.setItem('token', 't1');
    await request('/y');
    expect(localStorage.getItem('token')).toBe('t2');
  });

  it('5xx 抛 RequestError 含 status', async () => {
    (fetch as any).mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await expect(request('/z')).rejects.toBeInstanceOf(RequestError);
  });

  it('网络错误抛错且不重试', async () => {
    (fetch as any).mockRejectedValueOnce(new TypeError('NetworkError'));
    await expect(request('/q', { retry: 0 })).rejects.toThrow(/Network/);
  });

  it('支持 AbortSignal 取消', async () => {
    const ac = new AbortController();
    (fetch as any).mockImplementationOnce(
      (_u, { signal }: any) =>
        new Promise((_, rej) => signal.addEventListener('abort', () => rej(new DOMException('abort', 'AbortError')))),
    );
    ac.abort();
    await expect(request('/w', { signal: ac.signal })).rejects.toThrow();
  });

  it('query 序列化含数组与 null', async () => {
    (fetch as any).mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await request('/p', { query: { a: 1, b: null, c: [1, 2] } });
    const url = (fetch as any).mock.calls[0][0];
    expect(url).toMatch(/a=1/);
    expect(url).toMatch(/c=1&c=2/);
    expect(url).not.toMatch(/b=/);
  });
});
```

**`src/utils/helpers.spec.ts`（节选 30 行）**

```ts
import { describe, it, expect } from 'vitest';
import { formatRelativeTime, maskPhone, truncate } from './helpers';

describe('formatRelativeTime', () => {
  const now = new Date('2025-01-01T12:00:00Z').getTime();
  it('30 秒内', () => expect(formatRelativeTime(now - 10_000, now)).toBe('刚刚'));
  it('5 分钟前', () => expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 分钟前'));
  it('3 小时前', () => expect(formatRelativeTime(now - 3 * 3600_000, now)).toBe('3 小时前'));
  it('昨天', () => expect(formatRelativeTime(now - 26 * 3600_000, now)).toBe('昨天'));
  it('7 天前', () => expect(formatRelativeTime(now - 8 * 86400_000, now)).toBe('8 天前'));
});

describe('maskPhone', () => {
  it('11 位手机号中段打码', () => expect(maskPhone('13800001234')).toBe('138****1234'));
  it('非手机号原样', () => expect(maskPhone('12345')).toBe('12345'));
});

describe('truncate', () => {
  it('截断带省略号', () => expect(truncate('hello world', 5)).toBe('hello…'));
  it('不够长不变', () => expect(truncate('hi', 10)).toBe('hi'));
});
```

**`src/composables/useDebounce.spec.ts`（35 行）**

```ts
import { describe, it, expect, vi } from 'vitest';
import { useDebounce } from './useDebounce';

describe('useDebounce', () => {
  it('延迟执行只触发一次', async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = useDebounce(fn, 200);
    debounced(); debounced(); debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(199);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('cancel 取消未执行调用', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const debounced = useDebounce(fn, 100);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
```

**验收**
- `npm run test src/utils src/stores src/composables` 全绿
- coverage 报告 `src/utils/**` ≥ 80%

---

### Task 3：后端核心单测

**文件清单**
- 新增 `api/utils/validate.spec.ts`
- 新增 `api/utils/crypto.spec.ts`
- 新增 `api/services/auth.spec.ts`
- 新增 `api/middleware/auth.spec.ts`
- 新增 `api/middleware/error.spec.ts`

**为什么**：auth 链路是回归高发；middleware 错误处理是稳定性的"地板"；utils 验签/校验是安全门槛。

**`api/middleware/auth.spec.ts`（50 行）**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { authRequired, adminRequired } from './auth';

function mockReq(headers: Record<string, string> = {}): Request {
  return { headers, user: undefined } as unknown as Request;
}
const mockRes = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() }) as unknown as Response;
const mockNext = () => vi.fn() as unknown as NextFunction;

describe('authRequired', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('无 token → 401', () => {
    const next = mockNext();
    authRequired(mockReq(), mockRes(), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('合法 token → 注入 req.user 并 next()', () => {
    const token = 'Bearer valid.jwt.token';
    vi.doMock('../utils/jwt', () => ({ verify: () => ({ id: 1, role: 'user' }) }));
    const next = mockNext();
    authRequired(mockReq({ authorization: token }), mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});

describe('adminRequired', () => {
  it('非 admin → 403', () => {
    const next = mockNext();
    adminRequired({ user: { role: 'user' } } as any, mockRes(), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });
  it('admin → next()', () => {
    const next = mockNext();
    adminRequired({ user: { role: 'admin' } } as any, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});
```

**`api/utils/validate.spec.ts`（40 行）**

```ts
import { describe, it, expect } from 'vitest';
import { isEmail, isPhone, isPasswordStrong, sanitizeText } from './validate';

describe('validate', () => {
  it('isEmail', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a@b.')).toBe(false);
  });
  it('isPhone 11 位 1 开头', () => {
    expect(isPhone('13800001234')).toBe(true);
    expect(isPhone('23800001234')).toBe(false);
    expect(isPhone('1380000123')).toBe(false);
  });
  it('isPasswordStrong 至少 8 位 + 字母 + 数字', () => {
    expect(isPasswordStrong('abc12345')).toBe(true);
    expect(isPasswordStrong('abcdefgh')).toBe(false);
    expect(isPasswordStrong('12345678')).toBe(false);
  });
  it('sanitizeText 去掉 HTML 与控制字符', () => {
    expect(sanitizeText('<script>x</script>hi\u0000')).toBe('hi');
    expect(sanitizeText('  spaced  ')).toBe('spaced');
  });
});
```

**验收**
- `npm run test api/**` 全绿
- coverage `api/utils/**` ≥ 85%

---

### Task 4：Playwright 配置 + 骨架

**文件清单**
- 新增 `playwright.config.ts`
- 新增 `e2e/.gitkeep`
- 新增 `e2e/fixtures/test-fixture.ts`
- 新增 `e2e/helpers/api.ts`（后端直连 helper）
- 修改 `package.json` scripts

**为什么**：Playwright 配置要支持本地起 `api` 子进程 + 多浏览器矩阵 + 失败回看（trace/screenshot/video）。

**`playwright.config.ts`（完整）**

```ts
import { defineConfig, devices } from '@playwright/test';

const PORT = 5180;
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox',  use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit',   use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NODE_ENV: 'test',
        API_PORT: '4000',
        CLIENT_PORT: String(PORT),
        SQLITE_PATH: ':memory:',
        JWT_SECRET: 'test-secret',
        SEED: '1',
      },
    },
  ],
});
```

**`e2e/fixtures/test-fixture.ts`**

```ts
import { test as base, expect } from '@playwright/test';
import { createTestUser, loginViaApi } from '../helpers/api';

type Fixtures = {
  authedPage: import('@playwright/test').Page;
  testUser: { id: number; email: string; token: string };
};

export const test = base.extend<Fixtures>({
  testUser: async ({ request }, use) => {
    const u = await createTestUser(request);
    await use(u);
  },
  authedPage: async ({ page, testUser }, use) => {
    await page.addInitScript((token) => {
      window.localStorage.setItem('token', token);
    }, testUser.token);
    await use(page);
  },
});

export { expect };
```

**`e2e/helpers/api.ts`（30 行）**

```ts
import type { APIRequestContext } from '@playwright/test';

export async function createTestUser(req: APIRequestContext) {
  const email = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}@test.local`;
  const r = await req.post('/api/auth/register', {
    data: { email, password: 'Passw0rd!', nickname: 'Tester' },
  });
  if (!r.ok()) throw new Error(`register failed: ${r.status()}`);
  const j = await r.json();
  return { id: j.user.id, email, token: j.token };
}

export async function loginViaApi(req: APIRequestContext, email: string, password: string) {
  const r = await req.post('/api/auth/login', { data: { email, password } });
  return (await r.json()).token as string;
}

export async function postCreate(req: APIRequestContext, token: string, body: { title: string; content: string; section?: string }) {
  const r = await req.post('/api/posts', {
    headers: { Authorization: `Bearer ${token}` },
    data: { ...body, section: body.section ?? '广场' },
  });
  if (!r.ok()) throw new Error(`post failed: ${r.status()}`);
  return r.json();
}
```

**package.json scripts 增量**

```jsonc
{
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:report": "playwright show-report"
}
```

**验收**
- `npx playwright --version` 输出 1.49+
- `npx playwright install --with-deps` 成功
- `npm run test:e2e -- --list` 输出测试列表

---

### Task 5：E2E 10 关键流程

**文件清单**
- 新增 `e2e/01-auth.spec.ts`（注册 / 登录）
- 新增 `e2e/02-post.spec.ts`（发帖 / 编辑 / 删除）
- 新增 `e2e/03-comment.spec.ts`（评论 / 回复）
- 新增 `e2e/04-like.spec.ts`（点赞 / 取消）
- 新增 `e2e/05-follow.spec.ts`（关注 / 取关 / 列表）
- 新增 `e2e/06-message.spec.ts`（私信）
- 新增 `e2e/07-admin.spec.ts`（管理 4 操作：封号 / 删帖 / 置顶 / 公告）

**为什么**：10 流程覆盖主业务链路；用同一 `testUser` fixture 保证幂等；admin 流程用一次性 `adminToken` 提权。

**`e2e/02-post.spec.ts`（完整示例，60 行）**

```ts
import { test, expect } from './fixtures/test-fixture';

test.describe('发帖', () => {
  test('未登录跳登录', async ({ page }) => {
    await page.goto('/post/new');
    await expect(page).toHaveURL(/\/login/);
  });

  test('已登录可发帖并看到列表', async ({ authedPage, testUser }) => {
    const p = authedPage;
    await p.goto('/post/new');
    await p.getByLabel('标题').fill('E2E 标题');
    await p.getByLabel('正文').fill('E2E 内容');
    await p.getByRole('button', { name: '发布' }).click();
    await expect(p).toHaveURL(/\/post\/\d+/);
    await expect(p.getByText('E2E 标题')).toBeVisible();
  });

  test('空标题被前端拦', async ({ authedPage }) => {
    const p = authedPage;
    await p.goto('/post/new');
    await p.getByRole('button', { name: '发布' }).click();
    await expect(p.getByText(/标题不能为空/)).toBeVisible();
  });

  test('正文超 5000 字被拦', async ({ authedPage }) => {
    const p = authedPage;
    await p.goto('/post/new');
    await p.getByLabel('标题').fill('长');
    await p.getByLabel('正文').fill('x'.repeat(5001));
    await p.getByRole('button', { name: '发布' }).click();
    await expect(p.getByText(/内容过长/)).toBeVisible();
  });

  test('自己发的帖可删除', async ({ authedPage }) => {
    const p = authedPage;
    await p.goto('/post/new');
    await p.getByLabel('标题').fill('待删');
    await p.getByLabel('正文').fill('待删内容');
    await p.getByRole('button', { name: '发布' }).click();
    await p.getByRole('button', { name: '删除' }).click();
    await p.getByRole('button', { name: '确认' }).click();
    await expect(p).toHaveURL(/\/square/);
  });
});
```

**`e2e/07-admin.spec.ts`（节选 50 行）**

```ts
import { test, expect, request as pwRequest } from '@playwright/test';

test.describe('管理后台', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('admin 登录并封号 / 删帖 / 置顶 / 公告', async ({ playwright }) => {
    const ctx = await pwRequest.newContext({ baseURL: 'http://127.0.0.1:5180' });
    // 1) admin 登录拿 token（脚本预置 admin 账号）
    const r = await ctx.post('/api/auth/login', {
      data: { email: 'admin@school.local', password: 'AdminPass123!' },
    });
    const { token } = await r.json();
    expect(token).toBeTruthy();

    // 2) 封号
    const ban = await ctx.post('/api/admin/users/2/ban', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(ban.ok()).toBeTruthy();

    // 3) 删帖
    const del = await ctx.delete('/api/admin/posts/1', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(del.ok()).toBeTruthy();

    // 4) 置顶
    const pin = await ctx.post('/api/admin/posts/2/pin', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(pin.ok()).toBeTruthy();

    // 5) 公告
    const ann = await ctx.post('/api/admin/announcements', {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'E2E 公告', content: 'E2E' },
    });
    expect(ann.ok()).toBeTruthy();
  });
});
```

**验收**
- `npm run test:e2e` 在 chromium 全绿
- `npx playwright show-report` 能看到 trace + screenshot

---

### Task 6：小程序静态自检扩到 30+ 用例

**文件清单**
- 修改 `miniprogram/tests/frontend-static.test.js`（追加 29 个 case）
- 新增 `miniprogram/tests/data/`（fixture JSON）
- 修改 `miniprogram/package.json` scripts：`check` 跑 `node tests/frontend-static.test.js`

**为什么**：小程序 E2E 跑不起，先把静态扫描做强；30 用例覆盖 4 文件类型（app.json / page.wxml / .wxss / .js）+ 跨文件引用 + 危险模式。

**新增用例类别（每类 ≥ 5 个）**

```js
// 截选自 frontend-static.test.js
const tests = [
  // 1) app.json 必备字段
  { name: 'app.json 含 pages 数组', check: (files) => Array.isArray(files['app.json']?.pages) },
  { name: 'app.json 必有 window.navigationBarTitleText', check: (f) => !!f['app.json']?.window?.navigationBarTitleText },
  { name: 'app.json 不允许空 pages', check: (f) => (f['app.json']?.pages?.length ?? 0) > 0 },
  // 2) WXML 必备四件套
  { name: '每个 page 目录含 .wxml/.wxss/.js/.json', check: (f) => /* 遍历 pages */ },
  { name: 'WXML 根标签闭合', check: (f) => /* 解析 <view></view> 配对 */ },
  // 3) 危险模式
  { name: '禁止 wx:for-key 缺失', check: (f) => !/wx:for="[^"]*"/.test(f._allWxml) || /wx:key=/.test(f._allWxml) },
  { name: '禁止内联 style 大于 200 字', check: (f) => /* 行内 style="" 长度检查 */ },
  // 4) JS 端
  { name: 'Page({}) 必须有 data 或 properties', check: (f) => /* 解析 Page() 参数 */ },
  { name: '禁止 eval / new Function', check: (f) => !/\beval\s*\(/.test(f._allJs) && !/new\s+Function\s*\(/.test(f._allJs) },
  // 5) 跨文件
  { name: 'app.json pages 引用的文件存在', check: (f) => /* 解析路径并 glob 验证 */ },
  { name: 'JS require 路径解析存在', check: (f) => /* 静态 require 路径 */ },
  // 6) 资源
  { name: 'WXML <image> src 不为空', check: (f) => !/src=""/.test(f._allWxml) },
  { name: 'WXSS 不存在未定义 class', check: (f) => /* 简易启发式 */ },
  // ... 共 30+
];
```

**验收**
- `cd miniprogram && npm run check` 跑通 30+ 用例全绿
- 报告 `tests/last-report.json` 含每条用例 `name / status / duration`

---

### Task 7：GitHub Actions 三件套

**文件清单**
- 新增 `.github/workflows/ci.yml`
- 新增 `.github/workflows/preview.yml`
- 新增 `.github/workflows/lighthouse.yml`
- 新增 `.github/CODEOWNERS`（可选）

**为什么**：CI 是质量门；Preview 拉 PR 早验证；Lighthouse 跑趋势。

**`.github/workflows/ci.yml`（完整 80 行）**

```yaml
name: ci

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '20'

jobs:
  lint:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: 'npm' }
      - run: npm ci
      - run: npm run lint
      - run: npx vue-tsc --noEmit -p tsconfig.json

  unit:
    runs-on: ubuntu-24.04
    needs: lint
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: 'npm' }
      - run: npm ci
      - run: npm run test:coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }
      - uses: actions/upload-artifact@v4
        with: { name: lcov, path: coverage/lcov.info }

  static-miniapp:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }} }
      - working-directory: miniprogram
        run: npm ci && npm run check

  e2e:
    runs-on: ubuntu-24.04
    needs: unit
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: 'npm' }
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7

  build:
    runs-on: ubuntu-24.04
    needs: e2e
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: ${{ env.NODE_VERSION }}, cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: dist, path: dist/, retention-days: 7 }
```

**`.github/workflows/preview.yml`（40 行）**

```yaml
name: preview
on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  vercel-preview:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run build
      - name: Vercel Deploy Hook
        env:
          VERCEL_DEPLOY_HOOK: ${{ secrets.VERCEL_DEPLOY_HOOK }}
        run: |
          if [ -n "$VERCEL_DEPLOY_HOOK" ]; then
            curl -X POST "$VERCEL_DEPLOY_HOOK"
            echo "preview deploy triggered"
          else
            echo "::warning::VERCEL_DEPLOY_HOOK not set"
          fi
```

**`.github/workflows/lighthouse.yml`（30 行）**

```yaml
name: lighthouse
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  lhci:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci && npm run build
      - name: Run Lighthouse CI
        run: |
          npx -y @lhci/cli@0.14 autorun \
            --config=./lighthouserc.json \
            --collect.staticDistDir=./dist
        env:
          LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
      - uses: actions/upload-artifact@v4
        if: always()
        with: { name: lhci, path: '.lighthouseci/' }
```

**验收**
- 推 PR 触发三个 workflow
- 全部绿，且总时长 ≤ 12 min

---

### Task 8：Sentry 接入

**文件清单**
- 新增 `api/sentry.ts`（Node 端 init）
- 修改 `api/index.ts`（最早 require）
- 新增 `src/sentry.ts`（Vue 端 init）
- 修改 `src/main.ts`（最早 import）
- 新增 `vite.config.ts` 中 `sentryVitePlugin`
- 新增 `.env.example` 加 `SENTRY_DSN_*`

**为什么**：统一 Sentry 平台，前端 Vue + 后端 Node 同一项目；source map 用 sentry-cli 在 CI 注入 release。

**`api/sentry.ts`（30 行）**

```ts
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const DSN = process.env.SENTRY_DSN_API;
const ENV = process.env.NODE_ENV ?? 'development';
const RELEASE = process.env.SENTRY_RELEASE ?? `api@${process.env.npm_package_version}`;

export function initSentry() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: ENV,
    release: RELEASE,
    tracesSampleRate: ENV === 'production' ? 0.2 : 1.0,
    profilesSampleRate: 0.1,
    integrations: [nodeProfilingIntegration()],
    beforeSend(event) {
      if (event.user) delete event.user.ip_address; // PII
      return event;
    },
  });
}

export function setUserContext(user: { id: number; role?: string; nickname?: string }) {
  Sentry.setUser({ id: String(user.id), role: user.role, username: user.nickname });
}

export function clearUserContext() { Sentry.setUser(null); }
```

**`src/sentry.ts`（35 行）**

```ts
import * as Sentry from '@sentry/vue';
import type { App } from 'vue';
import { browserTracingIntegration, replayIntegration } from '@sentry/vue';

export function initSentry(app: App, router: any) {
  const dsn = import.meta.env.VITE_SENTRY_DSN_WEB;
  if (!dsn) return;
  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE,
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    integrations: [
      browserTracingIntegration({ router }),
      replayIntegration({ maskAllText: true, blockAllMedia: true }),
    ],
    beforeSend(event) {
      if (event.user?.ip_address) delete event.user.ip_address;
      return event;
    },
  });
}

export function setUserContext(user: { id: number; nickname?: string }) {
  Sentry.setUser({ id: String(user.id), username: user.nickname });
}
```

**`vite.config.ts` 增量**

```ts
import { sentryVitePlugin } from '@sentry/vite-plugin';
// ...
plugins: [
  vue(),
  sentryVitePlugin({
    org: process.env.SENTRY_ORG!,
    project: 'web',
    authToken: process.env.SENTRY_AUTH_TOKEN,
    release: { name: process.env.SENTRY_RELEASE },
    sourcemaps: { assets: './dist/**', filesToDeleteAfterUpload: ['**/*.map'] },
  }),
]
```

**`api/index.ts` 接入示例**

```ts
import express from 'express';
import { initSentry, setUserContext, clearUserContext } from './sentry';
initSentry(); // 必须最早
import * as Sentry from '@sentry/node';
const app = express();
// ... 路由
Sentry.setupExpressErrorHandler(app);
app.use((err, _req, res, _next) => {
  Sentry.captureException(err);
  res.status(err.statusCode ?? 500).json({ message: err.message });
});
// 登录成功后 setUserContext，注销后 clearUserContext
```

**验收**
- 故意抛 `throw new Error('e2e test')` 能在 Sentry 后台看到事件
- release 与 git commit 对得上
- source map 在 Sentry 详情页可点击查看原码

---

### Task 9：Lighthouse CI

**文件清单**
- 新增 `lighthouserc.json`
- 新增 `.lighthouseci/`（gitignore，加 `.gitkeep`）
- 新增 `scripts/lhci-assert.sh`（可选）

**为什么**：性能预算硬约束，每次 PR 都能发现回归；趋势持久化到 LHCI 服务器（自托管/免费）。

**`lighthouserc.json`（完整）**

```json
{
  "ci": {
    "collect": {
      "staticDistDir": "./dist",
      "url": [
        "http://localhost/index.html",
        "http://localhost/square.html",
        "http://localhost/post.html?id=1"
      ],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop",
        "skipAudits": ["uses-http2"],
        "chromeFlags": "--no-sandbox --headless=new"
      }
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.9 }],
        "categories:best-practices": ["error", { "minScore": 0.9 }],
        "categories:seo": ["warn", { "minScore": 0.85 }],
        "first-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2500 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 300 }]
      }
    },
    "upload": {
      "target": "temporary-public-storage",
      "reportFilenamePattern": "%%PATHNAME%%-%%DATETIME%%-report"
    }
  }
}
```

**验收**
- `npx lhci autorun --config=./lighthouserc.json` 在本地 dist 跑通
- Performance ≥ 0.85，CLS ≤ 0.1

---

### Task 10：VitePress 文档站

**文件清单**
- 新增 `docs-site/.vitepress/config.ts`
- 新增 `docs-site/index.md`
- 新增 `docs-site/guide/getting-started.md`
- 新增 `docs-site/api/posts.md`
- 新增 `docs-site/.github/workflows/docs.yml`（实际放 `.github/workflows/docs.yml`）
- 修改 `package.json` scripts

**为什么**：文档是工程治理的一部分；VitePress 静态站 + GitHub Pages 零成本。

**`docs-site/.vitepress/config.ts`（40 行）**

```ts
import { defineConfig } from 'vitepress';

export default defineConfig({
  title: '校园墙 文档',
  description: '校园墙产品 + 工程文档',
  lang: 'zh-CN',
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/posts' },
      { text: 'GitHub', link: 'https://github.com/your-org/school-wall' },
    ],
    sidebar: {
      '/guide/': [
        { text: '入门', items: [
          { text: '快速开始', link: '/guide/getting-started' },
          { text: '工程规范', link: '/guide/engineering' },
          { text: '贡献指南', link: '/guide/contributing' },
        ]},
      ],
      '/api/': [
        { text: 'API', items: [
          { text: '帖子', link: '/api/posts' },
          { text: '用户', link: '/api/users' },
          { text: '评论', link: '/api/comments' },
        ]},
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/your-org/school-wall' }],
    search: { provider: 'local' },
    footer: { message: '校园墙 · 校内匿名社区', copyright: '© 2025 校园墙组' },
  },
  head: [['link', { rel: 'icon', href: '/favicon.svg' }]],
});
```

**`docs-site/index.md`（节选 30 行）**

```md
---
layout: home
hero:
  name: 校园墙
  text: 校内匿名社区 · 工程文档
  tagline: Vue 3 + Express 5 + 原生小程序
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: API 概览
      link: /api/posts
features:
  - title: 三端一致
    details: 同一份 API 契约，Web 与小程序共享服务端；后端类型用 Zod 校验。
  - title: 端到端可观测
    details: Sentry 接入前后端，Lighthouse CI 卡性能预算，Vitest + Playwright 双覆盖。
  - title: 提 PR 即可
    details: Vercel Preview + LHCI 趋势 + VitePress 文档全自动。
---

## 路线图
- ✅ 方向 D：工程治理与可观测性（本批）
- ⏭ 方向 E：性能与可扩展性
- ⏭ 方向 F：数据治理与隐私
```

**`docs-site/api/posts.md`（节选 30 行）**

```md
# 帖子 API

## POST /api/posts
创建帖子。

| 字段 | 必填 | 类型 | 约束 |
|------|------|------|------|
| title | 是 | string | 1-50 字符 |
| content | 是 | string | 1-5000 字符 |
| section | 否 | string | 默认 `广场` |
| images | 否 | string[] | ≤ 9 个 URL |

### 请求示例
```bash
curl -X POST https://api.school-wall.local/api/posts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"hello","content":"world"}'
```

### 响应 201
```json
{ "id": 42, "title": "hello", "content": "world", "authorId": 1, "createdAt": "2025-01-01T00:00:00Z" }
```

### 错误码
- `400` 参数不合法
- `401` 未登录
- `403` 账号被封
- `429` 频次超限
```

**`.github/workflows/docs.yml`（30 行）**

```yaml
name: docs
on:
  push:
    branches: [main]
    paths: ['docs-site/**']

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build-deploy:
    runs-on: ubuntu-24.04
    environment:
      name: github-pages
      url: ${{ steps.deploy.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npm run docs:build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: docs-site/.vitepress/dist }
      - id: deploy
        uses: actions/deploy-pages@v4
```

**package.json 增量**

```jsonc
{
  "docs:dev": "vitepress dev docs-site",
  "docs:build": "vitepress build docs-site",
  "docs:preview": "vitepress preview docs-site"
}
```

**验收**
- `npm run docs:dev` 起本地预览
- `npm run docs:build` 产物在 `docs-site/.vitepress/dist/`
- 推 main 后 `https://<org>.github.io/school-wall/` 可访问

---

## 6. 跨 task 协调

### 6.1 依赖图

```
T1 (Vitest config) ─┬─→ T2 (前端单测)
                    └─→ T3 (后端单测)
T1 ─→ T7-ci.yml（依赖 npm run test:coverage 脚本）
T4 (Playwright config) ─→ T5 (E2E 10 流程) ─→ T7-ci.yml
T6 (miniprogram check) ─→ T7-ci.yml
T8 (Sentry) ─→ T9 (Lighthouse，与 Sentry 同一 release 协调）
T10 (VitePress) ─→ T7-ci.yml（只跑 docs job）
```

### 6.2 共享约定

- **环境变量集中**：`.env.example` 是单一事实源；`SENTRY_DSN_API` / `SENTRY_DSN_WEB` / `SENTRY_RELEASE` / `VERCEL_DEPLOY_HOOK` / `LHCI_GITHUB_APP_TOKEN`。
- **覆盖率阈值**：Vitest 阈值与 CI 同时卡，PR 红即拒。
- **E2E 端口**：固定 5180，避免与 dev（5173/3000）冲突。
- **Sentry release**：`SENTRY_RELEASE = ${github.sha}`（CI 注入），本地 = `dev`。
- **LHCI 趋势**：上传到 `temporary-public-storage` 即可（不需自建服务器）。

### 6.3 顺序执行

1. **先 T1 + T4**：测试基础设施先行。
2. **再 T2 + T3 + T5 + T6**：写测试本体。
3. **再 T8 + T9**：接入观测。
4. **再 T10**：文档。
5. **最后 T7**：CI 串起来；CI 调试期允许单 job 临时跳过。

---

## 7. 风险登记

| # | 风险 | 概率 | 影响 | 缓解 |
|---|------|------|------|------|
| R1 | E2E 跑得太慢（>8 min） | 中 | 中 | webServer 复用、`fullyParallel: true`、先关 firefox/webkit 留 chromium |
| R2 | CI 缓存 miss，每次 npm ci 慢 | 中 | 中 | setup-node 配 `cache: 'npm'`、Turborepo 备选 |
| R3 | Playwright WebKit 偶尔跨域警告 | 中 | 低 | `actionTimeout` 调大 20s、加 `--disable-web-security` 仅本地 |
| R4 | Sentry 上传 source map 慢 CI | 中 | 中 | CI 缓存 `@sentry/cli`、失败不阻塞主流程（`continue-on-error: true`） |
| R5 | LHCI 数值波动大 | 高 | 低 | `numberOfRuns: 3` 取中位数、阈值只做 error 级 |
| R6 | 小程序测试用 JSDOM 跑不起来 | 高 | 中 | 走纯静态字符串扫描（已有方案），不强求 jsdom |
| R7 | VitePress 与 Vite 大版本冲突 | 低 | 中 | 锁 Vitepress 1.6 / Vite 5.x；遇冲突用 `overrides` |
| R8 | 单元测试 mock 不到 express 异步 | 中 | 中 | 用 `supertest` 注入 fake req/res，不真起 server |
| R9 | Sentry DSN 误提交到 git | 中 | 高 | `.gitignore` 加 `.env*`；CI 走 secrets；pre-commit 加 `git-secrets` |
| R10 | Vercel preview 配额爆 | 低 | 中 | 50 PR/日超限时降级为评论贴链接 |

---

## 8. 里程碑

| 周次 | 交付 | 状态判定 |
|------|------|----------|
| W1 | T1 + T4 跑通（Vitest + Playwright 各自一个空套件绿） | `npm run test` & `npm run test:e2e -- --list` 成功 |
| W2 | T2 + T3 + T5 完成（单测 + E2E 全绿） | coverage ≥ 阈值；E2E 10 流程全绿 |
| W3 | T6 + T7 完成（miniprogram check + CI 串好） | PR 上 GitHub Actions 绿 |
| W4 | T8 + T9 + T10 完成（Sentry + LHCI + Docs） | Sentry 收到首条事件；LHCI report 公开；Docs 站上线 |
| W5 | 全量回归 + 文档补完 + sign-off | 全部任务清单勾完 |

---

## 9. 审查与 sign-off

### 9.1 审查清单（每 task 完成时打勾）

- [ ] 代码遵循 `eslint-config` + `prettier`
- [ ] 测试覆盖率达标
- [ ] CI 任务对应 workflow 存在
- [ ] 文档（如有）已更新
- [ ] 风险登记更新（新增风险标 R#）
- [ ] 关联 issue / PR 链接写进 commit

### 9.2 sign-off 矩阵

| 角色 | 关注 | 必签 |
|------|------|------|
| Tech Lead | 整体架构、关键决策 | ✅ |
| 前端负责人 | T2 / T5 / T8-Web / T9 / T10 | ✅ |
| 后端负责人 | T3 / T8-API | ✅ |
| QA | T5 / T6 / T7 跑通 | ✅ |
| DevOps | T7 / T9 / docs.yml | ✅ |
| 产品（可选） | T10 文档站 | ⬜ |

### 9.3 上线门（Go-Live Gate）

- ✅ 所有 task 完成
- ✅ CI 连续 5 个 commit 主分支绿
- ✅ LHCI 趋势 Performance ≥ 0.85 连续 3 天
- ✅ Sentry 24h 无未处理 fatal
- ✅ Docs 站首屏可访问 + 搜索可用
- ✅ CODEOWNERS 至少 3 个 reviewer 同意

---

## 10. 项目级 todo（执行清单）

> 完成 spec 后，按此清单逐项落地；每勾掉一项前确保 `verification-before-completion` 已跑过。

- [ ] **T1-1** 写 `vitest.config.ts` + `src/tests/unit/setup.ts`
- [ ] **T1-2** `package.json` 加 `test` / `test:watch` / `test:coverage` / `test:unit` 脚本
- [ ] **T1-3** `tsconfig.json` 加 `"types": ["vitest/globals"]` 并 typecheck 通过
- [ ] **T2-1** `src/utils/api.spec.ts`（请求/响应/错误）
- [ ] **T2-2** `src/utils/request.spec.ts`（401 重试、Abort、序列化）
- [ ] **T2-3** `src/utils/helpers.spec.ts`（formatRelativeTime / maskPhone / truncate）
- [ ] **T2-4** `src/stores/*.spec.ts`（至少 user / post 两个 store）
- [ ] **T2-5** `src/composables/useDebounce.spec.ts` + 其他 ≥ 2 个
- [ ] **T3-1** `api/utils/validate.spec.ts`（isEmail/isPhone/isPasswordStrong/sanitizeText）
- [ ] **T3-2** `api/utils/crypto.spec.ts`（hash/compare）
- [ ] **T3-3** `api/services/auth.spec.ts`（注册/登录/登出）
- [ ] **T3-4** `api/middleware/auth.spec.ts`（authRequired/adminRequired）
- [ ] **T3-5** `api/middleware/error.spec.ts`（统一错误处理）
- [ ] **T4-1** `playwright.config.ts`（三浏览器 + webServer）
- [ ] **T4-2** `e2e/fixtures/test-fixture.ts`（authedPage 注入）
- [ ] **T4-3** `e2e/helpers/api.ts`（后端直连）
- [ ] **T4-4** `npx playwright install --with-deps` 成功
- [ ] **T5-1** `e2e/01-auth.spec.ts`（注册 / 登录 / 登出）
- [ ] **T5-2** `e2e/02-post.spec.ts`（发帖 / 编辑 / 删除）
- [ ] **T5-3** `e2e/03-comment.spec.ts`（评论 / 回复）
- [ ] **T5-4** `e2e/04-like.spec.ts`（点赞 / 取消）
- [ ] **T5-5** `e2e/05-follow.spec.ts`（关注 / 取关 / 列表）
- [ ] **T5-6** `e2e/06-message.spec.ts`（私信发送 / 接收 / 已读）
- [ ] **T5-7** `e2e/07-admin.spec.ts`（封号 / 删帖 / 置顶 / 公告）
- [ ] **T6-1** `miniprogram/tests/frontend-static.test.js` 扩到 30+ 用例
- [ ] **T6-2** `miniprogram/tests/data/` fixture JSON
- [ ] **T6-3** `miniprogram/package.json` `check` 脚本跑通
- [ ] **T7-1** `.github/workflows/ci.yml`（lint + typecheck + unit + e2e + build）
- [ ] **T7-2** `.github/workflows/preview.yml`（Vercel deploy hook）
- [ ] **T7-3** `.github/workflows/lighthouse.yml`（autorun + artifact）
- [ ] **T7-4** `CODEOWNERS` 落地
- [ ] **T8-1** `api/sentry.ts` + `api/index.ts` 接入
- [ ] **T8-2** `src/sentry.ts` + `src/main.ts` 接入
- [ ] **T8-3** `vite.config.ts` 加 `sentryVitePlugin`
- [ ] **T8-4** `.env.example` 加 SENTRY_* 字段
- [ ] **T8-5** CI 上传 source map（可选 task 推到 W4）
- [ ] **T9-1** `lighthouserc.json` 完整配置
- [ ] **T9-2** `.lighthouseci/` 持久化与 `.gitignore` 配合
- [ ] **T9-3** `scripts/lhci-assert.sh`（可选）
- [ ] **T10-1** `docs-site/.vitepress/config.ts`
- [ ] **T10-2** `docs-site/index.md` 首页
- [ ] **T10-3** `docs-site/guide/getting-started.md`
- [ ] **T10-4** `docs-site/api/posts.md` + 至少 2 个 API 页
- [ ] **T10-5** `.github/workflows/docs.yml` 部署到 GitHub Pages
- [ ] **跨** 风险登记 R1-R10 全部 `缓解` 列写具体动作
- [ ] **跨** sign-off 矩阵 5 个必签角色全签字
- [ ] **跨** Go-Live Gate 6 条全绿

---

**版本说明**：本 spec 与 `spec-A/B/C` 互不冲突；T1-T10 都可在不破坏现有 `dev / build / start` 的前提下增量引入。如需调整顺序，先改 §6.3，再同步 §8 里程碑。

