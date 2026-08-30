const app = getApp()
const api = require('../../../utils/api')

/**
 * 私信会话页：对接新后端 /conversations 系列。
 * 入口参数二选一：
 *   - receiverId（detail 页「联系TA」）：POST /conversations 幂等拿会话 id；
 *   - conversationId（消息页私信列表）：直接加载。
 * 消息升序渲染（自己右侧/对方左侧+头像昵称），发送即时上屏，
 * 5s 定时器轮询新消息；进入即拉取，后端顺带把我侧未读清零。
 */
const POLL_INTERVAL = 5000
const PAGE_SIZE = 100

Page({
  data: {
    conversationId: '',
    receiverId: '',
    postId: '',
    peerName: '同学',
    peerAvatar: '',
    myAvatar: '',
    messages: [],
    inputText: '',
    sending: false,
    loading: true,
    chatTemplateId: '',
    subscribeAsked: false,
    needLogin: false,
    loadError: '',
    scrollInto: ''
  },

  onLoad(options) {
    this.pollTimer = null
    this.setData({
      receiverId: options.receiverId || '',
      postId: options.postId || '',
      conversationId: options.conversationId || ''
    })
    this.enter()
    // 订阅消息模板（wx-push 预埋）：服务端未配置时 data 为 null，端上不弹授权
    api.get('/wx/push-config', {}, false).then((cfg) => {
      if (cfg && cfg.chatTemplateId) this.setData({ chatTemplateId: cfg.chatTemplateId })
    }).catch(() => {})
  },

  onShow() {
    if (this.data.conversationId) this.startPolling()
  },

  onHide() {
    this.stopPolling()
  },

  onUnload() {
    this.stopPolling()
  },

  /* ---------------- 会话建立与加载 ---------------- */

  async enter() {
    const me = (app.globalData && app.globalData.userInfo) || {}
    this.setData({ myAvatar: me.avatar || '' })

    if (!app.checkLogin()) {
      this.setData({ loading: false, needLogin: true })
      return
    }
    try {
      if (!this.data.conversationId && this.data.receiverId) {
        // 幂等：已存在则复用同一会话 id
        const conv = await api.post('/conversations', { peerId: Number(this.data.receiverId) }, false)
        this.setData({ conversationId: String((conv && conv.id) || '') })
      }
      if (!this.data.conversationId) {
        this.setData({ loading: false, loadError: '缺少会话参数' })
        return
      }
      await Promise.all([this.loadMessages(true), this.loadPeer()])
      this.startPolling()
    } catch (e) {
      console.error('进入会话失败', e)
      this.setData({ loading: false })
    }
  },

  /** 拉会话列表取对端昵称头像（GET /conversations 无单查接口） */
  async loadPeer() {
    try {
      const list = await api.get('/conversations', {}, false)
      const conv = (list || []).find(c => String(c.id) === String(this.data.conversationId))
      if (conv && conv.peer) {
        const name = conv.peer.nickname || '同学'
        this.setData({
          peerName: name,
          peerAvatar: api.absUrl(conv.peer.avatar) || ''
        })
        wx.setNavigationBarTitle({ title: name })
      }
    } catch (e) { /* 顶部展示默认值即可 */ }
  },

  async loadMessages(scrollToBottom) {
    if (!this.data.conversationId) return
    try {
      const res = await api.get(`/conversations/${this.data.conversationId}/messages`, { page: 1, pageSize: PAGE_SIZE }, false)
      const list = (res && res.list) || []
      const prevCount = this.data.messages.length
      this.setData({ messages: list, loading: false, needLogin: false, loadError: '' })
      if (scrollToBottom || list.length !== prevCount) this.scrollToBottom(list)
    } catch (e) {
      console.error('加载消息失败', e)
      this.setData({ loading: false })
    }
  },

  scrollToBottom(list) {
    const arr = list || this.data.messages
    const last = arr && arr.length ? arr[arr.length - 1] : null
    if (!last) return
    // 先置空再赋值，保证连续两条同 id 锚点也能触发滚动
    this.setData({ scrollInto: '' }, () => {
      this.setData({ scrollInto: 'msg-' + last.id })
    })
  },

  /* ---------------- 轮询 ---------------- */

  startPolling() {
    this.stopPolling()
    this.pollTimer = setInterval(() => {
      this.loadMessages(false)
    }, POLL_INTERVAL)
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  },

  /* ---------------- 发送 ---------------- */

  onInputChange(e) {
    this.setData({ inputText: e.detail.value })
  },

  async onSendMessage() {
    const content = (this.data.inputText || '').trim()
    if (!content || this.data.sending || !this.data.conversationId) return
    // 订阅消息授权（wx-push 预埋）：仅在服务端配置了模板时触发，用户点击时请求一次/会话
    if (this.data.chatTemplateId && !this.data.subscribeAsked && wx.requestSubscribeMessage) {
      this.setData({ subscribeAsked: true })
      wx.requestSubscribeMessage({
        tmplIds: [this.data.chatTemplateId],
        fail: () => {} // 拒绝/失败不影响发消息
      })
    }

    const tempId = 'tmp-' + Date.now()
    this.setData({
      messages: this.data.messages.concat([{
        id: tempId,
        content,
        isMine: true,
        pending: true,
        createdAt: new Date().toISOString(),
        timeAgoText: '刚刚'
      }]),
      inputText: '',
      sending: true
    })
    this.scrollToBottom()

    try {
      await api.post(`/conversations/${this.data.conversationId}/messages`, { content }, false)
      // 用服务端真实记录替换临时气泡
      await this.loadMessages(true)
    } catch (e) {
      console.error('发送失败', e)
      this.setData({
        messages: this.data.messages.map(m =>
          m.id === tempId ? { ...m, pending: false, failed: true } : m
        )
      })
    } finally {
      this.setData({ sending: false })
    }
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
  }
})
