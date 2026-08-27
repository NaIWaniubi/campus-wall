const { followingList, followersList } = require('../../../utils/api')
const { requireLogin } = require('../../../utils/auth')

const PAGE_SIZE = 20

/** 信誉分 -> 徽章等级（与 mine 页 buildCreditBadge 同口径） */
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

Page({
  data: {
    type: 'following', // following | followers
    userId: '',
    users: [],
    page: 1,
    hasMore: false,
    loading: false,
    loaded: false
  },

  onLoad(options) {
    if (!requireLogin('查看关注')) return
    const type = options.type === 'followers' ? 'followers' : 'following'
    this.setData({
      type,
      userId: options.userId || ''
    })
    wx.setNavigationBarTitle({ title: type === 'followers' ? '粉丝' : '关注' })
    this.loadUsers(true)
  },

  onSwitchTab(e) {
    const type = e.currentTarget.dataset.type
    if (!type || type === this.data.type || this.data.loading) return
    this.setData({
      type,
      users: [],
      page: 1,
      hasMore: false,
      loaded: false
    })
    wx.setNavigationBarTitle({ title: type === 'followers' ? '粉丝' : '关注' })
    this.loadUsers(true)
  },

  async loadUsers(reset) {
    if (this.data.loading) return
    const page = reset ? 1 : this.data.page + 1
    this.setData({ loading: true })
    try {
      const fetcher = this.data.type === 'followers' ? followersList : followingList
      const data = await fetcher(this.data.userId, page, PAGE_SIZE)
      const items = (((data && data.list) || [])).map(u => Object.assign({}, u, { badge: buildCreditBadge(u.creditScore) }))
      this.setData({
        users: reset ? items : this.data.users.concat(items),
        page,
        hasMore: !!(data && data.hasMore),
        loaded: true,
        loading: false
      })
    } catch (e) {
      console.error('加载关注列表失败', e)
      this.setData({ loaded: true, loading: false })
    }
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadUsers(false)
  },

  /** 对方主页路由暂缺，占位提示 */
  onTapUser() {
    wx.showToast({ title: '对方主页暂未开放', icon: 'none' })
  }
})
