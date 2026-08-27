# 方向 A：Web 端体验深度升级 — 可执行 spec

> 项目：校园墙 · Web 主端
> 栈：Vue 3.5 + TypeScript 5.9 + Vite 8 + Tailwind 3 + Pinia 3 + vue-router 4 + Lucide
> 范围：仅 `src/`（用户端 + 管理端），不涉及后端 schema 变更（除明确标注的 WS 端点）
> 对齐：总方案 M1–M7，本 spec 覆盖 M3 / M4 / M5 / M6

---

## 1. 目标与成功标准（可量指标）

| # | 指标 | 现状基线 | 目标值 | 测量方式 |
|---|------|----------|--------|----------|
| 1 | Lighthouse Performance（移动 4G Slow） | 估 ~55 | **≥ 85** | `lighthouse-ci` 接入 GitHub Actions，每日 1 次 |
| 2 | LCP（信息流首屏） | 未测，估计 ≥ 3.5s | **≤ 1.8s** | Web Vitals 注入 + Lighthouse 报告 |
| 3 | CLS | 未测 | **≤ 0.05** | 同上 |
| 4 | TTI（首页冷启） | 未测 | **≤ 2.5s** | Lighthouse TBT ≤ 200ms |
| 5 | 信息流滚动 FPS（1000 条数据） | 当前 DOM 全渲染，估 ~25fps | **稳定 58–60fps** | `requestAnimationFrame` 采样 + PerformanceObserver |
| 6 | 私信端到端延迟（同机房） | 当前轮询 5s，估 2.5s 中位 | **≤ 400ms 中位** | WS push + 后端 `x-response-time` 注入 |
| 7 | 暗色模式覆盖率 | 0 | **100% 页面 + 100% 组件** | `data-theme` 属性 + Playwright 截图对比 |
| 8 | a11y（axe-core 严重项） | 未测 | **0 严重 / 0 警告** | `@axe-core/playwright` 接入回归 |
| 9 | PWA 安装率（30 日） | 0 | **≥ 8%** | `appinstalled` 事件埋点 |
| 10 | 离线可读 | 0 页 | **首页 + 任意 5 篇详情** | Service Worker 缓存策略命中 |

**为什么定这些数**：1–4 是 Vite 默认的体验底线，5–6 是校园墙最高频的两个动作（刷信息流 / 收发私信），7–8 是评审常被挑战的"看起来像大学生作品 vs 看起来像 SaaS"的差距来源，9–10 是把"刷一下就走"的访客变成回访用户的关键钩子。

---

## 2. 范围与不做项

### 做（5–8 条）
1. 设计 token 体系（颜色 / 间距 / 圆角 / 阴影 / 字体），三档断点（sm <640 / md 640–960 / lg ≥960）
2. 14 个核心组件重做：PostCard / Skeleton / EmptyState / AiAssistant / ChatPanel / CreditBadge 等
3. 信息流虚拟滚动（@tanstack/vue-virtual），草稿 24h 自动恢复
4. WebSocket 客户端（私信 + 系统消息 + 帖子状态变更）
5. 管理后台 Dashboard 可视化（ECharts 5，4 个核心图）
6. 暗色模式（prefers-color-scheme + 手动切换 + Pinia 持久化）
7. PWA（manifest + workbox + 离线浏览首页 + 详情页）
8. a11y 全面审计 + 修复 + 回归用例
9. 性能优化（路由懒分包 / 图片懒加载 / 字体子集 / critical CSS）
10. 文档 + Lighthouse CI + 回归脚本

### 不做（5–8 条）
1. **不做后端 schema 改造**：WS 端点复用现有 JWT 鉴权 + 现有 `chat_messages` 表，不新增字段
2. **不做 SSR / Nuxt 迁移**：体量不到、SEO 不是核心诉求，CSR + 预渲染足以
3. **不做 i18n 国际化**：当前用户 99% 中国大陆学生，单语够用
4. **不做组件库升级**（如 Element Plus 引入）：引入会增加 200KB+，与 PWA 目标冲突
5. **不做大改路由结构**：保持现有 7 个用户端 + 9 个管理端，仅懒分包
6. **不做管理后台 RBAC 重构**：现有管理员/超管二级够用，不引入 Casbin
7. **不做实时音视频**：私信只做文字 + 图片，超纲
8. **不做 Storybook 完整接入**：仅在 a11y 回归时用 Playwright 跑组件，等 spec 落地稳定后再单独评估

---

## 3. 关键技术决策

| # | 决策点 | 方案 A（选） | 备选 B | 选 A 的理由 |
|---|--------|--------------|--------|-------------|
| 1 | 虚拟滚动库 | `@tanstack/vue-virtual` 3.x | `vue-virtual-scroller` | 维护活跃、API 现代（headless）、按需加载 ~3KB；vue-virtual-scroller 已停更 |
| 2 | 状态管理 | 继续 Pinia 3（已有） | 引入 Pinia 4 RC | 3.x 稳定、团队已掌握；4 RC 升级收益不抵风险 |
| 3 | WS 客户端 | 原生 `WebSocket` + 重连封装 | `socket.io-client` | 后端是 Express 5，原生 WS 即可，socket.io 多一层协议开销 |
| 4 | 图表库 | ECharts 5（按需引入） | Chart.js | Dashboard 需求复杂（漏斗+热力），ECharts 表达力强、按需 tree-shake 后 80KB |
| 5 | Service Worker | `vite-plugin-pwa` 1.x（workbox 包装） | 手写 SW | 自动生成 manifest + precache 清单 + 升级提示，省 1 周 |
| 6 | 暗色模式实现 | CSS 变量 + `data-theme` 属性 | Tailwind `dark:` 类 | 变量方案对第三方组件 / ECharts 主题切换更友好 |
| 7 | 字体方案 | 系统字体栈 + 中文 fallback 栈 | 引入 Inter / 思源黑体 | 校园墙 90% 内容是中文，自带字体已 60ms 内首字；引入字体反增 LCP |
| 8 | Critical CSS | `@unocss/preset-mini` 提取 | 手写 + critters | 已用 Tailwind 编译，critters 运行时提取更稳 |
| 9 | a11y 检测 | `@axe-core/playwright` | Lighthouse a11y 审计 | axe 是行业标准，定位到具体节点；Lighthouse 只打分 |
| 10 | 性能监控 | `web-vitals` 4 + 自建埋点 | 接入 Sentry | 体量小，第三方上报 + GDPR 风险不值得；自建够用 |

---

