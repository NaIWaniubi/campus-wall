const app = getApp()
const { get, post } = require('../../../utils/api')
const { buildPostShare } = require('../../../utils/share')

Page({
  data: { posts: [], activeTab: 'all', loadMoreStatus: 'nomore', page: 1, pageSize: 10, hasMore: false, loading: true, loadFailed: false },
  onLoad() { this.loadPosts(1) },
  async loadPosts(targetPage) {
    const page = targetPage || this.data.page
    // 过期响应令牌：快速切 Tab 时丢弃旧请求结果，避免旧数据覆盖新列表
    const seq = (this.reqSeq = (this.reqSeq || 0) + 1)
    this.setData({ loading: true, loadFailed: false })
    try {
      const params = { category: 'activity', page, pageSize: this.data.pageSize }
      if (this.data.activeTab !== 'all') params.subType = this.data.activeTab
      const result = await get('/posts', params, false)
      if (seq !== this.reqSeq) return
      this.setData({
        page,
        posts: page === 1 ? (result.list || []) : [...this.data.posts, ...(result.list || [])],
        hasMore: result.hasMore, loadMoreStatus: result.hasMore ? 'more' : 'nomore',
        loading: false
      })
    } catch (e) {
      if (seq !== this.reqSeq) return
      // 失败不推进 page：点重试仍请求同一页；同时区分「加载失败」与「暂无内容」
      this.setData({ loading: false, loadFailed: true, loadMoreStatus: 'error' })
    }
  },
  onRetry() { this.loadPosts(this.data.page || 1) },
  onSwitchTab(e) { this.setData({ activeTab: e.currentTarget.dataset.tab, page: 1, posts: [] }); this.loadPosts(1) },
  onTapPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.post.id}` }) },
  async onLikePost(e) { if (!app.requireLogin(null, '点赞')) return; const id = e.detail.id; const updated = await post(`/posts/${id}/like`, {}, false); this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) }) },
  onCommentPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}&focus=true` }) },
  async onFavoritePost(e) { if (!app.requireLogin(null, '收藏')) return; const id = e.detail.id; const updated = await post(`/posts/${id}/favorite`, {}, false); this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) }) },
  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ loadMoreStatus: 'loading' })
    this.loadPosts(this.data.page + 1)
  },
  onGoPublish() { app.requireLogin(() => { wx.setStorageSync('publishCategory', 'activity'); wx.switchTab({ url: '/pages/publish/publish' }) }) },
  onShareAppMessage(e) { const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''; const post = this.data.posts.find(item => item.id === id); return buildPostShare(post, id) }
})
