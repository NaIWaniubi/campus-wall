# 设计规范 V4 ·「纸感海报 / PAPER & INK」

> 一句话：**纸底 + 墨线 + 硬投影 + 大字排版 + 荧光色块**。
> 这不是「再加点渐变」，而是把全站从「玻璃拟态」换成「编辑设计」。
> 参考实现：`src/pages/HomePage.vue`（头部 + 今日校园卡）、`src/components/PostCard.vue`、`src/components/BottomNav.vue`。

## 0. 硬约束（违反就算没做完）

1. **只改分配给你的文件**；不要动 `src/styles/*`、`src/utils/*`、`src/components/PostCard.vue`、`BottomNav.vue`、`HomePage.vue`。
2. **只做样式与结构**：不改 props / emits / 接口调用 / 路由 / 业务判断 / 文案含义。删掉一个 `v-if` 也算改逻辑。
3. 不要引入新依赖、不要写 `<style scoped>` 里的大段自定义 CSS（≤20 行以内、且必须用 `var(--*)`）。
4. 不要跑 `npm run build`（会和别人的产物冲突）；类型问题留给集成阶段。
5. 颜色只能用 token：`var(--ink) var(--paper) var(--card) var(--lime) var(--coral) var(--sky) var(--violet) var(--ink-mute)`；不要写新的十六进制。

## 1. 令牌

| 变量 | 用途 |
|---|---|
| `--paper` | 页面底（暖白纸），已由 `body` 全局设置，页面根节点不要再写 `bg-white`/`bg-zinc-50` |
| `--card` | 卡片/输入底（纯白） |
| `--ink` | 墨色：文字、1.5px 描边、硬投影 |
| `--ink-soft` / `--ink-mute` | 次级文字 / 弱文字 |
| `--lime` / `--coral` / `--sky` / `--violet` | 四个荧光强调色（块面、点、贴纸） |
| `--shadow-hard`(3px) / `--shadow-hard-sm`(2px) / `--shadow-hard-lg`(6px) | 硬投影，**只用这三个** |

## 2. 组件类（优先用它们，不要自己拼）

| 类 | 长什么样 | 替换掉原来的 |
|---|---|---|
| `.ds-card` / `.ds-card.ds-card--hover` | 白底 + 1.5px 墨线 + 18px 圆角 + 3px 硬投影 | `bg-white rounded-xl shadow-sm` / `.card` |
| `.ds-btn` / `.ds-btn--primary` / `.ds-btn--accent` / `.ds-btn--danger` / `.ds-btn--sm` | 描边胶囊按钮；primary = 墨底荧光字；active 下沉 2px | `.btn-grad` / 彩色 rounded-lg 按钮 |
| `.ds-icon-btn` | 38px 方形描边图标钮 | 圆角 icon button |
| `.ds-chip` / `.ds-chip.is-active` | 描边胶囊；active = 墨底荧光字 | 筛选胶囊、Tab 胶囊 |
| `.ds-tag` + `.ds-tag-dot` | 描边小标签 + 彩色圆点 | 彩色底小标签 |
| `.ds-input` | 1.5px 墨线输入框，focus 变硬投影 | `bg-zinc-50 border-zinc-200 rounded-lg` 输入 |
| `.ds-sticker`（`--coral/--sky/--violet`） | 微旋转贴纸 | 旧的 `.sticker` |
| `.ds-label` | 10.5px 大写字距标签 | `text-xs text-zinc-400` 的字段名 |
| `.ds-display` + `.ds-display-xl/lg` | 900 字重、负字距标题 | `text-2xl font-bold` 页标题 |
| `.ds-title` / `.ds-sub` | 20px 小标题 / 13px 说明 | — |
| `.ds-marker` | 荧光笔标记（文字下半截荧光） | `.grad-text` |
| `.ds-rule` / `.ds-hairline` | 墨线 / 淡分隔线 | `border-t border-zinc-100` |
| `.ds-section-head` + `__num` + `__line` | 「01 —— 板块」式章节头 | 普通 h2 |
| `.hero` | 墨色海报头（已全局重定义，保留即可） | — |
| `.sort-strip` | 纸色排序条（已全局重定义） | — |

## 3. 排版规则

