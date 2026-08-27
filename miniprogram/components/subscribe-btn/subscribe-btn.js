/**
 * subscribe-btn：板块订阅/已订阅 toggle。
 * 初始态来自 GET /api/subscriptions；点击 POST /api/subscriptions/:sectionId（后端 toggle 语义）。
 */
const app = getApp()
const { get, post } = require('../../utils/api')

Component({
  properties: {
    sectionId: {
      type: Number,
      value: 0
    }
  },

  data: {
    subscribed: false,
    busy: false
  },

  lifetimes: {
    attached() {
      this.loadState()
    }
  },

  methods: {
    async loadState() {
      if (!this.data.sectionId || !app.checkLogin()) return
      try {
        const rows = await get('/subscriptions', {}, false)
        const subscribed = (rows || []).some(r => r.sectionId === this.data.sectionId)
        this.setData({ subscribed })
      } catch (e) {
        // 拉取失败不影响点击，点击时以后端 toggle 结果为准
        console.error('加载订阅状态失败', e)
      }
    },

    async onToggle() {
      if (this.data.busy) return
      if (!app.checkLogin()) {
        wx.showToast({ title: '请先登录', icon: 'none' })
        return
      }
      this.setData({ busy: true })
      try {
        const res = await post('/subscriptions/' + this.data.sectionId, {}, false)
        const subscribed = !!(res && res.subscribed)
        this.setData({ subscribed })
        wx.showToast({ title: subscribed ? '订阅成功' : '已取消订阅', icon: 'none' })
      } catch (e) {
        // 业务错误提示由适配层统一 toast
      } finally {
        this.setData({ busy: false })
      }
    }
  }
})
