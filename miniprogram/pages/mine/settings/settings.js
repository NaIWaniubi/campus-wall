const { showToast, showModal } = require('../../../utils/util')
const { logout } = require('../../../utils/api')

/** 登录态存储键：清理缓存时必须保留，否则会把用户顺带踢下线 */
const AUTH_KEYS = ['token', 'userInfo']

/** 本地存储占用；wx 的 currentSize 单位为 KB */
function getCacheSize() {
  try {
    const { currentSize = 0 } = wx.getStorageInfoSync()
    if (!currentSize) return ''
    return currentSize >= 1024 ? `${(currentSize / 1024).toFixed(1)}MB` : `${Math.round(currentSize)}KB`
  } catch (e) {
    // 存储信息不可用时静默留空，不阻塞设置页渲染
    return ''
  }
}

/** 清理除登录态外的全部本地缓存 */
function clearAllCache() {
  try {
    const { keys = [] } = wx.getStorageInfoSync()
    keys.forEach((key) => {
      if (!AUTH_KEYS.includes(key)) wx.removeStorageSync(key)
    })
  } catch (e) {
    console.error('[settings] 清理缓存失败', e)
  }
}

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