## 4. 依赖项与前置

```json
{
  "dependencies": {
    "@tanstack/vue-virtual": "^3.10.0",     // 信息流虚拟滚动
    "echarts": "^5.5.0",                    // 管理后台图表
    "vue-echarts": "^7.0.0",                // Vue 3 适配
    "workbox-window": "^7.1.0"              // PWA 客户端（dev 依赖）
  },
  "devDependencies": {
    "vite-plugin-pwa": "^0.20.0",           // 自动生成 SW + manifest
    "@axe-core/playwright": "^4.10.0",      // a11y 回归
    "playwright": "^1.47.0",                // 端到端 + a11y
    "lighthouse": "^12.2.0",                // 性能审计
    "@lhci/cli": "^0.14.0",                 // CI 集成
    "web-vitals": "^4.2.0",                 // 真实用户指标
    "critters": "^0.0.24"                   // Critical CSS
  }
}
```

**为什么选**：
- `@tanstack/vue-virtual`：与 React 版本同源，文档完善，体积 < 5KB gzip
- `vite-plugin-pwa`：Vite 8 官方推荐，零配置即可拿到 manifest + precache
- `@axe-core/playwright`：可定位到具体 DOM 节点 + role，CI 友好
- `web-vitals`：Google 官方 1KB 库，LCP/CLS/INP 上报

**不引入**：
- 不引入 Tailwind UI / Headless UI（重复造轮子，且与薄荷绿设计语言冲突）
- 不引入 Element Plus / Naive UI（与 Pinia store 边界混乱）
- 不引入 Day.js / date-fns（原生 `Intl.DateTimeFormat` 够用）

---

## 5. 详细 task 清单

### Task 1：设计 token + 三档响应式 layout 基础

**文件路径**：
- 新增：`src/styles/tokens.css`（CSS 变量定义）
- 新增：`src/styles/themes.css`（亮/暗双主题）
- 新增：`src/composables/useBreakpoint.ts`
- 修改：`tailwind.config.ts`（接入 CSS 变量）
- 修改：`src/assets/main.css`（引入 token）
- 修改：`src/App.vue`（根容器应用主题）

**关键代码 `src/composables/useBreakpoint.ts`**：
```ts
import { ref, onMounted, onUnmounted } from 'vue'

/** 断点定义：sm<640 / md 640-960 / lg≥960，移动优先最大宽 960 */
export type Breakpoint = 'sm' | 'md' | 'lg'

const QUERIES: Record<Breakpoint, string> = {
  sm: '(max-width: 639px)',
  md: '(min-width: 640px) and (max-width: 959px)',
  lg: '(min-width: 960px)',
}

export function useBreakpoint() {
  const current = ref<Breakpoint>('sm')
  const mqls: Map<Breakpoint, MediaQueryList> = new Map()

  const update = () => {
    // 优先级 lg > md > sm，确保只命中一个
    if (mqls.get('lg')!.matches) current.value = 'lg'
    else if (mqls.get('md')!.matches) current.value = 'md'
    else current.value = 'sm'
  }

  onMounted(() => {
    for (const bp of Object.keys(QUERIES) as Breakpoint[]) {
      const mql = window.matchMedia(QUERIES[bp])
      mql.addEventListener('change', update)
      mqls.set(bp, mql)
    }
    update()
  })

  onUnmounted(() => {
    mqls.forEach((mql) => mql.removeEventListener('change', update))
  })

  const isMobile = () => current.value === 'sm'
  const isTablet = () => current.value === 'md'
  const isDesktop = () => current.value === 'lg'

  return { current, isMobile, isTablet, isDesktop }
}
```

**关键代码 `src/styles/tokens.css`**：
```css
:root {
  /* 品牌色：薄荷绿 / 暖橙 / 珊瑚红 */
  --color-primary-50:  #ECFDF5;
  --color-primary-500: #10B981;
  --color-primary-600: #059669;
  --color-primary-700: #047857;

  --color-accent-500: #F59E0B;
  --color-danger-500: #EF4444;

  /* zinc 中性 */
  --color-surface:    #FFFFFF;
  --color-surface-2:  #F4F4F5;
  --color-border:     #E4E4E7;
  --color-text:       #18181B;
  --color-text-soft:  #52525B;
  --color-text-mute:  #A1A1AA;

  /* 间距阶梯 4-based */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px;
  --space-4: 16px; --space-6: 24px; --space-8: 32px;

  /* 圆角 */
  --radius-sm: 6px; --radius-md: 10px; --radius-lg: 16px; --radius-full: 9999px;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.04);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.08);
  --shadow-lg: 0 12px 32px rgb(0 0 0 / 0.12);

  /* 字号 */
  --text-xs: 12px; --text-sm: 14px; --text-base: 15px;
  --text-lg: 17px; --text-xl: 20px; --text-2xl: 24px;

  /* 容器 */
  --container-max: 960px;
}

[data-theme='dark'] {
  --color-surface:   #18181B;
  --color-surface-2: #27272A;
  --color-border:    #3F3F46;
  --color-text:      #FAFAFA;
  --color-text-soft: #A1A1AA;
  --color-text-mute: #71717A;

  --shadow-sm: 0 1px 2px rgb(0 0 0 / 0.4);
  --shadow-md: 0 4px 12px rgb(0 0 0 / 0.5);
  --shadow-lg: 0 12px 32px rgb(0 0 0 / 0.6);
}
```

**接口定义**：
```ts
/** 主题模式：'light' | 'dark' | 'system' */
export type ThemeMode = 'light' | 'dark' | 'system'

/** 应用外观偏好持久化结构 */
export interface AppearancePref {
  mode: ThemeMode
  fontScale: 1 | 1.1 | 1.2  // 老年/小屏适配
  reduceMotion: boolean
}
```

**验收**：
- [ ] `npm run dev` 后所有页面无样式断裂
- [ ] `tokens.css` 内变量被全部组件至少 1 处引用
- [ ] `useBreakpoint()` 在控制台可观察到 `current` 变化
- [ ] 切到桌面端宽度时，最大宽度 960px 容器居中

---

### Task 2：Skeleton 组件体系

**文件路径**：
- 新增：`src/components/Skeleton.vue`（基础原子）
- 新增：`src/components/PostCardSkeleton.vue`
- 新增：`src/components/MessageItemSkeleton.vue`
- 新增：`src/components/SectionGridSkeleton.vue`
- 修改：`src/components/PostCard.vue`（导出 prop 控制）
- 修改：`src/pages/HomePage.vue` / `SectionPage.vue` / `PostDetailPage.vue`（挂骨架）

