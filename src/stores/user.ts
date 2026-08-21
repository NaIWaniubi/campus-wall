/**
 * 用户状态管理：Token、用户信息、登录登出
 */
import { defineStore } from 'pinia'
import request from '@/utils/request'

interface User {
  id: number
  student_id: string
  nickname: string
  avatar: string
  college: string
  grade: string
  signature: string
  credit_score: number
  role: string
  status: string
  created_at: string
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
    canPost: (state) => (state.user?.credit_score || 0) >= 60,
    canComment: (state) => (state.user?.credit_score || 0) >= 60,
    canAnonymous: (state) => (state.user?.credit_score || 0) >= 90,
    postLimit: (state) => {
      const score = state.user?.credit_score || 100
      if (score < 60) return 0
      if (score < 80) return 3
      return 10
    },
  },
  actions: {
    async login(studentId: string, password: string) {
      const res: any = await request.post('/auth/login', { studentId, password })
      this.token = res.data.token
      this.user = res.data.user
      return res
    },
    async register(data: { studentId: string; password: string; nickname: string; college?: string; grade?: string }) {
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
