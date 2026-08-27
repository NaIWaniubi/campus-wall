const app = getApp()
const { get, post } = require('../../../utils/api')
const { buildPostShare } = require('../../../utils/share')

Page({
  data: { posts: [], activeTab: 'all', loadMoreStatus: 'nomore', page: 1, pageSize: 10, hasMore: false },
  onLoad() { this.loadPosts() },
  async loadPosts() {
    try {
      const params = { category: 'help', page: this.data.page, pageSize: this.data.pageSize }
      if (this.data.activeTab !== 'all') params.subType = this.data.activeTab
      const result = await get('/posts', params, false)
      this.setData({
        posts: this.data.page === 1 ? (result.list || []) : [...this.data.posts, ...(result.list || [])],
        hasMore: result.hasMore, loadMoreStatus: result.hasMore ? 'more' : 'nomore'
      })
    } catch (e) { this.setData({ loadMoreStatus: 'error' }) }
  },
  onSwitchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab, page: 1, posts: [] }); this.loadPosts() },
  onTapPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.post.id}` }) },
  async onLikePost(e) { if (!app.requireLogin(null, '点赞')) return; const id = e.detail.id; const updated = await post(`/posts/${id}/like`, {}, false); this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) }) },
  onCommentPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}&focus=true` }) },
  async onFavoritePost(e) { if (!app.requireLogin(null, '收藏')) return; const id = e.detail.id; const updated = await post(`/posts/${id}/favorite`, {}, false); this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) }) },
  onLoadMore() { if (!this.data.hasMore) return; this.setData({ page: this.data.page + 1, loadMoreStatus: 'loading' }); this.loadPosts() },
  onGoPublish() { app.requireLogin(() => { wx.setStorageSync('publishCategory', 'help'); wx.switchTab({ url: '/pages/publish/publish' }) }) },
  onShareAppMessage(e) { const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''; const post = this.data.posts.find(item => item.id === id); return buildPostShare(post, id) }
})
