# 变更日志

所有重要变更都记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，本项目遵循 [SemVer](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### R1 安全审计修复批（2026-11-14）
- **六视角只读审计集群**（zcode-fleet swarm 并行 6 worker + 主线程视觉验收 8 实拍）回收去重 10 项真缺陷（3 P0 + 7 P1），交叉验证高置信
- **[P0] 匿名评论/回复通知实名泄露**：upsertNotification 用真实昵称写进帖主消息列表——通知署名按 anonymous 归一「匿名同学」（评论+楼中楼两条路径），与 formatComment 展示口径一致
- **[P0] extraFields 创建路径绕过白名单**：创建侧补 sanitizeExtraFields（与编辑同口径）；soldTo/soldAt 服务端专属键被剥离；riskFlag 改独立组装；10MB 任意 JSON→FTS 触发器全量切词的 DoS 面同步关闭
- **[P0] rate 评价买家权威来源**：不再信任库中 extra_fields.soldTo（历史可被预置污染=「指定任意人扣信誉分」通道），唯一权威是 trade_offers 的 accepted/completed 记录
- **[P1] 回复「回复」三级嵌套静默丢评论**：服务端把 parent_id 归一化到顶层评论 id；通知锚点同归一（Web 对回复点「回复」不再产生任何接口查不回的数据）
- **[P1] 评论列表可见性**：非 published 帖（审核中/驳回/删除）评论对游客/无关用户 404，作者/管理员可见——与帖子详情同口径；回复接口同样挂守卫
- **[P1] wx-login 缺 ver**：改密/封禁过的账号微信静默登录后每请求 401 死循环——补 ver: token_version
- **[P1] 管理端重置密码不吊销 token**：UPDATE 追加 token_version+1 + changes===0 判 404（被盗号应急通道真正止损）
- **[P1] Web Push 订阅归属约束**：subscribe 的 ON CONFLICT 只在归属相同时刷新 keys（他人不可抢主截走离线通知）；unsubscribe 带 user_id（不可越权摘除他人设备）
- **[P1] WS 重复 hello**：认证后再 hello 直接 close(4008)——修复 Conn 永久泄漏与同 socket 换 token 串投；hub.detach 清空集合
- **[P1] 编辑状态机**：deleted 帖编辑 404、rejected 拒编辑——违规内容不再能经编辑回流审核队列
- **[P0] 生产超管口令出仓库**：render.yaml 改 sync:false（Render 控制台注入）；提交材料/部署手册脱敏；bundle 脚本演示默认值改 demo-admin-2026
- 回归锁 11 条新增（audit-r1-fixes.test.ts）+ push 契约测试改写锁新归属语义；V4 渐变回潮清零（PostCard 头像/标签、首页简报图标、板块色点改纯色）；测试 279→290

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
- **E2E 复活并进 CI**：tests/e2e 12 条浏览器流自 V5 登录重构后静默腐烂 10 条——修 e2e-backend.mjs（db.ts 生产加固后缺 ADMIN_INITIAL_PASSWORD/JWT_SECRET 直接崩在 seed 前）、playwright.config 自动探测本机 chromium 可执行（版本代差 headless_shell-1234 缺件）、helper 登录 placeholder 兼容新旧文案、3 处「点首页卡内标题」改走搜索入口（虚拟列表重渲染脱离 DOM 导致 click 悬挂）、断言文案对齐（近 7 天趋势空格）与匿名断言补真（选真匿名帖断言脱敏）；CI 新增 Browser E2E job（needs verify，与 load 并行，失败上传 report），本地 12/12 全绿 1.9min
- **小程序分享卡 + 订阅消息接通**：服务端 sharp 合成 750×600 V4 纸感分享卡（`/api/posts/:id/share-card.png`，仅 published、卡面零作者信息、10min 缓存带 updated_at 键）；无图帖不再让微信截页面当封面，首图绝对化；详情页补朋友圈分享；system 订阅模板在发帖/评论 tap 链内授权（未配置静默）；Dockerfile/Render 补 fonts-noto-cjk；13 条新测试（版式/转义/匿名/404/缓存/静态锁）
- **docs 站成书**：vitepress 首页 hero + 功能全景/AI 架构/安全匿名/质量门/设计系统/版本史六新章 + 全量侧栏 + 本地搜索；修旧文档死链；docs:build 进 CI 做死链门
- **Lighthouse 性能门进 CI**：移动端模拟 3 次中位数（单跑波动 ±15 必 flaky）；先修后设阈——marked/dompurify 懒加载（助手不打开不求值）、命令面板首次 Ctrl+K 才挂载 chunk、首屏 pageSize 20→12、卡片 contain 布局隔离，perf 67→79；门阈值 perf≥72/a11y≥90/bp≥90/seo≥90（实测 79/95/100/100）
- 测试 279 条全过（SEO 24+5 / push 集成 7 / 分享卡 13 / 评论直达 3 / 风格回潮锁 3 / errorGuard 5 / AI 短路 3）+ 浏览器 E2E 12/12；Playwright 用户端 17 张 + 后台 7 张双主题实拍 + 海报/inert/PWA/全局通知 E2E 0 控制台报错；全路由爬取 ALL ROUTES HEALTHY

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
