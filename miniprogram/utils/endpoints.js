/**
 * 业务端点：按域分组的高阶调用，底层走 legacy-adapter 适配。
 * 不直接 import rawRequest；所有调用经 request() 自动跑路径/字段映射。
 *
 * 端点分组：
 *   posts        帖子详情 / 列表 / 点赞 / 收藏 / 评论 / 举报
 *   users        我的资料 / 我的帖子 / 我的评论 / 我的收藏 / 我的点赞
 *   follow       关注 toggle / 关注列表 / 粉丝列表 / 关注状态
 *   search       搜索 / 热词
 *   messages     通知（未读数 / 列表 / 已读 / 全标已读）/ 会话 / 聊天
 *   sections     公告 / 订阅
 *   feedback     意见反馈
 *   admin        管理端统计 / 帖子 / 举报 / 反馈 / 用户
 *   upload       图片上传
 */
const { request, adaptResponse, normalizeUser } = require('./legacy-adapter')
const { rawRequest, absUrl, toMs } = require('./request')
const { showToast } = require('./util')

// 通用 http 别名（endpoints 内部用；旧 facade 也再 export 一份）
const get = (url, data = {}, loading = true) => request({ url, method: 'GET', data, loading })
const post = (url, data = {}, loading = true) => request({ url, method: 'POST', data, loading })
const put = (url, data = {}, loading = true) => request({ url, method: 'PUT', data, loading })
const del = (url, data = {}, loading = true) => request({ url, method: 'DELETE', data, loading })

/* ---------- posts ---------- */
const posts = {
  /** 帖子详情：GET /posts/:id -> normalizePost */
  detail: (id) => get('/posts/' + id, {}, false),
  /** 帖子列表：GET /posts?...  分页形状 */
  list: (params) => get('/posts', params, false),
  /** 帖子搜索：GET /search?...  复用列表归一 */
  search: (params) => get('/search', params, false),
  /** 点赞 toggle：POST /posts/:id/like -> {liked,likeCount} 同时归一带 isLiked/likes */
  like: (id) => post('/posts/' + id + '/like', {}, false),
  /** 收藏 toggle */
  favorite: (id) => post('/posts/' + id + '/favorite', {}, false),
  /** 评论列表 */
  comments: (id) => get('/posts/' + id + '/comments', {}, false),
  /** 发评论（支持 replyToId，会自动改写到独立 reply 接口） */
  addComment: (id, data) => post('/posts/' + id + '/comments', data),
  /** 评论点赞 toggle */
  likeComment: (id) => post('/comments/' + id + '/like', {}, false),
  /** 失物招领匹配候选 */
  matches: (id) => get('/posts/' + id + '/matches', {}, false),
  /** 举报帖子 */
  report: (data) => post('/report', data),
  /** 发帖 */
  create: (data) => post('/posts', data),
  /** 编辑帖子 */
  update: (id, data) => put('/posts/' + id, data),
  /** 删除帖子 */
  remove: (id) => del('/posts/' + id),
}

/* ---------- users ---------- */
const users = {
  /** 当前用户：GET /user/info -> /auth/me */
  me: () => get('/user/info', {}, false),
  /** 公开信息：GET /users/:id */
  byId: (id) => get('/users/' + id, {}, false),
  /** 更新资料：PUT /user/info -> /users/profile */
  update: (data) => put('/user/info', data),
  /** 我的帖子 */
  myPosts: () => get('/user/posts', {}, false),
  /** 我的收藏 */
  myFavorites: () => get('/user/favorites', {}, false),
  /** 我的点赞 */
  myLikes: () => get('/user/likes', {}, false),
}

/* ---------- follow ---------- */
const follow = {
  toggle: (id) => post('/users/' + id + '/follow', {}, false),
  following: (id, page = 1, pageSize = 20) => get('/users/' + id + '/following', { page, pageSize }, false),
  followers: (id, page = 1, pageSize = 20) => get('/users/' + id + '/followers', { page, pageSize }, false),
  status: (id) => get('/users/' + id + '/follow-status', {}, false),
}

/* ---------- search ---------- */
const search = {
  hotTopics: () => get('/search/hot-topics', {}, false),
  query: (params) => get('/search', params, false),
}

/* ---------- messages ---------- */
const messages = {
  /** 未读数：归一为 number */
  unreadCount: () => get('/notifications/unread-count', {}, false),
  /** 通知列表（type 可选） */
  notifications: (type) => get('/notifications', type ? { type } : {}, false),
  /** 标记单条已读：PUT /messages/read/:id */
  markRead: (id) => put('/messages/read/' + id, {}, false),
  /** 全标已读：POST /notifications/read-all -> 改 PUT /messages/read-all */
  readAll: () => post('/notifications/read-all', {}, false),
  /** 会话列表 */
  conversations: () => get('/conversations', {}, false),
  /** 创建会话 */
  createConversation: (peerId) => post('/conversations', { peerId: Number(peerId) }, false),
  /** 会话消息 */
  conversationMessages: (conversationId, page = 1, pageSize = 20) =>
    get('/conversations/' + conversationId + '/messages', { page, pageSize }, false),
  /** 发送消息 */
  sendMessage: (conversationId, content) => post('/conversations/' + conversationId + '/messages', { content }, false),
}

