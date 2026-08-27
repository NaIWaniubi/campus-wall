# 方向 B：微信小程序现代化 Spec

> 状态：v1.0 可执行稿 · 目标：把现有 26 页原生小程序从"功能能用、视觉陈旧、API 适配层臃肿"推进到"设计系统统一、视觉对标小红书、API 适配层解耦、性能可感知"。本文档不涉及 Web 端（方向 A），不引入 Taro/uni-app 跨端框架。
>
> 配套：复用 `2026-07-31 xiaohongshu-apple-ui` 已落 spec 的视觉方向，承接其 5 个任务但按原生小程序落地。

---

## 1. 目标与成功标准（可量）

| # | 目标 | 度量 | 验收手段 |
|---|------|------|----------|
| G1 | 设计系统统一 | app.wxss 中 `var(--*)` 引用覆盖 ≥ 95%；硬编码 hex/rpx 颜色/圆角/间距残留 ≤ 5% | grep 全仓 `#[0-9a-fA-F]{3,6}` 仅命中 token 定义文件 |
| G2 | 视觉对标小红书 | 首页/详情/发布三页视觉一致通过设计走查；PostCard 关键交互（点赞/收藏）动效 < 16ms/帧 | 截图对比 + 真机录屏 |
| G3 | API 适配层解耦 | utils/api.js 拆为 4 文件；单文件最大行数 ≤ 250；任一文件可独立单测 | 行数统计 + 单元测试通过 |
| G4 | 路径兼容无损 | 旧路径 `/post/list` 等 ≥ 20 个旧端点 100% 命中 legacy-adapter；联调回归脚本 0 失败 | `tests/legacy-routes.test.js` 全绿 |
| G5 | Skeleton 全量覆盖 | 8 大内容页首屏白屏 ≤ 200ms；Skeleton 100% 挂载 | 录屏 + DOM 检查 |
| G6 | 低端机体验 | perf-low 类名命中机型（CPU < 4 核 或 RAM < 4GB）首屏可交互 ≤ 1.5s | 真机 perf 面板 |
| G7 | 启动耗时 | 冷启动至首页首帧 ≤ 1.2s（中端机，WiFi）；按需注入 + 懒加载后包内非首屏页 ≤ 8 个 | 微信 IDE 性能 trace |
| G8 | 0 回归 | 26 页 E2E 主流程（浏览/发布/评论/通知/审核）跑通，crash 0 | 真机回归 1 轮 |

---

## 2. 范围与不做项

### 范围内（In）
- miniprogram/ 全量 26 页 + 8 组件视觉与 token 化
- utils/api.js 拆分为 request / legacy-adapter / endpoints / auth 四件套
- Skeleton 组件 + 8 大内容页挂载
- 低端机 perf-low 类名细化（动画降级、图片懒加载、首屏按需）
- app.js 启动逻辑精简（同步依赖 → 异步懒加载）

### 不做项（Out）
- ❌ 不引入 Taro / uni-app / kbone 等跨端框架（README 已锁栈）
- ❌ 不改后端契约（只做客户端路径翻译与字段归一）
- ❌ 不重做"我的"页面业务（仅跟随 token 化）
- ❌ 不动 Web 端（方向 A 单独 spec）
- ❌ 不做 i18n（当前仅中文，scope 外）
- ❌ 不引入 TypeScript（短期成本不划算，待 G3 落地后单独立项）

---

## 3. 关键技术决策

| # | 决策 | 备选 | 选定理由 |
|---|------|------|----------|
| D1 | 视觉走小红书 + Apple hybrid：白底 + 圆角 12-16rpx + 卡片阴影 + 大标题 32rpx | 纯 Apple HIG / Material You | 与 Web 端 A 方向一致；学生群体对小红书更熟悉；中性偏年轻化 |
| D2 | 设计 token 用 WXSS CSS 变量（`--color-*`），不支持 fallback 用 hardcoded 同名 | SCSS-like 预编译 / JS 主题对象 | WXSS 原生支持 `:root`/`page` 级变量；运行时换肤成本低；构建无需新增依赖 |
| D3 | utils/api.js 拆 4 文件：request（网络内核）、legacy-adapter（路径翻译）、endpoints（端点常量）、auth（鉴权封装） | 保留单文件+分区注释 / 全量重写为 class | 5 类职责本就独立，拆分是 YAGNI 反向——已有"职责混杂"就是拆分理由；与 Web 端"薄适配层"思路对齐 |
| D4 | Skeleton 用纯 WXML 占位 + 关键帧动画，不引入 npm 包 | Vant Skeleton / 自研 Canvas | 26 页体量自制够用；包体 +0KB；可与 token 系统联动 |
| D5 | perf-low 通过 wx.getSystemInfoSync 一次性判定，写 localStorage 缓存 7 天 | 每次进入重判 / 仅首次进入 | wx.getSystemInfoSync 是同步 API，每次调用有 30ms 损耗；缓存命中后 0 开销 |
| D6 | 启动期不 await 任何非首屏依赖（话题列表缓存、消息未读数等改为 onLaunch 后台 setData） | 全 await 串行 / 全部挪到首页 onLoad | onLaunch 阻塞首帧；非首屏数据晚 200ms 用户无感 |
| D7 | 端点常量 endpoints.js 走 `Object.freeze` 嵌套对象，运行时不可改 | 字符串拼接 / TS enum | 与原生 JS 兼容；写错字段名直接 TypeError，编译期无法挡但运行期早爆 |
| D8 | 路径兼容测试用 Jest + 简易 mock，CI 由开发者本地 `npm run test:legacy` 触发 | 接入微信 CI miniprogram-ci | 引入 minutest 是 scope creep；本地脚本 + 真机联调已够 |

---

## 4. 依赖项

### 工具链
- 微信开发者工具 Stable ≥ 3.7.0（支持 WXSS 变量）
- Node ≥ 16（仅本地脚本，不进包体）
- Jest 29（仅 devDependencies，测试 utils 拆分）

