# Campus Wall Social Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current campus-wall mini program into a polished, low-cost, production-oriented campus social community with WeChat login, real social state, follows, private messaging, and publish-first-review-later moderation.

**Architecture:** Keep the native WeChat mini program structure, but make the backend testable and split persistence/social/moderation responsibilities into focused modules. Replace demo JSON behavior with a SQLite-backed store for pilot launch, then wire frontend pages to real APIs and shared UI states.

**Tech Stack:** Native WeChat mini program WXML/WXSS/JS, Node.js, Express, JWT, `better-sqlite3` for low-cost local persistence, Node built-in test runner for backend tests.

---

## Scope Note

The approved design covers several subsystems: backend persistence, auth, feeds, follows, messaging, moderation, and UI polish. Treat this as one launch plan, executed in vertical slices. Each task should leave the app runnable and testable before moving on.

This workspace currently has no `.git` directory. When a step says to commit, run the commit only if `Test-Path .git` returns `True`; otherwise update `progress.md` with the completed task and skip the commit command.

## File Structure

### Backend

- Modify: `server/package.json`
  - Add `test`, `test:api`, and SQLite dependency.
- Modify: `server/app.js`
  - Export the Express app for tests and start listening only when run directly.
  - Replace inline JSON helpers with imported store/services.
- Create: `server/src/config.js`
  - Centralize JWT secret, port, upload directory, data directory, and WeChat credentials from environment variables.
- Create: `server/src/db.js`
  - Open SQLite, create tables, seed baseline data, and expose prepared helpers.
- Create: `server/src/services/authService.js`
  - Handle WeChat login exchange, demo fallback for local dev, token issuing, and banned-user checks.
- Create: `server/src/services/feedService.js`
  - Query feeds, topics, real counts, reactions, favorites, and comments.
- Create: `server/src/services/followService.js`
  - Manage follow/unfollow, counts, and following feed.
- Create: `server/src/services/messageService.js`
  - Manage conversations, text messages, unread counts, and blocking.
- Create: `server/src/services/moderationService.js`
  - Keyword classification, reports, admin actions, hidden content, and bans.
- Create: `server/tests/api.test.js`
  - Backend API coverage with Node's built-in `node:test`.

### Mini Program Shared Files

- Modify: `app.json`
  - Change tab bar to Home, Topics, Publish, Messages, Profile.
- Modify: `app.js`
  - Improve login helper and global app state.
- Modify: `app.wxss`
  - Replace purple template styling with the approved campus-community visual system.
- Modify: `utils/api.js`
  - Treat 2xx responses as successful, preserve auth state safely, expose clearer error objects.
- Modify: `utils/category.js`
  - Reframe categories as topics/channels while preserving existing IDs.
- Create: `utils/auth.js`
  - Shared login prompt and protected-action helper.
- Create: `utils/state.js`
  - Small helpers for list item updates, empty states, and retry metadata.

### Mini Program Components

- Modify: `components/post-card/*`
  - Real share button, follow button, better metadata layout, anonymous display.
- Modify: `components/empty-state/*`
  - Add action button support for login, publish, retry, or browse topics.
- Create: `components/conversation-item/*`
  - Conversation list row.
- Create: `components/user-row/*`
  - Follow/follower list row.

### Mini Program Pages

- Modify: `pages/index/*`
  - New Home feeds: recommended, latest, following, hot topics.
- Modify: `pages/category/*`
  - Convert category landing page into Topics page.
- Modify: category detail pages under `pages/category/*/*`
  - Reuse real topic feeds and remove duplicate local-only behavior.
- Modify: `pages/publish/*`
  - One-step publish flow, stronger validation, drafts, anonymous and private-message toggles.
- Modify: `pages/detail/*`
  - Add follow and private-message entry; keep real comments/reactions.
- Modify: `pages/message/*`
  - Add private-message tab/conversation entry and better logged-out/empty states.
- Create: `pages/message/chat/*`
  - One-to-one text chat.
- Modify: `pages/mine/*`
  - Profile as social homepage with real counts.
- Create: `pages/mine/follows/*`
  - Follow and follower lists.
- Create: `pages/admin/moderation/*`
  - Lightweight admin queue inside mini program for pilot moderation.
- Modify: `pages/mine/settings/*`
  - Remove fake settings and fix cache behavior.

---

### Task 1: Backend Test Harness And App Export

**Files:**
- Modify: `server/package.json`
- Modify: `server/app.js`
- Create: `server/tests/api.test.js`

- [ ] **Step 1: Add backend test scripts and SQLite dependency**

Edit `server/package.json` so the scripts and dependencies include:

```json
{
  "scripts": {
    "start": "node app.js",
    "dev": "node app.js",
    "test": "node --test",
    "test:api": "node --test tests/api.test.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.10.0",
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "multer": "^1.4.5-lts.1",
    "jsonwebtoken": "^9.0.2",
    "bcryptjs": "^2.4.3",
    "uuid": "^9.0.0"
  }
}
```

- [ ] **Step 2: Install backend dependencies**

Run:

```powershell
npm install --prefix server
```

Expected: `server/package-lock.json` updates and `better-sqlite3` appears in the lockfile.

- [ ] **Step 3: Export the Express app without auto-listening in tests**

At the end of `server/app.js`, replace unconditional listen logic with:

```js
const PORT = process.env.PORT || 3000

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`校园墙后端服务运行在 http://localhost:${PORT}`)
  })
}

module.exports = app
```

If an existing `app.listen(...)` block exists, remove that older block.

- [ ] **Step 4: Write the first smoke test**

Create `server/tests/api.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const app = require('../app')

function request(server, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : ''
    const req = http.request({
      method,
      port: server.address().port,
      path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    }, res => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: raw ? JSON.parse(raw) : null })
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

test('GET /api/posts returns a list response', async () => {
  const server = app.listen(0)
  try {
    const res = await request(server, 'GET', '/api/posts')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.code, 0)
    assert.ok(Array.isArray(res.body.data.list))
  } finally {
    server.close()
  }
})
```

- [ ] **Step 5: Run the test**

Run:

```powershell
npm test --prefix server
```

Expected: one passing test.

- [ ] **Step 6: Commit or record progress**

If Git exists:

```powershell
git add server/package.json server/package-lock.json server/app.js server/tests/api.test.js
git commit -m "test: add backend api smoke test"
```

If Git does not exist, add this line to `progress.md`:

```markdown
- Completed Task 1: backend app export and smoke test harness.
```

---

### Task 2: SQLite Store And Seed Migration

**Files:**
- Create: `server/src/config.js`
- Create: `server/src/db.js`
- Modify: `server/app.js`
- Modify: `server/tests/api.test.js`

- [ ] **Step 1: Write a persistence test for seeded posts**

Append to `server/tests/api.test.js`:

```js
test('seeded topics use real post counts', async () => {
  const server = app.listen(0)
  try {
    const res = await request(server, 'GET', '/api/search/hot-topics')
    assert.equal(res.statusCode, 200)
    assert.equal(res.body.code, 0)
    assert.ok(res.body.data.every(topic => Number.isInteger(topic.count)))
    assert.ok(res.body.data.every(topic => topic.count >= 0))
  } finally {
    server.close()
  }
})
```

- [ ] **Step 2: Create backend config**

Create `server/src/config.js`:

```js
const path = require('path')

