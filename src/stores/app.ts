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
    /** 板块接口是否失败：发布页/板块页据此显示重试，而不是空选择器 + 假空态 */
    sectionsError: false,
    unreadCount: 0,
    loading: false,
  }),
  actions: {
    async fetchSections() {
      // 失败时保留 sectionsError，让发布页/板块页能给出「重试」而不是空选择器
      try {
        const res: any = await request.get('/sections')
        this.sections = res.data
        this.sectionsError = false
      } catch (e) {
        this.sectionsError = true
        throw e
      }
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