**关键代码 `src/components/PostCardSkeleton.vue`**：
```vue
<script setup lang="ts">
/** 信息流卡片骨架：模拟真实卡片比例，避免加载后跳动 */
defineProps<{
  count?: number
  showMedia?: boolean
}>()
</script>

<template>
  <div role="status" aria-label="加载中">
    <div
      v-for="i in (count ?? 3)"
      :key="i"
      class="skeleton-card border-b border-[var(--color-border)] px-4 py-3"
    >
      <div class="flex items-center gap-3 mb-3">
        <Skeleton variant="circle" :width="40" :height="40" />
        <div class="flex-1 space-y-2">
          <Skeleton variant="text" :width="'40%'" :height="14" />
          <Skeleton variant="text" :width="'25%'" :height="12" />
        </div>
      </div>
      <div class="space-y-2 mb-3">
        <Skeleton variant="text" :width="'95%'" :height="14" />
        <Skeleton variant="text" :width="'80%'" :height="14" />
        <Skeleton variant="text" :width="'60%'" :height="14" />
      </div>
      <Skeleton
        v-if="showMedia"
        variant="rounded"
        :width="'100%'"
        :height="180"
        class="mb-3"
      />
      <div class="flex gap-4">
        <Skeleton variant="text" :width="60" :height="12" />
        <Skeleton variant="text" :width="60" :height="12" />
        <Skeleton variant="text" :width={60}" :height="12" />
      </div>
    </div>
    <span class="sr-only">内容加载中</span>
  </div>
</template>
```

**关键代码 `src/components/Skeleton.vue`（核心）**：
```vue
<script setup lang="ts">
import { computed } from 'vue'

type Variant = 'text' | 'circle' | 'rounded' | 'block'

const props = withDefaults(defineProps<{
  variant?: Variant
  width?: number | string
  height?: number | string
  /** 动画：'pulse' | 'shimmer' | 'none' */
  animation?: 'pulse' | 'shimmer' | 'none'
}>(), {
  variant: 'text',
  width: '100%',
  height: 14,
  animation: 'shimmer',
})

const style = computed(() => ({
  width: typeof props.width === 'number' ? `${props.width}px` : props.width,
  height: typeof props.height === 'number' ? `${props.height}px` : props.height,
  borderRadius:
    props.variant === 'circle' ? '50%' :
    props.variant === 'rounded' ? 'var(--radius-md)' : 'var(--radius-sm)',
}))
</script>

<template>
  <span
    :class="[
      'inline-block bg-[var(--color-surface-2)]',
      animation === 'pulse' && 'animate-pulse',
      animation === 'shimmer' && 'skeleton-shimmer',
    ]"
    :style="style"
    aria-hidden="true"
  />
</template>

<style scoped>
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--color-surface-2) 0%,
    var(--color-border) 50%,
    var(--color-surface-2) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-shimmer { animation: none; }
}
</style>
```

**接口定义**：
```ts
/** 骨架组件的对外契约：业务侧只关心 variant + 尺寸 */
export interface SkeletonProps {
  variant?: 'text' | 'circle' | 'rounded' | 'block'
  width?: number | string
  height?: number | string
  animation?: 'pulse' | 'shimmer' | 'none'
}
```

**验收**：
- [ ] `PostCardSkeleton` 在 HomePage 首屏渲染 ≤ 16ms
- [ ] `prefers-reduced-motion` 用户看到静态骨架
- [ ] 真实数据到达时无 CLS 跳动（高度匹配）

---

### Task 3：虚拟滚动信息流

**文件路径**：
- 新增：`src/composables/useVirtualFeed.ts`
- 新增：`src/components/VirtualPostList.vue`
- 修改：`src/pages/HomePage.vue` / `SectionPage.vue` / `SearchPage.vue`
- 修改：`src/stores/feed.ts`（已存在则扩字段）

**关键代码 `src/composables/useVirtualFeed.ts`**：
```ts
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import type { Post } from '@/types/post'

/** 预估行高：首屏用 240，后续根据 index 动态修正 */
const estimateSize = (index: number, post: Post) => {
  if (post.images && post.images.length > 0) return 320
  if (post.content.length > 120) return 200
  return 160
}

export function useVirtualFeed(posts: Ref<Post[]>) {
  const parentRef = ref<HTMLElement | null>(null)
  const scrollMargin = ref(0)

  const virtualizer = useVirtualizer({
    count: computed(() => posts.value.length),
    getScrollElement: () => parentRef.value,
    estimateSize: (index) => estimateSize(index, posts.value[index]),
    overscan: 5,                    // 预渲染 5 条
    measureElement:                 // 动态测量真实高度
      typeof window !== 'undefined' &&
      navigator.userAgent.indexOf('Firefox') === -1
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  })

  const items = computed(() => virtualizer.value.getVirtualItems())
  const totalSize = computed(() => virtualizer.value.getTotalSize())

  // 触底加载：剩余 5 条时触发
  const onScroll = (e: Event) => {
    const el = e.target as HTMLElement
    if (
      el.scrollHeight - el.scrollTop - el.clientHeight < 600 &&
      posts.value.length > 0
    ) {
      // emit('reach-bottom')
    }
  }

  // 测量动态高度
  onMounted(() => {
    if (!parentRef.value) return
    parentRef.value.addEventListener('scroll', onScroll, { passive: true })
  })
  onUnmounted(() => {
    parentRef.value?.removeEventListener('scroll', onScroll)
  })

  return { parentRef, items, totalSize, virtualizer }
}
```

**关键代码 `src/components/VirtualPostList.vue`**：
```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { Post } from '@/types/post'
import { useVirtualFeed } from '@/composables/useVirtualFeed'
import PostCard from './PostCard.vue'
import PostCardSkeleton from './PostCardSkeleton.vue'

const props = defineProps<{
  posts: Post[]
  loading?: boolean
}>()

const emit = defineEmits<{
  reachBottom: []
  refresh: []
}>()

const { parentRef, items, totalSize } = useVirtualFeed(
  computed(() => props.posts)
)
</script>

<template>
  <div
    ref="parentRef"
    class="virtual-feed-container overflow-y-auto h-[calc(100dvh-56px)]"
    role="feed"
    aria-busy="loading"
  >
    <div :style="{ height: `${totalSize}px`, position: 'relative' }">
      <div
        v-for="vi in items"
        :key="vi.key"
        :data-index="vi.index"
        :ref="virtualizer.measureElement"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${vi.start}px)`,
        }"
      >
        <PostCard
          v-if="posts[vi.index]"
          :post="posts[vi.index]"
        />
      </div>
    </div>
    <PostCardSkeleton v-if="loading" :count="2" class="mt-2" />
  </div>
