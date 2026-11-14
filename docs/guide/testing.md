# 质量门：六道 CI 门 + 本地复现

每次 push 到 master，GitHub Actions 跑六道门，任一失守即红：

| 门 | 内容 | 本地复现 |
|---|---|---|
| 静态门 | ESLint + vue-tsc + **290 单测/集成**（干净库，无需 seed）+ 文档站死链检查 | `npm run lint && npm run check && npm test && npm run docs:build` |
| 雷达算法门 | 失物雷达标注集：召回/误报/P@1 跌破阈值即失败 | `npm run eval:radar -- --gate` |
| 体积预算门 | gzip：vendor-echarts≤210K / 框架≤75K / 主包≤100K / 懒加载块≤60K | `npm run build && npm run check:bundle` |
| 契约压测门 | 24 并发×20s：零 5xx、零连接错误、8 端点状态码契约全命中、p95<800ms | `npm run loadtest`（需 `RATE_LIMIT_ENABLED=0` 实例） |
| 浏览器门 | Playwright 12 条核心流真 Chromium（隔离库自动重灌种子） | `npx playwright test` |
| Lighthouse 门 | 移动端模拟 3 次中位数：perf≥72 / a11y≥90 / bp≥90 / seo≥90（CI 实测 95/95/100/100） | `node scripts/lighthouse-gate.mjs` |

## 压测门的契约语义

与「跑分」不同，守的是交付承诺：鉴权守卫匿名必须 401、404 语义不许漂移、
限流 429 单独统计（防线在工作，不算失败）。CI 实测 ~2409 req/s、p95 5ms。

## 浏览器门的防腐设计

E2E 曾自 V5 登录重构后静默腐烂 10/12——教训进 CI：

- 入口走搜索而非「点首页卡内标题」（虚拟列表重渲染会让节点脱离 DOM）
- 断言用无障碍锚（`aria-label=查看帖子：*`）与正则文案，不锁死易变字面量
- 匿名断言选真匿名帖并校验脱敏，不选错帖

## Lighthouse 门的纪律

- **3 次中位数**：移动端模拟单跑波动实测 ±15（冷缓存/机器负载），单跑门必 flaky
- **先修后设阈**：67 → 79 的真实优化（marked/dompurify 懒加载、命令面板懒挂载、首屏 pageSize 20→12、卡片 contain 隔离），阈值 72 是回归地板而非遮羞布
- 无 SSR 的 Vue SPA 移动端再往上需 prerender——那是另一个工程面，不靠调阈值假装

## 其它回归锁

- 风格回潮锁 3 条：小程序 wxss 禁渐变/玻璃拟态/柔影回潮
- 对比度锁：品牌色对纸底 ≥4.5:1（WCAG AA）
- SEO 锁 29 条：OG 单份注入、JSON-LD 转义、RSS 匿名归一、sitemap 形状
- OpenAPI 锁：五域 13 端点登记齐全，push 501 语义进契约

## 覆盖率口径

`npm run test:coverage` 可出报告；不设硬阈值——miniprogram 静态分析不计执行覆盖，
硬阈值只会制造刷指标动机。质量以「门」而非「百分比」表达。
