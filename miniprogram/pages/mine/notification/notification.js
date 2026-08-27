const app = getApp()
const { get, put, post } = require('../../../utils/api')
const { timeAgo } = require('../../../utils/util')
const { getMessageTypeMeta } = require('../../../utils/constants')

/** 通知列表页：与消息页共用新后端 GET /messages?type=xx 契约（match/digest/system） */
Page({
  data: {
    notifications: [],
    activeTab: 'all',
    tabs: [
      { id: 'all', name: '全部' },
      { id: 'match', name: '匹配' },
      { id: 'digest', name: '摘要' },
      { id: 'system', name: '系统' }
    ]
  },

  async onLoad() {
    this.loadNotifications()
  },

  async loadNotifications() {
    if (!app.checkLogin()) {
      this.setData({ notifications: [] })
      return
    }
    try {
      const type = this.data.activeTab === 'all' ? '' : this.data.activeTab
      const list = await get('/notifications', type ? { type } : {}, false)
      const notifications = (list || []).map(n => {
        const meta = getMessageTypeMeta(n.type)
        return {
          ...n,
          title: meta.name,
          iconText: meta.icon,
          timeAgoText: timeAgo(n.time)
        }
      })
      this.setData({ notifications })
    } catch (e) {
      console.error('加载通知失败', e)
    }
  },

  onSwitchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
    this.loadNotifications()
  },

  async onTapNotification(e) {
    const { id, postid } = e.currentTarget.dataset
    if (!app.checkLogin()) return
    // 本地置灰 + 后端持久化已读，失败不阻塞跳转
    this.setData({
      notifications: this.data.notifications.map(n => n.id === id ? { ...n, isRead: true } : n)
    })
    put('/messages/read/' + id, {}, false).catch(() => {})
    if (postid) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${postid}` })
    }
  },

  async onMarkAllRead() {
    if (!app.checkLogin()) return
    try {
      await post('/notifications/read-all', {}, false)
      const notifications = this.data.notifications.map(n => ({ ...n, isRead: true }))
      this.setData({ notifications })
    } catch (e) {
      console.error('标记已读失败', e)
    }
  }
})
