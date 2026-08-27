const app = getApp()
const { getCategoryList } = require('../../utils/category')
const { get, post } = require('../../utils/api')
const { timeAgo } = require('../../utils/util')
const { buildPostShare } = require('../../utils/share')

Page({
  data: {
    posts: [],
    categoryList: [],
    sortTabs: [
      { id: 'hot', name: '热门' },
      { id: 'new', name: '最新' }
    ],
    activeSort: 'hot',
    currentCategory: '',
    currentCampus: '主校区',
    page: 1,
    pageSize: 10,
    isLoading: false,
    isRefreshing: false,
    loadMoreStatus: 'more',
    hasMore: true,
    currentUserId: '',
    emptyStateText: '还没有动态，快来发布第一条吧',
    emptyStateSubText: '分享一条校园新鲜事，让同学们看到你',
    emptyStateIcon: '📝',
    emptyStateBtnText: '去发布',
    announcement: null
  },

  onLoad() {
    const categoryList = getCategoryList()
    this.setData({ categoryList })
    this.loadPosts()
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 })
    }
    this.setData({ currentUserId: app.globalData.userInfo ? app.globalData.userInfo.id : '' })
    this.updateEmptyState()
    this.checkAnnouncement()
  },

  /**
   * 公告确认流：登录态下拉最新未确认公告（游客静默跳过）。
   * 每会话只查一次（失败不置位，下次 onShow 重试）；「我知道了」POST ack
   * 后端即按确认记录过滤，本地同时清空数据源保证本会话不再弹。
   */
  async checkAnnouncement() {
    if (this._announceChecked || !app.checkLogin()) return
    try {
      const a = await get('/announcements/active', {}, false)
      this._announceChecked = true
      if (a && a.id != null && !this.data.announcement) {
        this.setData({ announcement: a })
      }
    } catch (e) {
      console.warn('[announce] 拉取公告失败，下次回首页重试', e)
    }
  },

  async onAnnouncementAck() {
    const a = this.data.announcement
    if (!a) return
    this.setData({ announcement: null })
    try {
      await post('/announcements/' + a.id + '/ack', {}, false)
    } catch (e) {
      // ack 失败仅影响服务端记录；本会话已不再弹，下次冷启动可能重提
      console.warn('[announce] 确认公告失败', e)
    }
  },

  onPullDownRefresh() {
    this.onRefresh()
  },

  onReachBottom() {
    this.onLoadMore()
  },

  async loadPosts() {
    if (this.data.isLoading) return
    this.setData({ isLoading: true })

    try {
      const params = {
        page: this.data.page,
        pageSize: this.data.pageSize,
        sort: this.data.activeSort
      }
      if (this.data.currentCategory) params.category = this.data.currentCategory

      const result = await get('/posts', params, false)
      this.setData({
        posts: this.data.page === 1 ? result.list : [...this.data.posts, ...result.list],
        isLoading: false,
        isRefreshing: false,
        hasMore: result.hasMore,
        loadMoreStatus: result.hasMore ? 'more' : 'nomore'
      })
      this.updateEmptyState()
    } catch (e) {
      this.setData({ isLoading: false, isRefreshing: false, loadMoreStatus: 'error' })
      this.updateEmptyState('network')
    }
    wx.stopPullDownRefresh()
  },

  updateEmptyState(type = '') {
    if (type === 'network') {
      this.setData({
        emptyStateText: '网络开小差了',
        emptyStateSubText: '稍后重试一下，校园新鲜事还在路上',
        emptyStateIcon: '📡',
        emptyStateBtnText: '重新加载'
      })
      return
    }
    this.setData({
      emptyStateText: '还没有动态，快来发布第一条吧',
      emptyStateSubText: '分享一条校园新鲜事，让同学们看到你',
      emptyStateIcon: '📝',
      emptyStateBtnText: '去发布'
    })
  },

  onRefresh() {
    this.setData({
      isRefreshing: true,
      page: 1,
      hasMore: true
    })
    this.loadPosts()
  },

  onLoadMore() {
    if (!this.data.hasMore || this.data.isLoading) return
    this.setData({
      page: this.data.page + 1,
      loadMoreStatus: 'loading'
    })
    this.loadPosts()
  },

  onSelectCategory(e) {
    const id = e.currentTarget.dataset.id
    this.setData({
      currentCategory: id,
      page: 1,
      posts: []
    })
    this.loadPosts()
  },

  onSwitchSort(e) {
    const id = e.currentTarget.dataset.id
    if (!id || id === this.data.activeSort) return
    this.setData({
      activeSort: id,
      page: 1,
      posts: []
    })
    this.loadPosts()
  },

  onEmptyStateAction() {
    if (this.data.loadMoreStatus === 'error') {
      this.onRefresh()
      return
    }
    this.onGoPublish()
  },

  onSwitchCampus() {
    const campusList = app.globalData.campusList
    wx.showActionSheet({
      itemList: campusList,
      success: (res) => {
        this.setData({
          currentCampus: campusList[res.tapIndex],
          page: 1,
          posts: []
        })
        this.loadPosts()
      }
    })
  },

  onGoSearch() {
    wx.navigateTo({ url: '/pages/search/search' })
  },

  onGoPublish() {
    app.requireLogin(() => {
      wx.switchTab({ url: '/pages/publish/publish' })
    })
  },

  onTapPost(e) {
    const post = e.detail.post
    wx.navigateTo({
      url: `/pages/detail/detail?id=${post.id}`
    })
  },

  async onLikePost(e) {
    if (!app.requireLogin(null, '点赞')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/like`, {}, false)
    this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) })
  },

  onCommentPost(e) {
    const id = e.detail.id
    wx.navigateTo({
      url: `/pages/detail/detail?id=${id}&focus=true`
    })
  },

  async onFavoritePost(e) {
    if (!app.requireLogin(null, '收藏')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/favorite`, {}, false)
    this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) })
  },

  async onFollowAuthor(e) {
    if (!app.requireLogin(null, '关注')) return
    const userId = e.detail.userId
    const result = await post(`/users/${userId}/follow`, {}, false)
    const posts = this.data.posts.map(item => {
      if (item.author && item.author.id === userId) {
        return { ...item, author: { ...item.author, isFollowing: !!result.following } }
      }
      return item
    })
    this.setData({ posts })
  },

  onSharePost(e) {
    const id = e.detail.id
    const post = this.data.posts.find(p => p.id === id)
    return buildPostShare(post, id)
  },

  onShareAppMessage(e) {
    const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''
    const post = this.data.posts.find(p => p.id === id)
    return buildPostShare(post, id)
  }
})