- 页面标题：`.ds-display .ds-display-lg`；区块标题：`.ds-title`；正文 13–14px / `leading-relaxed`；说明 12–13px `var(--ink-mute)`。
- 数字（计数、价格、时间）：加 `ds-num`。
- 列表项之间用 `space-y-3`；卡片内边距 `p-4`（桌面 `p-5`）。
- 大留白是设计的一部分：**不要为了塞内容把间距压到 8px 以下**。

## 4. 页面骨架模板

```vue
<template>
  <div class="min-h-screen pb-24">
    <!-- 墨色海报头 -->
    <header class="hero px-5 pt-6 pb-7 rounded-b-[20px]">
      <div class="flex items-center gap-2">
        <span class="ds-sticker ds-sticker--coral">SECTION</span>
        <span class="ds-label" style="color: rgb(255 255 255 / 0.45)">8 板块 · 本校</span>
      </div>
      <h1 class="ds-display ds-display-lg mt-2 text-white">页面标题</h1>
      <p class="mt-1 text-[13px] text-white/60">一句说明</p>
    </header>

    <div class="max-w-[960px] mx-auto px-3 -mt-4 space-y-3">
      <section class="ds-card p-4">
        <div class="ds-section-head mb-3">
          <span class="ds-section-head__num">01</span>
          <h2 class="ds-title">区块标题</h2>
          <span class="ds-section-head__line"></span>
        </div>
        <!-- 内容 -->
      </section>
    </div>
  </div>
</template>
```

## 5. 常见替换对照

| 旧写法 | V4 写法 |
|---|---|
| `class="bg-white rounded-xl p-4"` | `class="ds-card p-4"` |
| `class="text-sm font-medium text-zinc-700"` | `class="ds-label"`（字段名）或 `text-[13px] font-semibold" style="color: var(--ink-soft)"` |
| `class="text-xs text-zinc-400"` | `class="ds-sub"` 或 `style="color: var(--ink-mute)"` |
| `class="border border-zinc-200 rounded-lg"` | `class="ds-input"`（输入）/ `class="ds-card ds-card--flat"`（容器） |
| `style="background: var(--grad-brand)"`（图标底） | `style="background: var(--lime); color: var(--ink)"` 或 `var(--violet)` + 白字 |
| 渐变文字/蓝色链接 | `class="ds-marker"` / `style="color: var(--violet)"` + `font-bold underline underline-offset-2` |
| 空态插画/灰块 | `.ds-card.ds-card--flat` + `.ds-label` + 一句人话 |

## 6. 验收标准（集成时会按这个逐页看截图）

1. 页面里不再出现「白卡片浮在淡紫/灰底上」的旧观感：所有容器要么是 `.ds-card`，要么明确是纸底分区。
2. 每个页面至少有一个「海报级」元素：大字标题 / 贴纸 / 荧光块 / 走马条 / 编号章节头。
3. 主按钮只有一个视觉重心（墨底荧光），次级操作一律描边。
4. 手机 390px 下不横向溢出；卡片间距一致；底部不被 TabBar 遮挡（页面根 `pb-24`）。

## 7. V5 深色翻转原语（违反必出黑底黑字）

深色主题下 `--ink ⇄ --paper` 互换。所以 **任何「恒暗画布」里不能用 `var(--paper)` 当文字色，任何「恒亮小控件」里不能用 `var(--ink)` 当底 + 亮色字**。统一用：

| 类 | 用途 | 亮色 | 深色 |
|---|---|---|---|
| `.ds-poster` | 恒暗大画布：hero 类头部、后台侧栏、提交条、弹窗头 | 墨底 #14110F + 亮字 | 更深 #080706 + 亮字 |
| `.on-poster` / `.on-poster-soft` / `.on-poster-accent` | 海报画布上的文字 | 恒亮白 / 70% / 荧光 | 同左（不随主题翻） |
| `.ds-ink-btn` | 小控件（FAB、发送、清空） | 墨底 + 荧光字 | **荧光底 + 墨字**（自动翻） |
| `.ds-scrim` | 模态遮罩 | 墨 55% | 纯黑 72% |

