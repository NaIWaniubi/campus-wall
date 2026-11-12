/**
 * 旧版页面调用 -> 新后端契约的映射层：
 *   - resolvePath / rewriteMethod：旧路径/方法 -> 新路径
 *   - adaptQuery / adaptPayload：旧 query/body -> 新字段
 *   - adaptResponse + normalize*：新后端响应 -> 页面既有渲染字段别名
 *
 * 26 个 import 引用方完全不变（api.js 仍按原签名导出 get/post/put/del/uploadFile/...），
 * 本文件只负责把适配逻辑独立出去，行为 100% 等价。
 */
const { CATEGORY_TO_SECTION, SECTION_TO_CATEGORY } = require('./constants')
const { rawRequest, absUrl, toMs, getAppSafe } = require('./request')

/** 计算实际请求路径（含方法改写语义） */
function resolvePath(oldUrl, method, data) {
  // --- GET ---
  if (method === 'GET') {
    if (oldUrl === '/search/hot-topics') return '/search/hot'
    if (oldUrl === '/user/info') return '/auth/me'
    if (oldUrl === '/user/posts') return '/users/me/posts'
    if (oldUrl === '/user/favorites') return '/users/me/favorites'
    if (oldUrl === '/user/likes') return '/users/me/likes'
    if (oldUrl === '/notifications/unread-count') return '/messages'
    if (oldUrl === '/notifications') return '/messages'
  }

  // --- POST ---
  if (method === 'POST') {
    if (oldUrl === '/report' && data && data.targetType === 'post') {
      return '/posts/' + data.targetId + '/report'
    }
    const resolveMatch = oldUrl.match(/^\/admin\/reports\/(\d+)\/resolve$/)
    if (resolveMatch) return '/admin/reports/' + resolveMatch[1]
    const banMatch = oldUrl.match(/^\/admin\/users\/(\d+)\/ban$/)
    if (banMatch) return '/admin/users/' + banMatch[1]
    if (data && data.replyToId != null && /^\/posts\/\d+\/comments$/.test(oldUrl)) {
      return '/comments/' + data.replyToId + '/reply'
    }
  }

  // --- PUT ---
  if (method === 'PUT') {
    if (oldUrl === '/user/info') return '/users/profile'
  }

  return oldUrl
}

/** 个别接口需要改写 HTTP 方法 */
function rewriteMethod(oldUrl, method) {
  if (method === 'POST' && oldUrl === '/notifications/read-all') return 'PUT'
  if (method === 'POST' && /^\/admin\/reports\/\d+\/resolve$/.test(oldUrl)) return 'PUT'
  if (method === 'POST' && /^\/admin\/users\/\d+\/ban$/.test(oldUrl)) return 'PUT'
  return method
}

/** GET 查询参数映射 */
function adaptQuery(oldUrl, params) {
  const q = Object.assign({}, params)

  if (/^\/posts$/.test(oldUrl)) {
    if (q.category != null) {
      q.sectionId = CATEGORY_TO_SECTION[q.category] || q.category
      delete q.category
    }
    if (q.sort === 'latest') q.sort = 'new'
    delete q.feed       // 关注流暂无对应能力，回退默认热度流
    // campus 现由后端 extra_fields.campus 支持，不再丢弃
  }
  // 子类型裸值归一：发布层把旧 subType 存进 extraFields.itemType，
  // 新后端筛选用 key:val 形态，故裸值统一补 itemType: 前缀
  if (q.subType != null && q.subType !== '' && String(q.subType).indexOf(':') < 0) {
    q.subType = 'itemType:' + q.subType
  }
  if (q.subType === '') delete q.subType
  // 价格区间旧标签（如「500以上」）-> 后端 min-max 格式（"500-"）
  if (q.priceRange && !/^\d*-\d*$/.test(q.priceRange)) {
    const m = String(q.priceRange).match(/\d+/)
    q.priceRange = m ? m[0] + '-' : ''
  }
  // 时间范围中文标签 -> 天数（后端只认数字天）
  const TIME_RANGE_DAYS = { '今天': '1', '3天内': '3', '一周内': '7', '一个月内': '30' }
  if (q.timeRange != null) {
    q.timeRange = TIME_RANGE_DAYS[q.timeRange] || (/^\d+$/.test(q.timeRange) ? q.timeRange : '')
  }
  if (q.type != null && (q.type === '' || q.type === 'all')) {
    delete q.type
  }
  return q
}