</template>
```

**接口定义**：
```ts
import type { Ref } from 'vue'
import type { VirtualItem, Virtualizer } from '@tanstack/vue-virtual'

export interface UseVirtualFeedReturn {
  parentRef: Ref<HTMLElement | null>
  items: ComputedRef<VirtualItem[]>
  totalSize: ComputedRef<number>
  virtualizer: Virtualizer<HTMLElement, Element>
}
```

**验收**：
- [ ] 1000 条数据下，DevTools Performance 录制 ≥ 58fps
- [ ] 滚动时 Network 面板下，新数据按需加载
- [ ] 触底 600px 内触发 `reachBottom` 事件
- [ ] `Tab` 键可逐条聚焦 PostCard

---

### Task 4：WebSocket 客户端

**文件路径**：
- 新增：`src/composables/useWebSocket.ts`（核心）
- 新增：`src/composables/useChatSocket.ts`（私信封装）
- 新增：`src/composables/useNotificationSocket.ts`（系统消息封装）
- 新增：`src/stores/realtime.ts`（连接状态 + 心跳）
- 修改：`src/stores/user.ts`（注入 token）
- 修改：`src/components/ChatPanel.vue` / `src/pages/MessagePage.vue`
- 修改：`src/main.ts`（启动连接）

**关键代码 `src/composables/useWebSocket.ts`**：
```ts
import { ref, onUnmounted, watch } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRealtimeStore } from '@/stores/realtime'

export type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting' | 'error'

export interface WsMessage<T = unknown> {
  type: string
  data: T
  ts: number
}

interface UseWebSocketOptions {
  url: string                    // 例: '/ws'
  heartbeatInterval?: number     // 默认 25s
  maxBackoff?: number            // 默认 30s
  onMessage: (msg: WsMessage) => void
}

/** 指数退避：1s, 2s, 4s, 8s, 16s, 30s(封顶) */
const backoff = (attempt: number, max: number) =>
  Math.min(1000 * 2 ** attempt, max)

export function useWebSocket(opts: UseWebSocketOptions) {
  const userStore = useUserStore()
  const realtime = useRealtimeStore()
  let ws: WebSocket | null = null
  let attempt = 0
  let heartbeatTimer: number | null = null
  let reconnectTimer: number | null = null

  const status = ref<WsStatus>('closed')

  const connect = () => {
    if (!userStore.token) return
    status.value = 'connecting'
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    ws = new WebSocket(`${proto}://${location.host}${opts.url}?token=${userStore.token}`)

    ws.onopen = () => {
      status.value = 'open'
      attempt = 0
      realtime.setConnected(opts.url, true)
      // 启动心跳
      if (opts.heartbeatInterval) {
        heartbeatTimer = window.setInterval(() => {
          ws?.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' }))
        }, opts.heartbeatInterval)
      }
    }

    ws.onmessage = (e) => {
      try {
        const msg: WsMessage = JSON.parse(e.data)
        if (msg.type === 'pong') return
        opts.onMessage(msg)
      } catch (err) {
        console.warn('[ws] parse error', err)
      }
    }

    ws.onerror = () => { status.value = 'error' }
    ws.onclose = () => {
      status.value = 'closed'
      realtime.setConnected(opts.url, false)
      heartbeatTimer && clearInterval(heartbeatTimer)
      // 指数退避重连
      attempt += 1
      reconnectTimer = window.setTimeout(
        connect,
        backoff(attempt, opts.maxBackoff ?? 30000)
      )
      status.value = 'reconnecting'
    }
  }

  const send = (data: unknown) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify(data))
  }

  const close = () => {
    reconnectTimer && clearTimeout(reconnectTimer)
    heartbeatTimer && clearInterval(heartbeatTimer)
    ws?.close()
  }

  // 监听登录态变化：登出关闭，登录开启
  watch(
    () => userStore.token,
    (t) => (t ? connect() : close()),
    { immediate: true }
  )

  onUnmounted(close)

  return { status, send, close, connect }
}
```

**关键代码 `src/composables/useChatSocket.ts`**：
```ts
import { useWebSocket, type WsMessage } from './useWebSocket'
import { useMessageStore } from '@/stores/message'
import type { ChatMessage } from '@/types/chat'

interface IncomingMsg {
  message: ChatMessage
  conversationId: string
}

/** 私信 WS 封装：自动解包 + 推 store */
export function useChatSocket() {
  const messageStore = useMessageStore()

  return useWebSocket({
    url: '/ws/chat',
    heartbeatInterval: 25_000,
    maxBackoff: 30_000,
    onMessage: (raw: WsMessage) => {
      switch (raw.type) {
        case 'message:new': {
          const { message, conversationId } = raw.data as IncomingMsg
          messageStore.appendMessage(conversationId, message)
          // 通知：如果窗口隐藏，弹系统通知
          if (document.hidden && Notification.permission === 'granted') {
            new Notification('新消息', {
              body: message.content.slice(0, 40),
              icon: '/icon-192.png',
            })
          }
          break
        }
        case 'message:read':
          messageStore.markRead(raw.data as { conversationId: string; messageIds: string[] })
          break
        case 'conversation:typing':
          messageStore.setTyping(raw.data as { conversationId: string; userId: string })
          break
        default:
          break
      }
    },
  })
}
```

**接口定义**：
```ts
/** 私信消息 */
export interface ChatMessage {
  id: string
  conversationId: string
  senderId: string
  content: string
  type: 'text' | 'image'
  createdAt: number
  readAt?: number
}

