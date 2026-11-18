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

// 静默续期单飞句柄：并发只发一次 /auth/refresh（见 refreshAccessToken 注释）
let refreshInFlight: Promise<boolean | null> | null = null
// 会话代际：logout/重新登录时递增，用于丢弃在飞的旧续期响应（防止退出被"复活"）
let sessionEpoch = 0

export const useUserStore = defineStore('user', {
  state: () => ({
    token: '' as string,
    refreshToken: '' as string,
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
    /**
     * 启动续期：access token 只活在内存里（刷新页面即丢失），
     * 若持久化的 refreshToken 存在，用它静默换发一次会话。
     * 成功 → 会话恢复；服务端明确拒绝 → 清登录态；网络异常（null）→ 保持现状等重试。
     */
    async ensureSession() {
      if (this.token || !this.refreshToken) return
      const ok = await this.refreshAccessToken()
      // null = 网络异常/未知，不销毁持久化会话（弱网抖动不该逼用户重登）
      if (ok === false) {
        this.logout()
      }
    },
    /** 替换本地 token：改密后服务端签发新 token（旧 token 已因 token_version 递增失效） */
    setToken(token: string) {
      this.token = token
    },
    /**
     * 同时写入 access + refresh（改密场景）：
     * 服务端改密会递增 token_version 并签发新的一对 token，
     * 若只换 access 不换 refresh，下次静默续期会因 ver 不匹配被拒 → 本设备自己掉线。
     */
    setSession(token: string, refreshToken?: string) {
      this.token = token
      if (refreshToken) this.refreshToken = refreshToken
    },
    /** 登录：账号可为手机号 / 拼音 / 邮箱前缀 / 原学号 */
    async login(account: string, password: string) {
      const res: any = await request.post('/auth/login', { account, password })
      this.token = res.data.token
      this.refreshToken = res.data.refreshToken || ''
      this.user = res.data.user
      return res
    },
    async register(data: { account: string; password: string; nickname: string; college?: string; grade?: string }) {
      const res: any = await request.post('/auth/register', data)
      this.token = res.data.token
      this.refreshToken = res.data.refreshToken || ''
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
    /**
     * 静默续期：用 refresh token 换新 access token（refresh token 同时轮换）。
     *
     * 三态返回：
     * - true  续期成功
     * - false 服务端明确拒绝（401/403：refresh 过期/被吊销/重放冲突）→ 调用方可登出
     * - null  网络异常/响应异常，结果未知 → 保持现状，等下次请求重试
     *   （原实现把网络异常也返回 false，ensureSession 因此在弱网抖动时直接销毁
     *    持久化会话，用户被迫重新登录——这是可用性事故，不是安全策略）
     *
     * 单飞（single-flight）：并发调用共用同一次刷新。典型并发场景＝启动时路由守卫与
     * App.vue onMounted 几乎同时各调一次——refresh 是单次消费（服务端 jti 重放即拒），
     * 若无此闸，两次各自发请求，第一次成功后第二次撞重放 401，第二次把有效会话清掉。
     */
    async refreshAccessToken(): Promise<boolean | null> {
      if (!this.refreshToken) return false
      if (refreshInFlight) return refreshInFlight
      // 会话代际：本次刷新发起时记下 epoch；若期间发生 logout（或重新登录），
      // 响应回来时必须丢弃——否则「点退出 → 在飞的 refresh 返回」会把会话复活，
      // 并把新的 refreshToken 重新写进 localStorage（等于用户退出失败）。
      const epochAtStart = sessionEpoch
      const run = (async (): Promise<boolean | null> => {
        try {
        const res: any = await request.post('/auth/refresh', { refreshToken: this.refreshToken })
          if (epochAtStart !== sessionEpoch) return false
          if (res?.data?.token) {
            this.token = res.data.token
            if (res.data.refreshToken) this.refreshToken = res.data.refreshToken
            return true
          }
          // 200 但没有 token：服务端明确不认这个 refresh → 拒绝
          return false
        } catch (e: any) {
          // 有 response = 服务端给了响应（401/403 等明确拒绝）；无 response = 网络异常
          if (e?.response) return false
          return null
        }
      })()
      refreshInFlight = run
      try {
        return await run
      } finally {
        refreshInFlight = null
      }
    },
    logout() {
      // 递增代际：作废所有在飞的续期响应（见 refreshAccessToken 注释）
      sessionEpoch += 1
      // 彻底清空登录态，避免残留数据导致权限判断错误
      this.token = ''
      this.refreshToken = ''
      this.user = null
    },
  },
  // 只持久化 refreshToken + 用户资料：access token（2h）不落盘，
  // 读取面从「整个存储区持续暴露」缩到「仅剩单次可用的 refresh」
  persist: {
    key: 'campus-wall-user',
    storage: localStorage,
    pick: ['refreshToken', 'user'],
  },
})
