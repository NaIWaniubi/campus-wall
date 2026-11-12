# API 契约映射报告：A 小程序(旧) → B Express5+TS 后端(新)

> 只读侦察结论。A=`C:\Users\chen\Desktop\校园墙`，B=`E:\校园墙`。供改造实施用。

## 1. A 前端调用面（utils/ + app.js）

**基础设施**
- baseUrl：`app.globalData.baseUrl`（app.js L45-47）= 环境注入 `API_BASE_URL` || `'http://127.0.0.1:3000/api'`
- 登录态：token 存 `wx.setStorageSync('token'/'userInfo')` → 启动时载入 `globalData.token/userInfo`（app.js L68-77）
- Header：每个请求带 `Authorization: Bearer <token>`、`Content-Type: application/json`（utils/api.js L21-25）
- 响应约定：`{code:number, msg?, data}`；`code===0` 成功取 `data`；`code===401` 清 token 跳 `profile?needLogin=true`；其他 toast `msg`（api.js L29-53）
- 上传：`wx.uploadFile` → `POST baseUrl + '/upload'`，字段名 `name='file'`，Bearer 头，响应 JSON `{code,msg,data:{url}}`（api.js L80-112）；发布/头像前先 `wx.chooseMedia`→可选 `wx.compressImage`

**A 的帖子对象形状**（mock.js + 页面消费）：`id`(string), `category`, `subType`, `title`, `content`, `images[]`, `author{id,nickname,avatar,isAnonymous}`, `campus`, `location`, `time`(ms 时间戳), `likes`, `comments`(数), `favorites`(数), `isLiked`, `isFavorited`, `tags[]`, `status`, `extra{}`（按板块含 price/contactInfo/departureTime/maxPeople 等）

**A 实际调用的接口清单**（页面扫描汇总）
| # | 方法+路径 | 请求 | 期望响应(data) |
|---|---|---|---|
| 1 | POST `/auth/login` | `{code(wx.login凭证), nickname, avatar}` | `{token, userInfo{id,nickname,avatar,signature,campus,role,status,isDemo,postCount,favoriteCount,likeCount,followerCount,followingCount,createTime}}` |
| 2 | GET `/user/info` | - | userInfo |
| 3 | PUT `/user/info` | `{nickname\|avatar\|signature\|campus}` 单字段 | user |
| 4 | GET `/posts` | query `{page,pageSize,feed('recommended'\|'follow'),sort('hot'\|'latest'),category?,campus?}` | `{list[Post], hasMore}` |
| 5 | GET `/posts/:id` | - | Post |
| 6 | POST `/posts` | `{category,subType,title,content,images[],isAnonymous,campus,tags[],extra{...allowMessages}}` | 新帖 |
| 7 | PUT `/posts/:id` | 同上 | - |
| 8 | DELETE `/posts/:id` | - | - |
| 9 | POST `/posts/:id/like` | `{}` | **整个更新后的 Post**（前端直接替换列表项） |
| 10 | POST `/posts/:id/favorite` | `{}` | **整个更新后的 Post** |
| 11 | GET `/posts/:id/comments` | - | `Comment[]{id,content,author{id,nickname,avatar,isAnonymous},time,likes,isLiked,replies[]{id,commentId,author,content,replyTo{id,nickname},time,likes,isLiked}}` |
| 12 | POST `/posts/:id/comments` | `{content, replyToId?, replyToName?}` | - |
| 13 | POST `/comments/:id/like` | `{}` | - |
| 14 | POST `/report` | `{targetType:'post', targetId, reason}` | - |
| 15 | GET `/search/hot-topics` | - | `[{"id","name","count"}]` |
| 16 | GET `/notifications` | query `{type?('comment'\|'like'\|...')}` | `Notification[]{id,type,title,content,time(ms),isRead,postId}` |
| 17 | POST `/notifications/read-all` | - | - |
| 18 | GET `/notifications/unread-count` | - | number |
| 19 | GET `/conversations` | - | `[{id,...,last_time,unread_count}]`（snake_case！） |
| 20 | POST `/conversations` | `{receiverId, postId?}` | `{id}` |
| 21 | GET `/conversations/:id/messages` | - | Message[] |
| 22 | POST `/conversations/:id/messages` | `{content}` | Message |
| 23 | POST `/users/:id/follow` | - | - |
| 24 | GET `/users/:id/follows` | query `{type:'following'\|'followers'}` | 用户数组 |
| 25 | GET `/user/posts` | query `{status?'active'\|'resolved'}` | Post[] |
| 26 | GET `/user/favorites` | - | Post[] |
| 27 | GET `/user/likes` | - | Post[] |
| 28 | POST `/feedback` | `{content, contact, images[]}` | - |
| 29 | POST `/upload` | multipart `file` | `{url}` |
| 30 | GET `/admin/reports`;POST `/admin/reports/:id/resolve`;POST `/admin/hide` `{targetType,targetId}`;POST `/admin/users/:id/ban` | 仅 moderation 管理页 | - |

