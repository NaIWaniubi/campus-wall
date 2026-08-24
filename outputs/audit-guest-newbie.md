# 校园墙 产品体验审计：游客 & 新注册用户走查

> 审计方式：只读代码走查（Vue3 `src/` + Express `api/`，小程序抽查），模拟两条路径：
> **A 游客**：首页→浏览→详情→点赞/评论/收藏/关注/私信→注册→登录失败
> **B 新用户**（注册默认信誉分 100）：立即发帖→匿名→板块差异化字段→资料完善→信誉门槛
> 共 15 条，按「不满程度 × 触发概率」排序。

## 先说结论：两个角色的关键事实

- **默认信誉分 = 100**（`api/routes/auth.ts:130`），新用户注册即可发帖、也可匿名（60/90 门槛全通过）。门槛只有被管理员扣分或交易差评后才会遇到——但产品没有任何地方告诉用户分数怎么涨怎么掉。
- **登录墙时机总体做得不错**：路由守卫带 `redirect`（`src/router/index.ts:94-97`），详情页点赞/收藏/评论/私信/关注都会先跳登录并保留回跳（`src/pages/PostDetailPage.vue:137,147,169`）。问题出在下面这些漏网之处。

---

## 不满清单（按严重度）

### P0

**1. 敏感词用 `'sb'/'nm'` 子串匹配并前端硬拦截发布，正常内容会被误杀**
- 证据：`src/utils/helpers.ts:10`（词库含 `'sb', 'nm'`）、`src/pages/PublishPage.vue:203-205`（命中即 toast 并 return，禁止提交）；后端同一词库 `api/utils/sensitive.ts:18`
- 场景：二手帖写「支持 USB 接口」→ 命中 `sb`，永远发不出去，提示还是莫名其妙的「内容包含敏感词：sb」。而后端对同类命中只是 warn 放行打标（`api/routes/posts.ts:326-328`），前端比后端更凶。
- 修复：去掉无词边界的两字母拼音词，或改用分词/词边界匹配；前端降级为「提示不拦截」，拦截交给后端分级。

**2. 信誉门槛 UX 三连伤：匿名开关点击后才报错、强匿名板块先替你打开再拦你、所有拒绝文案不讲原因和恢复路径**
- 证据：
  - 开关无禁用态/门槛提示，<90 用户看到的是普通开关，点了才 toast：`src/pages/PublishPage.vue:454-460` + `168-175`
  - 选「吐槽树洞」（force_anonymous）时 watch 自动打开匿名（`PublishPage.vue:108-114`），<90 用户一路填完在提交时被拦（`PublishPage.vue:207-209`），前后自相矛盾
  - 文案止步于「信誉分过低/低于90」，全站没有一处解释扣分原因与恢复方式；实际恢复途径只有管理员调整（`api/routes/admin.ts:113`）和交易互评加分（`api/routes/trades.ts:91`）
- 修复：<90 时开关置灰并标注「需信誉分 ≥90」；强匿名板块对 <90 用户直接说明该板块暂不可发；拒绝文案附「如何恢复信誉分」链接。

### P1

**3. 忘记密码零出口，账号一旦忘密即等于丢失**
- 证据：`src/pages/LoginPage.vue` 全页无「忘记密码」入口；后端仅有登录态下的改密接口（`api/routes/auth.ts:191`），唯一重置途径是管理员后台（`api/routes/admin.ts` reset-password）
- 修复：登录页加「忘记密码」引导（哪怕只是展示「联系管理员/辅导员重置」的说明页）。

**4. 帖子详情页任何加载失败都谎报「帖子不存在或已删除」并把用户踢回首页**
- 证据：`src/pages/PostDetailPage.vue:110-113`，catch 不区分 404 / 网络 500 / 超时，一律 toast + `router.replace('/')`
- 场景：地铁里断网点开帖子 → 被「帖子不存在」误导且强行送回首页，刷新欲都没有。
- 修复：仅 404 才提示并返回；网络错误留在本页给「重新加载」按钮。

**5. 注册链路两次丢弃 redirect：登录页「去注册」不带参，注册成功固定回首页**
- 证据：`src/pages/LoginPage.vue:105`（`to="/register"` 无 query）、`src/pages/RegisterPage.vue:58`（`router.replace('/')`）
- 场景：游客被守卫带到 `/login?redirect=/post/3`，点「去注册」，注册完落在首页——想看的那条帖子丢了。
- 修复：「去注册」透传 redirect；注册成功 `replace(redirect || '/')`。

**6. 401 拦截器的 redirect 只存 path 不存 query，回跳丢参数**
- 证据：`src/utils/request.ts:36`（`currentRoute.value.path`）、`:43/:47`（`query: { redirect: currentPath }`）；对比路由守卫用的是 `to.fullPath`（`src/router/index.ts:95`）
- 场景：游客在 `/search?keyword=考研资料` 点收藏 → 登录回来关键词没了。
- 修复：三处统一改为 `route.fullPath`。

