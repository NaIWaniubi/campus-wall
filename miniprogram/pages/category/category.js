const { getCategoryList } = require('../../utils/category')
const { get } = require('../../utils/api')

Page({
  data: { categoryList: [] },

  async onLoad() {
    const categoryList = getCategoryList()
    try {
      const topics = await get('/search/hot-topics', {}, false)
      const list = categoryList.map(cat => {
        const matched = topics.find(topic => topic.name === cat.id || topic.name === cat.name)
        return { ...cat, postCount: matched ? matched.count : 0 }
      })
      this.setData({ categoryList: list })
    } catch (e) {
      const list = categoryList.map(cat => ({ ...cat, postCount: 0 }))
      this.setData({ categoryList: list })
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 })
    }
  },

  onGoCategory(e) {
    const id = e.currentTarget.dataset.id
    const urlMap = {
      lost: '/pages/category/lost/lost',
      confession: '/pages/category/confession/confession',
      help: '/pages/category/help/help',
      trade: '/pages/category/trade/trade',
      carshare: '/pages/category/carshare/carshare',
      team: '/pages/category/team/team',
      activity: '/pages/category/activity/activity',
      daily: '/pages/category/daily/daily'
    }
    wx.navigateTo({ url: `${urlMap[id]}?category=${id}` })
  }
})
