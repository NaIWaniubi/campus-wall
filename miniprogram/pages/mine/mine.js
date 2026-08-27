const app = getApp()
const { get, followingList, followersList } = require('../../utils/api')
const { timeAgo } = require('../../utils/util')

/** 信誉分 -> 徽章文案与等级样式（CreditBadge 等价实现） */
function buildCreditBadge(score) {
  if (typeof score !== 'number' || isNaN(score)) return null
  let cls = 'lv-normal'
  let label = '信誉良好'
  if (score >= 100) { cls = 'lv-gold'; label = '信誉极佳' }
  else if (score >= 90) { cls = 'lv-good'; label = '信誉优秀' }
  else if (score >= 80) { cls = 'lv-normal'; label = '信誉良好' }
  else if (score >= 60) { cls = 'lv-warn'; label = '信誉一般' }
  else { cls = 'lv-bad'; label = '信誉受限' }
  return { score, label, cls }
}

function buildStars(rating) {
  const n = Math.max(0, Math.min(5, Number(rating) || 0))
  return '★★★★★'.slice(0, n) + '☆☆☆☆☆'.slice(0, 5 - n)
}

Page({
  data: {
    userInfo: {},
    unreadCount: 0,
    creditBadge: null,
    tradeRatings: null
  },

  onLoad() {
    this.loadUserInfo()
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 })
    }
    this.loadUserInfo()
    if (app.checkLogin()) {
      try {
        const count = await get('/notifications/unread-count', {}, false)
        this.setData({ unreadCount: count })
      } catch (e) {
        this.setData({ unreadCount: 0 })
      }
    }
  },

  async loadUserInfo() {
    if (app.checkLogin()) {
      try {
        const userInfo = await get('/user/info', {}, false)
        app.globalData.userInfo = userInfo
        wx.setStorageSync('userInfo', userInfo)
        this.applyUser(userInfo)
        this.loadTradeRatings(userInfo.id)
        this.loadFollowCounts(userInfo.id)
        return
      } catch (e) {
        console.error('加载用户信息失败', e)
      }
    }
    this.applyUser(app.globalData.userInfo || {})
  },

  applyUser(userInfo) {
    this.setData({
      userInfo,
      creditBadge: buildCreditBadge(userInfo && userInfo.creditScore)
    })
  },

  /** 交易评价区：GET /api/users/:id/trade-ratings -> {total, avg, list[]} */
  async loadTradeRatings(userId) {
    if (!userId) {
      this.setData({ tradeRatings: null })
      return
    }
    try {
      const data = await get(`/users/${userId}/trade-ratings`, {}, false)
      const list = ((data && data.list) || []).slice(0, 3).map(r => ({
        ...r,
        starsText: buildStars(r.rating),
        timeAgoText: timeAgo(new Date(r.createdAt).getTime())
      }))
      this.setData({
        tradeRatings: {
          total: (data && data.total) || 0,
          avg: data && data.avg != null ? data.avg : null,
          list
        }
      })
    } catch (e) {
      console.error('加载交易评价失败', e)
      this.setData({ tradeRatings: null })
    }
  },

  /** 关注/粉丝数：后端暂无 me 聚合端点，用两个 pageSize=1 列表请求取 total */
  async loadFollowCounts(userId) {
    if (!userId) return
    try {
      const [following, followers] = await Promise.all([
        followingList(userId, 1, 1),
        followersList(userId, 1, 1)
      ])
      this.setData({
        'userInfo.followingCount': (following && following.total) || 0,
        'userInfo.followerCount': (followers && followers.total) || 0
      })
    } catch (e) {
      console.error('加载关注/粉丝数失败', e)
    }
  },

  onGoProfile() {
    wx.navigateTo({ url: '/pages/mine/profile/profile' })
  },

  onGoMyPosts() {
    app.requireLogin(() => {
      wx.navigateTo({ url: '/pages/mine/myPosts/myPosts' })
    })
  },

  onGoMyFavorites() {
    app.requireLogin(() => {
      wx.navigateTo({ url: '/pages/mine/myFavorites/myFavorites' })
    })
  },

  onGoMyLikes() {
    app.requireLogin(() => {
      wx.navigateTo({ url: '/pages/mine/myLikes/myLikes' })
    })
  },

  onGoFollows(e) {
    app.requireLogin(() => {
      wx.navigateTo({ url: `/pages/mine/follows/follows?type=${e.currentTarget.dataset.type}&userId=${this.data.userInfo.id}` })
    }, '查看关注')
  },

  onGoNotification() {
    wx.navigateTo({ url: '/pages/mine/notification/notification' })
  },

  onGoSettings() {
    wx.navigateTo({ url: '/pages/mine/settings/settings' })
  },

  onTapRatingPost(e) {
    const postId = e.currentTarget.dataset.postid
    if (postId) wx.navigateTo({ url: `/pages/detail/detail?id=${postId}` })
  },

  onAbout() {
    wx.showModal({
      title: '关于我们',
      content: '校园墙小程序 v1.0.0\n一个属于大学生的校园信息分享平台',
      showCancel: false
    })
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/mine/feedback/feedback' })
  }
})