## 2. A 旧后端端点（server/app.js，Express + better-sqlite3 + data/*.json）

与上表一一对应实现：`/api/auth/login`、`/api/user/info`(GET/PUT)、`/api/users/:id/follow`、`/api/users/:id/follows`、`/api/conversations*`(4 个私信端点)、`/api/users/:id/block`、`/api/posts`(CRUD/hidden/like/favorite/comments/comment-like)、`/api/user/{posts,favorites,likes}`、`/api/notifications`(list/read-all/unread-count)、`/api/search/hot-topics`、`/api/upload`、`/api/report`、`/api/admin/{reports,reports/:id/resolve,hide,users/:id/ban}`、`/api/feedback`、`/api/content/check`、静态 `/uploads/:file`。
**旧后端独有而前端已用的能力：chat 私信（conversations）、关注 follow、拉黑 block、反馈 feedback、内容检查 content/check。**

## 3. B 新后端契约（docs/ARCHITECTURE.md + api/routes/*.ts，挂载见 app.ts）

- **响应包**：`{code, message, data}`；成功 `code===200`；失败多为 HTTP200 + body `code`(400/401/403/404/1001 账号不存在/1002 密码错误/1003 封禁)；`data` 失败为 null。⚠️ 与 A 的 `code===0`+`msg` 不同
- **认证**：header `Authorization: Bearer <token>`；JWT 7d payload `{id, studentId, role}`；账号密码 bcrypt；中间件 authRequired/authOptional/adminRequired/superAdminRequired
  - **V5 变更**：登录名不再强制 8 位学号。`POST /auth/register|login` 接受 `account`（3–32 位，`[A-Za-z0-9_.@-]`），同时兼容旧字段 `studentId`；学院改为选填；注册密码 6 位起且含字母+数字（`commonSchemas.registerPassword`），`password`（8 位+大小写+数字）仅用于改密。数据库列名仍是 `student_id`（语义=登录账号）。
- **分页形状**：`{list, total, page, pageSize, hasMore}`
- **帖子对象 formatPost（全 camelCase）**：`id`(number), `title`, `content`, `images[]`, `thumbImages[]`(原图+.thumb.webp), `isAnonymous`, `status`('published'|'pending'|'pending_review'|'deleted'), `isTop`, `topType`, `rejectReason`, `viewCount`, `likeCount`, `commentCount`, `favoriteCount`, `extraFields{}`, `section{id,name,icon}`, `author{id,nickname,avatar,college,creditScore}`(匿名时 id:0/creditScore:null), `isMine`, `liked`, `favorited`, `createdAt/updatedAt`(ISO)
- **发帖**：POST `/api/posts` `{sectionId, title(≤50), content(10~500字), images(≤9), isAnonymous, extraFields{price,contact,location,tradeType,condition,time,itemType,organizer 白名单}}` → `{id, status, matchedCount}`（失物匹配命中数）
- **点赞/收藏返回增量**：`{liked, likeCount}` / `{favorited, favoriteCount}`（⚠️ 非 A 的整帖回传）
- **评论**：GET/POST `/api/posts/:id/comments` `{content(≤200), isAnonymous}`；回复走 `POST /api/comments/:id/reply`；另有 `/api/comments/:id/{like,report}`、DELETE
- **板块**：GET `/api/sections` → `[{id,name,icon,sort,isActive,forceAnonymous,needAudit}]`；种子 6 个：二手交易(1)/失物招领(2)/表白墙(3)/吐槽树洞(4,forceAnonymous=1)/互助问答(5)/校园活动(6)。搜索 `GET /api/search?keyword&page`（分页形状）、热词 `GET /api/search/hot` → string[]
- **消息(通知)**：GET `/api/messages?type` → `{list:[{id,userId,type,content,postId,isRead,createdAt}], unreadCount}`；PUT `/api/messages/read/:id`、PATCH `/:id/read`、PUT `/read-all`。⚠️ B 的 messages 只是站内通知，**无私信会话**
- **auth**：POST `/api/auth/register` `{studentId(6-12位数字), password(≥6), nickname, college?, grade?}` → `{token, user}`；POST `/login` `{studentId, password}` → 同；GET `/me`；PUT `/password` `{oldPassword,newPassword}`；POST `/logout`。⚠️ user 内部字段 snake_case：`student_id, credit_score, created_at`
- **users**：GET `/api/users/:id`；PUT `/api/users/profile` `{nickname?,avatar?,signature?}`（无 campus）；GET `/api/users/me/{posts,comments,favorites}`；GET `/api/users/:id/trade-ratings`
- **其余模块**：`/api/upload`(multipart `file` jpg/jpeg/png ≤5MB，三重校验+sharp 压缩 → `{url, thumbUrl}`)；`/api/drafts`；`/api/announcements`(active/ack/CRUD)；`/api/subscriptions`(`POST /:sectionId` toggle、GET list)；`/api/trades/:postId/{complete,rate}`；`/api/ai/{chat,chat/stream}`；`/api/admin/*`(users ban/reset-password/credit、posts audit/top、comments、reports、stats、sections CRUD)、`/api/admin/ai/*`、`/api/health`

