Component({
  data: {
    selected: 0,
    list: [
      { pagePath: '/pages/index/index', text: '首页', icon: '/images/nav-home.svg', activeIcon: '/images/nav-home-active.svg' },
      { pagePath: '/pages/category/category', text: '话题', icon: '/images/nav-compass.svg', activeIcon: '/images/nav-compass-active.svg' },
      { pagePath: '/pages/publish/publish', text: '发布', icon: '/images/nav-plus.svg', activeIcon: '/images/nav-plus-active.svg' },
      { pagePath: '/pages/message/message', text: '消息', icon: '/images/nav-bell.svg', activeIcon: '/images/nav-bell-active.svg' },
      { pagePath: '/pages/mine/mine', text: '我的', icon: '/images/nav-user.svg', activeIcon: '/images/nav-user-active.svg' }
    ]
  },

  lifetimes: {
    attached() {
      this.syncSelected()
    }
  },

  pageLifetimes: {
    show() {
      this.syncSelected()
    }
  },

  methods: {
    syncSelected() {
      const pages = getCurrentPages()
      const route = pages.length ? `/${pages[pages.length - 1].route}` : '/pages/index/index'
      const selected = this.data.list.findIndex(item => item.pagePath === route)
      this.setData({ selected: selected < 0 ? 0 : selected })
    },

    onSwitchTab(e) {
      const index = Number(e.currentTarget.dataset.index)
      const item = this.data.list[index]
      if (!item || index === this.data.selected) return
      this.setData({ selected: index })
      wx.switchTab({ url: item.pagePath })
    }
  }
})
