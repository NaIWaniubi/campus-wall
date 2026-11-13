# 变更日志

所有重要变更都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### V5 · 体验与落地（2026-11-13）
- **登录重构**：通用账号注册登录（手机号/拼音/邮箱前缀，3–32 位；学号降级为旧字段别名），密码 6 位含字母数字；登录页新增「一键体验（免输入）」与「游客逛逛」；字段级内联错误 + 桌面自动聚焦
- **全局命令面板**：`Ctrl/⌘+K` 唤起，实时搜帖子 + 板块直达 + 页面跳转 + 最近搜索；↑↓ 导航 / Enter 进入 / Esc 关闭
- **新手引导**：首次到首页自动弹三步（选板块 / 发布 / AI），Esc 关，会话内不重弹；命令面板与设置页可重看
- **深色模式**：顶栏一键切换；新增 `ds-poster / ds-ink-btn / ds-scrim / on-poster` 翻转原语，修掉消息标题、后台侧栏等「恒暗画布 + 会翻色的变量」造成的黑底黑字
- **OG 分享卡片**：`/post/:id` 服务端注入（仅 published；反代出绝对 URL；模板按 mtime 缓存防发版错引旧 chunk）；静态页兜底带 twitter:card
- **发布页**：剪贴板图片粘贴 + 拖拽上传（与点选共用 addFiles 通道）；发布前预览弹窗（复用 PostCard 所见即所得，捕获层拦截互动）
- **评论直达**：通知携带 `related_sub_id`（回复锚到顶层评论），Web/小程序点击消息滚到 `#cmt-{id}` 并柠色闪烁 2.6s；通知去重按子键分键
- **分享海报**：详情页一键生成 750×1000@2 纯 canvas 海报（恒暗品牌头 + 板块色胶囊 + 空间不足先舍图再舍摘要行），下载/复制/系统分享
- **无障碍**：三个 Teleport 模态接入 inert 焦点陷阱（背景退出 Tab 序列与无障碍树）；skip-link / aria / 对比度回归锁
- **PWA 一键安装**：`beforeinstallprompt` 捕获单例 + 设置页「安装校园墙」（已安装/可安装/手动指引三分支）
- **全局实时通知**：任意页面收到 WS 推送即刷新未读徽标 + toast 摘要（消息页内不打扰）；修 `main.ts` 仅在已登录时 start 导致游客→登录不装 WS token-watch 的根因（改无条件 start，内部按 token 决策）
- **SEO 静态面**：`robots.txt`（屏蔽 /admin /api + 绝对 Sitemap 指向）与动态 `sitemap.xml`（published 帖 + 全板块入图，缓存 10min），注册在 SPA 通配回退之前
- **JSON-LD 结构化数据**：`/post/:id` 注入 schema.org SocialMediaPosting（headline/datePublished/author/image/isPartOf），面向搜索引擎富摘要；`<`/`>` 统一转 `\u003c` 防内容提前闭合 `</script>`；模板若预置 ld+json 先清后注保证单份；website 页不输出
- **RSS 订阅输出**：`/rss.xml`（`/feed` 别名同 handler）吐最近 30 条 published 帖，缓存 10min；匿名条目 `dc:creator` 归一「匿名同学」，全字段 XML 转义；index.html 声明 `rel=alternate` 自动发现；实测 demo 19 条与库存精确一致（1 条 pending 不外泄）、3 条匿名逐 item 断言零昵称泄露
- **全局错误兜底**：`router.onError` 识别旧 chunk 404 自动硬刷新一次（sessionStorage 防死循环、storage 不可用则保守不刷）；`app.config.errorHandler` 把未捕获 Vue 错误降级为提示而非白屏；`errorGuard` 纯函数抽出 + 单测锁死
- **小程序 V4 结构级同源**：全部 wxss 去渐变/玻璃拟态/蓝灰柔影 → 纸白实底 + 墨线硬影；私信 CTA 墨底柠字；全局分区标题柠色标记条；发布页海报小标头 + NEW 贴纸；8 分类色与 mock 调色板对齐 web 板块色；3 条风格回潮回归锁
- **细节**：路由顶部进度条、首页回到顶部、toast/信誉色彻底退绿（紫/深青/深琥珀/红）、PWA 图标重绘为 V4 墨底荧光砖、`:focus-visible` 焦点环、`prefers-reduced-motion` 降级
- **管理后台 V4 全量重构**：外壳 + 看板 + 帖子/评论/举报/用户/板块/反馈/公告/AI 设置共 11 页；图表跟随主题
- **小程序 AI 成稿**：发布页「✨ 一句话成稿」贴纸按钮 → 服务端 /ai/draft（AI 或离线套版），回填标题/正文并自动采纳板块建议；busy 防重入；2 条接线锁测试
- **离线智能成稿升级**：无 key/熔断时不再原样回吐——按板块抽取 物品/成色/价格/时间/地点/联系方式 套版（正文保留原话 + 📌 结构化清单，情绪板块不套版），标题自动【板块】前缀，滑窗碎片标签彻底移除（字段做种子标签）；实测失物招领一句话 → 「【失物招领】校园卡」+ 干净标签
- **前台/后台 AI 分轨**：当面等的成稿/划重点/助手只走快网关链（fastOnly 剔除慢免费档；空链不开熔断），auth 短路后 ~1.5s 即落离线套版（实测 15.3s→1.56s）；慢但免费的真模型专职后台简报
- **AI 免费档真跑通**：OpenRouter reasoning 模型严格 JSON 提示词下会把 token 烧进思考导致 content 空——免费档预算提到 4096 + 传 `reasoning.effort=low` + `salvageJsonFromReasoning` 从思考尾部打捞 JSON；今日简报改后台大预算（100s、ignoreBreaker）真实出稿（实测 60s 后 offline 转 false），成功即复位熔断等于为前台探活；+3 条打捞单测
- **AI 网关级 auth 短路**：自建网关返回 401/Invalid token 时，同端点其余模型不再逐个空耗重试（endpointKeyFor 以 url+key 尾 6 位为指纹），直接切 OpenRouter 免费档；实测失败调用与错误日志从 6+ 降到 3
- **Web Push 通电落地**：VAPID 从纸面预埋变为真开关——`scripts/gen-vapid.mjs` 首跑自动生成密钥对（只落 gitignored 数据目录，永不进仓库），start-demo 注入环境（cmd 逐行执行，env 必须排在 node 行之前——踩坑修复）；demo 真机闭环：设置页开启→订阅拿到真实 FCM endpoint 落库→他人评论触发 VAPID 签名真发→关闭→服务端删行；修 enablePush 静默失败 bug（pushManager/权限层异常不走 axios 拦截器，现给出可读 toast；另实锤 Chrome 无痕模式整体禁用 Push API，自动化必须持久 profile）；push 路由 0→7 条集成测（鉴权/结构校验/未配置 501/同 endpoint 换主刷新/退订）
- 测试 266 条全过（SEO 24+5 / push 集成 7 / 评论直达 3 / 风格回潮锁 3 / errorGuard 5 / AI 短路 3）；Playwright 用户端 17 张 + 后台 7 张双主题实拍 + 海报/inert/PWA/全局通知 E2E 0 控制台报错；全路由爬取 ALL ROUTES HEALTHY