const rootDir = path.join(__dirname, '..')

module.exports = {
  port: process.env.PORT || 3000,
  jwtSecret: process.env.JWT_SECRET || 'dev_only_change_me',
  dataDir: process.env.DATA_DIR || path.join(rootDir, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.join(rootDir, 'uploads'),
  sqlitePath: process.env.SQLITE_PATH || path.join(rootDir, 'data', 'campus-wall.sqlite'),
  wechatAppId: process.env.WECHAT_APP_ID || '',
  wechatSecret: process.env.WECHAT_APP_SECRET || '',
  allowDemoLogin: process.env.ALLOW_DEMO_LOGIN !== 'false'
}
```

- [ ] **Step 3: Create SQLite schema and helpers**

Create `server/src/db.js`:

```js
const fs = require('fs')
const path = require('path')
const Database = require('better-sqlite3')
const { sqlitePath, dataDir } = require('./config')

if (!fs.existsSync(path.dirname(sqlitePath))) {
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true })
}

const db = new Database(sqlitePath)
db.pragma('journal_mode = WAL')

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      openid TEXT UNIQUE NOT NULL,
      nickname TEXT NOT NULL,
      avatar TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      campus TEXT NOT NULL DEFAULT '主校区',
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      sub_type TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      images TEXT NOT NULL DEFAULT '[]',
      author_id TEXT NOT NULL,
      is_anonymous INTEGER NOT NULL DEFAULT 1,
      campus TEXT NOT NULL DEFAULT '主校区',
      location TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      extra TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active',
      moderation_level TEXT NOT NULL DEFAULT 'clean',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_id TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS post_likes (post_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (post_id, user_id));
    CREATE TABLE IF NOT EXISTS post_favorites (post_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (post_id, user_id));
    CREATE TABLE IF NOT EXISTS follows (follower_id TEXT NOT NULL, following_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (follower_id, following_id));
    CREATE TABLE IF NOT EXISTS blocks (blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (blocker_id, blocked_id));
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, post_id TEXT, user_a_id TEXT NOT NULL, user_b_id TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_id TEXT NOT NULL, receiver_id TEXT NOT NULL, content TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, title TEXT NOT NULL, content TEXT NOT NULL, post_id TEXT, is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, reason TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL, resolved_at INTEGER);
  `)
}

function readSeedJson(filename, fallback) {
  const filepath = path.join(dataDir, filename)
  if (!fs.existsSync(filepath)) return fallback
  return JSON.parse(fs.readFileSync(filepath, 'utf8'))
}

function seedFromJson() {
  const existing = db.prepare('SELECT COUNT(*) AS count FROM posts').get().count
  if (existing > 0) return

  const now = Date.now()
  const usersById = new Map()
  for (const post of readSeedJson('posts.json', [])) {
    usersById.set(post.author.id, {
      id: post.author.id,
      openid: `seed_${post.author.id}`,
      nickname: post.author.nickname || '校园同学',
      avatar: post.author.avatar || '',
      signature: '',
      campus: post.campus || '主校区',
      role: 'user',
      status: 'active',
      created_at: now
    })
  }

  const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, openid, nickname, avatar, signature, campus, role, status, created_at) VALUES (@id, @openid, @nickname, @avatar, @signature, @campus, @role, @status, @created_at)')
  const insertPost = db.prepare('INSERT OR IGNORE INTO posts (id, category, sub_type, title, content, images, author_id, is_anonymous, campus, location, tags, extra, status, moderation_level, created_at, updated_at) VALUES (@id, @category, @sub_type, @title, @content, @images, @author_id, @is_anonymous, @campus, @location, @tags, @extra, @status, @moderation_level, @created_at, @updated_at)')

  const seed = db.transaction(() => {
    for (const user of usersById.values()) insertUser.run(user)
    for (const post of readSeedJson('posts.json', [])) {
      insertPost.run({
        id: post.id,
        category: post.category,
        sub_type: post.subType || '',
        title: post.title || '',
        content: post.content,
        images: JSON.stringify(post.images || []),
        author_id: post.author.id,
        is_anonymous: post.author.isAnonymous ? 1 : 0,
        campus: post.campus || '主校区',
        location: post.location || '',
        tags: JSON.stringify(post.tags || []),
        extra: JSON.stringify(post.extra || {}),
        status: post.status || 'active',
        moderation_level: 'clean',
        created_at: post.time || now,
        updated_at: post.time || now
      })
    }
  })
  seed()
}

migrate()
seedFromJson()

module.exports = { db }
```

- [ ] **Step 4: Import the config in `server/app.js`**

At the top of `server/app.js`, replace hard-coded constants with:

```js
const { jwtSecret: JWT_SECRET, uploadDir: UPLOAD_DIR, dataDir: DATA_DIR, port: PORT } = require('./src/config')
const { db } = require('./src/db')
```

Keep the old JSON helpers temporarily until each route is migrated.

- [ ] **Step 5: Run the tests**

Run:

```powershell
npm test --prefix server
```

Expected: the smoke test and topic-count test pass.

- [ ] **Step 6: Commit or record progress**

If Git exists:

```powershell
git add server/package.json server/package-lock.json server/app.js server/src/config.js server/src/db.js server/tests/api.test.js
git commit -m "feat: add sqlite pilot data store"
```

If Git does not exist, add:

```markdown
- Completed Task 2: SQLite pilot store and seed migration.
```

---

### Task 3: Production-Shaped WeChat Login And Auth Guards

**Files:**
- Create: `server/src/services/authService.js`
- Modify: `server/app.js`
- Modify: `server/tests/api.test.js`
- Modify: `app.js`
- Create: `utils/auth.js`

- [ ] **Step 1: Add auth API tests**

Append to `server/tests/api.test.js`:

```js
async function login(server, nickname = '测试同学') {
  const res = await request(server, 'POST', '/api/auth/login', {
    code: `dev_code_${Date.now()}_${Math.random()}`,
    nickname,
    avatar: ''
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.code, 0)
  assert.ok(res.body.data.token)
  return res.body.data
}

test('login creates a user and returns a token', async () => {
  const server = app.listen(0)
  try {
    const data = await login(server)
    const profile = await request(server, 'GET', '/api/user/info', null, data.token)
    assert.equal(profile.body.code, 0)
    assert.equal(profile.body.data.nickname, '测试同学')
  } finally {
    server.close()
  }
})
```

- [ ] **Step 2: Create the auth service**

Create `server/src/services/authService.js`:

```js
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { db } = require('../db')
const { jwtSecret, wechatAppId, wechatSecret, allowDemoLogin } = require('../config')

async function resolveOpenid(code) {
  if (wechatAppId && wechatSecret) {
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${encodeURIComponent(wechatAppId)}&secret=${encodeURIComponent(wechatSecret)}&js_code=${encodeURIComponent(code)}&grant_type=authorization_code`
    const res = await fetch(url)
    const data = await res.json()
    if (!data.openid) throw new Error(data.errmsg || '微信登录失败')
    return data.openid
  }
  if (allowDemoLogin) return `dev_${code}`
  throw new Error('服务端未配置微信登录')
}

