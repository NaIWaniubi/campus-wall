/**
 * API 服务模块：封装所有后端接口调用
 */
import request from '@/utils/request'

// ─────────────────────────────────────────────────────────────
// 公共入参类型（部分高频方法使用，显式声明替代 any 的样板）
// ─────────────────────────────────────────────────────────────
export interface CreatePostPayload {
  sectionId: number
  title: string
  content: string
  images?: string[]
  isAnonymous?: boolean
  extraFields?: Record<string, unknown>
}

export type UpdatePostPayload = CreatePostPayload

export interface LoginPayload {
  studentId: string
  password: string
}

export interface RegisterPayload {
  studentId: string
  password: string
  nickname: string
  college?: string
  grade?: string
}

export interface CommentPayload {
  content: string
  isAnonymous?: boolean
}

// 认证
export const authApi = {
  login: (data: LoginPayload) => request.post('/auth/login', data),
  register: (data: RegisterPayload) => request.post('/auth/register', data),
  me: () => request.get('/auth/me'),
  updatePassword: (data: { oldPassword: string; newPassword: string }) => request.put('/auth/password', data),
  logout: () => request.post('/auth/logout'),
}

// 帖子
export const postApi = {
  list: (params: { page?: number; pageSize?: number; sectionId?: number; keyword?: string; sort?: string; priceRange?: string; timeRange?: string; subType?: string; authorId?: number }) => request.get('/posts', { params }),
  detail: (id: number) => request.get(`/posts/${id}`),
  matches: (id: number) => request.get(`/posts/${id}/matches`),
  similars: (id: number) => request.get(`/posts/${id}/similars`),
  publish: (data: CreatePostPayload) => request.post('/posts', data),
  edit: (id: number, data: UpdatePostPayload) => request.put(`/posts/${id}`, data),
  delete: (id: number) => request.delete(`/posts/${id}`),
  like: (id: number) => request.post(`/posts/${id}/like`),
  favorite: (id: number) => request.post(`/posts/${id}/favorite`),
  report: (id: number, reason: string) => request.post(`/posts/${id}/report`, { reason }),
}

// 评论
export const commentApi = {
  list: (postId: number) => request.get(`/posts/${postId}/comments`),
  publish: (postId: number, data: CommentPayload) => request.post(`/posts/${postId}/comments`, data),
  reply: (commentId: number, data: CommentPayload) => request.post(`/comments/${commentId}/reply`, data),
  delete: (commentId: number) => request.delete(`/comments/${commentId}`),
  like: (commentId: number) => request.post(`/comments/${commentId}/like`),
}

// 用户
export const userApi = {
  info: (id: number) => request.get(`/users/${id}`),
  lookup: (studentId: string) => request.get('/users/lookup', { params: { studentId } }),
  updateProfile: (data: { nickname?: string; avatar?: string; signature?: string }) => request.put('/users/profile', data),
  myPosts: () => request.get('/users/me/posts'),
  myComments: () => request.get('/users/me/comments'),
  myFavorites: (params?: { page?: number; pageSize?: number }) => request.get('/users/me/favorites', { params }),
  myLikes: (params: { page?: number; pageSize?: number }) => request.get('/users/me/likes', { params }),
}

// 意见反馈
export const feedbackApi = {
  submit: (data: { content: string; contact?: string }) => request.post('/feedback', data),
}

// 私信会话
export const conversationApi = {
  list: () => request.get('/conversations'),
  create: (peerId: number) => request.post('/conversations', { peerId }),
  messages: (id: number, params?: { page?: number; pageSize?: number; afterId?: number }) =>
    request.get(`/conversations/${id}/messages`, { params }),
  send: (id: number, data: { content: string }) => request.post(`/conversations/${id}/messages`, data),
}

// 关注体系（挂载于 /users）
export const followApi = {
  followToggle: (id: number) => request.post(`/users/${id}/follow`),
  followStatus: (id: number) => request.get(`/users/${id}/follow-status`),
  followingList: (id: number, params?: { page?: number; pageSize?: number }) =>
    request.get(`/users/${id}/following`, { params }),
  followersList: (id: number, params?: { page?: number; pageSize?: number }) =>
    request.get(`/users/${id}/followers`, { params }),
}