/* ---------- sections / 公告 / 订阅 ---------- */
const sections = {
  activeAnnouncement: () => get('/announcements/active', {}, false),
  ackAnnouncement: (id) => post('/announcements/' + id + '/ack', {}, false),
  subscriptions: () => get('/subscriptions', {}, false),
  toggleSubscription: (sectionId) => post('/subscriptions/' + sectionId, {}, false),
}

/* ---------- feedback ---------- */
const feedback = {
  create: (data) => post('/feedback', data),
}

/* ---------- admin ---------- */
const admin = {
  stats: () => get('/admin/stats', {}, false),
  posts: (params) => get('/admin/posts', params, false),
  reports: (params) => get('/admin/reports', params, false),
  /** 解决举报：POST /admin/reports/:id/resolve -> PUT /admin/reports/:id
   *  入参 payload 用于透传 action('resolve'|'dismiss') 与 result(处理说明)
   */
  resolveReport: (id, payload = {}) => post('/admin/reports/' + id + '/resolve', payload || {}),
  feedbacks: (params) => get('/admin/feedbacks', params, false),
  users: (params) => get('/admin/users', params, false),
}

/* ---------- drafts 云草稿（Q4：跨设备可见；后端 GET/POST/PUT ?id=/DELETE） ---------- */
const drafts = {
  /** 最近 10 条，按 created_at DESC；字段已 camelCase（id/sectionId/title/content/images/isAnonymous/extraFields/createdAt） */
  list: () => get('/drafts', {}, false),
  save: (data) => post('/drafts', data, false),
  /** 编辑已有草稿必须走 PUT ?id=，POST 会新建一条并挤掉旧草稿 */
  update: (id, data) => put('/drafts?id=' + id, data, false),
  remove: (id) => del('/drafts/' + id, {}, false),
}

/* ---------- trades 意向出价与二手交易闭环 ---------- */
const trades = {
  complete: (postId, buyerId) => post('/trades/' + postId + '/complete', buyerId ? { buyerId: Number(buyerId) } : {}),
  myRating: (postId) => get('/trades/' + postId + '/my-rating', {}, false),
  rate: (postId, data) => post('/trades/' + postId + '/rate', data),
  offers: (postId) => get('/trades/' + postId + '/offers', {}, false),
  createOffer: (postId, data) => post('/trades/' + postId + '/offers', data),
  acceptOffer: (offerId) => post('/trades/offers/' + offerId + '/accept', {}),
  rejectOffer: (offerId) => post('/trades/offers/' + offerId + '/reject', {}),
  cancelOffer: (offerId) => post('/trades/offers/' + offerId + '/cancel', {}),
}

/* ---------- radar 失物招领智能雷达 ---------- */
const radar = {
  matches: (postId) => get('/posts/' + postId + '/radar', {}, false),
}

/* ---------- upload（multipart） ---------- */
const uploadFile = (filePath, name = 'file') => {
  return new Promise((resolve, reject) => {
    const app = require('./request').getAppSafe()
    const token = require('./request').getToken()
    wx.uploadFile({
      url: require('./request').getBaseUrl() + '/upload',
      filePath: filePath,
      name: name,
      header: {
        'Authorization': 'Bearer ' + (token || '')
      },
      success: (res) => {
        let data
        try {
          data = JSON.parse(res.data)
        } catch (e) {
          showToast('上传响应异常')
          reject({ message: '上传响应异常', raw: res.data })
          return
        }
        if (data.code === 200) {
          // 入库用相对路径：存绝对地址会把部署域名写进数据库，换域名后历史图片全部失效。
          // 渲染侧（legacy-adapter.normalizePost）会统一 absUrl，预览也可直接用 previewUrl。
          resolve({
            url: data.data.url,
            thumbUrl: data.data.thumbUrl,
            previewUrl: absUrl(data.data.url),
            previewThumbUrl: absUrl(data.data.thumbUrl)
          })
        } else {
          showToast(data.message || '上传失败')
          reject(data)
        }
      },
      fail: (err) => {
        showToast('上传失败')
        reject(err)
      }
    })
  })
}

/** 旧 facade 兼容：按顶层函数名调用（detail/follows/settings 等页面用） */
const followToggle = follow.toggle
const followingList = follow.following
const followersList = follow.followers
const followStatus = follow.status

module.exports = {
  get, post, put, del, request, uploadFile,
  absUrl, toMs,
  followToggle, followingList, followersList, followStatus,
  posts, users, follow, search, messages, sections, feedback, admin, drafts, trades, radar,
}
