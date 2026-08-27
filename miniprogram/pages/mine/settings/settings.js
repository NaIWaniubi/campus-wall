const { showToast, showModal } = require('../../../utils/util')
const { clearAllCache, getCacheSize } = require('../../../utils/cache')
const { logout } = require('../../../utils/api')

Page({
  data: {
    cacheSize: '',
    isLoggedIn: false
  },

  onLoad() {
    this.setData({
      cacheSize: getCacheSize(),
      isLoggedIn: getApp().checkLogin()
    })
  },

  onShow() {
    this.setData({ isLoggedIn: getApp().checkLogin() })
  },

  async onClearNonAuthCache() {
    const confirmed = await showModal('清理缓存', '确定要清理图片和页面缓存吗？登录状态会保留。')
    if (confirmed) {
      clearAllCache()
      this.setData({ cacheSize: getCacheSize() })
      showToast('缓存已清除', 'success')
    }
  },

  onUserAgreement() {
    wx.navigateTo({ url: '/pages/legal/userAgreement' })
  },

  onPrivacyPolicy() {
    wx.navigateTo({ url: '/pages/legal/privacyPolicy' })
  },

  onFeedback() {
    wx.navigateTo({ url: '/pages/mine/feedback/feedback' })
  },

  /** 退出登录：POST /auth/logout 幂等 + 清空本地登录态 */
  async onLogout() {
    const confirmed = await showModal('确认退出', '确定要退出登录吗？')
    if (!confirmed) return
    await logout()
    this.setData({ isLoggedIn: false })
    showToast('已退出登录')
  }
})