// 消息
export const messageApi = {
  list: (type?: string) => request.get('/messages', { params: { type } }),
  read: (id: number) => request.put(`/messages/read/${id}`),
  readAll: () => request.put('/messages/read-all'),
}

// 板块与搜索
export const sectionApi = {
  list: (all?: boolean) => request.get('/sections', { params: all ? { all: 1 } : {} }),
  hotSearch: () => request.get('/search/hot'),
  search: (keyword: string, params: { page?: number; sectionId?: number; sort?: 'new' | 'hot' } = {}) =>
    request.get('/search', { params: { keyword, ...params } }),
}

// 草稿
export const draftApi = {
  list: () => request.get('/drafts'),
  save: (data: { sectionId?: number; title: string; content: string; images?: string[]; isAnonymous?: boolean; extraFields?: any }) => request.post('/drafts', data),
  remove: (id: number) => request.delete(`/drafts/${id}`),
  clear: () => request.delete('/drafts'),
}

// Web Push（VAPID 未开启时 publicKey 为 null，设置页据此隐藏入口）
export const pushApi = {
  publicKey: () => request.get('/push/public-key'),
  subscribe: (subscription: unknown) => request.post('/push/subscribe', { subscription }),
  unsubscribe: (endpoint: string) => request.post('/push/unsubscribe', { endpoint }),
}

// 公告
export const announcementApi = {
  active: () => request.get('/announcements/active'),
  ack: (id: number) => request.post(`/announcements/${id}/ack`),
  list: () => request.get('/announcements'),
  create: (data: { title: string; content: string; expiresAt?: string }) => request.post('/announcements', data),
  deactivate: (id: number) => request.put(`/announcements/${id}/deactivate`),
}

// 文件上传
export const uploadApi = {
  upload: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 30000 })
  },
}

// AI 助手（回答耗时较长，单独放宽超时）
export interface AiForumItem {
  id: number
  commentId?: number
  title: string
  excerpt: string
  section: string
  likeCount: number
  commentCount: number
  createdAt: string
  type: 'post' | 'comment'
}
/** AI 成稿结果（/ai/draft） */
export interface AiDraftResult {
  title: string
  content: string
  tags: string[]
  sectionId: number | null
  sectionName: string | null
  price: number | null
  /** true = 未接入大模型，按站内规则生成 */
  offline: boolean
}

/** AI 划重点结果（/ai/summarize） */
export interface AiSummaryResult {
  points: string[]
  risk: 'low' | 'medium' | 'high'
  riskNote: string | null
  offline: boolean
}

/** 今日简报（/ai/digest） */
export interface AiDigestResult {
  date: string;
  /** 统计窗口文案：'24 小时' 或 '近 7 天'（冷清时自动放宽） */
  window?: string
  /** 仅 personalized 路径返回；公开默认简报不含此字段 */
  scope?: 'personal'
  stats: { posts: number; comments: number }
  sections: Array<{ name: string; n: number }>
  hot: { id: number; title: string; section: string; likes: number } | null
  summary: string
  tip: string
  offline: boolean
}

export const aiApi = {
  chat: (data: { message: string; history?: { role: 'user' | 'assistant'; content: string }[] }) =>
    request.post<{ reply: string; forums: AiForumItem[] }>('/ai/chat', data, { timeout: 65000 }),
  /** 发布助手：一句话 → 标题 / 正文 / 标签 / 板块 / 价格 */
  draft: (data: { raw: string; sectionId?: number }) =>
    request.post<AiDraftResult>('/ai/draft', data, { timeout: 65000 }),
  /** 帖子划重点：要点 + 风险提示（只传 postId，服务端取正文） */
  summarize: (data: { postId?: number; title?: string; content?: string }) =>
    request.post<AiSummaryResult>('/ai/summarize', data, { timeout: 65000 }),
  /** 今日简报：登录用户传 personal，未登录保持公开全站版 */
  digest: (scope?: 'personal') =>
    request.get<AiDigestResult>('/ai/digest', { params: scope ? { scope } : undefined, timeout: 20000 }),
}