## 4. 板块模型对比

| A(category) | 中文名/顺序 | → B section | 结论 |
|---|---|---|---|
| trade 二手闲置 | 4 | 二手交易(sort1) | ✅ 一一对应，改名 |
| lost 失物招领 | 1 | 失物招领(sort2) | ✅ 一一对应 |
| confession 表白墙 | 2 | 表白墙(sort3) | ✅ 一一对应 |
| daily 校园日常 | 7 | 吐槽树洞(sort4) | ⚠️ 部分：仅 rant(匿名吐槽) 子类对应；share/positive/fun 无家可归 |
| help 校园求助 | 3 | 互助问答(sort5) | ✅ 近似对应，改名 |
| carshare 拼车/拼单 | 5 | — | ❌ B 缺失，需新增 section+extraFields(departureTime/destination/maxPeople/costPerPerson) |
| team 社团/组队 | 6 | —（可挂校园活动 sort6） | ⚠️ 建议新增独立「组队」或扩展校园活动 extraFields(recruitCount/deadline/requirements) |
| — | — | 校园活动(sort6) | B 独有 |

建议种子改造：新增 `拼车拼单`、`社团组队` 两 section（need_audit 视运营），daily 拆分——日常分享并入树洞但放宽 force_anonymous，或新增「校园日常」第 8 板块。A 的 subTypes 存入 `extraFields.subType` 即可复用 B 的 `?subType=key:val` 筛选。

## 5. 登录体系对比与兼容策略

- A：微信登录。`wx.login()` 取 code → POST `/auth/login {code,nickname,avatar}` → 服务端 `jscode2session` 换 openid（无凭据时 dev_ 演示号兜底）→ JWT **30d** payload `{userId}` → `{token,userInfo}`
- B：仅学号密码。`POST /api/auth/register|login {studentId,password}` → bcrypt 校验 → JWT **7d** `{id,studentId,role}` → `{token,user}`（user 字段 snake_case 且无 postCount 等统计）
- **兼容策略（推荐）**：
  1. 小程序登录页改为「学号+密码」表单：注册 `/api/auth/register`，登录 `/api/auth/login`；token 仍存 `wx.storage('token')`、header 仍 `Authorization: Bearer`，两端一致无需改请求层
  2. 适配器统一处理：`code===200` 才算成功（兼容旧 `code===0`）、`message` 替代 `msg`、401 清态逻辑不变
  3. wx.login 静默登录列为**可选后续**：需在 B 增加 `POST /api/auth/wx-login` 并给 users 表加 `openid` 列（现 schema 无此字段，无法平滑兼容）
  4. 注意 B 的信誉分门槛：creditScore<60 不能发帖/评论、<90 不能匿名——小程序 UI 需展示 creditScore 引导

## 6. 总映射表（A 前端调用 → B 端点）