async function loginWithWeChat({ code, nickname, avatar }) {
  const openid = await resolveOpenid(code)
  const now = Date.now()
  let user = db.prepare('SELECT * FROM users WHERE openid = ?').get(openid)
  if (!user) {
    user = {
      id: `u${uuidv4().replace(/-/g, '').slice(0, 8)}`,
      openid,
      nickname: nickname || '校园同学',
      avatar: avatar || '',
      signature: '热爱校园生活',
      campus: '主校区',
      role: 'user',
      status: 'active',
      created_at: now
    }
    db.prepare('INSERT INTO users (id, openid, nickname, avatar, signature, campus, role, status, created_at) VALUES (@id, @openid, @nickname, @avatar, @signature, @campus, @role, @status, @created_at)').run(user)
  }
  const token = jwt.sign({ userId: user.id }, jwtSecret, { expiresIn: '30d' })
  return { token, userInfo: normalizeUser(user) }
}

function normalizeUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    avatar: user.avatar,
    signature: user.signature,
    campus: user.campus,
    role: user.role,
    status: user.status
  }
}

function getUserById(userId) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(userId)
}

module.exports = { loginWithWeChat, normalizeUser, getUserById }
```

- [ ] **Step 3: Replace login route and strengthen `authMiddleware`**

In `server/app.js`, import the service:

```js
const { loginWithWeChat, normalizeUser, getUserById } = require('./src/services/authService')
```

Replace the login route with:

```js
app.post('/api/auth/login', async (req, res) => {
  try {
    const data = await loginWithWeChat(req.body)
    res.json({ code: 0, data })
  } catch (e) {
    res.json({ code: 400, msg: e.message || '登录失败' })
  }
})
```

Update `authMiddleware` after token verification:

```js
const user = getUserById(decoded.userId)
if (!user) return res.json({ code: 401, msg: '用户不存在' })
if (user.status === 'banned') return res.json({ code: 403, msg: '账号已被封禁' })
req.userId = decoded.userId
req.user = user
```

- [ ] **Step 4: Add shared mini-program auth helper**

Create `utils/auth.js`:

```js
function isLoggedIn() {
  const app = getApp()
  return !!app.globalData.token
}

function requireLogin(action) {
  if (isLoggedIn()) return true
  wx.showModal({
    title: '需要登录',
    content: action ? `${action}需要先登录微信账号` : '请先登录微信账号',
    confirmText: '去登录',
    success: res => {
      if (res.confirm) wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
    }
  })
  return false
}

module.exports = { isLoggedIn, requireLogin }
```

- [ ] **Step 5: Use the shared helper in `app.js`**

Replace `requireLogin(callback)` with:

```js
requireLogin(callback, action = '') {
  if (this.checkLogin()) {
    callback && callback()
    return true
  }
  wx.showModal({
    title: '需要登录',
    content: action ? `${action}需要先登录微信账号` : '请先登录微信账号',
    confirmText: '去登录',
    success: res => {
      if (res.confirm) wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
    }
  })
  return false
}
```

- [ ] **Step 6: Run tests**

Run:

```powershell
npm test --prefix server
```

Expected: auth and smoke tests pass.

---

### Task 4: Feed, Topics, Reactions, Favorites, And Comments

**Files:**
- Create: `server/src/services/feedService.js`
- Modify: `server/app.js`
- Modify: `server/tests/api.test.js`
- Modify: `utils/api.js`
- Modify: `pages/index/index.js`
- Modify: `pages/search/search.js`
- Modify: `components/post-card/post-card.wxml`
- Modify: `components/post-card/post-card.js`

- [ ] **Step 1: Add persistence tests for likes and favorites**

Append to `server/tests/api.test.js`:

```js
test('like and favorite persist for the logged-in user', async () => {
  const server = app.listen(0)
  try {
    const auth = await login(server, '互动测试')
    const like = await request(server, 'POST', '/api/posts/1/like', {}, auth.token)
    const favorite = await request(server, 'POST', '/api/posts/1/favorite', {}, auth.token)
    assert.equal(like.body.code, 0)
    assert.equal(favorite.body.code, 0)
    const detail = await request(server, 'GET', '/api/posts/1', null, auth.token)
    assert.equal(detail.body.data.isLiked, true)
    assert.equal(detail.body.data.isFavorited, true)
  } finally {
    server.close()
  }
})
```

- [ ] **Step 2: Create `feedService` mapping functions**

Create `server/src/services/feedService.js`:

```js
const { v4: uuidv4 } = require('uuid')
const { db } = require('../db')

function parseJson(value, fallback) {
  try { return JSON.parse(value || '') } catch (e) { return fallback }
}

function postToApi(row, viewerId = '') {
  const author = db.prepare('SELECT id, nickname, avatar FROM users WHERE id = ?').get(row.author_id) || {}
  const likes = db.prepare('SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?').get(row.id).count
  const favorites = db.prepare('SELECT COUNT(*) AS count FROM post_favorites WHERE post_id = ?').get(row.id).count
  const comments = db.prepare("SELECT COUNT(*) AS count FROM comments WHERE post_id = ? AND status = 'active'").get(row.id).count
  const isLiked = viewerId ? !!db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(row.id, viewerId) : false
  const isFavorited = viewerId ? !!db.prepare('SELECT 1 FROM post_favorites WHERE post_id = ? AND user_id = ?').get(row.id, viewerId) : false
  return {
    id: row.id,
    category: row.category,
    subType: row.sub_type,
    title: row.title,
    content: row.content,
    images: parseJson(row.images, []),
    author: {
      id: row.author_id,
      nickname: row.is_anonymous ? '匿名同学' : author.nickname,
      avatar: row.is_anonymous ? '' : author.avatar,
      isAnonymous: !!row.is_anonymous
    },
    campus: row.campus,
    location: row.location,
    time: row.created_at,
    likes,
    comments,
    favorites,
    isLiked,
    isFavorited,
    tags: parseJson(row.tags, []),
    status: row.status,
    moderationLevel: row.moderation_level,
    extra: parseJson(row.extra, {})
  }
}

function listPosts({ page = 1, pageSize = 10, sort = 'latest', category = '', campus = '', feed = 'latest', viewerId = '' }) {
  const limit = Number(pageSize)
  const offset = (Number(page) - 1) * limit
  const params = []
  const where = ["p.status = 'active'"]
  if (category) { where.push('p.category = ?'); params.push(category) }
  if (campus && campus !== '全部') { where.push('p.campus = ?'); params.push(campus) }
  if (feed === 'following' && viewerId) {
    where.push('p.author_id IN (SELECT following_id FROM follows WHERE follower_id = ?)')
    params.push(viewerId)
  }
  const order = sort === 'hot'
    ? 'ORDER BY (SELECT COUNT(*) FROM post_likes WHERE post_id = p.id) DESC, p.created_at DESC'
    : 'ORDER BY p.created_at DESC'
  const rows = db.prepare(`SELECT p.* FROM posts p WHERE ${where.join(' AND ')} ${order} LIMIT ? OFFSET ?`).all(...params, limit + 1, offset)
  return {
    list: rows.slice(0, limit).map(row => postToApi(row, viewerId)),
    hasMore: rows.length > limit
  }
}

