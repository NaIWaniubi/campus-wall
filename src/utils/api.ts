/**
 * API 服务模块：封装所有后端接口调用
 */
import request from '@/utils/request'

// 认证
export const authApi = {
  login: (data: { studentId: string; password: string }) => request.post('/auth/login', data),
  register: (data: { studentId: string; password: string; nickname: string; college?: string; grade?: string }) => request.post('/auth/register', data),
  me: () => request.get('/auth/me'),
  updatePassword: (data: { oldPassword: string; newPassword: string }) => request.put('/auth/password', data),
  logout: () => request.post('/auth/logout'),
}

// 帖子
export const postApi = {
  list: (params: { page?: number; pageSize?: number; sectionId?: number; keyword?: string; sort?: string; priceRange?: string; timeRange?: string; subType?: string }) => request.get('/posts', { params }),
  detail: (id: number) => request.get(`/posts/${id}`),
  publish: (data: any) => request.post('/posts', data),
  edit: (id: number, data: any) => request.put(`/posts/${id}`, data),
  delete: (id: number) => request.delete(`/posts/${id}`),
  like: (id: number) => request.post(`/posts/${id}/like`),
  favorite: (id: number) => request.post(`/posts/${id}/favorite`),
  report: (id: number, reason: string) => request.post(`/posts/${id}/report`, { reason }),
}

// 评论
export const commentApi = {
  list: (postId: number) => request.get(`/posts/${postId}/comments`),
  publish: (postId: number, data: { content: string; isAnonymous?: boolean }) => request.post(`/posts/${postId}/comments`, data),
  reply: (commentId: number, data: { content: string; isAnonymous?: boolean }) => request.post(`/comments/${commentId}/reply`, data),
  delete: (commentId: number) => request.delete(`/comments/${commentId}`),
  like: (commentId: number) => request.post(`/comments/${commentId}/like`),
}

// 用户
export const userApi = {
  info: (id: number) => request.get(`/users/${id}`),
  updateProfile: (data: { nickname?: string; avatar?: string; signature?: string }) => request.put('/users/profile', data),
  myPosts: () => request.get('/users/me/posts'),
  myComments: () => request.get('/users/me/comments'),
  myFavorites: () => request.get('/users/me/favorites'),
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
  search: (keyword: string, page?: number) => request.get('/search', { params: { keyword, page } }),
}

// 草稿
export const draftApi = {
  list: () => request.get('/drafts'),
  save: (data: { sectionId?: number; title: string; content: string; images?: string[]; isAnonymous?: boolean; extraFields?: any }) => request.post('/drafts', data),
  remove: (id: number) => request.delete(`/drafts/${id}`),
  clear: () => request.delete('/drafts'),
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
  createAnnouncement: (data: { title: string; content: string; expiresAt?: string }) => request.post('/announcements', data),
  deactivateAnnouncement: (id: number) => request.put(`/announcements/${id}/deactivate`),
}
