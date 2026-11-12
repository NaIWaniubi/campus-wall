/**
 * 用户状态管理：Token、用户信息、登录登出
 */
import { defineStore } from 'pinia'
import request from '@/utils/request'

interface User {
  id: number
  studentId: string
  nickname: string
  avatar: string
  college: string
  grade: string
  signature: string
  creditScore: number
  role: string
  status: string
  createdAt: string
}

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '' as string,
    user: null as User | null,
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
    isAdmin: (state) => state.user?.role === 'super_admin' || state.user?.role === 'section_admin',
    isSuperAdmin: (state) => state.user?.role === 'super_admin',
    canPost: (state) => (state.user?.creditScore || 0) >= 60,
    canComment: (state) => (state.user?.creditScore || 0) >= 60,
    canAnonymous: (state) => (state.user?.creditScore || 0) >= 90,
    postLimit: (state) => {
      const score = state.user?.creditScore || 100
      if (score < 60) return 0
      if (score < 80) return 3
      return 10
    },
  },
  actions: {
    /** 替换本地 token：改密后服务端签发新 token（旧 token 已因 token_version 递增失效） */
    setToken(token: string) {
      this.token = token
    },
    /** 登录：账号可为手机号 / 拼音 / 邮箱前缀 / 原学号 */
    async login(account: string, password: string) {
      const res: any = await request.post('/auth/login', { account, password })
      this.token = res.data.token
      this.user = res.data.user
      return res
    },
    async register(data: { account: string; password: string; nickname: string; college?: string; grade?: string }) {
      const res: any = await request.post('/auth/register', data)
      this.token = res.data.token
      this.user = res.data.user
      return res
    },
    async fetchCurrentUser() {
      const res: any = await request.get('/auth/me')
      this.user = res.data
      return res.data
    },
    /**
     * 从旧版 snake_case 字段（student_id/credit_score/created_at）迁移到 camelCase。
     * 触发时机：登录后或刷新时若 user 缺 camelCase 字段但有 snake_case 字段，
     * 把旧字段重命名后写回，确保 `user.creditScore` 等访问正常。
     */
    migrateLegacyUser() {
      if (!this.user) return
      const u = this.user as any
      if (u.creditScore == null && u.credit_score != null) u.creditScore = u.credit_score
      if (u.studentId == null && u.student_id != null) u.studentId = u.student_id
      if (u.createdAt == null && u.created_at != null) u.createdAt = u.created_at
    },
    async updateProfile(data: { nickname?: string; avatar?: string; signature?: string }) {
      const res: any = await request.put('/users/profile', data)
      this.user = res.data
      return res
    },
    logout() {
      // 彻底清空登录态，避免残留数据导致权限判断错误
      this.token = ''
      this.user = null
    },
  },
  persist: {
    key: 'campus-wall-user',
    storage: localStorage,
  },
})