| A 调用 | B 对应 | 判定 |
|---|---|---|
| POST /auth/login | POST /api/auth/login | 形状不同：入参 `{code,nickname,avatar}`→`{studentId,password}`；出参 `{token,userInfo(camelCase统计)}`→`{token,user(snake_case)}` 需适配 |
| GET/PUT /user/info | GET /api/auth/me；PUT /api/users/profile | 路径不同+形状不同：campus 字段 B 不支持更新，需扩 users 表 |
| GET /posts | GET /api/posts?page&pageSize&sectionId&keyword&sort | 形状不同：`category`→`sectionId`、`feed` 无(B 无关注流)、`campus` 无；返回多 total/pageSize |
| GET /posts/:id | GET /api/posts/:id | 形状不同：字段名全面改名（time→createdAt、likes→likeCount、category→section、extra→extraFields…），需前端映射层 |
| POST/PUT/DELETE /posts | POST/PUT/DELETE /api/posts(/:id) | 形状不同：body 改 `{sectionId,…,extraFields}`，去掉 campus/tags/subType（并入 extraFields） |
| POST /posts/:id/like | POST /api/posts/:id/like | 形状不同：整帖 → `{liked,likeCount}`，前端替换逻辑要改 |
| POST /posts/:id/favorite | POST /api/posts/:id/favorite | 形状不同：同上 `{favorited,favoriteCount}` |
| GET/POST /posts/:id/comments | GET/POST /api/posts/:id/comments | 形状不同：回复改走 `POST /api/comments/:id/reply`；replyToId/replyToName 弃用 |
| POST /comments/:id/like | POST /api/comments/:id/like | 完全一致（语义相同） |
| POST /report | POST /api/posts/:id/report | 路径不同：targetId 进 path；评论举报另有 /api/comments/:id/report |
| GET /search/hot-topics | GET /api/search/hot | 路径+形状不同：`[{name,count}]` → `string[]`（且为硬编码词） |
| GET /notifications | GET /api/messages?type | 路径+形状不同：数组 → `{list,unreadCount}`；`time/isRead/title` → `createdAt/isRead/content` |
| POST /notifications/read-all | PUT /api/messages/read-all | 路径不同（GET/PUT 差异） |
| GET /notifications/unread-count | GET /api/messages 的 unreadCount | 路径不同：无独立端点，从列表取或新增 |
| GET /conversations 等 4 个私信端点 | — | ❌ B 缺失：messages 表是通知不是私信，需新增 conversations 私信模块（复用 A 表结构 senderId/receiverId/postId/content/isRead） |
| POST /users/:id/follow、GET /users/:id/follows | — | ❌ B 缺失 follows 表与端点；若保留社交功能需新增，否则小程序隐藏关注入口 |
| GET /user/posts | GET /api/users/me/posts | 路径+形状不同：status 参数值域不同（active/resolved vs published/pending/pending_review） |
| GET /user/favorites | GET /api/users/me/favorites | 路径不同，形状近似（少 thumbImages/isMine） |
| GET /user/likes | — | ❌ B 缺失「我的点赞」端点（likes 表在，加查询即可） |
| POST /feedback | — | ❌ B 缺失 feedback 表/端点 |
| POST /upload | POST /api/upload | 形状微差：`{url}` → `{url,thumbUrl}`（兼容可直接取 url） |
| /admin/* 4 个管理端点 | /api/admin/{reports,reports/:id(PUT),posts/:id/audit,users/:id/ban(PUT)} | 路径+方法不同：hide→audit(status)、resolve→reports/:id(PUT)、ban POST→PUT；B 能力更强(stats/credit/sections CRUD) |

## 7. 新增工作清单（改造 B 以承接小程序）

1. **请求层适配器**（小程序 utils/api.js）：`code===200` 成功判定、`message` 字段、401 跳转不变——一处改动全局生效
2. **板块种子**：db.ts 种子追加 `拼车拼单`、`社团组队`（icon 用 lucide 名：car/users）；决定 daily↔吐槽树洞 的 force_anonymous 策略
3. **chat 私信**：B 新增 `conversations`+`conversation_msgs` 表与 4 端点（对齐 A 的 #19-22 契约：`POST /api/conversations {receiverId,postId?}`、`GET /api/conversations`、`GET/POST /api/conversations/:id/messages`），否则小程序 message tab 的会话页不可用
4. **关注能力**：新增 `follows(user_id,following_id)` 表 + `POST /api/users/:id/follow`、`GET /api/users/:id/follows?type=`；不做则下线 follows 页与信息流 feed=follow 参数
5. **我的点赞**：补 `GET /api/users/me/likes`（likes 表已有，纯查询）
6. **意见反馈**：新增 `feedbacks(content,contact,images,user_id,created_at)` 表 + `POST /api/feedback`
7. **用户资料**：users 表补 `campus` 列并在 PUT /profile 支持（A 有四校区选择器）；GET /me 补 postCount/favoriteCount 等统计（A 我的页直接消费）
8. **登录页改造**：学号密码表单 + 注册页；wx.login 静默登录留接口位（`openid` 列 + `/api/auth/wx-login`）列为二期
9. **字段映射层**：小程序建 `normalizePost()` 把 B 的 camelCase 帖子对象转 A 页面现有字段名（time/likes/comments/favorites/category/subType/extra），可让 pages/ 几乎零改动
10. **上传流程不变**：仍 `wx.uploadFile(name='file', Bearer)` 到 `POST /api/upload`，baseUrl 指向 B 的 `http://<host>:3001/api`；注意 B 只收 jpg/png ≤5MB（A 端 compressImage 先行）