/** POST/PUT 请求体映射 */
function adaptPayload(oldUrl, method, data) {
  let payload = data

  // 发帖 / 编辑帖子：category->sectionId，extra->extraFields（subType 并入 itemType）
  if ((method === 'POST' && oldUrl === '/posts') || (method === 'PUT' && /^\/posts\/\d+$/.test(oldUrl))) {
    payload = toBackendPostPayload(data)
  }

  // 评论回复：replyToId 拆到独立回复接口，body 只带 content
  if (method === 'POST' && data && data.replyToId != null && /^\/posts\/\d+\/comments$/.test(oldUrl)) {
    payload = { content: data.content }
  }

  // 举报：只传 reason
  if (method === 'POST' && oldUrl === '/report') {
    payload = { reason: data.reason }
  }

  // 更新资料：白名单字段（campus 等后端不支持的字段丢弃）
  if (method === 'PUT' && oldUrl === '/user/info') {
    const p = {}
    if (data.nickname !== undefined) p.nickname = data.nickname
    if (data.avatar !== undefined) p.avatar = data.avatar
    if (data.signature !== undefined) p.signature = data.signature
    payload = p
  }

  // 管理端举报处理：POST .../resolve -> PUT /admin/reports/:id {action, result}
  // 透传调用方传入的 action / result（resolve / dismiss 等），未传时默认 dismiss
  if (/^\/admin\/reports\/\d+\/resolve$/.test(oldUrl)) {
    const incoming = (data && typeof data === 'object') ? data : {}
    payload = {
      action: incoming.action || 'dismiss',
      result: incoming.result || '已处理',
    }
  }

  return payload
}

function toBackendPostPayload(d) {
  d = d || {}
  const extraFields = Object.assign({}, d.extra || {})
  if (d.subType) extraFields.itemType = d.subType
  if (typeof d.allowMessages !== 'undefined') extraFields.allowMessages = d.allowMessages
  return {
    sectionId: CATEGORY_TO_SECTION[d.category] || Number(d.sectionId) || 0,
    title: d.title,
    content: d.content,
    images: Array.isArray(d.images) ? d.images : [],
    isAnonymous: !!d.isAnonymous,
    extraFields
  }
}

/* ------------------------------------------------------------------ */
/* 响应字段归一化（新后端契约 -> 页面既有渲染字段别名）                  */
/* ------------------------------------------------------------------ */

function normalizeUser(u) {
  if (!u || typeof u !== 'object') return u
  return Object.assign({}, u, {
    studentId: u.studentId != null ? u.studentId : u.student_id,
    creditScore: u.creditScore != null ? u.creditScore : u.credit_score,
    createdAt: u.createdAt != null ? u.createdAt : u.created_at
  })
}

/** 帖子对象：补 time/category/extra/likes 等页面既有渲染字段 */
function normalizePost(p) {
  if (!p || typeof p !== 'object' || p.id == null) return p
  const extra = p.extraFields || {}
  const sectionId = p.section && p.section.id
  const app = getAppSafe()
  const me = (app && app.globalData && app.globalData.userInfo) || {}
  const author = p.author
    ? Object.assign({ isAnonymous: !!p.isAnonymous }, p.author, { avatar: absUrl(p.author.avatar) })
    : { id: me.id || 0, nickname: me.nickname || '我', avatar: absUrl(me.avatar) || '', isAnonymous: false }
  return Object.assign({}, p, {
    images: (p.images || []).map(absUrl),
    thumbImages: (p.thumbImages || []).map(absUrl),
    time: toMs(p.createdAt),
    category: SECTION_TO_CATEGORY[sectionId] || '',
    subType: extra.itemType || extra.subType || '',
    extra,
    tags: p.tags || [],
    campus: extra.campus || p.campus || '',
    location: extra.location || '',
    isLiked: !!p.liked,
    likes: p.likeCount || 0,
    comments: p.commentCount || 0,
    isFavorited: !!p.favorited,
    favorites: p.favoriteCount || 0,
    author
  })
}

/** 评论对象（含楼中楼递归）：author.isAnonymous / isLiked / likes / time(ms) */
function normalizeComment(c) {
  if (!c || typeof c !== 'object') return c
  return Object.assign({}, c, {
    author: Object.assign({ isAnonymous: !!c.isAnonymous }, c.author),
    isLiked: !!c.liked,
    likes: c.likeCount || 0,
    time: toMs(c.createdAt),
    replies: (c.replies || []).map(normalizeComment)
  })
}