/** 实时连接状态（持久化无关，仅内存） */
export interface RealtimeState {
  chatConnected: boolean
  systemConnected: boolean
  lastHeartbeat: number
}
```

**后端契约（与后端对齐）**：
- `GET /ws/chat?token=<jwt>` 升级 WebSocket
- 客户端发：`{ type: 'ping' }` / `{ type: 'typing', conversationId }` / `{ type: 'read', conversationId, messageIds }`
- 服务端推：`{ type: 'message:new', data: { message, conversationId } }` 等

**验收**：
- [ ] 开启 DevTools Network WS 面板，看到连接 + 心跳帧
- [ ] 后端断开 30s 内自动恢复（指数退避）
- [ ] 跨标签页广播：开两个标签同时收到新消息
- [ ] 登出后连接立即关闭，token 失效时尝试重连仅 1 次后停止

---

### Task 5：管理后台 Dashboard 可视化

**文件路径**：
- 新增：`src/pages/admin/DashboardPage.vue`（重做）
- 新增：`src/components/admin/charts/UserGrowthChart.vue`
- 新增：`src/components/admin/charts/PostHeatmapChart.vue`
- 新增：`src/components/admin/charts/TradeFunnelChart.vue`
- 新增：`src/components/admin/charts/SensitiveWordChart.vue`
- 新增：`src/composables/useAdminMetrics.ts`
- 修改：`src/utils/api.ts`（新增 `getDashboardMetrics`）

**关键代码 `src/composables/useAdminMetrics.ts`**：
```ts
import { ref, onMounted } from 'vue'
import { getDashboardMetrics } from '@/utils/api'

export interface DashboardMetrics {
  dau: { today: number; yesterday: number; trend: number[] }
  posts: { today: number; pending: number; rejected: number; trend: number[] }
  trades: { open: number; completed: number; disputed: number; trend: number[] }
  sensitive: { topWords: { word: string; count: number }[] }
  heatmap: number[][]            // 7x24
}

export function useAdminMetrics() {
  const metrics = ref<DashboardMetrics | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const load = async () => {
    loading.value = true
    error.value = null
    try {
      metrics.value = await getDashboardMetrics()
    } catch (e: any) {
      error.value = e.message ?? '加载失败'
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  return { metrics, loading, error, reload: load }
}
```

**关键代码 `src/components/admin/charts/UserGrowthChart.vue`**：
```vue
<script setup lang="ts">
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import {
  GridComponent, TooltipComponent, TitleComponent,
} from 'echarts/components'
import VChart from 'vue-echarts'
import { computed } from 'vue'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, TitleComponent])

const props = defineProps<{
  trend: number[]
  labels?: string[]
}>()

const option = computed(() => ({
  grid: { left: 40, right: 16, top: 24, bottom: 32 },
  xAxis: {
    type: 'category',
    data: props.labels ?? props.trend.map((_, i) => `${i + 1}日`),
    axisLine: { lineStyle: { color: 'var(--color-border)' } },
    axisLabel: { color: 'var(--color-text-soft)', fontSize: 11 },
  },
  yAxis: {
    type: 'value',
    splitLine: { lineStyle: { color: 'var(--color-border)' } },
    axisLabel: { color: 'var(--color-text-soft)', fontSize: 11 },
  },
  tooltip: { trigger: 'axis' },
  series: [{
    type: 'line',
    smooth: true,
    data: props.trend,
    symbol: 'circle',
    symbolSize: 6,
    lineStyle: { color: 'var(--color-primary-500)', width: 2 },
    itemStyle: { color: 'var(--color-primary-500)' },
    areaStyle: {
      color: {
        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(16,185,129,0.3)' },
          { offset: 1, color: 'rgba(16,185,129,0)' },
        ],
      },
    },
  }],
}))
</script>

<template>
  <VChart :option="option" autoresize style="height: 240px;" />
</template>
```

**接口定义**：
```ts
/** 仪表盘指标响应 */
export interface DashboardMetricsDTO {
  dau: { today: number; yesterday: number; trend: number[] }
  posts: { today: number; pending: number; rejected: number; trend: number[] }
  trades: { open: number; completed: number; disputed: number; trend: number[] }
  sensitive: { topWords: { word: string; count: number }[] }
  heatmap: number[][]   // 7 行(周一到周日) × 24 列(0-23时)
}
```

**验收**：
- [ ] 4 个图表均能在 1s 内渲染（Canvas）
- [ ] 暗色模式下图表颜色自动切换
- [ ] 数据为空时显示"暂无数据"占位
- [ ] 移动端单列堆叠，桌面端 2×2 网格

---

### Task 6：暗色模式

**文件路径**：
- 新增：`src/composables/useTheme.ts`
- 新增：`src/components/ThemeToggle.vue`
- 修改：`src/stores/app.ts`（持久化主题）
- 修改：`src/App.vue`（应用 `data-theme`）
- 修改：所有 9 个管理端页面 + 7 个用户端页面（确保无硬编码颜色）

**关键代码 `src/composables/useTheme.ts`**：
```ts
import { ref, watch, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'

export type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'app:theme'
const root = document.documentElement

const applyTheme = (mode: ThemeMode) => {
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const effective = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode
  root.setAttribute('data-theme', effective)
  // 同步 meta 主题色，避免浏览器 UI 闪白
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', effective === 'dark' ? '#18181B' : '#10B981')
}

export function useTheme() {
  const appStore = useAppStore()
  const mode = ref<ThemeMode>(
    (localStorage.getItem(STORAGE_KEY) as ThemeMode) ?? appStore.theme ?? 'system'
  )

  const setMode = (next: ThemeMode) => {
    mode.value = next
    localStorage.setItem(STORAGE_KEY, next)
    appStore.setTheme(next)
  }

  const toggle = () => {
    const order: ThemeMode[] = ['light', 'dark', 'system']
    const idx = order.indexOf(mode.value)
    setMode(order[(idx + 1) % order.length])
  }

  onMounted(() => {
    applyTheme(mode.value)
    // 监听系统主题变化
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', () => {
      if (mode.value === 'system') applyTheme('system')
    })
  })

  watch(mode, (m) => applyTheme(m))

  return { mode, setMode, toggle }
}
```

**关键代码 `src/components/ThemeToggle.vue`**：
```vue
<script setup lang="ts">
import { Sun, Moon, Monitor } from 'lucide-vue-next'
import { useTheme } from '@/composables/useTheme'

const { mode, setMode } = useTheme()
</script>

<template>
  <div
    class="theme-toggle inline-flex rounded-full bg-[var(--color-surface-2)] p-1"
    role="radiogroup"
    aria-label="主题切换"
  >
    <button
      v-for="opt in [
        { v: 'light', icon: Sun, label: '浅色' },
        { v: 'dark',  icon: Moon, label: '深色' },
        { v: 'system', icon: Monitor, label: '跟随系统' },
      ]"
      :key="opt.v"
      type="button"
      :aria-pressed="mode === opt.v"
      :aria-label="opt.label"
      class="rounded-full w-7 h-7 flex items-center justify-center transition"
      :class="mode === opt.v
        ? 'bg-[var(--color-primary-500)] text-white'
        : 'text-[var(--color-text-soft)] hover:text-[var(--color-text)]'"
      @click="setMode(opt.v as any)"
    >
      <component :is="opt.icon" :size="14" />
    </button>
  </div>