// 管理端 AI 设置
export const adminAiApi = {
  getKnowledge: () => request.get('/admin/ai/knowledge'),
  saveKnowledge: (content: string) => request.put('/admin/ai/knowledge', { content }),
  getSettings: () => request.get('/admin/ai/settings'),
  saveSettings: (model: string) => request.put('/admin/ai/settings', { model }),
  stats: () => request.get('/admin/ai/stats'),
}

// 管理后台
export const adminApi = {
  // 用户管理
  users: (params: any) => request.get('/admin/users', { params }),
  banUser: (id: number, data: { action: string; reason?: string; duration?: string }) => request.put(`/admin/users/${id}/ban`, data),
  resetPassword: (id: number, newPassword: string) => request.put(`/admin/users/${id}/reset-password`, { newPassword }),
  adjustCredit: (id: number, score: number, reason?: string) => request.put(`/admin/users/${id}/credit`, { score, reason }),
  // 内容审核
  posts: (params: any) => request.get('/admin/posts', { params }),
  auditPost: (id: number, action: string, reason?: string) => request.put(`/admin/posts/${id}/audit`, { action, reason }),
  topPost: (id: number, action: string, topType?: string) => request.put(`/admin/posts/${id}/top`, { action, topType }),
  // 评论管理
  comments: (params: any) => request.get('/admin/comments', { params }),
  deleteComment: (id: number) => request.delete(`/admin/comments/${id}`),
  // 举报处理
  reports: (params: any) => request.get('/admin/reports', { params }),
  handleReport: (id: number, action: string, result?: string) => request.put(`/admin/reports/${id}`, { action, result }),
  // 数据统计
  stats: () => request.get('/admin/stats'),
  // 板块管理
  createSection: (data: any) => request.post('/admin/sections', data),
  updateSection: (id: number, data: any) => request.put(`/admin/sections/${id}`, data),
  deleteSection: (id: number) => request.delete(`/admin/sections/${id}`),
  // 公告管理
  announcements: () => request.get('/announcements'),
  createAnnouncement: (data: { title: string; content: string; expiresAt?: string; targetUserId?: number }) => request.post('/announcements', data),
  deactivateAnnouncement: (id: number) => request.put(`/announcements/${id}/deactivate`),
  // 意见反馈
  feedbacks: (params?: { keyword?: string; status?: string; page?: number; pageSize?: number }) =>
    request.get('/admin/feedbacks', { params }),
  closeFeedback: (id: number, status: 'closed' | 'open' = 'closed') => request.put(`/admin/feedbacks/${id}/status`, { status }),
}

// 板块订阅
export const subscriptionApi = {
  list: () => request.get('/subscriptions'),
  toggle: (sectionId: number) => request.post(`/subscriptions/${sectionId}`),
}

// 二手交易互评 + 意向出价
export const tradeApi = {
  complete: (postId: number, buyerId?: number) => request.post(`/trades/${postId}/complete`, buyerId ? { buyerId } : {}),
  myRating: (postId: number) => request.get(`/trades/${postId}/my-rating`),
  rate: (postId: number, data: { targetUserId?: number; rating: number; comment?: string }) =>
    request.post(`/trades/${postId}/rate`, data),
  ratingsOf: (userId: number) => request.get(`/users/${userId}/trade-ratings`),
  // 意向出价（闪电意向撮合闭环）
  createOffer: (postId: number, data: { offerPrice: number; message?: string }) =>
    request.post(`/trades/${postId}/offers`, data),
  offers: (postId: number) => request.get(`/trades/${postId}/offers`),
  acceptOffer: (offerId: number) => request.post(`/trades/offers/${offerId}/accept`),
  rejectOffer: (offerId: number) => request.post(`/trades/offers/${offerId}/reject`),
  cancelOffer: (offerId: number) => request.post(`/trades/offers/${offerId}/cancel`),
}

// 智能雷达（失物招领相似帖）
export interface RadarMatchItem {
  postId: number
  title: string
  excerpt: string
  direction: string
  score: number
  reasons: string[]
  createdAt: string
}

export const radarApi = {
  matches: (postId: number) => request.get(`/posts/${postId}/radar`),
}
