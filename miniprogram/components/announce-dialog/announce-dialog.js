/**
 * 官方公告半模态卡（对齐 web 端 AnnouncementDialog）：
 * 纯展示组件，标题+正文+「我知道了」；确认动作通过 ack 事件交页面处理
 * （页面 POST /announcements/:id/ack 后置空数据源即不再弹，后端也会按 ack 记录过滤）。
 */
Component({
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    content: { type: String, value: '' }
  },

  methods: {
    onAck() {
      this.triggerEvent('ack')
    },
    // 阻断遮罩/卡片滚动穿透与冒泡点击
    noop() {}
  }
})