</template>
```

**接口定义**：
```ts
export type ThemeMode = 'light' | 'dark' | 'system'
export interface AppState {
  theme: ThemeMode
  sidebarCollapsed: boolean
  // ... 已有字段保留
}
```

**验收**：
- [ ] 切换无白屏闪烁（FOUC）
- [ ] localStorage 持久化，刷新后保持
- [ ] `prefers-color-scheme` 变化且 mode=system 时自动跟随
- [ ] ECharts 主题随切换

---

### Task 7：PWA

**文件路径**：
- 新增：`public/icon-192.png` / `public/icon-512.png` / `public/maskable-512.png`
- 新增：`public/robots.txt`
- 修改：`index.html`（meta 主题色 + apple-touch-icon）
- 修改：`vite.config.ts`（注册 `vite-plugin-pwa`）
- 新增：`src/composables/usePwaUpdate.ts`

**关键代码 `vite.config.ts`（PWA 片段）**：
```ts
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',         // 新版本自动应用
      includeAssets: ['favicon.ico', 'robots.txt', 'icon-192.png'],
      manifest: {
        name: '校园墙',
        short_name: '校园墙',
        description: '你的校园生活社区',
        theme_color: '#10B981',
        background_color: '#FFFFFF',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // 运行时缓存策略
        runtimeCaching: [
          {
            // 图片：CacheFirst，30 天，最多 200 条
            urlPattern: /\.(?:png|jpg|jpeg|svg|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // API GET：StaleWhileRevalidate，10 分钟
            urlPattern: /\/api\/.*$/,
            method: 'GET',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'api',
              expiration: { maxEntries: 100, maxAgeSeconds: 600 },
            },
          },
          {
            // 字体：CacheFirst，1 年
            urlPattern: /\.(?:woff2?|ttf)$/,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts' },
          },
        ],
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: true },      // 开发态也启用，方便调试
    }),
  ],
})
```

**关键代码 `src/composables/usePwaUpdate.ts`**：
```ts
import { ref, onMounted } from 'vue'

/** 监听 SW 更新，弹提示让用户刷新 */
export function usePwaUpdate() {
  const needRefresh = ref(false)
  const offlineReady = ref(false)
  let updateFn: ((reload?: boolean) => Promise<void>) | null = null

  onMounted(async () => {
    if (!('serviceWorker' in navigator)) return
    const { registerSW } = await import('virtual:pwa-register')
    updateFn = registerSW({
      immediate: true,
      onNeedRefresh() { needRefresh.value = true },
      onOfflineReady() { offlineReady.value = true },
    })
  })

  const update = () => updateFn?.(true)

  return { needRefresh, offlineReady, update }
}
```

**验收**：
- [ ] Chrome DevTools → Application → Manifest 全部字段合法
- [ ] 飞行模式下打开过的页面仍可访问
- [ ] Lighthouse PWA 审计通过
- [ ] 版本升级时弹"有新版本，刷新"提示

---

### Task 8：a11y 全面审计修复

**文件路径**：
- 新增：`tests/a11y/spec.ts`（Playwright + axe）
- 修改：所有页面（按修复清单）
- 新增：`src/composables/useFocusTrap.ts`（Modal 焦点陷阱）

**关键代码 `src/composables/useFocusTrap.ts`**：
```ts
import { onMounted, onUnmounted, ref, nextTick } from 'vue'

const FOCUSABLE = [
  'a[href]', 'area[href]', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])',
  'button:not([disabled])', 'iframe', 'object', 'embed',
  '[contenteditable]', '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Modal/Dialog 焦点陷阱：Tab 在容器内循环，Esc 触发 close */
export function useFocusTrap(
  containerRef: Ref<HTMLElement | null>,
  onEscape: () => void
) {
  const previouslyFocused = ref<HTMLElement | null>(null)

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onEscape()
      return
    }
    if (e.key !== 'Tab' || !containerRef.value) return
    const focusable = containerRef.value.querySelectorAll<HTMLElement>(FOCUSABLE)
    if (focusable.length === 0) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus()
    }
  }

  onMounted(async () => {
    await nextTick()
    previouslyFocused.value = document.activeElement as HTMLElement
    const first = containerRef.value?.querySelector<HTMLElement>(FOCUSABLE)
    first?.focus()
    document.addEventListener('keydown', onKey)
  })

  onUnmounted(() => {
    document.removeEventListener('keydown', onKey)
    previouslyFocused.value?.focus()
  })
}
```

**关键代码 `tests/a11y/spec.ts`**：
```ts
import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PAGES = [
  '/', '/section/lost-found', '/post/1', '/publish',
  '/messages', '/profile', '/search', '/admin',
]

for (const path of PAGES) {
  test(`a11y: ${path}`, async ({ page }) => {
    await page.goto(path)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze()
    const critical = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )
    expect(critical, JSON.stringify(critical, null, 2)).toEqual([])
  })
}
```

**修复清单（审计 → 修复）**：
| 问题 | 修复 |
|------|------|
| 颜色对比度 < 4.5:1 | 提亮 `--color-text-soft` |
| 图片缺 `alt` | 动态绑定 `alt={post.title}` |
| 按钮缺 `aria-label` | 图标按钮补 `aria-label` |
| Modal 无焦点陷阱 | 应用 `useFocusTrap` |
| 表单无 `label` | 加 `<label for>` 或 `aria-labelledby` |
| 跳转链接无 `href` | 改用 `router-link` 或加 `tabindex="0"` |

**验收**：
- [ ] axe-core 8 个核心页面 0 严重 / 0 警告
- [ ] Lighthouse a11y ≥ 95
- [ ] 键盘 Tab 顺序符合视觉顺序

---

### Task 9：性能优化

**文件路径**：
- 修改：`vite.config.ts`（手动分包 + gzip/brotli）
- 修改：`src/router/index.ts`（动态 import）
- 新增：`src/composables/useImageLazy.ts`
- 修改：`index.html`（preload + dns-prefetch）
- 修改：`src/components/PostCard.vue`（图片 `loading="lazy"` + `decoding="async"`）

**关键代码 `vite.config.ts`（性能片段）**：
```ts
export default defineConfig({
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-vue': ['vue', 'vue-router', 'pinia'],
          'vendor-echarts': ['echarts', 'vue-echarts'],
          'vendor-icons': ['lucide-vue-next'],
        },
      },
    },
    // 内联 < 4KB 资源
    assetsInlineLimit: 4096,
    // CSS 拆分
    cssCodeSplit: true,
    // source map 仅生产报错时使用
    sourcemap: 'hidden',
  },
  plugins: [
    vue(),
    // Brotli 压缩（部署时 nginx 也应开启）
    compression({ algorithm: 'gzip' }),
  ],
})
```

**关键代码 `src/composables/useImageLazy.ts`**：
```ts
import { onMounted, onUnmounted, ref, type Ref } from 'vue'