### V4 · 纸感海报设计系统（2026-11-12）
- 全站换肤：暖纸底 + 1.5px 墨线 + 硬投影 + 大字排版 + 荧光四色（lime/coral/sky/violet）
- 新原语：`.ds-card / .ds-btn / .ds-chip / .ds-tag / .ds-sticker / .ds-display / .ds-section-head`
- 移动端 TabBar、卡片、骨架屏、AI 气泡全部重绘；规范见 docs/DESIGN-V4.md

### V3 · 多巴胺青春体系（2026-11-12）
- 品牌紫 `#6D3BF5` + 8 色板块轮，明确去绿白
- AI 产品化：一句话成稿 / 帖子划重点 / 今日校园简报（离线规则兜底 + 熔断 + 调用预算）

### 文档
- LICENSE 定为 MIT，README 同步
- 新增 SECURITY.md / CONTRIBUTING.md / CODE_OF_CONDUCT.md / CHANGELOG.md

## [1.0.0] - 2026-09-26

参赛/开源就绪版本。

### 平台形态
- **三端**：Vue 3 Web（5173）+ 原生微信小程序 + Express REST/WS API（3001），共用同一契约
- **8 大板块**：二手交易 / 失物招领 / 表白墙 / 吐槽树洞 / 互助问答 / 校园活动 / 拼车 / 组队
- **管理后台**：数据看板（KPI + 7 日趋势）、用户、内容审核、评论、举报、板块、公告、反馈、AI 助手配置

### 用户端功能
- 学号注册登录、JWT、个人中心、信誉分体系（0–120 分级权限）
- 发帖 / 草稿箱 / 24h 编辑窗、敏感词三级风险（驳回/审队/放行）
- 信息流：Tab 滑动、下拉刷新、无限加载、骨架屏
- 搜索：300ms 防抖、本地历史、热门词
- 互动：点赞、收藏、楼中楼回复、举报（24h 频控、3 人升级）
- 消息：分类 Tab、未读红点、WebSocket 单连接承载通知 + 私信
- 关注体系、我的点赞聚合页
- 失物招领智能匹配（闲置关键词打分双向通知）
- 板块订阅，每日定时摘要推送
- 二手交易双向互评，信誉分联动
- AI 助手（OpenRouter）：知识库 + 检索问答

### 可靠性与运维
- 信息流 LRU + TTL 缓存（`X-Cache` 可观测）
- SQLite WAL 在线热备份，AES-256-GCM 加密
- 滑动窗口限流，登录失败锁定
- `/api/health` 健康检查（db/storage/ws/uptime/5xx）
- PWA（manifest + SW，指纹静态优先，API 永不缓存）
- 图片上传压缩 + WebP 缩略

### 工程化
- CI：lint + typecheck + unit + build + Playwright E2E + Lighthouse + docs build
- Playwright 5 spec 核心流；隔离库 `api/e2e-test.db`
- VitePress 文档站（架构 + API 映射 + 指南）
- OpenAPI 契约（`api/openapi/`）
- ESLint 9 / vue-tsc 类型检查

### 演示与体验
- 演示账号：admin/admin123（管理员）、23770001–23770005/demo1234（用户）
- `npm run seed` 一键灌入幂等演示数据
- `npm run dev` 一键前后端联调
