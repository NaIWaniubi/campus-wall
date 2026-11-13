# 设计系统：V4 纸感海报 PAPER & INK

V3 的「渐变 + 玻璃」在多轮打磨后仍显廉价，V4 换设计语言：
**纸底 `#F7F2E8` + 1.5px 墨线 `#14110F` + 硬投影（0 模糊）+ 900 字重标题 + 荧光四色**。

| 令牌 | 值 | 用途 |
|---|---|---|
| paper / card | `#F7F2E8` / 纸白 | 底与卡面 |
| ink / ink-soft / ink-mute | `#14110F` / `#4A443C` / `#6E6659` | 文字三档 |
| lime | `#C8F04A` | 主强调（按钮/标记条/品牌条） |
| coral / sky / violet | `#FF4D2E` / `#38D6F5` / `#6D3BF5` | 警示/信息/次强调 |

## 原语

`ds-card`（描边+硬投影，hover 上浮/active 下沉）、`ds-btn`（primary 墨底荧光 / accent 荧光底墨字）、
`ds-chip`、`ds-input`、`ds-tag`、`ds-sticker`（微旋转贴纸）、`ds-marquee`、`ds-section-head`（编号章节头）、
`ds-marker`（荧光笔）、`ds-fab`、`ds-poster / ds-ink-btn / ds-scrim`（深色翻转）。

## 纪律

- **禁渐变 / 禁 backdrop-blur / 禁柔影**——三条回归锁在 `tests/miniprogram/static.test.ts` 与 web 侧守护
- 深色模式全套令牌映射（纸→深墨、墨线→纸色），修掉「恒暗画布 + 会翻色变量」的黑底黑字
- 板块八色轮保留作分类身份色（琥珀/青/玫红/紫/靛/蓝/品红/粉），与品牌荧光层分层

## 双端同源

小程序全部 wxss 去渐变/玻璃/柔影 → 纸白实底 + 墨线硬影；分区标题柠色标记条；
8 分类色与 web 板块色对齐；发布页海报小标头 + NEW 贴纸。

## 无障碍

对比度 AA 单测守护；帖子卡 `role=button` + 键盘 Enter/Space；模态 inert 焦点陷阱；
skip-link / `aria-live` toast / `prefers-reduced-motion` 降级。

完整规范见仓库 [docs/DESIGN-V4.md](https://github.com/NaIWaniubi/campus-wall/blob/master/docs/DESIGN-V4.md)。