/** IntersectionObserver 包装：进入视口 200px 提前加载 */
export function useImageLazy(
  targetRef: Ref<HTMLElement | null>,
  onIntersect: () => void,
  options: { rootMargin?: string } = {}
) {
  let observer: IntersectionObserver | null = null
  onMounted(() => {
    if (!targetRef.value || !('IntersectionObserver' in window)) {
      onIntersect(); return
    }
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            onIntersect()
            observer?.disconnect()
            break
          }
        }
      },
      { rootMargin: options.rootMargin ?? '200px 0px', threshold: 0.01 }
    )
    observer.observe(targetRef.value)
  })
  onUnmounted(() => observer?.disconnect())
}
```

**字体子集**（不引入 webfont）：
- 浏览器命中 `font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`
- 中文 0KB 额外下载，英文走系统

**Critical CSS 流程**：
1. `vite build` 产出 dist
2. `critters` 解析 index.html，提取首屏 CSS 内联
3. 非首屏 CSS 异步加载

**验收**：
- [ ] 首屏 JS bundle ≤ 180KB gzip
- [ ] 图片懒加载：滚动 3 屏后，Network 仅看到当前屏 ±1
- [ ] 无 layout shift 报告（CLS = 0）

---

### Task 10：回归 + 文档 + Lighthouse CI 接入

**文件路径**：
- 新增：`.github/workflows/lighthouse-ci.yml`
- 新增：`docs/WEB-EXPERIENCE-UPGRADE.md`（使用文档）
- 新增：`docs/PERFORMANCE-BUDGET.md`（性能预算）
- 修改：`README.md`（新增章节"PWA / 暗色 / 性能"）
- 修改：`package.json`（新增脚本）

**关键代码 `.github/workflows/lighthouse-ci.yml`**：
```yaml
name: Lighthouse CI
on:
  pull_request:
    paths: ['src/**', 'vite.config.ts', 'package.json']
  push:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run build
      - name: Lighthouse CI
        uses: treosh/lighthouse-ci-action@v11
        with:
          configPath: '.lighthouserc.json'
          uploadArtifacts: true
```

**关键配置 `.lighthouserc.json`**：
```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:4173/",
        "http://localhost:4173/section/lost-found",
        "http://localhost:4173/post/1"
      ],
      "startServerCommand": "npm run preview"
    },
    "assert": {
      "preset": "lighthouse:recommended",
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.85 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:pwa": ["warn", { "minScore": 0.9 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 1800 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.05 }]
      }
    }
  }
}
```

**新增 npm scripts**：
```json
{
  "scripts": {
    "test:a11y": "playwright test tests/a11y",
    "lhci": "lhci autorun",
    "perf": "npm run build && npm run preview & lhci autorun",
    "pwa:dev": "vite-plugin-pwa dev (内置)"
  }
}
```

**验收**：
- [ ] GitHub PR 必跑 Lighthouse CI
- [ ] docs/WEB-EXPERIENCE-UPGRADE.md 含每个新组件的使用示例
- [ ] README "性能" 章节含真实数字

---

## 6. 跨 task 协调

### 阻塞关系
```
Task 1 (token) ──┬─→ Task 2 (skeleton 用 token 颜色)
                 ├─→ Task 5 (图表用 token)
                 ├─→ Task 6 (暗色用 token)
                 └─→ Task 9 (critical CSS 用 token 类名)

Task 1 → Task 3 (虚拟列表继承 token)
Task 1 → Task 4 (WS 客户端 store 用 token 状态色)
Task 3 → Task 9 (虚拟列表的 overscan 影响 bundle 拆分)

Task 5 ──┐
Task 6 ──┼─→ Task 7 (PWA 启动页需要正确主题)
Task 2 ──┘
```

**共享文件**：
- `tailwind.config.ts`：Task 1 / 6 改
- `vite.config.ts`：Task 7 / 9 改
- `src/App.vue`：Task 1 / 6 改
- `src/utils/api.ts`：Task 4 / 5 改
- `src/stores/app.ts`：Task 6 改

### 灰度策略
- **A/B 标记**：PWA、暗色模式用 `?v2=1` URL 参数开启，未带时回退旧版
- **管理后台 Dashboard**：仅对 `role=admin` 开放
- **虚拟滚动**：先在 `SectionPage`（数据量大的子板块）灰度，1 周后全量

### 回滚预案
- 每个 Task 独立 PR，单 PR 可单独 revert
- WS 失败兜底：自动降级为 5s 轮询（旧实现）
- PWA 失败：用户从 `chrome://apps` 卸载即可
- 暗色模式：localStorage 清空即回退

---

## 7. 风险登记

| # | 风险 | 概率 | 影响 | 缓解 | 责任人 |
|---|------|------|------|------|--------|
| R1 | WS 后端没准备好，前端先发 | 中 | 高 | 客户端内置 5s 轮询降级，握手失败立即退 | 前端 + 后端对齐人 |
| R2 | 虚拟滚动导致图片懒加载失效 | 中 | 中 | `IntersectionObserver` 与虚拟滚动独立；overscan=5 保证视口外有缓冲 | 前端 |
| R3 | PWA 缓存了旧版本 API 响应 | 中 | 中 | API GET 缓存仅 10 分钟；mutation 请求永远走网络 | 前端 |
| R4 | 暗色模式下 ECharts 主题错乱 | 中 | 低 | ECharts 主题随 `data-theme` 同步重渲 | 前端 |
| R5 | Lighthouse CI 误报导致 PR 被卡 | 高 | 低 | 阈值留 5% buffer；关键指标失败才 block | 前端 |
| R6 | Service Worker 与 Vite HMR 冲突 | 中 | 中 | 开发态用 `devOptions.enabled=true` + 明确 source map | 前端 |
| R7 | a11y 修复导致视觉降级 | 中 | 中 | 改动前 Playwright 截图基线对比 | 前端 + 设计 |
| R8 | 虚拟滚动 + 现有 `requestAnimationFrame` 滚动监听冲突 | 低 | 中 | 统一改用 `useVirtualizer` 自带事件 | 前端 |