规则：
1. 要一块「黑底白字」区 → `class="ds-poster"`，不要写 `style="background: var(--ink)"`。
2. 该区域内的次级文字用 `on-poster-soft`，强调字用 `on-poster-accent`，**不要**用 `color: var(--paper)`（深色下它翻成近黑 = 隐形）。
3. 弹层遮罩一律 `ds-scrim`；主按钮 `ds-btn--primary`（已内置翻转）。
4. 信誉/状态阶梯已去绿：`helpers.creditColor` = 紫(#6D3BF5)/深青(#0E7C86)/深琥珀(#B45309)/红(#DC2626)。

## 8. V5 功能面（新增，回归时一并验收）

- **登录**：`一键体验（免输入）` 直接登演示号；`先随便逛逛` 游客模式；字段级内联错误；桌面自动聚焦。
- **命令面板**：`Ctrl/⌘+K` 或 `window.dispatchEvent(new CustomEvent('cp:open'))`；空查询=最近搜索+入口+板块，有查询=帖子实时结果。
- **新手引导**：`OnboardingGuide` 首次到首页 0.8s 自动弹一次（`localStorage['onboarding:v1']` 记忆；`CustomEvent('onboarding:open')` 重看；Esc 可关）。
- **OG 分享卡片**：`api/utils/seo.ts` 在 SPA fallback 注入（仅 published 帖；模板按 mtime 缓存——发版后旧 chunk 引用必须失效）。
- **发布页**：剪贴板图片粘贴 / 拖拽上传共用 `addFiles()` 通道。
- **路由进度条**：`RouteProgress`（懒加载顶条）；`prefers-reduced-motion` 已降级；焦点环 `:focus-visible` 全局启用。
- **发布前预览**：`PublishPage` 预览弹窗内嵌 `<PostCard :post="previewPost">`，外层捕获层 `@click.capture.stop` 拦截点赞/评论等互动。
- **评论直达**：通知消息携带 `relatedSubId`（回复锚到顶层评论）；详情页 `?comment={id}` 滚到 `#cmt-{id}` 并播 2.6s `cmt-flash` 柠环动画；小程序端 `scroll-into-view` 同语义。
- **分享海报**：`SharePosterModal` 纯 canvas 750×1000@2（恒暗品牌头 + 板块色胶囊；`STATS_Y=690` 固定带，空间不足先舍图、再减摘要行），下载/复制/系统分享三分支。
- **模态焦点陷阱**：`useModalInert.trapWithInert(visibleRef)`——弹窗打开给 `#app` 加 `inert`，背景退出 Tab 序列/无障碍树；已接命令面板、新手引导、分享海报。
- **PWA 安装**：`usePwaInstall` 模块级单例捕获 `beforeinstallprompt`；设置页 03「安装校园墙」三分支（已安装 tag / 一键安装按钮 / 手动指引文案）。
- **小程序 V4 同源**：纸白实底 + 墨线 + 硬投影取代渐变/玻璃拟态/柔影（`static.test.ts` 三条回潮锁：135 渐变仅允许 mine 海报头、禁 `backdrop-filter: blur`、禁旧色相 rgba 家族）；全局 `.section-title` 柠色标记条；发布页 `.pub-hero` 海报小标头 + NEW 贴纸；8 分类色与 mock 调色板对齐 `src/utils/sections.ts` 板块色。
- **全局实时通知**：`useNotifyFeed`（App.vue 挂一次）消费 `notification:push` / `message:incoming` → `appStore.refreshUnread()` + 非消息页才 toast。`main.ts` 无条件 `useWebSocket().start()`（内部仅 token 存在才真连，并 `$subscribe` 跟随登录/换号/登出）——这是游客登录后能收到推送的前提。
- **SEO 静态面**：`registerCrawlEndpoints`（在 SPA 通配回退**之前**注册）出 `robots.txt`（绝对 Sitemap、屏蔽 /admin /api）与 `sitemap.xml`（published 帖 + 板块，缓存 10min）；`buildSitemapXml` 纯函数、loc 转义防 XML 注入。
- **离线智能成稿**：`ruleDraft` 无 AI 时按板块套版——`offlineFields` 只抽原文实有字段（物品/成色/价格/时间/地点/联系方式/捡到or丢失），正文=原话+📌 清单；表白/吐槽情绪板块不套版；标签以干净字段为种子，滑窗碎片仅在零标签时兜底。
- **全局错误兜底**：`errorGuard.isChunkLoadError/shouldReloadOnChunkError`（纯函数 + 单测）驱动 `router.onError`——旧 chunk 404 硬刷新一次防白屏，sessionStorage/storage 异常均有防死循环；`app.config.errorHandler` 兜未捕获 Vue 错误为 toast 而非白屏。