### 运行时
- 微信基础库 ≥ 2.30.0（CSS Variables、IntersectionObserver 已稳定）
- 后端契约：复用现有 /api/v1/* 路径，不新增

### 资源
- 图标：tabbar-icon、post-card 操作图标统一 SVG 转 base64 内联（避免 woff 体积与网络请求）
- 字体：系统字体栈 `-apple-system, "PingFang SC", sans-serif`，不引外部字体

---

## 5. 详细 task 清单（8 个）

### Task 1：design token 抽出 + 组件替换硬编码

**为什么**：当前 token 散落 app.wxss 各处，改主题/暗色模式要全局搜索替换；先建 token 表，后续 5 个 task 都靠它，**这是基建**。

**文件清单**：
- `miniprogram/app.wxss`（重写）
- `miniprogram/styles/tokens.wxss`（新建）
- `miniprogram/styles/animations.wxss`（新建）
- `miniprogram/components/post-card/post-card.wxss`（改）
- `miniprogram/components/comment-item/comment-item.wxss`（改）
- `miniprogram/components/user-row/user-row.wxss`（改）
- `miniprogram/components/conversation-item/conversation-item.wxss`（改）
- `miniprogram/components/empty-state/empty-state.wxss`（改）
- `miniprogram/components/load-more/load-more.wxss`（改）
- `miniprogram/components/subscribe-btn/subscribe-btn.wxss`（改）
- `miniprogram/components/announce-dialog/announce-dialog.wxss`（改）

**关键代码（tokens.wxss 完整定义）**：

```css
/* tokens.wxss —— 全局设计变量 */
page {
  /* 颜色：中性 */
  --color-bg: #ffffff;
  --color-bg-soft: #fafafa;
  --color-bg-muted: #f4f4f5;
  --color-bg-elevated: #ffffff;
  --color-bg-overlay: rgba(0, 0, 0, 0.45);
  --color-divider: #ececee;
  --color-text-primary: #161617;
  --color-text-secondary: #4e5969;
  --color-text-tertiary: #86909c;
  --color-text-placeholder: #c9cdd4;
  --color-text-inverse: #ffffff;

  /* 颜色：品牌 */
  --color-brand: #ff2442;          /* 小红书红 */
  --color-brand-soft: #ffe5ea;
  --color-brand-strong: #d1102d;
  --color-accent: #ffb84d;         /* 收藏/点赞高亮 */

  /* 颜色：状态 */
  --color-success: #00b42a;
  --color-warning: #ff7d00;
  --color-danger: #f53f3f;
  --color-info: #165dff;

  /* 间距（4 倍数） */
  --space-1: 4rpx;
  --space-2: 8rpx;
  --space-3: 12rpx;
  --space-4: 16rpx;
  --space-5: 20rpx;
  --space-6: 24rpx;
  --space-8: 32rpx;
  --space-10: 40rpx;
  --space-12: 48rpx;
  --space-16: 64rpx;

  /* 圆角 */
  --radius-xs: 4rpx;
  --radius-sm: 8rpx;
  --radius-md: 12rpx;
  --radius-lg: 16rpx;
  --radius-xl: 24rpx;
  --radius-pill: 999rpx;

  /* 字号 */
  --font-size-caption: 22rpx;
  --font-size-body-s: 26rpx;
  --font-size-body: 28rpx;
  --font-size-body-l: 30rpx;
  --font-size-title-s: 32rpx;
  --font-size-title: 36rpx;
  --font-size-title-l: 40rpx;
  --font-size-display: 48rpx;

  /* 字重 */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* 行高 */
  --line-height-tight: 1.3;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.7;

  /* 阴影 */
  --shadow-sm: 0 2rpx 8rpx rgba(0, 0, 0, 0.04);
  --shadow-md: 0 4rpx 16rpx rgba(0, 0, 0, 0.06);
  --shadow-lg: 0 8rpx 24rpx rgba(0, 0, 0, 0.08);

  /* 动效 */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;

  /* 布局 */
  --tabbar-height: 100rpx;
  --navbar-height: 88rpx;
  --safe-bottom: env(safe-area-inset-bottom);
}
```

**关键代码（post-card.wxss 替换示例）**：

```css
/* 替换前：硬编码散落 */
.post-card { background: #fff; border-radius: 16rpx; padding: 24rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,.06); }
.post-title { color: #161617; font-size: 32rpx; font-weight: 600; }
.post-meta  { color: #86909c; font-size: 24rpx; }

/* 替换后：token 化 */
.post-card {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  box-shadow: var(--shadow-md);
}
.post-title {
  color: var(--color-text-primary);
  font-size: var(--font-size-title-s);
  font-weight: var(--font-weight-semibold);
  line-height: var(--line-height-tight);
}
.post-meta {
  color: var(--color-text-tertiary);
  font-size: var(--font-size-caption);
}
```

**接口**：无（纯样式）。

**验收**：
- `grep -rE '#[0-9a-fA-F]{3,6}' miniprogram --include=*.wxss | grep -v tokens.wxss` 输出 ≤ 5 行
- 8 个组件 wxml 中内联 style 颜色 ≤ 3 处（例外：cover 渐变遮罩）

---

### Task 2：复用 2026-07-31 spec/plan 任务 1——全局视觉系统

**为什么**：Task 1 解决了"颜色/间距/字号"token 化，但**页面级**的导航栏、TabBar、空状态、加载态还要按小红书+Apple 风重做一次。这是 26 页的"门面"。

**文件清单**：
- `miniprogram/app.wxss`（改：全局基础样式）
- `miniprogram/app.json`（改：window 主题、tabBar 视觉）
- `miniprogram/custom-tab-bar/index.{js,json,wxml,wxss}`（改：自定义 TabBar）
- `miniprogram/components/empty-state/empty-state.wxml`（改）

**关键代码（custom-tab-bar 关键片段）**：

```xml
<!-- custom-tab-bar/index.wxml -->
<view class="tabbar {{perfLow ? 'tabbar--perf-low' : ''}}"
      style="padding-bottom: {{safeBottom}}rpx;">
  <view wx:for="{{tabs}}" wx:key="path"
        class="tabbar__item {{selected === index ? 'is-active' : ''}}"
        data-path="{{item.path}}" data-index="{{index}}"
        bindtap="switchTab">
    <image class="tabbar__icon"
           src="{{selected === index ? item.iconActive : item.icon}}"
           mode="aspectFit" />
    <text class="tabbar__label">{{item.text}}</text>
  </view>
</view>
```

```css
/* custom-tab-bar/index.wxss */
.tabbar {
  position: fixed; bottom: 0; left: 0; right: 0;
  height: var(--tabbar-height);
  background: var(--color-bg);
  border-top: 1rpx solid var(--color-divider);
  display: flex; align-items: center;
  box-shadow: 0 -2rpx 8rpx rgba(0,0,0,.02);
}
.tabbar__item { flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--space-1); }
.tabbar__icon { width: 48rpx; height: 48rpx; }
.tabbar__label { font-size: var(--font-size-caption); color: var(--color-text-tertiary); }
.tabbar__item.is-active .tabbar__label { color: var(--color-text-primary); font-weight: var(--font-weight-medium); }
.tabbar--perf-low .tabbar__item { transition: none !important; }
```

```js
// custom-tab-bar/index.js（精简）
const app = getApp()
Component({
  data: {
    selected: 0,
    safeBottom: 0,
    perfLow: false,
    tabs: [
      { path: '/pages/index/index', text: '首页',
        icon: 'assets/tab/home.png', iconActive: 'assets/tab/home-a.png' },
      { path: '/pages/topic/topic', text: '话题',
        icon: 'assets/tab/topic.png', iconActive: 'assets/tab/topic-a.png' },
      { path: '/pages/publish/publish', text: '发布',
        icon: 'assets/tab/publish.png', iconActive: 'assets/tab/publish.png' },
      { path: '/pages/message/message', text: '消息',
        icon: 'assets/tab/msg.png', iconActive: 'assets/tab/msg-a.png' },
      { path: '/pages/mine/mine', text: '我的',
        icon: 'assets/tab/mine.png', iconActive: 'assets/tab/mine-a.png' },
    ],
  },
  attached() {
    this.setData({
      safeBottom: app.globalData.safeBottom || 0,
      perfLow: app.globalData.perfLow || false,
    })
  },
  methods: {
    switchTab(e) {
      const { path, index } = e.currentTarget.dataset
      wx.switchTab({ url: path, success: () => this.setData({ selected: index }) })
    },
  },
})
```

**接口**：与 app.globalData.perfLow、safeBottom 联动（由 app.js 启动期写入）。

**验收**：
- 5 Tab 切换无白屏闪烁
- 暗色模式（手动注入 `data-theme="dark"` 验证，不在 spec 范围）视觉无穿透

---

### Task 3：复用 2026-07-31 spec/plan 任务 2——首页 feed header 改造

**为什么**：首页是流量入口，header 决定"调性"。小红书风的核心是"图片流 + 简洁分类 + 强搜索"。

**文件清单**：
- `miniprogram/pages/index/index.wxml`（改）
- `miniprogram/pages/index/index.wxss`（改）
- `miniprogram/pages/index/index.js`（改：分类 chip 数据源）
- `miniprogram/components/subscribe-btn/subscribe-btn.wxml`（小改：贴 header 入口）

**关键代码（index.wxml header 段）**：

```xml
<!-- pages/index/index.wxml：header 段 -->
<view class="home-header">
  <view class="home-header__search" bindtap="onSearchTap">
    <image class="home-header__search-icon" src="/assets/icons/search.svg" />
    <text class="home-header__search-placeholder">搜帖子、话题、同学</text>
  </view>
  <subscribe-btn class="home-header__subscribe" />
</view>

<scroll-view class="home-chips" scroll-x enhanced show-scrollbar="{{false}}">
  <view wx:for="{{categories}}" wx:key="id"
        class="home-chip {{currentCategory === item.id ? 'is-active' : ''}}"
        data-id="{{item.id}}" bindtap="onCategoryTap">
    <text>{{item.name}}</text>
  </view>
</scroll-view>

<view class="home-feed">
  <block wx:for="{{posts}}" wx:key="id">
    <post-card post="{{item}}" bind:like="onLike" bind:collect="onCollect" />
  </block>
  <load-more status="{{loadStatus}}" />
</view>
```

```css
/* index.wxss：header + chip */
.home-header {
  position: sticky; top: 0; z-index: 10;
  display: flex; align-items: center; gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-bg);
  border-bottom: 1rpx solid var(--color-divider);
}
.home-header__search {
  flex: 1; height: 64rpx; padding: 0 var(--space-4);
  background: var(--color-bg-muted);
  border-radius: var(--radius-pill);
  display: flex; align-items: center; gap: var(--space-2);
}
.home-header__search-icon { width: 32rpx; height: 32rpx; opacity: .6; }
.home-header__search-placeholder {
  color: var(--color-text-tertiary); font-size: var(--font-size-body-s);
}
.home-chips {
  white-space: nowrap; padding: var(--space-3) var(--space-4);
  background: var(--color-bg);
  border-bottom: 1rpx solid var(--color-divider);
}
.home-chip {
  display: inline-block; padding: var(--space-2) var(--space-4);
  margin-right: var(--space-2);
  border-radius: var(--radius-pill);
  font-size: var(--font-size-body); color: var(--color-text-secondary);
  background: var(--color-bg-muted);
  transition: all var(--duration-fast) var(--ease-standard);
}
.home-chip.is-active {
  background: var(--color-text-primary);
  color: var(--color-text-inverse);
  font-weight: var(--font-weight-medium);
}
```

**接口**：
- 复用 `utils/api.js#fetchPosts({ category, page, pageSize })`（待 Task 7 拆完走 endpoints.posts.list）
- 事件：`bind:like` / `bind:collect` 冒泡到 page 层

**验收**：
- 首屏 header 不跟随滚动消失（sticky 生效）
- chip 点击切换 ≤ 1 帧（用 wx:if 而非 hidden，触发 onLoad 不重）

---

### Task 4：复用 2026-07-31 spec/plan 任务 3——小红书风 PostCard

**为什么**：feed 流视觉核心。原 PostCard 偏"信息密度高"，小红书偏"图大文少、卡片立体"。

**文件清单**：
- `miniprogram/components/post-card/post-card.{wxml,wxss,js,json}`（重写）
- `miniprogram/components/post-card/skeleton.wxml`（新建）

**关键代码（post-card.wxml 完整结构）**：

```xml
<!-- components/post-card/post-card.wxml -->
<view class="post-card {{perfLow ? 'post-card--perf-low' : ''}}"
      bindtap="onTap" data-id="{{post.id}}">
  <view class="post-card__cover" wx:if="{{post.cover}}">
    <image class="post-card__image"
           src="{{post.cover}}" mode="aspectFill" lazy-load="{{true}}"
           binderror="onImgError" />
    <view class="post-card__badge" wx:if="{{post.tag}}">{{post.tag}}</view>
  </view>
  <view class="post-card__body">
    <text class="post-card__title">{{post.title}}</text>
    <text class="post-card__summary" wx:if="{{post.summary}}">{{post.summary}}</text>
    <view class="post-card__meta">
      <user-row user="{{post.author}}" compact />
      <view class="post-card__actions">
        <view class="post-card__action" catchtap="onLikeTap">
          <image src="{{post.liked ? '/assets/icons/heart-on.svg' : '/assets/icons/heart.svg'}}"
                 class="post-card__action-icon" />
          <text class="post-card__action-text">{{post.likeCount || ''}}</text>
        </view>
        <view class="post-card__action" catchtap="onCommentTap">
          <image src="/assets/icons/comment.svg" class="post-card__action-icon" />
          <text class="post-card__action-text">{{post.commentCount || ''}}</text>
        </view>
      </view>
    </view>
  </view>
</view>
```

```css
/* post-card.wxss */
.post-card {
  background: var(--color-bg-elevated);
  border-radius: var(--radius-lg);
  overflow: hidden;
  margin: var(--space-3) var(--space-4);
  box-shadow: var(--shadow-sm);
  transition: transform var(--duration-fast) var(--ease-standard),
              box-shadow var(--duration-fast) var(--ease-standard);
}
.post-card:active { transform: scale(0.98); box-shadow: var(--shadow-md); }
.post-card__cover { position: relative; width: 100%; aspect-ratio: 4 / 3; background: var(--color-bg-muted); }
.post-card__image { width: 100%; height: 100%; display: block; }
.post-card__badge {
  position: absolute; top: var(--space-3); left: var(--space-3);
  padding: var(--space-1) var(--space-2);
  background: var(--color-bg-overlay);
  color: var(--color-text-inverse);
  font-size: var(--font-size-caption);
  border-radius: var(--radius-xs);
  backdrop-filter: blur(8rpx);
}
.post-card__body { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); }
.post-card__title {
  font-size: var(--font-size-body-l);
  font-weight: var(--font-weight-semibold);
  color: var(--color-text-primary);
  line-height: var(--line-height-tight);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden;
}
.post-card__summary {
  font-size: var(--font-size-body-s);
  color: var(--color-text-secondary);
  line-height: var(--line-height-normal);
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  overflow: hidden;
}
.post-card__meta { display: flex; align-items: center; justify-content: space-between; margin-top: var(--space-2); }
.post-card__actions { display: flex; gap: var(--space-4); }
.post-card__action { display: flex; align-items: center; gap: var(--space-1); }
.post-card__action-icon { width: 32rpx; height: 32rpx; }
.post-card__action-text { font-size: var(--font-size-caption); color: var(--color-text-tertiary); }
.post-card--perf-low { transition: none !important; box-shadow: var(--shadow-sm); }
```

```js
// post-card.js
Component({
  options: { styleIsolation: 'apply-shared' },
  properties: {
    post: { type: Object, value: {} },
  },
  data: { perfLow: false },
  attached() { this.setData({ perfLow: getApp().globalData.perfLow || false }) },
  methods: {
    onTap(e) { this.triggerEvent('tap', { id: this.data.post.id }) },
    onLikeTap() {
      this.triggerEvent('like', { id: this.data.post.id, liked: !this.data.post.liked })
    },
    onCommentTap() {
      this.triggerEvent('comment', { id: this.data.post.id })
    },
    onImgError(e) { console.warn('post cover load fail', e) },
  },
})
```

**接口**：
- 事件：`tap` / `like` / `comment`
- 属性：`post: { id, title, summary, cover, tag, author, likeCount, commentCount, liked }`

**验收**：
- 点击卡片波纹 ≤ 16ms（真机 trace）
- lazy-load 生效（图片未到可视区不发起请求）
- perf-low 模式下无 transform 动画

---

### Task 5：复用 2026-07-31 spec/plan 任务 4——详情阅读体验

**为什么**：详情页 300 行是仓库最大页面，承载发布者头像、正文、评论、图片、底部操作栏；阅读体验差直接劝退。

**文件清单**：
- `miniprogram/pages/detail/detail.{wxml,wxss,js}`（重写）
- `miniprogram/components/comment-item/comment-item.wxml`（小改）

**关键代码（detail.wxml 主体）**：

```xml
<!-- pages/detail/detail.wxml -->
<view class="detail {{perfLow ? 'detail--perf-low' : ''}}">
  <view class="detail__header">
    <user-row user="{{post.author}}" followable />
    <text class="detail__time">{{post.createdAtRelative}}</text>
  </view>
  <view class="detail__title">{{post.title}}</view>
  <view class="detail__content">
    <block wx:for="{{post.contentBlocks}}" wx:key="idx">
      <text wx:if="{{item.type === 'text'}}" class="detail__paragraph">{{item.text}}</text>
      <image wx:elif="{{item.type === 'image'}}"
             class="detail__image"
             src="{{item.url}}" mode="widthFix" lazy-load
             data-src="{{item.url}}"
             bindtap="onImagePreview" />
    </block>
  </view>
  <view class="detail__tags">
    <text wx:for="{{post.tags}}" wx:key="*this" class="detail__tag">#{{item}}</text>
  </view>
  <view class="detail__comments">
    <view class="detail__comments-header">评论 {{post.commentCount}}</view>
    <block wx:for="{{comments}}" wx:key="id">
      <comment-item comment="{{item}}" bind:reply="onReply" />
    </block>
    <load-more status="{{commentLoadStatus}}" />
  </view>

  <view class="detail__actionbar" style="padding-bottom: {{safeBottom}}rpx;">
    <view class="detail__actionbar-input" bindtap="onCommentFocus">
      <text class="detail__actionbar-placeholder">说点什么…</text>
    </view>
    <view class="detail__actionbar-btn" catchtap="onLikeTap">
      <image src="{{post.liked ? '/assets/icons/heart-on.svg' : '/assets/icons/heart.svg'}}" />
      <text>{{post.likeCount || '点赞'}}</text>
    </view>
    <view class="detail__actionbar-btn" catchtap="onCollectTap">
      <image src="{{post.collected ? '/assets/icons/star-on.svg' : '/assets/icons/star.svg'}}" />
      <text>{{post.collected ? '已收藏' : '收藏'}}</text>
    </view>
    <button class="detail__actionbar-share" open-type="share">
      <image src="/assets/icons/share.svg" />
    </button>
  </view>
</view>
```

```css
/* detail.wxss 关键段 */
.detail { padding-bottom: calc(120rpx + var(--safe-bottom)); background: var(--color-bg); }
.detail__header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); }
.detail__time { color: var(--color-text-tertiary); font-size: var(--font-size-caption); }
.detail__title { padding: 0 var(--space-4) var(--space-3); font-size: var(--font-size-title); font-weight: var(--font-weight-bold); line-height: var(--line-height-tight); color: var(--color-text-primary); }
.detail__paragraph { display: block; padding: var(--space-2) var(--space-4); font-size: var(--font-size-body); line-height: var(--line-height-relaxed); color: var(--color-text-primary); }
.detail__image { width: 100%; margin: var(--space-3) 0; }
.detail__tags { padding: var(--space-2) var(--space-4); }
.detail__tag { display: inline-block; margin-right: var(--space-2); color: var(--color-info); font-size: var(--font-size-body-s); }
.detail__actionbar { position: fixed; left: 0; right: 0; bottom: 0; height: calc(100rpx + var(--safe-bottom)); background: var(--color-bg); border-top: 1rpx solid var(--color-divider); display: flex; align-items: center; gap: var(--space-2); padding: 0 var(--space-3); z-index: 20; }
.detail__actionbar-input { flex: 1; height: 64rpx; background: var(--color-bg-muted); border-radius: var(--radius-pill); display: flex; align-items: center; padding: 0 var(--space-4); }
.detail__actionbar-placeholder { color: var(--color-text-tertiary); font-size: var(--font-size-body-s); }
.detail__actionbar-btn { display: flex; flex-direction: column; align-items: center; gap: 2rpx; min-width: 80rpx; }
.detail__actionbar-btn image { width: 40rpx; height: 40rpx; }
.detail__actionbar-btn text { font-size: var(--font-size-caption); color: var(--color-text-secondary); }
```

**接口**：
- 复用 `endpoints.posts.get(id)` / `endpoints.comments.list(postId, page)`（待 Task 7 落地）
- 事件：`bind:reply` 由 comment-item 冒泡

**验收**：
- 长文（≥ 2000 字）渲染 FPS ≥ 50
- 图片点击进入 wx.previewView 正常
- 键盘弹起时 actionbar 不被遮挡（adjustKeyboard 实验）

---

### Task 6：复用 2026-07-31 spec/plan 任务 5——发布 Apple 风表单

**为什么**：发布是漏斗关键节点；原 364 行 publish.js 写满了"业务规则 + UI 状态 + 草稿保存"，表单本身视觉陈旧。

**文件清单**：
- `miniprogram/pages/publish/publish.{wxml,wxss,js}`（重写）
- `miniprogram/components/announce-dialog/announce-dialog.wxml`（小改：发版协议）

**关键代码（publish.wxml 精简结构）**：

```xml
<!-- pages/publish/publish.wxml -->
<view class="publish">
  <view class="publish__chips">
    <view wx:for="{{categories}}" wx:key="id"
          class="publish__chip {{form.category === item.id ? 'is-active' : ''}}"
          data-id="{{item.id}}" bindtap="onCategoryTap">
      <image wx:if="{{item.icon}}" src="{{item.icon}}" class="publish__chip-icon" />
      <text>{{item.name}}</text>
    </view>
  </view>

  <view class="publish__field">
    <input class="publish__title"
           placeholder="一句话标题（必填）"
           placeholder-class="publish__placeholder"
           value="{{form.title}}"
           maxlength="40"
           bindinput="onTitleInput" />
  </view>

  <view class="publish__field publish__field--textarea">
    <textarea class="publish__content"
              placeholder="详细说说吧～支持换行"
              placeholder-class="publish__placeholder"
              value="{{form.content}}"
              maxlength="2000"
              auto-height
              bindinput="onContentInput" />
    <view class="publish__counter">{{form.content.length}}/2000</view>
  </view>

  <view class="publish__media">
    <view wx:for="{{form.media}}" wx:key="idx" class="publish__media-item">
      <image src="{{item.url}}" mode="aspectFill" />
      <view class="publish__media-remove" catchtap="onMediaRemove" data-idx="{{idx}}">×</view>
    </view>
    <view wx:if="{{form.media.length < 9}}" class="publish__media-add" bindtap="onMediaAdd">
      <text>+</text>
    </view>
  </view>

  <view class="publish__options">
    <view class="publish__switch" bindtap="onAnonymousToggle">
      <text>匿名发布</text>
      <switch checked="{{form.anonymous}}" color="var(--color-brand)" disabled />
    </view>
    <view class="publish__switch" bindtap="onCommentToggle">
      <text>允许评论</text>
      <switch checked="{{form.allowComment}}" color="var(--color-brand)" disabled />
    </view>
  </view>

  <view class="publish__submitbar" style="padding-bottom: {{safeBottom}}rpx;">
    <view class="publish__draft" bindtap="onSaveDraft">存草稿</view>
    <button class="publish__submit" bindtap="onSubmit"
            disabled="{{!canSubmit}}">发布</button>
  </view>
</view>
```

```css
/* publish.wxss 关键段 */
.publish { min-height: 100vh; background: var(--color-bg); padding-bottom: calc(140rpx + var(--safe-bottom)); }
.publish__chips { display: flex; gap: var(--space-2); padding: var(--space-4); overflow-x: auto; }
.publish__chip { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-2) var(--space-4); background: var(--color-bg-muted); border-radius: var(--radius-pill); font-size: var(--font-size-body-s); color: var(--color-text-secondary); white-space: nowrap; }
.publish__chip.is-active { background: var(--color-text-primary); color: var(--color-text-inverse); font-weight: var(--font-weight-medium); }
.publish__chip-icon { width: 28rpx; height: 28rpx; }
.publish__field { padding: var(--space-4); border-bottom: 1rpx solid var(--color-divider); }
.publish__title { font-size: var(--font-size-title-s); font-weight: var(--font-weight-semibold); color: var(--color-text-primary); }
.publish__content { width: 100%; min-height: 240rpx; font-size: var(--font-size-body); line-height: var(--line-height-relaxed); }
.publish__placeholder { color: var(--color-text-placeholder); }
.publish__counter { text-align: right; color: var(--color-text-tertiary); font-size: var(--font-size-caption); margin-top: var(--space-2); }
.publish__media { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: var(--space-4); }
.publish__media-item { position: relative; width: 200rpx; height: 200rpx; border-radius: var(--radius-md); overflow: hidden; }
.publish__media-item image { width: 100%; height: 100%; }
.publish__media-remove { position: absolute; top: 4rpx; right: 4rpx; width: 40rpx; height: 40rpx; background: var(--color-bg-overlay); color: var(--color-text-inverse); border-radius: 50%; text-align: center; line-height: 40rpx; font-size: 32rpx; }
.publish__media-add { width: 200rpx; height: 200rpx; border: 2rpx dashed var(--color-divider); border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center; color: var(--color-text-tertiary); font-size: 60rpx; }
.publish__submitbar { position: fixed; left: 0; right: 0; bottom: 0; height: calc(120rpx + var(--safe-bottom)); background: var(--color-bg); border-top: 1rpx solid var(--color-divider); display: flex; align-items: center; gap: var(--space-3); padding: 0 var(--space-4); }
.publish__draft { color: var(--color-text-secondary); font-size: var(--font-size-body); padding: var(--space-3); }
.publish__submit { flex: 1; height: 80rpx; background: var(--color-brand); color: var(--color-text-inverse); border-radius: var(--radius-pill); font-size: var(--font-size-body); font-weight: var(--font-weight-medium); border: none; }
.publish__submit[disabled] { background: var(--color-bg-muted); color: var(--color-text-placeholder); }
```

**接口**：
- 提交走 `endpoints.posts.create(form)`（待 Task 7）
- 草稿落 `wx.setStorageSync('publish:draft:<userId>', form)`，恢复时倒序展示

**验收**：
- 必填校验：标题为空/内容为空时 canSubmit=false
- 草稿恢复：杀进程重进仍在
- 9 图上限 hard-cap

---

### Task 7：utils/api.js 拆 4 文件 + 路径兼容测试

**为什么**：api.js 599 行同时承担 5 类职责（路径映射、方法改写、参数归一、响应归一、降级短路），任何改动都牵动 26 页。**这是仓库最大的单点技术债**。

**文件清单**（新建）：
- `miniprogram/utils/request.js`（约 180 行）
- `miniprogram/utils/endpoints.js`（约 90 行）
- `miniprogram/utils/legacy-adapter.js`（约 200 行）
- `miniprogram/utils/auth.js`（约 60 行）
- `miniprogram/utils/api.js`（改：仅 re-export + 顶层兼容垫片，约 30 行）
- `tests/legacy-routes.test.js`（新建）

**依赖关系**：

```
api.js (facade)
  ├─→ request.js      (wx.request 封装 + 重试 + 鉴权注入)
  │     └─→ auth.js   (token 读写 + 刷新)
  ├─→ endpoints.js    (端点常量)
  └─→ legacy-adapter.js (旧路径→新契约)
        └─→ endpoints.js
              └─→ request.js
```

**关键代码（endpoints.js）**：

```js
// utils/endpoints.js
const E = (path) => `/api/v1${path}`
const POSTS = Object.freeze({
  list:   E('/posts'),
  get:    (id) => E(`/posts/${id}`),
  create: E('/posts'),
  update: (id) => E(`/posts/${id}`),
  remove: (id) => E(`/posts/${id}`),
  like:   (id) => E(`/posts/${id}/like`),
  collect:(id) => E(`/posts/${id}/collect`),
})
const COMMENTS = Object.freeze({
  list:   (postId) => E(`/posts/${postId}/comments`),
  create: (postId) => E(`/posts/${postId}/comments`),
})
const USERS = Object.freeze({
  me:        E('/users/me'),
  get:       (id) => E(`/users/${id}`),
  posts:     (id) => E(`/users/${id}/posts`),
})
// ... 其余板块（trade/lost/confession 等）同样形态

module.exports = { POSTS, COMMENTS, USERS, /* ... */ }
```

**关键代码（legacy-adapter.js 关键段）**：

```js
// utils/legacy-adapter.js —— 把 5 类职责里的"路径翻译+方法改写"搬过来
const endpoints = require('./endpoints')
const request = require('./request')

// 旧端点 → 新端点 映射表
const LEGACY_MAP = Object.freeze({
  '/post/list':         { method: 'GET',  newEndpoint: endpoints.POSTS.list },
  '/post/detail':       { method: 'GET',  newEndpoint: (p) => endpoints.POSTS.get(p.id) },
  '/post/publish':      { method: 'POST', newEndpoint: endpoints.POSTS.create },
  '/post/like':         { method: 'POST', newEndpoint: (p) => endpoints.POSTS.like(p.postId) },
  '/post/collect':      { method: 'POST', newEndpoint: (p) => endpoints.POSTS.collect(p.postId) },
  '/comment/list':      { method: 'GET',  newEndpoint: (p) => endpoints.COMMENTS.list(p.postId) },
  '/comment/publish':   { method: 'POST', newEndpoint: (p) => endpoints.COMMENTS.create(p.postId) },
  '/user/info':         { method: 'GET',  newEndpoint: (p) => endpoints.USERS.get(p.uid) },
  // ... 累计 ≥ 20 个旧端点
})

// 旧参数名 → 新参数名 归一
const PARAM_ALIAS = Object.freeze({
  uid: 'userId', postId: 'id', pageNo: 'page', pageSize: 'pageSize',
})

function normalizeParams(params = {}) {
  const out = {}
  for (const k of Object.keys(params)) {
    const realKey = PARAM_ALIAS[k] || k
    out[realKey] = params[k]
  }
  return out
}

function adapt(path, params) {
  const entry = LEGACY_MAP[path]
  if (!entry) throw new Error(`Unknown legacy path: ${path}`)
  const ep = typeof entry.newEndpoint === 'function' ? entry.newEndpoint(params) : entry.newEndpoint
  return { method: entry.method, endpoint: ep, params: normalizeParams(params) }
}

// 顶层入口：业务代码继续用 fetchPostList({...}) 这种具名方法
function fetchPostList(params) {
  const { method, endpoint, params: p } = adapt('/post/list', params)
  return request.request(method, endpoint, p)
}
// ... 其他具名导出（fetchPostDetail、fetchPostPublish、...）

module.exports = { adapt, fetchPostList /* ... */, LEGACY_MAP }
```

**关键代码（request.js 关键段）**：

```js
// utils/request.js
const auth = require('./auth')

const DEFAULT_OPTS = Object.freeze({
  baseURL: '',  // 已由 endpoints 拼好
  timeout: 12000,
  retries: 1,
})

function request(method, endpoint, data = {}, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts }
  const header = { 'content-type': 'application/json' }
  const token = auth.getToken()
  if (token) header.Authorization = `Bearer ${token}`

  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      wx.request({
        url: endpoint, method, data, header, timeout: o.timeout,
        success: (res) => {
          // 响应归一：后端 {code, data, msg} / {errno, result, message} 双形态
          const body = res.data || {}
          if (res.statusCode === 401) return auth.handle401().then(() => attempt(n)).catch(reject)
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const code = body.code ?? body.errno ?? 0
            if (code === 0) return resolve(body.data ?? body.result)
            return reject(new ApiError(code, body.msg || body.message))
          }
          if (n > 0) return setTimeout(() => attempt(n - 1), 500)
          reject(new ApiError(res.statusCode, 'network error'))
        },
        fail: (err) => {
          if (n > 0) return setTimeout(() => attempt(n - 1), 500)
          reject(new ApiError(-1, err.errMsg))
        },
      })
    }
    attempt(o.retries)
  })
}

class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code }
}

module.exports = { request, ApiError }
```

**关键代码（auth.js 关键段）**：

```js
// utils/auth.js
const TOKEN_KEY = 'auth:token'
const REFRESH_KEY = 'auth:refresh'

function getToken() { return wx.getStorageSync(TOKEN_KEY) || '' }
function setToken(t) { wx.setStorageSync(TOKEN_KEY, t) }
function clearToken() { wx.removeStorageSync(TOKEN_KEY); wx.removeStorageSync(REFRESH_KEY) }

async function handle401() {
  // 单一职责：401 时的刷新策略
  const refresh = wx.getStorageSync(REFRESH_KEY)
  if (!refresh) throw new Error('no refresh token')
  const res = await wx.request({ url: '/api/v1/auth/refresh', method: 'POST', data: { refresh } })
  if (res.statusCode === 200 && res.data?.data?.token) {
    setToken(res.data.data.token)
    return res.data.data.token
  }
  clearToken()
  throw new Error('refresh failed')
}

module.exports = { getToken, setToken, clearToken, handle401 }
```

**关键代码（api.js facade）**：

```js
// utils/api.js —— 仅 re-export 兼容垫片，业务代码迁移期双轨
module.exports = {
  ...require('./legacy-adapter'),
  request: require('./request').request,
  endpoints: require('./endpoints'),
  auth: require('./auth'),
}
```

**关键代码（tests/legacy-routes.test.js 关键段）**：

```js
// tests/legacy-routes.test.js
const { adapt, LEGACY_MAP } = require('../miniprogram/utils/legacy-adapter')

describe('legacy path 兼容', () => {
  test('所有声明的旧端点都被映射', () => {
    expect(Object.keys(LEGACY_MAP).length).toBeGreaterThanOrEqual(20)
  })
  test('/post/list 翻译为 GET /api/v1/posts', () => {
    const r = adapt('/post/list', { page: 1, pageSize: 20 })
    expect(r.method).toBe('GET')
    expect(r.endpoint).toBe('/api/v1/posts')
  })
  test('/post/detail 用 id 拼装', () => {
    const r = adapt('/post/detail', { id: 42 })
    expect(r.endpoint).toBe('/api/v1/posts/42')
  })
  test('uid 别名归一为 userId', () => {
    const r = adapt('/user/info', { uid: 7 })
    expect(r.params.userId).toBe(7)
    expect(r.params.uid).toBeUndefined()
  })
  test('未声明路径抛错而非静默', () => {
    expect(() => adapt('/no/such/path', {})).toThrow(/Unknown legacy path/)
  })
})
```

**接口**：业务侧 0 改动，迁移期 6 个月内逐步把 `fetchPostList` 替换为 `endpoints.POSTS.list + request.request('GET', ...)`。

**验收**：
- utils/ 下任一单文件 ≤ 250 行
- `npm run test:legacy` 100% 通过
- 联调 5 业务（首页/详情/发布/评论/消息）无 regression

---

### Task 8：Skeleton 组件 + 8 大页面挂载 + 低端机 perf-low 进一步 + 启动耗时

**为什么**：首屏白屏是"现代化"的最后一公里；perf-low 进一步把动画/图片懒加载/同步调用三件套做透；启动耗时直接拉新留。

**文件清单**：
- `miniprogram/components/skeleton/skeleton.{wxml,wxss,js,json}`（新建）
- `miniprogram/pages/{index,detail,publish,search,message/message,message/chat/chat,mine,topic,category/*}/page.{wxml}`（8 大页加 Skeleton）
- `miniprogram/app.js`（精简）
- `miniprogram/utils/perf.js`（新建）

**关键代码（skeleton.wxml）**：

```xml
<!-- components/skeleton/skeleton.wxml -->
<view class="skeleton {{loading ? 'is-loading' : ''}} {{perfLow ? 'skeleton--perf-low' : ''}}">
  <view wx:if="{{type === 'card'}}" class="skeleton__card">
    <view class="skeleton__cover skeleton__shimmer" />
    <view class="skeleton__line skeleton__shimmer" style="width: 80%;" />
    <view class="skeleton__line skeleton__shimmer" style="width: 60%;" />
    <view class="skeleton__row">
      <view class="skeleton__avatar skeleton__shimmer" />
      <view class="skeleton__line skeleton__shimmer" style="width: 30%;" />
    </view>
  </view>
  <view wx:elif="{{type === 'detail'}}" class="skeleton__detail">
    <view class="skeleton__row">
      <view class="skeleton__avatar skeleton__shimmer" />
      <view class="skeleton__line skeleton__shimmer" style="width: 40%;" />
    </view>
    <view class="skeleton__line skeleton__shimmer" style="width: 90%;" />
    <view class="skeleton__line skeleton__shimmer" style="width: 70%;" />
    <view class="skeleton__line skeleton__shimmer" style="width: 85%;" />
  </view>
  <view wx:elif="{{type === 'list'}}" class="skeleton__list">
    <view wx:for="{{rows || 6}}" wx:key="*this" class="skeleton__list-row">
      <view class="skeleton__avatar skeleton__shimmer" />
      <view class="skeleton__line skeleton__shimmer" style="width: 70%;" />
    </view>
  </view>
</view>
```

```css
/* skeleton.wxss */
.skeleton { padding: var(--space-4); }
.skeleton__card, .skeleton__detail { display: flex; flex-direction: column; gap: var(--space-3); }
.skeleton__cover { width: 100%; aspect-ratio: 4/3; border-radius: var(--radius-md); }
.skeleton__line { height: 28rpx; border-radius: var(--radius-sm); }
.skeleton__avatar { width: 64rpx; height: 64rpx; border-radius: 50%; flex-shrink: 0; }
.skeleton__row { display: flex; align-items: center; gap: var(--space-3); }
.skeleton__shimmer {
  background: linear-gradient(90deg, var(--color-bg-muted) 25%, #e8e8ea 50%, var(--color-bg-muted) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite linear;
}
.skeleton--perf-low .skeleton__shimmer { animation: none; background: var(--color-bg-muted); }
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
```

```js
// skeleton.js
Component({
  properties: {
    loading: { type: Boolean, value: true },
    type:    { type: String, value: 'card' },   // card | detail | list
    rows:    { type: Number, value: 6 },
  },
  data: { perfLow: false },
  attached() { this.setData({ perfLow: getApp().globalData.perfLow || false }) },
})
```

**关键代码（pages/index/index.wxml 挂载示例）**：

```xml
<view class="home">
  <view wx:if="{{initialLoading}}" class="home__skeleton">
    <skeleton type="card" loading="{{true}}" />
    <skeleton type="card" loading="{{true}}" />
  </view>
  <block wx:else>
    <!-- 原有 header + chips + feed -->
  </block>
</view>
```

**关键代码（utils/perf.js）**：

```js
// utils/perf.js —— 启动期一次性判定 + 缓存 7 天
const KEY = 'sys:perf-low'
const TTL = 7 * 24 * 60 * 60 * 1000

function detect() {
  const cached = wx.getStorageSync(KEY)
  if (cached && Date.now() - cached.t < TTL) return cached.v
  let perfLow = false
  try {
    const sys = wx.getSystemInfoSync()
    const cores = sys.cpuCoreCount || 4
    const mem = (sys.memorySize || 4096) / 1024  // MB
    const modelBad = /(vivo|oppo|redmi|honor|huawei-nova)/i.test(sys.model || '')
    perfLow = cores < 4 || mem < 4 || modelBad
  } catch (e) { perfLow = false }
  wx.setStorageSync(KEY, { t: Date.now(), v: perfLow })
  return perfLow
}

module.exports = { detect }
```

**关键代码（app.js 启动精简）**：

```js
// app.js —— 移除同步 await，挪到首页 onLoad
App({
  globalData: {
    userInfo: null,
    perfLow: false,
    safeBottom: 0,
    unreadCount: 0,
  },
  onLaunch() {
    // 同步：仅系统信息（用于 perf-low 判定，必须在首屏前）
    this.globalData.perfLow = require('./utils/perf').detect()
    try {
      const win = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.globalData.safeBottom = win.safeArea?.bottom ? win.screenHeight - win.safeArea.bottom : 0
    } catch (e) {}

    // 异步：非首屏依赖，挪到后台
    setTimeout(() => this._lazyInit(), 0)
  },
  _lazyInit() {
    // token 刷新、未读数、话题缓存等
    const auth = require('./utils/auth')
    auth.getToken() // 预热 storage 读
  },
})
```

**接口**：Skeleton 组件 props（loading/type/rows）；perf.detect() 同步。

**验收**：
- 8 大页 Skeleton 100% 挂载，DOM 中可查到 `<skeleton>`
- perf-low 类名注入：进入开发者工具"性能"面板，调低端机模拟，类名命中
- 冷启动至首帧 ≤ 1.2s（中端机 WiFi）

---

## 6. 跨 task 协调

| 协调点 | 涉及 task | 协议 |
|--------|-----------|------|
| `app.globalData.perfLow` | 2、4、5、6、8 | Task 8 在 onLaunch 写入；其他 task 在 component.attached 中读 |
| `endpoints.*` 命名 | 5、6、7 | Task 7 落地前先用 utils/api.js 旧具名；Task 7 完成后**一次性 grep 替换**，不跨 task 渐进 |
| `var(--*)` token | 1、2、3、4、5、6、8 | Task 1 必须先完成；后续 task 写 wxss 强制要求 token，code review 卡 |
| Skeleton 形态 | 8 | 与 Task 3/4/5 页面结构对齐；若页面布局调整，Skeleton 同步改 |
| `bind:like` / `bind:collect` 事件 | 4、5 | Task 4 在 PostCard 触发，Task 5 在 detail 复用同事件名 |
| auth token 注入 | 7 | request.js 内部从 auth.js 读；业务代码不接触 token |

**顺序约束（强）**：
1 → 2 → 3 → 4 → 5 → 6（视觉链）必须串行
7 与视觉链可**并行**（无代码冲突，但建议先 7 后 5/6，避免边改业务边改 utils）
8 依赖 2/3/4/5/6 全部完成，再挂 Skeleton 与 perf 检测

---

## 7. 风险登记

| # | 风险 | 概率 | 影响 | 缓解 |
|---|------|------|------|------|
| R1 | WXSS 变量在 iOS 13 基础库下 fallback 失败（老款 iPhone） | 中 | 中 | 关键变量在 selectors 内联一份 hex；CI 真机回归 iPhone 8 |
| R2 | 拆分 utils/api.js 后业务侧 26 页引入路径需批量更新，迁移期双轨易混 | 高 | 高 | api.js 留 facade；每个文件 import 走 subpath；ESLint 自定义规则禁止 `require('./api')` 后再 `fetchXxx` |
| R3 | 路径兼容表 20+ 旧端点覆盖不全，存量页面 NPE | 中 | 高 | 跑现有 26 页 e2e 抓所有 `request` 调用；对照适配表做覆盖率报告，< 100% 阻塞合并 |
| R4 | perf-low 误判：旗舰机被归类为低端 → 体验降级 | 中 | 中 | 缓存 7 天 + 用户可在"设置"手动关闭降级（scope 外但留入口） |
| R5 | Skeleton 与真实内容替换瞬间闪烁 | 中 | 低 | loading=true 时 opacity 0→1 加 200ms 过渡；wx:if 切，避免 hidden |
| R6 | 小红书风版权风险（图标/字体） | 低 | 中 | 图标全部自制或开源（heroicons / lucide 风格）；字体用系统栈 |
| R7 | 启动期 setTimeout 0 在 iOS 后台被节流导致未读数延迟 | 中 | 低 | 改为首页 onLoad 触发，不依赖 onLaunch |
| R8 | 8 组件 PostCard 重写后，原有 `onLike` 自定义逻辑丢失 | 中 | 中 | 迁移前用 `git grep` 列出所有 `bind:like` 消费者；保留事件签名 |
| R9 | 端点常量 endpoints.js 嵌套函数表达式在低版本基础库下 prototype 不可枚举 | 低 | 低 | 仅取用，Object.freeze 即可，不依赖枚举 |
| R10 | 启动耗时优化挪到 onLoad 后，冷启动首页短暂不显示未读数小红点 | 中 | 低 | tabbar 自己起 wx.getStorage 同步读，命中缓存则 0 延迟 |

---

## 8. 里程碑

| M | 完成定义 | 估时 |
|---|----------|------|
| M1 (D+3) | Task 1 完成（token 系统 + 8 组件替换） | 3d |
| M2 (D+5) | Task 2 完成（全局视觉 + TabBar） | 2d |
| M3 (D+8) | Task 3 完成（首页 header + chips） | 3d |
| M4 (D+10) | Task 4 完成（PostCard） | 2d |
| M5 (D+13) | Task 5 完成（详情页） | 3d |
| M6 (D+16) | Task 6 完成（发布页） | 3d |
| M7 (D+20) | Task 7 完成（utils 拆分 + 测试） | 4d |
| M8 (D+24) | Task 8 完成（Skeleton + perf + 启动） | 4d |
| M9 (D+26) | 全量回归 + sign-off | 2d |

总周期：~26 工作日（约 5 周）。M3-M6 视觉链与 M7 utils 拆分可在 D+8 起并行（双线 1 人或 2 人）。

---

## 9. 审查与 sign-off

| 阶段 | 审查人 | 通过标准 | 输出物 |
|------|--------|----------|--------|
| 设计走查 | 设计 + 1 名学生代表 | 视觉与小红书+Apple hybrid 一致；26 页 token 化无遗漏 | 走查截图 + 评审纪要 |
| 代码 review | Tech Lead | 8 task 代码符合本 spec；ESLint 0 错；wxss 变量覆盖 ≥ 95% | PR + 评审评论 |
| 联调 | 后端 + 前端 | legacy-routes 100% 通过；26 页 e2e 跑通 | 测试报告 |
| 真机回归 | QA | 中端机 0 crash；低端机 perf-low 命中；首屏 ≤ 1.2s | 真机录屏 + perf trace |
| Sign-off | PM + Tech Lead | G1-G8 全部达标 | 发布 checklist |

---

## 附录 A：项目级 todo 列表（落地用）

> 建议复制到 `miniprogram/MODERNIZATION-TODO.md` 或仓库 `TODO.md`，每完成一项打勾。

- [ ] **T1.1** 新建 `miniprogram/styles/tokens.wxss` 并定义全部 CSS 变量
- [ ] **T1.2** 在 `app.wxss` 顶部 `@import './styles/tokens.wxss';`
- [ ] **T1.3** `animations.wxss` 抽出关键帧（fade-in / shimmer / slide-up）
- [ ] **T1.4** PostCard 替换为 token 引用
- [ ] **T1.5** CommentItem / UserRow / ConversationItem / EmptyState / LoadMore / SubscribeBtn / AnnounceDialog 依次替换
- [ ] **T1.6** `grep -rE '#[0-9a-fA-F]{3,6}' miniprogram --include=*.wxss | grep -v tokens.wxss` 验证 ≤ 5 行
- [ ] **T2.1** `custom-tab-bar/index.wxml/wxss/js` 重写，5 Tab 视觉统一
- [ ] **T2.2** `app.json` window 主题、tabBar 自定义开关核对
- [ ] **T2.3** `empty-state` 组件加 emoji 化图标 + token
- [ ] **T3.1** `pages/index/index.wxml` 拆出 header + chips + feed 三段
- [ ] **T3.2** 分类 chip 数据源从 `category.js` 注入
- [ ] **T3.3** sticky header 滚动验证
- [ ] **T4.1** `post-card.wxml/wxss/js` 重写
- [ ] **T4.2** 图标资源 `assets/icons/{heart,heart-on,comment,share,star,star-on,search}.svg` 落地
- [ ] **T4.3** lazy-load 与 perf-low 类名贯通
- [ ] **T5.1** `pages/detail/detail.wxml/wxss/js` 重写（300 行 → 约 220 行）
- [ ] **T5.2** contentBlocks 块渲染（text/image 分离）
- [ ] **T5.3** 底部 actionbar 固定 + 键盘 adapt
- [ ] **T6.1** `pages/publish/publish.wxml/wxss/js` 重写（364 行 → 约 260 行）
- [ ] **T6.2** 草稿 storage key 与恢复逻辑
- [ ] **T6.3** 9 图上限 + 字符计数
- [ ] **T7.1** 新建 `utils/endpoints.js`
- [ ] **T7.2** 新建 `utils/request.js`
- [ ] **T7.3** 新建 `utils/auth.js`
- [ ] **T7.4** 新建 `utils/legacy-adapter.js`，搬 5 类职责的"路径翻译+方法改写"
- [ ] **T7.5** `utils/api.js` 改为 facade re-export
- [ ] **T7.6** `package.json` 加 `npm run test:legacy`，接 jest
- [ ] **T7.7** `tests/legacy-routes.test.js` 覆盖 ≥ 20 旧端点
- [ ] **T7.8** 26 页 e2e 联调，确认 0 regression
- [ ] **T8.1** 新建 `components/skeleton/skeleton.{wxml,wxss,js,json}`
- [ ] **T8.2** 8 大页 `initialLoading` 状态位 + Skeleton 挂载（index/detail/publish/search/message/message/chat/chat/mine/topic/category/*）
- [ ] **T8.3** `utils/perf.js` detect + 7 天缓存
- [ ] **T8.4** `app.js` 启动精简：同步只保留 perf 检测，异步挪到首页 onLoad
- [ ] **T8.5** 真机 perf trace，冷启动 ≤ 1.2s 验证
- [ ] **FINAL** 26 页真机回归 0 crash，发布 checklist 签字

---

## 附录 B：复用 2026-07-31 xiaohongshu-apple-ui spec 的对应关系

| 本 spec Task | 2026-07-31 spec Task | 差异（仅落地侧） |
|--------------|----------------------|------------------|
| Task 2 | 1. 全局视觉系统 | 落地为原生 WXSS，无 SCSS 预编译 |
| Task 3 | 2. 首页 feed header 改造 | 复用 header 结构，feed 流形态稍简（无瀑布流） |
| Task 4 | 3. 小红书风 PostCard | 一致；图标全部自制 SVG |
| Task 5 | 4. 详情阅读体验 | 一致；评论树最多 2 层（不实现 2026-07-31 的 3 层） |
| Task 6 | 5. 发布 Apple 风表单 | 一致；图片走 wx.chooseMedia 替代旧 wx.chooseImage |

2026-07-31 计划中未实现的部分（暗色模式、消息页重构、登录流程）**不在本 spec 范围**，后续单独立项。
