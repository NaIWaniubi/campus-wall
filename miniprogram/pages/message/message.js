const app = getApp()
const { get, put, post, absUrl } = require('../../utils/api')
const { timeAgo } = require('../../utils/util')
const { getMessageTypeMeta } = require('../../utils/constants')

/**
 * 消息中心：对接新后端 GET /api/messages?type=xx（data.list + unreadCount）。
 * 类型域：match（失物匹配）/ digest（每日摘要）/ system（系统通知）。
 * 「私信」tab 对接 GET /api/conversations 会话列表（对端昵称头像+最后消息+未读数），
 * 点击进入 chat 页；未读角标取会话列表口径汇总。
 */
Page({
  data: {
    tabs: [
      { id: 'chat', name: '私信' },
      { id: 'all', name: '全部' },
      { id: 'match', name: '匹配' },
      { id: 'digest', name: '摘要' },
      { id: 'system', name: '系统' }
    ],
    activeTab: 'all',
    isLoggedIn: false,
    notifications: [],
    unreadCount: 0,
    conversations: [],
    chatUnread: 0
  },

  onLoad() {
    this.loadNotifications()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 })
    }
    this.loadNotifications()
  },

  async loadNotifications() {
    if (!app.checkLogin()) {
      this.setData({ isLoggedIn: false, notifications: [], unreadCount: 0, conversations: [], chatUnread: 0 })
      return
    }
    this.setData({ isLoggedIn: true })
    if (this.data.activeTab === 'chat') {
      await this.loadConversations()
      return
    }

    try {
      // '/notifications' 由适配层映射为 GET /messages，type=all 时省略参数
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
      // 未读数取当前列表口径（后端按未读优先排序返回前100条）
      const unreadCount = notifications.filter(n => !n.isRead).length
      this.setData({ notifications, unreadCount })
    } catch (e) {
      console.error('加载消息失败', e)
    }
  },

  /** 私信会话列表：GET /conversations -> 对端昵称头像 + 最后消息 + 未读数 */
  async loadConversations() {
    try {
      const list = await get('/conversations', {}, false)
      const conversations = (list || []).map(c => ({
        id: c.id,
        displayName: (c.peer && c.peer.nickname) || '匿名同学',
        avatar: absUrl((c.peer && c.peer.avatar) || ''),
        last_content: c.lastMessage || '还没有消息',
        timeText: c.lastAt ? timeAgo(new Date(c.lastAt).getTime()) : '',
        unread_count: c.unread || 0
      }))
      this.setData({
        conversations,
        chatUnread: conversations.reduce((sum, c) => sum + (c.unread || 0), 0)
      })
    } catch (e) {
      console.error('加载会话失败', e)
    }
  },

  onOpenConversation(e) {
    const id = e.detail && e.detail.id
    if (id == null) return
    wx.navigateTo({ url: '/pages/message/chat/chat?conversationId=' + id })
  },

  onSwitchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab })
    this.loadNotifications()
  },

  async onTapNotification(e) {
    const { id, postid } = e.currentTarget.dataset
    if (!app.checkLogin()) return
    // 本地立即置灰 + 后端持久化已读（PUT /messages/read/:id），失败不阻塞跳转
    this.setData({
      notifications: this.data.notifications.map(n => n.id === id ? { ...n, isRead: true } : n),
      unreadCount: Math.max(0, this.data.unreadCount - 1)
    })
    put('/messages/read/' + id, {}, false).catch(() => {})
    if (postid) {
      wx.navigateTo({ url: `/pages/detail/detail?id=${postid}` })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
  },

  async onMarkAllRead() {
    if (!app.checkLogin()) return
    try {
      await post('/notifications/read-all', {}, false)
      const notifications = this.data.notifications.map(n => ({ ...n, isRead: true }))
      this.setData({ notifications, unreadCount: 0 })
    } catch (e) {
      console.error('标记已读失败', e)
    }
  }
})