function toggleLike(postId, userId) {
  const found = db.prepare('SELECT 1 FROM post_likes WHERE post_id = ? AND user_id = ?').get(postId, userId)
  if (found) db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = ?').run(postId, userId)
  else db.prepare('INSERT INTO post_likes (post_id, user_id, created_at) VALUES (?, ?, ?)').run(postId, userId, Date.now())
  return postToApi(db.prepare('SELECT * FROM posts WHERE id = ?').get(postId), userId)
}

function toggleFavorite(postId, userId) {
  const found = db.prepare('SELECT 1 FROM post_favorites WHERE post_id = ? AND user_id = ?').get(postId, userId)
  if (found) db.prepare('DELETE FROM post_favorites WHERE post_id = ? AND user_id = ?').run(postId, userId)
  else db.prepare('INSERT INTO post_favorites (post_id, user_id, created_at) VALUES (?, ?, ?)').run(postId, userId, Date.now())
  return postToApi(db.prepare('SELECT * FROM posts WHERE id = ?').get(postId), userId)
}

function createPost(payload, userId, moderationLevel) {
  const now = Date.now()
  const post = {
    id: uuidv4(),
    category: payload.category,
    sub_type: payload.subType || '',
    title: payload.title || '',
    content: payload.content,
    images: JSON.stringify(payload.images || []),
    author_id: userId,
    is_anonymous: payload.isAnonymous ? 1 : 0,
    campus: payload.campus || '主校区',
    location: payload.location || '',
    tags: JSON.stringify(payload.tags || []),
    extra: JSON.stringify(payload.extra || {}),
    status: 'active',
    moderation_level: moderationLevel,
    created_at: now,
    updated_at: now
  }
  db.prepare('INSERT INTO posts (id, category, sub_type, title, content, images, author_id, is_anonymous, campus, location, tags, extra, status, moderation_level, created_at, updated_at) VALUES (@id, @category, @sub_type, @title, @content, @images, @author_id, @is_anonymous, @campus, @location, @tags, @extra, @status, @moderation_level, @created_at, @updated_at)').run(post)
  return postToApi(db.prepare('SELECT * FROM posts WHERE id = ?').get(post.id), userId)
}

