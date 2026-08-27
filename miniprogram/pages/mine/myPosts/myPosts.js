const app = getApp()
const { get, post, del } = require('../../../utils/api')
const { showModal, showToast } = require('../../../utils/util')
const { buildPostShare } = require('../../../utils/share')

Page({
  data: { posts: [], activeTab: 'all' },

  // 新后端帖子状态值域：published/pending/pending_review/rejected/deleted（deleted 不可见）
  STATUS_TABS: {
    all: null,
    published: ['published'],
    pending: ['pending', 'pending_review'],
    rejected: ['rejected']
  },

  onLoad() { this.loadPosts() },

  async loadPosts() {
    if (!app.checkLogin()) return
    try {
      // 后端 /users/me/posts 返回全部非 deleted 帖子且忽略 status 参数，按 tab 客户端过滤
      const posts = await get('/user/posts', {}, false)
      const statuses = this.STATUS_TABS[this.data.activeTab]
      const filtered = statuses ? posts.filter(p => statuses.indexOf(p.status) >= 0) : posts
      const now = Date.now()
      const list = filtered.map(p => ({ ...p, canEdit: (now - p.time) < 24 * 3600000 }))
      this.setData({ posts: list })
    } catch (e) {
      console.error('加载帖子失败', e)
    }
  },

  onSwitchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab }); this.loadPosts() },

  onTapPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.post.id}` }) },

  async onLikePost(e) {
    if (!app.requireLogin(null, '点赞')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/like`, {}, false)
    this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated, canEdit: item.canEdit } : item) })
  },

  onCommentPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}&focus=true` }) },

  async onFavoritePost(e) {
    if (!app.requireLogin(null, '收藏')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/favorite`, {}, false)
    this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated, canEdit: item.canEdit } : item) })
  },

  onEditPost(e) {
    const id = e.currentTarget.dataset.id
    wx.setStorageSync('publishEditId', id)
    wx.switchTab({ url: '/pages/publish/publish' })
  },

  async onDeletePost(e) {
    const id = e.currentTarget.dataset.id
    const confirmed = await showModal('确认删除', '删除后不可恢复，确定要删除吗？')
    if (confirmed) {
      try {
        await del('/posts/' + id)
        const posts = this.data.posts.filter(p => p.id !== id)
        this.setData({ posts })
        showToast('已删除')
      } catch (e) {
        showToast('删除失败')
      }
    }
  },

  onGoPublish() { wx.switchTab({ url: '/pages/publish/publish' }) },

  onShareAppMessage(e) {
    const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''
    const post = this.data.posts.find(item => item.id === id)
    return buildPostShare(post, id)
  }
})
