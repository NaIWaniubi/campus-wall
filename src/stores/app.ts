/**
 * 应用全局状态：板块列表、未读消息数
 */
import { defineStore } from 'pinia'
import request from '@/utils/request'
import { useUserStore } from '@/stores/user'

interface Section {
  id: number
  name: string
  icon: string
  sort: number
  isActive: boolean
  forceAnonymous: boolean
  needAudit: boolean
}

export const useAppStore = defineStore('app', {
  state: () => ({
    sections: [] as Section[],
    unreadCount: 0,
    loading: false,
  }),
  actions: {
    async fetchSections() {
      const res: any = await request.get('/sections')
      this.sections = res.data
    },
    async fetchUnreadCount() {
      const res: any = await request.get('/messages')
      this.unreadCount = res.data.unreadCount
    },
    // 未读红点激活入口：带登录态守卫，供 App 级轮询 / focus 刷新调用
    async refreshUnread() {
      if (!useUserStore().isLoggedIn) return
      await this.fetchUnreadCount()
    },
    getSectionName(id: number) {
      return this.sections.find((s) => s.id === id)?.name || ''
    },
    getSectionIcon(name: string) {
      return this.sections.find((s) => s.name === name)?.icon || ''
    },
  },
})
