const app = getApp()
const { getCategoryList } = require('../../utils/category')
const { get, post } = require('../../utils/api')
const { buildPostShare } = require('../../utils/share')

Page({
  data: {
    keyword: '',
    hotTopics: [],
    searchHistory: [],
    hasSearched: false,
    results: [],
    categoryList: [],
    activeFilter: 'all',
    currentUserId: '',
    page: 1,
    pageSize: 10,
    hasMore: false,
    loadMoreStatus: 'more'
  },

  onLoad() {
    const categoryList = getCategoryList()
    const searchHistory = wx.getStorageSync('searchHistory') || []
    this.setData({
      categoryList,
      searchHistory,
      currentUserId: app.globalData.userInfo ? app.globalData.userInfo.id : ''
    })
    this.loadHotTopics()
  },

  async loadHotTopics() {
    try {
      const topics = await get('/search/hot-topics', {}, false)
      this.setData({ hotTopics: topics })
    } catch (e) {
      console.error('加载热门话题失败', e)
    }
  },

  onInput(e) {
    const value = e.detail.value
    if (!value.trim()) {
      this.setData({ keyword: value, hasSearched: false, results: [], activeFilter: 'all' })
      return
    }
    this.setData({ keyword: value })
  },

  async onSearch() {
    const keyword = this.data.keyword.trim()
    if (!keyword) return

    let searchHistory = [keyword, ...this.data.searchHistory.filter(h => h !== keyword)]
    if (searchHistory.length > 10) searchHistory = searchHistory.slice(0, 10)
    wx.setStorageSync('searchHistory', searchHistory)
    this.setData({ searchHistory, hasSearched: true, activeFilter: 'all', page: 1, results: [], hasMore: true, loadMoreStatus: 'more' })

    this.doSearch(keyword)
  },

  /** 关键词搜索：GET /posts?keyword=&sectionId=（分页形状，hasMore 驱动加载更多） */
  async doSearch(keyword) {
    // 首屏也要进入 loading：否则请求返回前会先闪一下「未找到相关内容」
    this.setData({ loadMoreStatus: 'loading' })
    try {
      const params = { keyword, page: this.data.page, pageSize: this.data.pageSize }
      if (this.data.activeFilter !== 'all') params.category = this.data.activeFilter
      const result = await get('/posts', params, false)
      const list = result.list || []
      this.setData({
        results: this.data.page === 1 ? list : [...this.data.results, ...list],
        hasMore: result.hasMore,
        loadMoreStatus: result.hasMore ? 'more' : 'nomore'
      })
    } catch (e) {
      this.setData({ results: this.data.page === 1 ? [] : this.data.results, hasMore: false, loadMoreStatus: 'error' })
    }
  },

  /** 搜索失败后的重试：保持当前关键词与筛选，重跑第一页 */
  onRetrySearch() {
    this.setData({ page: 1, results: [], hasMore: true })
    this.doSearch(this.data.keyword.trim())
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.loadMoreStatus === 'loading') return
    this.setData({ page: this.data.page + 1 })
    this.doSearch(this.data.keyword.trim())
  },

  onClear() {
    this.setData({ keyword: '', hasSearched: false, results: [], page: 1, hasMore: false, loadMoreStatus: 'more' })
  },

  onCancel() {
    wx.navigateBack()
  },

  onSearchTopic(e) {
    const name = e.currentTarget.dataset.name
    this.setData({ keyword: name })
    this.onSearch()
  },

  onSearchHistory(e) {
    const keyword = e.currentTarget.dataset.keyword
    this.setData({ keyword })
    this.onSearch()
  },

  onClearHistory() {
    wx.removeStorageSync('searchHistory')
    this.setData({ searchHistory: [] })
  },

  onFilterResult(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.activeFilter) return
    this.setData({ activeFilter: filter, page: 1, results: [], hasMore: true, loadMoreStatus: 'more' })
    this.doSearch(this.data.keyword.trim())
  },

  onTapPost(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.post.id}` })
  },

  async onLikePost(e) {
    if (!app.requireLogin(null, '点赞')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/like`, {}, false)
    this.setData({ results: this.data.results.map(item => item.id === id ? { ...item, ...updated } : item) })
  },

  onCommentPost(e) {
    wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}&focus=true` })
  },

  async onFavoritePost(e) {
    if (!app.requireLogin(null, '收藏')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/favorite`, {}, false)
    this.setData({ results: this.data.results.map(item => item.id === id ? { ...item, ...updated } : item) })
  },

  async onFollowAuthor(e) {
    if (!app.requireLogin(null, '关注')) return
    const userId = e.detail.userId
    const result = await post(`/users/${userId}/follow`, {}, false)
    const results = this.data.results.map(item => {
      if (item.author && item.author.id === userId) {
        return { ...item, author: { ...item.author, isFollowing: result.isFollowing } }
      }
      return item
    })
    this.setData({ results })
  },

  onShareAppMessage(e) {
    const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''
    const post = this.data.results.find(item => item.id === id)
    return buildPostShare(post, id)
  }
})