module.exports = { listPosts, postToApi, toggleLike, toggleFavorite, createPost }
```

- [ ] **Step 3: Update backend routes to use `feedService`**

In `server/app.js`, route `/api/posts`, `/api/posts/:id`, `/api/posts`, `/api/posts/:id/like`, and `/api/posts/:id/favorite` through the service. For public list/detail routes, parse an optional bearer token if present and pass `viewerId`; if token is invalid, treat the user as logged out for public reads.

Use this shape:

```js
app.get('/api/posts', optionalAuth, (req, res) => {
  const data = listPosts({ ...req.query, viewerId: req.userId || '' })
  res.json({ code: 0, data })
})
```

- [ ] **Step 4: Fix 2xx handling in `utils/api.js`**

Replace:

```js
if (res.statusCode === 200) {
```

with:

```js
if (res.statusCode >= 200 && res.statusCode < 300) {
```

- [ ] **Step 5: Wire list-page like and favorite to backend**

In `pages/index/index.js`, import `post`:

```js
const { get, post } = require('../../utils/api')
```

Replace local-only `onLikePost` and `onFavoritePost` with:

```js
async onLikePost(e) {
  if (!app.requireLogin(null, '点赞')) return
  const id = e.detail.id
  const updated = await post(`/posts/${id}/like`, {}, false)
  this.setData({ posts: this.data.posts.map(item => item.id === id ? updated : item) })
},

async onFavoritePost(e) {
  if (!app.requireLogin(null, '收藏')) return
  const id = e.detail.id
  const updated = await post(`/posts/${id}/favorite`, {}, false)
  this.setData({ posts: this.data.posts.map(item => item.id === id ? updated : item) })
}
```

- [ ] **Step 6: Replace card share view with native share button**

In `components/post-card/post-card.wxml`, replace the share action `<view>` with:

```xml
<button class="action-btn share-button" open-type="share" data-id="{{post.id}}" catchtap="onShare">
  <image class="action-icon" src="/images/icon_share.png" mode="aspectFit"></image>
  <text class="gray-color">分享</text>
</button>
```

Add button reset styles in `components/post-card/post-card.wxss`:

```css
.share-button {
  padding: 0;
  margin: 0;
  background: transparent;
  border: 0;
  line-height: inherit;
}

.share-button::after {
  border: 0;
}
```

- [ ] **Step 7: Run tests and static checks**

Run:

```powershell
npm test --prefix server
Select-String -Path 'pages\\index\\index.js','pages\\search\\search.js' -Pattern 'isLiked: !p.isLiked','isFavorited: !p.isFavorited'
```

Expected: tests pass; the search finds no local-only optimistic toggles in changed list pages.

---

### Task 5: Follow System

**Files:**
- Create: `server/src/services/followService.js`
- Modify: `server/app.js`
- Modify: `server/tests/api.test.js`
- Modify: `pages/detail/detail.*`
- Modify: `components/post-card/*`
- Create: `pages/mine/follows/follows.js`
- Create: `pages/mine/follows/follows.wxml`
- Create: `pages/mine/follows/follows.wxss`
- Create: `pages/mine/follows/follows.json`
- Modify: `app.json`

- [ ] **Step 1: Add follow API tests**

Append to `server/tests/api.test.js`:

```js
test('user can follow and unfollow another author', async () => {
  const server = app.listen(0)
  try {
    const auth = await login(server, '关注测试')
    const follow = await request(server, 'POST', '/api/users/u1/follow', {}, auth.token)
    assert.equal(follow.body.code, 0)
    assert.equal(follow.body.data.isFollowing, true)
    const unfollow = await request(server, 'POST', '/api/users/u1/follow', {}, auth.token)
    assert.equal(unfollow.body.code, 0)
    assert.equal(unfollow.body.data.isFollowing, false)
  } finally {
    server.close()
  }
})
```

- [ ] **Step 2: Create follow service**

Create `server/src/services/followService.js`:

```js
const { db } = require('../db')

function toggleFollow(followerId, followingId) {
  if (followerId === followingId) return { isFollowing: false, message: '不能关注自己' }
  const existing = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(followerId, followingId)
  if (existing) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').run(followerId, followingId)
    return { isFollowing: false }
  }
  db.prepare('INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)').run(followerId, followingId, Date.now())
  return { isFollowing: true }
}

function getFollowState(viewerId, userId) {
  return !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?').get(viewerId, userId)
}

function listFollows(userId, type) {
  const sql = type === 'followers'
    ? 'SELECT u.id, u.nickname, u.avatar, u.signature FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? ORDER BY f.created_at DESC'
    : 'SELECT u.id, u.nickname, u.avatar, u.signature FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? ORDER BY f.created_at DESC'
  return db.prepare(sql).all(userId)
}

module.exports = { toggleFollow, getFollowState, listFollows }
```

- [ ] **Step 3: Add follow routes**

In `server/app.js`, add:

```js
app.post('/api/users/:id/follow', authMiddleware, (req, res) => {
  const data = toggleFollow(req.userId, req.params.id)
  if (data.message) return res.json({ code: 400, msg: data.message })
  res.json({ code: 0, data })
})

app.get('/api/users/:id/follows', authMiddleware, (req, res) => {
  const type = req.query.type === 'followers' ? 'followers' : 'following'
  res.json({ code: 0, data: listFollows(req.params.id, type) })
})
```

- [ ] **Step 4: Add follow button to post cards**

In `components/post-card/post-card.wxml`, add a small follow button in the header when not anonymous:

```xml
<button wx:if="{{!post.author.isAnonymous && post.author.id !== currentUserId}}" class="follow-btn" catchtap="onFollow" data-id="{{post.author.id}}">
  {{post.author.isFollowing ? '已关注' : '关注'}}
</button>
```

In `components/post-card/post-card.js`, add:

```js
onFollow(e) {
  this.triggerEvent('follow', { userId: e.currentTarget.dataset.id })
}
```

- [ ] **Step 5: Register follows page**

Add `"pages/mine/follows/follows"` to `app.json` pages.

Create `pages/mine/follows/follows.json`:

```json
{
  "navigationBarTitleText": "关注"
}
```

- [ ] **Step 6: Run tests**

Run:

```powershell
npm test --prefix server
```

Expected: follow test passes.

---

### Task 6: Private Messaging And Blocking

**Files:**
- Create: `server/src/services/messageService.js`
- Modify: `server/app.js`
- Modify: `server/tests/api.test.js`
- Modify: `app.json`
- Modify: `pages/message/message.*`
- Create: `pages/message/chat/chat.js`
- Create: `pages/message/chat/chat.wxml`
- Create: `pages/message/chat/chat.wxss`
- Create: `pages/message/chat/chat.json`
- Create: `components/conversation-item/*`
- Modify: `pages/detail/detail.*`

- [ ] **Step 1: Add messaging API test**

Append to `server/tests/api.test.js`:

```js
test('private message creates a conversation and unread message', async () => {
  const server = app.listen(0)
  try {
    const sender = await login(server, '私信发送者')
    const start = await request(server, 'POST', '/api/conversations', { postId: '1', receiverId: 'u1' }, sender.token)
    assert.equal(start.body.code, 0)
    const conversationId = start.body.data.id
    const sent = await request(server, 'POST', `/api/conversations/${conversationId}/messages`, { content: '你好，还在吗？' }, sender.token)
    assert.equal(sent.body.code, 0)
    assert.equal(sent.body.data.content, '你好，还在吗？')
  } finally {
    server.close()
  }
})
```

- [ ] **Step 2: Create message service**

Create `server/src/services/messageService.js`:

```js
const { v4: uuidv4 } = require('uuid')
const { db } = require('../db')

function isBlocked(senderId, receiverId) {
  return !!db.prepare('SELECT 1 FROM blocks WHERE blocker_id = ? AND blocked_id = ?').get(receiverId, senderId)
}

function findOrCreateConversation(userId, receiverId, postId = '') {
  const existing = db.prepare(`
    SELECT * FROM conversations
    WHERE post_id = ? AND ((user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?))
  `).get(postId, userId, receiverId, receiverId, userId)
  if (existing) return existing
  const now = Date.now()
  const conversation = { id: uuidv4(), post_id: postId, user_a_id: userId, user_b_id: receiverId, created_at: now, updated_at: now }
  db.prepare('INSERT INTO conversations (id, post_id, user_a_id, user_b_id, created_at, updated_at) VALUES (@id, @post_id, @user_a_id, @user_b_id, @created_at, @updated_at)').run(conversation)
  return conversation
}

function listConversations(userId) {
  return db.prepare(`
    SELECT c.*, m.content AS last_content, m.created_at AS last_time,
      (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND receiver_id = ? AND is_read = 0) AS unread_count
    FROM conversations c
    LEFT JOIN messages m ON m.id = (SELECT id FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1)
    WHERE c.user_a_id = ? OR c.user_b_id = ?
    ORDER BY c.updated_at DESC
  `).all(userId, userId, userId)
}

function listMessages(conversationId, userId) {
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)').get(conversationId, userId, userId)
  if (!conversation) throw new Error('会话不存在')
  db.prepare('UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND receiver_id = ?').run(conversationId, userId)
  return db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(conversationId)
}

function sendMessage(conversationId, senderId, content) {
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)').get(conversationId, senderId, senderId)
  if (!conversation) throw new Error('会话不存在')
  const receiverId = conversation.user_a_id === senderId ? conversation.user_b_id : conversation.user_a_id
  if (isBlocked(senderId, receiverId)) throw new Error('对方已开启屏蔽，无法继续私信')
  const message = { id: uuidv4(), conversation_id: conversationId, sender_id: senderId, receiver_id: receiverId, content: content.trim(), status: 'active', is_read: 0, created_at: Date.now() }
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, receiver_id, content, status, is_read, created_at) VALUES (@id, @conversation_id, @sender_id, @receiver_id, @content, @status, @is_read, @created_at)').run(message)
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(message.created_at, conversationId)
  return message
}

function blockUser(blockerId, blockedId) {
  db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(blockerId, blockedId, Date.now())
  return { isBlocked: true }
}

module.exports = { findOrCreateConversation, listConversations, listMessages, sendMessage, blockUser }
```

- [ ] **Step 3: Add messaging routes**

In `server/app.js`, add:

```js
app.get('/api/conversations', authMiddleware, (req, res) => {
  res.json({ code: 0, data: listConversations(req.userId) })
})

app.post('/api/conversations', authMiddleware, (req, res) => {
  const data = findOrCreateConversation(req.userId, req.body.receiverId, req.body.postId || '')
  res.json({ code: 0, data })
})

app.get('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  try {
    res.json({ code: 0, data: listMessages(req.params.id, req.userId) })
  } catch (e) {
    res.json({ code: 404, msg: e.message })
  }
})

app.post('/api/conversations/:id/messages', authMiddleware, (req, res) => {
  try {
    res.json({ code: 0, data: sendMessage(req.params.id, req.userId, req.body.content || '') })
  } catch (e) {
    res.json({ code: 400, msg: e.message })
  }
})

app.post('/api/users/:id/block', authMiddleware, (req, res) => {
  res.json({ code: 0, data: blockUser(req.userId, req.params.id) })
})
```

- [ ] **Step 4: Register chat page**

Add `"pages/message/chat/chat"` to `app.json` pages.

Create `pages/message/chat/chat.json`:

```json
{
  "navigationBarTitleText": "私信"
}
```

- [ ] **Step 5: Implement chat page JS**

Create `pages/message/chat/chat.js`:

```js
const { get, post } = require('../../../utils/api')
const { requireLogin } = require('../../../utils/auth')

Page({
  data: {
    conversationId: '',
    receiverId: '',
    postId: '',
    messages: [],
    inputValue: '',
    isLoading: false
  },

  async onLoad(options) {
    if (!requireLogin('私信')) return
    if (options.conversationId) {
      this.setData({ conversationId: options.conversationId })
      await this.loadMessages()
      return
    }
    const conversation = await post('/conversations', { receiverId: options.receiverId, postId: options.postId || '' })
    this.setData({ conversationId: conversation.id, receiverId: options.receiverId || '', postId: options.postId || '' })
    await this.loadMessages()
  },

  async loadMessages() {
    const messages = await get(`/conversations/${this.data.conversationId}/messages`, {}, false)
    this.setData({ messages })
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value })
  },

  async onSend() {
    const content = this.data.inputValue.trim()
    if (!content) return
    const sent = await post(`/conversations/${this.data.conversationId}/messages`, { content }, false)
    this.setData({ messages: [...this.data.messages, sent], inputValue: '' })
  }
})
```

- [ ] **Step 6: Add contact button to detail page**

In `pages/detail/detail.wxml`, add a protected action button near the footer:

```xml
<button class="contact-btn" bindtap="onContactAuthor">私信作者</button>
```

In `pages/detail/detail.js`, add:

```js
onContactAuthor() {
  if (!app.requireLogin(null, '私信作者')) return
  const post = this.data.post
  wx.navigateTo({
    url: `/pages/message/chat/chat?receiverId=${post.author.id}&postId=${post.id}`
  })
}
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm test --prefix server
```

Expected: messaging tests pass.

---

### Task 7: Moderation, Reports, Admin Queue, And Bans

**Files:**
- Create: `server/src/services/moderationService.js`
- Modify: `server/app.js`
- Modify: `server/tests/api.test.js`
- Modify: `app.json`
- Create: `pages/admin/moderation/moderation.js`
- Create: `pages/admin/moderation/moderation.wxml`
- Create: `pages/admin/moderation/moderation.wxss`
- Create: `pages/admin/moderation/moderation.json`
- Modify: `pages/detail/detail.*`
- Modify: `pages/message/chat/chat.*`

- [ ] **Step 1: Add moderation tests**

Append to `server/tests/api.test.js`:

```js
test('severe sensitive content is blocked before publish', async () => {
  const server = app.listen(0)
  try {
    const auth = await login(server, '审核测试')
    const res = await request(server, 'POST', '/api/posts', {
      category: 'daily',
      subType: 'chat',
      content: '代考服务'
    }, auth.token)
    assert.equal(res.body.code, 400)
    assert.match(res.body.msg, /违规|敏感|发布/)
  } finally {
    server.close()
  }
})
```

- [ ] **Step 2: Create moderation service**

Create `server/src/services/moderationService.js`:

```js
const { v4: uuidv4 } = require('uuid')
const { db } = require('../db')

const severeWords = ['赌博', '色情', '暴力', '毒品', '枪支', '诈骗', '传销', '代考', '代写', '作弊']
const reviewWords = ['加微信', '兼职', '返利', '刷单', '包过', '校外']

function classifyText(text) {
  const source = String(text || '')
  if (severeWords.some(word => source.includes(word))) return 'blocked'
  if (reviewWords.some(word => source.includes(word))) return 'review'
  return 'clean'
}

function createReport({ reporterId, targetType, targetId, reason, detail = '' }) {
  const report = {
    id: uuidv4(),
    reporter_id: reporterId,
    target_type: targetType,
    target_id: targetId,
    reason,
    detail,
    status: 'pending',
    created_at: Date.now(),
    resolved_at: null
  }
  db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, detail, status, created_at, resolved_at) VALUES (@id, @reporter_id, @target_type, @target_id, @reason, @detail, @status, @created_at, @resolved_at)').run(report)
  return report
}

function listReports() {
  return db.prepare("SELECT * FROM reports WHERE status = 'pending' ORDER BY created_at DESC").all()
}

function hideTarget(targetType, targetId) {
  if (targetType === 'post') db.prepare("UPDATE posts SET status = 'hidden' WHERE id = ?").run(targetId)
  if (targetType === 'comment') db.prepare("UPDATE comments SET status = 'hidden' WHERE id = ?").run(targetId)
  if (targetType === 'message') db.prepare("UPDATE messages SET status = 'hidden' WHERE id = ?").run(targetId)
  return { status: 'hidden' }
}

function banUser(userId) {
  db.prepare("UPDATE users SET status = 'banned' WHERE id = ?").run(userId)
  return { status: 'banned' }
}

module.exports = { classifyText, createReport, listReports, hideTarget, banUser }
```

- [ ] **Step 3: Use moderation in publish**

In the `/api/posts` route, before creating the post:

```js
const level = classifyText(`${req.body.title || ''}\n${req.body.content || ''}`)
if (level === 'blocked') return res.json({ code: 400, msg: '内容包含违规信息，无法发布' })
const created = createPost(req.body, req.userId, level)
res.json({ code: 0, data: created })
```

- [ ] **Step 4: Replace report route**

Replace `/api/report` with:

```js
app.post('/api/report', authMiddleware, (req, res) => {
  const { targetType = 'post', targetId, reason, detail = '' } = req.body
  if (!targetId || !reason) return res.json({ code: 400, msg: '请选择举报原因' })
  res.json({ code: 0, data: createReport({ reporterId: req.userId, targetType, targetId, reason, detail }) })
})
```

- [ ] **Step 5: Add admin routes**

Add:

```js
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return res.json({ code: 403, msg: '无管理员权限' })
  next()
}

app.get('/api/admin/reports', authMiddleware, adminOnly, (req, res) => {
  res.json({ code: 0, data: listReports() })
})

app.post('/api/admin/hide', authMiddleware, adminOnly, (req, res) => {
  res.json({ code: 0, data: hideTarget(req.body.targetType, req.body.targetId) })
})

app.post('/api/admin/users/:id/ban', authMiddleware, adminOnly, (req, res) => {
  res.json({ code: 0, data: banUser(req.params.id) })
})
```

- [ ] **Step 6: Register admin page**

Add `"pages/admin/moderation/moderation"` to `app.json` pages.

Create `pages/admin/moderation/moderation.json`:

```json
{
  "navigationBarTitleText": "审核处理"
}
```

- [ ] **Step 7: Run tests**

Run:

```powershell
npm test --prefix server
```

Expected: moderation tests pass.

---

### Task 8: Navigation And Global Visual System

**Files:**
- Modify: `app.json`
- Modify: `app.wxss`
- Modify: `pages/index/index.wxss`
- Modify: `pages/category/category.json`
- Modify: `pages/publish/publish.json`
- Modify: `pages/message/message.json`
- Modify: `pages/mine/mine.json`

- [ ] **Step 1: Update tab bar to five entries**

In `app.json`, make tabBar list:

```json
[
  { "pagePath": "pages/index/index", "text": "首页", "iconPath": "images/tab_home.png", "selectedIconPath": "images/tab_home_active.png" },
  { "pagePath": "pages/category/category", "text": "话题", "iconPath": "images/tab_category.png", "selectedIconPath": "images/tab_category_active.png" },
  { "pagePath": "pages/publish/publish", "text": "发布", "iconPath": "images/tab_home.png", "selectedIconPath": "images/tab_home_active.png" },
  { "pagePath": "pages/message/message", "text": "消息", "iconPath": "images/tab_message.png", "selectedIconPath": "images/tab_message_active.png" },
  { "pagePath": "pages/mine/mine", "text": "我的", "iconPath": "images/tab_mine.png", "selectedIconPath": "images/tab_mine_active.png" }
]
```

Also set:

```json
"navigationBarBackgroundColor": "#16A085",
"navigationBarTextStyle": "white",
"backgroundColor": "#F6F8F7"
```

- [ ] **Step 2: Replace global purple-heavy styles**

In `app.wxss`, define:

```css
page {
  background: #F6F8F7;
  color: #1F2933;
  font-size: 28rpx;
}

.primary-color { color: #16A085; }
.warning-color { color: #F59E0B; }
.gray-color { color: #7B8794; }

.card {
  background: #FFFFFF;
  border-radius: 16rpx;
  box-shadow: 0 4rpx 16rpx rgba(31, 41, 51, 0.06);
}

.tag-primary {
  background: rgba(22, 160, 133, 0.1);
  color: #0E7C67;
}
```

Remove or replace purple gradient utility classes used only for decoration.

- [ ] **Step 3: Verify no old primary purple remains in global config**

Run:

```powershell
Select-String -Path 'app.json','app.wxss' -Pattern '#6C5CE7','purple','gradient'
```

Expected: no result unless a class name remains for compatibility without visual effect.

---

### Task 9: Home Feed And Topics Experience

**Files:**
- Modify: `pages/index/index.js`
- Modify: `pages/index/index.wxml`
- Modify: `pages/index/index.wxss`
- Modify: `pages/category/category.js`
- Modify: `pages/category/category.wxml`
- Modify: `pages/category/category.wxss`

- [ ] **Step 1: Change Home tabs to recommended/latest/following**

In `pages/index/index.js`, set data:

```js
feedTabs: [
  { id: 'recommended', name: '推荐' },
  { id: 'latest', name: '最新' },
  { id: 'following', name: '关注' }
],
activeFeed: 'recommended'
```

When building `/posts` params:

```js
feed: this.data.activeFeed,
sort: this.data.activeFeed === 'recommended' ? 'hot' : 'latest'
```

- [ ] **Step 2: Add feed tab markup**

In `pages/index/index.wxml`, use:

```xml
<view class="feed-tabs">
  <view wx:for="{{feedTabs}}" wx:key="id" class="feed-tab {{activeFeed === item.id ? 'active' : ''}}" data-id="{{item.id}}" bindtap="onSwitchFeed">
    {{item.name}}
  </view>
</view>
```

- [ ] **Step 3: Add feed switch handler**

In `pages/index/index.js`:

```js
onSwitchFeed(e) {
  this.setData({ activeFeed: e.currentTarget.dataset.id, page: 1, posts: [] })
  this.loadPosts()
}
```

- [ ] **Step 4: Convert category page copy to Topics**

In `pages/category/category.json`, set:

```json
{
  "navigationBarTitleText": "话题"
}
```

In `pages/category/category.wxml`, use topic language:

```xml
<view class="topic-page">
  <view class="topic-header">
    <text class="topic-title">校园话题</text>
    <text class="topic-subtitle">找到同频的聊天和互助频道</text>
  </view>
  <view class="topic-grid">
    <view wx:for="{{categoryList}}" wx:key="id" class="topic-card" data-id="{{item.id}}" bindtap="onTapCategory">
      <text class="topic-name">{{item.name}}</text>
      <text class="topic-count">{{item.count || 0}} 条动态</text>
    </view>
  </view>
</view>
```

- [ ] **Step 5: Verify Home and Topics have no fake counts**

Run:

```powershell
Select-String -Path 'pages\\category\\category.js','pages\\index\\index.js' -Pattern 'Math.random','random'
```

Expected: no results.

---

### Task 10: Publish Flow, Validation, Drafts, And Upload Limits

**Files:**
- Modify: `pages/publish/publish.js`
- Modify: `pages/publish/publish.wxml`
- Modify: `pages/publish/publish.wxss`
- Modify: `utils/category.js`
- Modify: `utils/cache.js`

- [ ] **Step 1: Add validation map**

In `pages/publish/publish.js`, add:

```js
const requiredExtraFields = {
  lost: ['lostLocation'],
  trade: ['price', 'condition'],
  carshare: ['departureTime', 'destination'],
  team: ['recruitCount'],
  help: ['deadline']
}
```

- [ ] **Step 2: Strengthen `checkCanPublish`**

Replace `checkCanPublish()` with:

```js
checkCanPublish() {
  const { selectedCategory, selectedSubType, content, title, needTitle, extraData } = this.data
  const hasContent = content.trim().length >= 5
  const hasTitle = needTitle ? title.trim().length >= 2 : true
  const hasSubType = !!selectedSubType
  const requiredFields = requiredExtraFields[selectedCategory] || []
  const hasExtras = requiredFields.every(field => String(extraData[field] || '').trim().length > 0)
  this.setData({
    canPublish: !!selectedCategory && hasSubType && hasContent && hasTitle && hasExtras
  })
}
```

- [ ] **Step 3: Limit image count to six**

In `onChooseImage`, replace:

```js
const remaining = 9 - this.data.imageList.length
```

with:

```js
const remaining = 6 - this.data.imageList.length
if (remaining <= 0) {
  showToast('最多添加6张图片')
  return
}
```

- [ ] **Step 4: Preserve draft on failure**

Before upload in `onPublish`, save:

```js
wx.setStorageSync('publishDraft', {
  selectedCategory: this.data.selectedCategory,
  selectedSubType: this.data.selectedSubType,
  title: this.data.title,
  content: this.data.content,
  imageList: this.data.imageList,
  selectedTopics: this.data.selectedTopics,
  isAnonymous: this.data.isAnonymous,
  campusIndex: this.data.campusIndex,
  extraData: this.data.extraData
})
```

After successful publish, clear:

```js
wx.removeStorageSync('publishDraft')
```

- [ ] **Step 5: Remove final confirmation dialog**

In `onPublish`, remove the `showModal` confirmation before calling the backend. Keep error toasts and success navigation.

- [ ] **Step 6: Verify validation hooks**

Run:

```powershell
Select-String -Path 'pages\\publish\\publish.js' -Pattern 'requiredExtraFields','publishDraft','最多添加6张图片'
```

Expected: all three patterns are present.

---

### Task 11: Messages, Chat UI, Profile, And Follows UI

**Files:**
- Modify: `pages/message/message.js`
- Modify: `pages/message/message.wxml`
- Modify: `pages/message/message.wxss`
- Modify: `pages/message/chat/chat.*`
- Modify: `pages/mine/mine.js`
- Modify: `pages/mine/mine.wxml`
- Modify: `pages/mine/mine.wxss`
- Modify: `pages/mine/follows/follows.*`
- Create: `components/conversation-item/conversation-item.js`
- Create: `components/conversation-item/conversation-item.wxml`
- Create: `components/conversation-item/conversation-item.wxss`
- Create: `components/conversation-item/conversation-item.json`
- Create: `components/user-row/user-row.js`
- Create: `components/user-row/user-row.wxml`
- Create: `components/user-row/user-row.wxss`
- Create: `components/user-row/user-row.json`

- [ ] **Step 1: Add message tabs**

In `pages/message/message.js`, set:

```js
tabs: [
  { id: 'chat', name: '私信' },
  { id: 'comment', name: '评论' },
  { id: 'like', name: '赞藏' },
  { id: 'follow', name: '关注' },
  { id: 'system', name: '系统' }
],
activeTab: 'chat',
conversations: []
```

- [ ] **Step 2: Load conversations on chat tab**

Add:

```js
async loadConversations() {
  if (!app.checkLogin()) {
    this.setData({ conversations: [], unreadCount: 0 })
    return
  }
  const conversations = await get('/conversations', {}, false)
  const unreadCount = conversations.reduce((sum, item) => sum + Number(item.unread_count || 0), 0)
  this.setData({ conversations, unreadCount })
}
```

Call it when `activeTab === 'chat'`.

- [ ] **Step 3: Create conversation item component**

Create `components/conversation-item/conversation-item.json`:

```json
{
  "component": true
}
```

Create `components/conversation-item/conversation-item.wxml`:

```xml
<view class="conversation" bindtap="onTap">
  <view class="avatar">匿</view>
  <view class="main">
    <view class="top">
      <text class="name">{{item.displayName || '匿名同学'}}</text>
      <text class="time">{{item.timeText}}</text>
    </view>
    <text class="last">{{item.last_content || '还没有消息'}}</text>
  </view>
  <view wx:if="{{item.unread_count > 0}}" class="badge">{{item.unread_count}}</view>
</view>
```

Create `components/conversation-item/conversation-item.js`:

```js
Component({
  properties: { item: Object },
  methods: {
    onTap() {
      this.triggerEvent('tap', { id: this.data.item.id })
    }
  }
})
```

- [ ] **Step 4: Link conversation item to chat**

In `pages/message/message.wxml`, render:

```xml
<conversation-item wx:for="{{conversations}}" wx:key="id" item="{{item}}" bind:tap="onTapConversation"></conversation-item>
```

In `pages/message/message.js`, add:

```js
onTapConversation(e) {
  wx.navigateTo({ url: `/pages/message/chat/chat?conversationId=${e.detail.id}` })
}
```

- [ ] **Step 5: Profile social counts and follow list links**

In `pages/mine/mine.wxml`, add links:

```xml
<view class="social-stats">
  <view bindtap="onGoFollows" data-type="following">
    <text class="num">{{userInfo.followingCount || 0}}</text>
    <text>关注</text>
  </view>
  <view bindtap="onGoFollows" data-type="followers">
    <text class="num">{{userInfo.followerCount || 0}}</text>
    <text>粉丝</text>
  </view>
</view>
```

In `pages/mine/mine.js`, add:

```js
onGoFollows(e) {
  if (!app.requireLogin(null, '查看关注')) return
  wx.navigateTo({ url: `/pages/mine/follows/follows?type=${e.currentTarget.dataset.type}&userId=${this.data.userInfo.id}` })
}
```

- [ ] **Step 6: Verify new component declarations**

Run:

```powershell
Test-Path 'components\\conversation-item\\conversation-item.json'
Test-Path 'components\\user-row\\user-row.json'
```

Expected: both return `True`.

---

### Task 12: Settings Cleanup, Empty States, And Final Verification

**Files:**
- Modify: `pages/mine/settings/settings.js`
- Modify: `pages/mine/settings/settings.wxml`
- Modify: `components/empty-state/*`
- Modify: `pages/message/message.wxml`
- Modify: `pages/index/index.wxml`
- Modify: `pages/category/category.wxml`
- Modify: `task_plan.md`
- Modify: `progress.md`

- [ ] **Step 1: Remove fake settings**

In `pages/mine/settings/settings.wxml`, remove or hide:

```xml
<!-- password change -->
<!-- notification preferences that have no backend enforcement -->
<!-- free-form phone binding -->
```

Keep real settings:

```xml
<view class="setting-item" bindtap="onClearNonAuthCache">
  <text>清理图片和页面缓存</text>
</view>
<view class="setting-item" bindtap="onGoPrivacy">
  <text>隐私政策</text>
</view>
<view class="setting-item" bindtap="onGoAgreement">
  <text>用户协议</text>
</view>
```

- [ ] **Step 2: Fix clear-cache behavior**

In `pages/mine/settings/settings.js`, replace `wx.clearStorageSync()` with:

```js
onClearNonAuthCache() {
  const token = wx.getStorageSync('token')
  const userInfo = wx.getStorageSync('userInfo')
  wx.clearStorageSync()
  if (token) wx.setStorageSync('token', token)
  if (userInfo) wx.setStorageSync('userInfo', userInfo)
  wx.showToast({ title: '缓存已清理', icon: 'success' })
}
```

- [ ] **Step 3: Add empty-state action support**

In `components/empty-state/empty-state.js`, ensure properties include:

```js
actionText: {
  type: String,
  value: ''
}
```

and method:

```js
onAction() {
  this.triggerEvent('action')
}
```

In `components/empty-state/empty-state.wxml`, add:

```xml
<button wx:if="{{actionText}}" class="empty-action" bindtap="onAction">{{actionText}}</button>
```

- [ ] **Step 4: Add logged-out message state**

In `pages/message/message.wxml`, when not logged in, render:

```xml
<empty-state title="登录后查看消息" desc="私信、评论、关注和系统通知都会放在这里" action-text="微信登录" bind:action="onGoLogin"></empty-state>
```

In `pages/message/message.js`, add:

```js
onGoLogin() {
  wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
}
```

- [ ] **Step 5: Run backend tests**

Run:

```powershell
npm test --prefix server
```

Expected: all backend API tests pass.

- [ ] **Step 6: Run static checks**

Run:

```powershell
Select-String -Path 'pages\\**\\*.js','components\\**\\*.js' -Pattern 'Math.random','wx.clearStorageSync','isLiked: !p.isLiked','isFavorited: !p.isFavorited'
```

Expected: no result for `Math.random`, no direct `wx.clearStorageSync` outside the fixed cache method, and no local-only list reaction toggles.

- [ ] **Step 7: Manual WeChat DevTools verification**

Open the project in WeChat DevTools and verify these flows:

```text
1. Visitor can browse Home and Topics.
2. Visitor tapping publish/comment/like/favorite/follow/private-message sees a login prompt.
3. WeChat login creates a user and stores token/userInfo.
4. User publishes anonymous and non-anonymous posts.
5. Like, favorite, comment, follow, and private message persist after refresh.
6. Message tab shows conversations and unread count.
7. Chat page can send text and reload history.
8. Report flow creates a pending admin item.
9. Severe sensitive content is blocked before publish.
10. Settings cache cleanup does not log the user out.
```

- [ ] **Step 8: Update tracking files**

In `task_plan.md`, mark Phase 8 complete only after tests and manual verification pass.

In `progress.md`, add:

```markdown
- Completed implementation and verification for the campus social redesign.
```

---

## Self-Review

- Spec coverage: The plan covers WeChat-only login, low-cost persistence, feeds, topics, follows, private messaging, anonymous display with backend accountability, publish-first-review-later moderation, visual cleanup, protected actions, fake-setting removal, and verification.
- Placeholder scan: The plan uses no deferred placeholder requirements; each task names concrete files and commands.
- Type consistency: Backend API paths use `/api/posts`, `/api/users/:id/follow`, `/api/conversations`, `/api/report`, and `/api/admin/*`; frontend calls use the same paths through `utils/api.js`, whose base URL already includes `/api`.
- Scope control: SMS login, email login, school verification, paid smart moderation, media chat, group chat, payments, complex recommendation, and multi-campus operations remain excluded from first launch.