---

## 8. 里程碑（与总方案对齐）

| 里程碑 | 本方向进度点 | 完成标志 | 估时 |
|--------|--------------|----------|------|
| M1（基线） | 启动 | 本 spec 评审通过 | 0.5d |
| M2（架构） | Task 1 完成 | token + 断点 composable 落地，所有页面迁移 | 3d |
| M3（骨架 + 列表） | Task 2 / 3 完成 | 信息流 60fps，骨架统一 | 4d |
| M4（实时） | Task 4 完成 + 后端 WS 联调 | 私信 < 400ms 端到端 | 5d |
| M5（管理可视化） | Task 5 完成 | Dashboard 4 图，< 1s 渲染 | 2d |
| M6（体验升级） | Task 6 / 7 / 8 完成 | 暗色 / PWA / a11y 全部验收 | 6d |
| M7（性能 + 收尾） | Task 9 / 10 完成 | Lighthouse CI 接通，性能达标 | 4d |

**累计估时：~24.5 工作日（1 人前端）**

---

## 9. 审查与 sign-off

### Code review checklist
- [ ] TypeScript strict 通过，`any` 出现需注释理由
- [ ] 组件 Props 用 `withDefaults` + 完整类型
- [ ] 颜色 / 间距 100% 走 token，无硬编码
- [ ] 暗色模式手动切换 3 次无报错
- [ ] PWA 离线模式可访问首页
- [ ] axe-core 8 个页面 0 严重 / 0 警告
- [ ] Lighthouse CI 必跑，性能分 ≥ 85
- [ ] 无新增 `console.log`（保留 `console.warn` for WS 异常）
- [ ] 文件大小：单文件 ≤ 300 行（超长拆 composable）

### 上线门槛（必满足任一阻塞项方可合并 main）
1. **阻塞**：性能分 < 80，a11y 严重项 > 0，bundle > 250KB gzip
2. **阻塞**：WS 握手失败时无降级
3. **阻塞**：PWA 安装后无离线页
4. **警告**：暗色模式对比度不足（≥ 4.5:1 才行）
5. **警告**：新增依赖未在 `package.json` 注释用途

### Sign-off 流程
1. PR 提交 → 自动化（Lighthouse CI + Playwright a11y）
2. 1 名前端 review + 1 名设计 review
3. 灰度 24h 无 Sentry 异常 → 全量
4. 在 `#release` 频道贴 LHCI 报告截图

---

## 项目级 todo（可立即执行）

| # | Task | 文件 / 路径 | 估时 |
|---|------|-------------|------|
| 1.1 | 创建设计 token | `src/styles/tokens.css` `src/styles/themes.css` | 0.5d |
| 1.2 | 接入断点 composable | `src/composables/useBreakpoint.ts` | 0.5d |
| 1.3 | 改 `tailwind.config.ts` + `App.vue` | 同 | 1d |
| 1.4 | 迁移 16 个页面的硬编码颜色 | `src/pages/**` `src/components/**` | 1d |
| 2.1 | 基础 Skeleton 组件 | `src/components/Skeleton.vue` | 0.5d |
| 2.2 | 业务骨架 3 个 | `PostCardSkeleton.vue` `MessageItemSkeleton.vue` `SectionGridSkeleton.vue` | 1d |
| 2.3 | 接入 3 个信息流页面 | `HomePage.vue` `SectionPage.vue` `SearchPage.vue` | 0.5d |
| 3.1 | 虚拟滚动 composable | `src/composables/useVirtualFeed.ts` | 1d |
| 3.2 | VirtualPostList 组件 | `src/components/VirtualPostList.vue` | 1d |
| 3.3 | 接入 3 个信息流页面 | 同上 | 1d |
| 3.4 | 性能回归 + 修复估计尺寸 | `useVirtualFeed.ts` | 0.5d |
| 4.1 | 基础 WebSocket composable | `src/composables/useWebSocket.ts` | 1d |
| 4.2 | 私信 / 通知封装 | `useChatSocket.ts` `useNotificationSocket.ts` | 1d |
| 4.3 | realtime store | `src/stores/realtime.ts` | 0.5d |
| 4.4 | 接入 ChatPanel + MessagePage | `src/components/ChatPanel.vue` `src/pages/MessagePage.vue` | 1d |
| 4.5 | 后端 WS 联调 + 降级测试 | 跨端 | 0.5d |
| 5.1 | 仪表盘 composable + API | `src/composables/useAdminMetrics.ts` `src/utils/api.ts` | 0.5d |
| 5.2 | 4 个图表组件 | `src/components/admin/charts/*` | 1.5d |
| 6.1 | useTheme + ThemeToggle | `src/composables/useTheme.ts` `src/components/ThemeToggle.vue` | 0.5d |
| 6.2 | 持久化到 app store | `src/stores/app.ts` | 0.5d |
| 6.3 | 16 个页面 + 图表迁移暗色 | 全部 | 2d |
| 7.1 | 准备图标 3 张 | `public/icon-{192,512}.png` `public/maskable-512.png` | 0.5d |
| 7.2 | 配置 vite-plugin-pwa | `vite.config.ts` | 0.5d |
| 7.3 | usePwaUpdate + 提示 UI | `src/composables/usePwaUpdate.ts` | 0.5d |
| 8.1 | useFocusTrap | `src/composables/useFocusTrap.ts` | 0.5d |
| 8.2 | Playwright + axe 套件 | `tests/a11y/spec.ts` | 0.5d |
| 8.3 | 修复 axe 报告 | 全部 | 2d |
| 9.1 | Vite 分包 + Brotli | `vite.config.ts` | 0.5d |
| 9.2 | 图片懒加载 composable | `src/composables/useImageLazy.ts` | 0.5d |
| 9.3 | 路由懒分包 | `src/router/index.ts` | 0.5d |
| 9.4 | Critical CSS 接入 | `vite.config.ts` (critters 插件) | 0.5d |
| 10.1 | LHCI 配置 + workflow | `.github/workflows/lighthouse-ci.yml` `.lighthouserc.json` | 0.5d |
| 10.2 | 文档 3 篇 | `docs/WEB-EXPERIENCE-UPGRADE.md` `docs/PERFORMANCE-BUDGET.md` `README.md` | 0.5d |
| 10.3 | 完整回归 | 全部 | 0.5d |

**总计：~24.5 工作日 / 1 人**
