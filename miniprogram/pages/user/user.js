const app = getApp()
const { users, follow: followApi, posts: postsApi, post, absUrl } = require('../../utils/api')
const { showToast } = require('../../utils/util')

const PAGE_SIZE = 20

/** 信誉分 -> 徽章等级（与关注列表 / 我的页同口径） */
function buildCreditBadge(score) {
  if (typeof score !== 'number' || isNaN(score)) return null
  let cls = 'lv-normal'
  if (score >= 100) cls = 'lv-gold'
  else if (score >= 90) cls = 'lv-good'
  else if (score >= 80) cls = 'lv-normal'
  else if (score >= 60) cls = 'lv-warn'
  else cls = 'lv-bad'
  return { score, cls }
}

/** 他人主页：公开资料 + 信誉徽章 + 关注关系 + TA 的公开帖（GET /users/:id、/posts?authorId=） */
Page({
  data: {
    userId: 0,
    user: null,
    avatar: '',
    badge: null,
    isSelf: false,
    isFollowing: false,
    followerCount: 0,
    loading: true,
    posts: [],
    page: 1,
    hasMore: false,
    loadingMore: false
  },

  onLoad(options) {
    const id = Number(options && options.id)
    if (!id) {
      showToast('用户不存在')
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    const me = app.globalData.userInfo || {}
    this.setData({ userId: id, isSelf: me.id === id })
    this.loadProfile()
    this.loadPosts(true)
  },

  onPullDownRefresh() {
    this.loadProfile()
    this.loadPosts(true).then(() => wx.stopPullDownRefresh())
  },

  async loadProfile() {
    try {
      const user = await users.byId(this.data.userId)
      if (!user) throw new Error('not found')
      const me = app.globalData.userInfo || {}
      this.setData({
        user,
        avatar: absUrl(user.avatar) || '',
        badge: buildCreditBadge(user.creditScore),
        isSelf: me.id === user.id
      })
      if (user.nickname) wx.setNavigationBarTitle({ title: user.nickname })
      if (this.data.isSelf) return
      if (app.checkLogin()) {
        try {
          const res = await followApi.status(this.data.userId)
          this.setData({ isFollowing: !!(res && res.following), followerCount: (res && res.count) || 0 })
        } catch (e) { /* 未登录或失败：静默 */ }
      }
    } catch (e) {
      console.error('加载用户主页失败', e)
      this.setData({ user: null })
    }
  },

  async loadPosts(reset) {
    if (this.data.loadingMore && !reset) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loadingMore: true })
    if (reset) this.setData({ loading: true })
    try {
      const data = await postsApi.list({ authorId: this.data.userId, page, pageSize: PAGE_SIZE, sort: 'new' })
      const list = (data && data.list) || []
      this.setData({
        posts: reset ? list : this.data.posts.concat(list),
        page,
        hasMore: !!(data && data.hasMore),
        loading: false,
        loadingMore: false
      })
    } catch (e) {
      console.error('加载用户帖子失败', e)
      this.setData({ loading: false, loadingMore: false, hasMore: false })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loadingMore) this.loadPosts(false)
  },

  async onToggleFollow() {
    if (this.data.isSelf) return
    if (!app.requireLogin(null, '关注')) return
    try {
      const res = await followApi.toggle(this.data.userId)
      const following = !!(res && res.following)
      this.setData({
        isFollowing: following,
        followerCount: Math.max(0, this.data.followerCount + (following ? 1 : -1))
      })
      showToast(following ? '已关注' : '已取消关注')
    } catch (e) {
      showToast('操作失败')
    }
  },

  onTapFollowing() {
    if (!app.checkLogin()) return
    wx.navigateTo({ url: `/pages/mine/follows/follows?type=following&userId=${this.data.userId}` })
  },

  onTapFollowers() {
    if (!app.checkLogin()) return
    wx.navigateTo({ url: `/pages/mine/follows/follows?type=followers&userId=${this.data.userId}` })
  },

  onGoSelf() {
    wx.switchTab({ url: '/pages/mine/mine' })
  },

  onTapPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.post.id}` }) },
  onCommentPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}&focus=true` }) },

  async onLikePost(e) {
    if (!app.requireLogin(null, '点赞')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/like`, {}, false)
    this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) })
  },

  async onFavoritePost(e) {
    if (!app.requireLogin(null, '收藏')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/favorite`, {}, false)
    this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) })
  },

  onShareAppMessage() {
    const name = (this.data.user && this.data.user.nickname) || '校园墙用户'
    return { title: `${name} 的主页`, path: `/pages/user/user?id=${this.data.userId}` }
  }
})