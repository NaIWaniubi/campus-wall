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