**7. 发布页切换板块静默清空已填的差异化字段，无确认**
- 证据：`src/pages/PublishPage.vue:285`（`@click="form.sectionId = s.id; form.extraFields = {}"`）
- 场景：价格、新旧、联系方式填完，手滑点到隔壁板块再切回来，全部清空（标题/正文还在，更容易以为字段也还在）。
- 修复：extraFields 非空时二次确认，或按板块缓存各自的 extraFields。

**8. 图片上传：>5MB 直接拒收还让用户「请压缩后上传」，而服务端明明有压缩能力；且只收 jpg/png**
- 证据：`src/pages/PublishPage.vue:149-151`（超限 toast 让用户自己压）、`:332`（`accept="image/jpeg,image/png"`，iPhone HEIC 连选都无法选）；服务端已有 sharp 缩放+webp 缩略图管线（`api/routes/upload.ts:86-119`）
- 修复：接入浏览器端 canvas 压缩（长边 ≤1600 再传），上限随之放宽；accept 增加 `image/heic,image/webp`。

**9. 差异化字段靠板块「中文名子串」推断，管理员改名功能即静默失效**
- 证据：`src/pages/PublishPage.vue:32-40`（`name.includes('二手')||includes('交易')…`）；板块名可在后台任意改（`api/routes/admin.ts:451`）
- 场景：「二手交易」改名「跳蚤市场」→ 发帖页价格/新旧/联系方式整块消失，无人知晓。
- 修复：sections 表增加稳定的 `kind` 字段，前端按 key 而不是名字渲染。

**10. 评论点赞的未登录跳转是全页唯一丢上下文的漏网之鱼**
- 证据：`src/pages/PostDetailPage.vue:157`（`router.push('/login')`），同文件 137/147/169 都是 `query: { redirect: route.fullPath }`
- 修复：补上 redirect，与同文件写法对齐。

### P2

**11. 注册页：协议链接是死的、禁用按钮零解释**
- 证据：`src/pages/RegisterPage.vue:138`（《用户协议》《隐私政策》`<a>` 无 href 无事件，点了没反应；小程序端反而有 `pages/legal/*` 页面）；`:141` 按钮 `disabled=!canSubmit` 导致 `handleSubmit` 里的兜底 toast（`:42-45`）永远触发不了，表单不对时用户只看到灰按钮不知为何
- 另：密码强度仅要求 ≥6 位（`RegisterPage.vue:28`、`api/routes/auth.ts:115`），无强度提示。
- 修复：协议链接指向真实页面；按钮常亮、点击时逐项指出不满足的字段。

**12. 消息中心空态是死胡同，对比首页空态有明显落差**
- 证据：`src/pages/MessagePage.vue:204`（通知空态纯文字「暂无消息」无按钮）、`:242`（会话空态有文案无行动）；对照首页有空态 CTA「去发布」（`src/pages/HomePage.vue:241-246`）
- 修复：至少给「去逛逛/去看热帖」按钮，会话空态文案加直达入口。

**13. 游客可以走完整个举报弹窗、选完原因，才在提交时被 401 打回登录**
- 证据：`src/pages/PostDetailPage.vue:438/:315`（举报入口对游客可见可点）→ `submitReport :260-267` 直接发请求 → 拦截器 401 才踢人
- 修复：游客点举报时先 `goLogin()`（现成方法，`:70-72`），或弹窗内提示登录。

**14. 草稿自动保存完全静默：无「已保存」指示、失败吞掉、入口隐蔽**
- 证据：`src/pages/PublishPage.vue:80-92`（`autoSaveDraft` 空 catch、成功也不提示）、30 秒间隔 + 仅 unmount 兜底（`:64-105`），浏览器直接关闭最多丢 30 秒输入；草稿箱入口只有发布页右上角小图标（`:247`）
- 修复：保存成功显示轻量「草稿已保存」角标，失败可重试；离开页面有未保存改动时提示。

**15. 后端 500 把原始 `error.message` 直出到用户 toast 里**
- 证据：`api/app.ts:140`（`message: error.message`）+ `src/utils/request.ts:70`（原样展示）——SQLite 约束冲突等英文技术串会直接弹给用户
- 修复：生产环境将非预期异常映射为通用友好文案 + 可追踪错误码，细节只进日志。

---

## 附：走查中确认没问题的点（免得重复排查）

- 未登录浏览首页/详情/搜索全部可用（列表接口 `authOptional`，`api/routes/posts.ts:84`）
- 首页 FAB/头像/铃铛对游客都带 `redirect` 跳登录（`HomePage.vue:121-155`）
- App.vue 拉取未读数前判断了登录态，不会造成游客 401 风暴（`src/App.vue:13-15`）
- 服务端图片压缩 + 缩略图（`upload.ts:96-119`）、上传 magic number 校验齐全
- 登录失败文案具体（「账号不存在，请前往注册」「密码错误」，`auth.ts:150,160`）
