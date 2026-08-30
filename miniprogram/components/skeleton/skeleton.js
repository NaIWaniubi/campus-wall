/**
 * 通用骨架屏组件：帖子卡 / 帖子详情 / 聊天记录三种形态
 * - type: post（默认）| detail | chat
 * - count: 骨架块数（post=卡片数，chat=消息行数），1-10 截断
 * - 低端机（perf-low）由全局根节点降级动画；系统减动效偏好下停用闪烁
 */
Component({
  properties: {
    type: { type: String, value: 'post' },
    count: { type: Number, value: 3 },
  },
  data: { blocks: [] },
  observers: {
    count(n) {
      this.rebuild(n)
    },
  },
  lifetimes: {
    attached() {
      if (!this.data.blocks.length) this.rebuild(this.data.count)
    },
  },
  methods: {
    rebuild(n) {
      const c = Math.max(1, Math.min(10, Number(n) || 3))
      this.setData({ blocks: Array.from({ length: c }, (_, i) => i) })
    },
  },
})