/** 列表包装：数组或 {list} 一律归一为分页形状 */
function normalizeListPayload(data, mapItem) {
  let list = []
  let rest = {}
  if (Array.isArray(data)) {
    list = data
  } else if (data && Array.isArray(data.list)) {
    list = data.list
    rest = data
  }
  if (mapItem) list = list.map(mapItem)
  return Object.assign({
    total: list.length,
    page: 1,
    pageSize: Math.max(list.length, 1),
    hasMore: false
  }, rest, { list })
}

/** 点赞/收藏返回值：同时带新旧字段名，页面可用 {...item,...updated} 合并 */
function normalizeReaction(data, kind) {
  if (!data || typeof data !== 'object') return data
  const out = Object.assign({}, data)
  if (kind === 'like') {
    out.isLiked = !!data.liked
    out.likes = data.likeCount != null ? data.likeCount : data.likes
  } else if (kind === 'favorite') {
    out.isFavorited = !!data.favorited
    out.favorites = data.favoriteCount != null ? data.favoriteCount : data.favorites
  }
  return out
}

/** 按旧调用入口做响应适配（reqPath 为实际发出的路径） */
function adaptResponse(oldUrl, reqPath, data) {
  // 未读数：mine 页期望数字
  if (oldUrl === '/notifications/unread-count') {
    return data && typeof data === 'object' && data.unreadCount != null ? data.unreadCount : 0
  }
  // 消息（旧 notifications）：返回归一化数组（time 为 ms 时间戳）
  if (oldUrl === '/notifications') {
    if (Array.isArray(data)) return data
    if (data && Array.isArray(data.list)) {
      return data.list.map(m => Object.assign({}, m, { time: toMs(m.createdAt) }))
    }
    return []
  }
  // 热词：新后端 string[] -> 页面消费的 [{id,name}]
  if (oldUrl === '/search/hot-topics') {
    if (Array.isArray(data) && (data.length === 0 || typeof data[0] === 'string')) {
      return data.map((name, i) => ({ id: i + 1, name }))
    }
    return data
  }
  // 帖子详情
  if (/^\/posts\/\d+$/.test(reqPath)) return normalizePost(data)
  // 帖子列表 / 搜索结果：分页形状
  if (reqPath === '/posts' || reqPath === '/search') {
    return normalizeListPayload(data, normalizePost)
  }
  // 我的帖子 / 我的收藏 / 我的点赞：页面直接消费数组
  if (reqPath === '/users/me/posts' || reqPath === '/users/me/favorites' || reqPath === '/users/me/likes') {
    return normalizeListPayload(data, normalizePost).list
  }
  // 评论列表
  if (/^\/posts\/\d+\/comments$/.test(reqPath)) {
    return Array.isArray(data) ? data.map(normalizeComment) : data
  }
  // 点赞 / 收藏
  const reactionMatch = reqPath.match(/^\/posts\/\d+\/(like|favorite)$/)
  if (reactionMatch) return normalizeReaction(data, reactionMatch[1])
  // 当前用户
  if (reqPath === '/auth/me') return normalizeUser(data)
  // 管理端举报列表：{list} -> 数组
  if (reqPath === '/admin/reports') {
    return data && Array.isArray(data.list) ? data.list : data
  }
  return data
}

/* ------------------------------------------------------------------ */
/* 入口：降级短路 -> 路径/方法/参数改写 -> 发送 -> 响应适配              */
/* ------------------------------------------------------------------ */

function unsupported(method, oldUrl, fallbackValue) {
  return Promise.resolve(fallbackValue)
}

const request = (options) => {
  const { url, method = 'GET', data = {}, header = {}, loading = true } = options

  // --- 未支持接口的优雅降级 ---
  // 关注体系（/users/:id/follow、following、followers、follow-status）已由新后端支持，摘除旧降级短路
  if (method === 'POST') {
    if (url === '/admin/hide') return unsupported(method, url, null)
  }

  const finalMethod = rewriteMethod(url, method)
  const finalUrl = resolvePath(url, finalMethod, data)
  const payload = method === 'GET' ? adaptQuery(url, data) : adaptPayload(url, finalMethod, data)

  return rawRequest({ url: finalUrl, method: finalMethod, data: payload, header, loading })
    .then(data => adaptResponse(url, finalUrl, data))
}

module.exports = {
  request,
  resolvePath,
  rewriteMethod,
  adaptQuery,
  adaptPayload,
  adaptResponse,
  normalizeUser,
  normalizePost,
  normalizeComment,
  normalizeListPayload,
  normalizeReaction,
  toBackendPostPayload,
}
