const api = require('./utils/api')

App({
  onLaunch() {
    this.detectLowEndDevice()
    this.checkUpdate()
    this.initUserInfo()
    this.silentWxLogin()
  },

  /**
   * 微信静默登录链：wx.login 取 code -> POST /auth/wx-login -> 存 token 走已登录态。
   * 返回 code 501（后端未配置微信登录）或任何失败：静默落入学号密码表单登录，
   * 不弹窗不打扰用户；已有 token（含学号密码会话）时跳过，避免覆盖登出状态。
   */
  async silentWxLogin() {
    try {
      if (this.globalData.token || wx.getStorageSync('token')) return
      const { code } = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject })
      })
      await api.wxLogin(code)
    } catch (e) {
      console.warn('[auth] 微信静默登录未生效，回退学号密码登录:', (e && (e.code || e.message)) || e)
    }
  },

  // 低端机检测：命中后在所有页面根节点追加 'perf-low' 类，由 app.wxss 关闭动画/模糊。
  detectLowEndDevice() {
    let isLow = false
    try {
      const info = wx.getSystemInfoSync()
      const mem = info && (info.memorySize || 0) // 单位 MB，部分为 0 时退化为型号判断
      const model = (info && info.model) || ''
      if (mem && mem <= 1024) isLow = true
      // 常见低端机型关键字（保守匹配）
      const lowModels = ['iPhone 6', 'iPhone 7', 'iPhone 8', 'iPhone SE', 'Redmi', '荣耀', '畅享', 'nova', 'OPPO A', 'vivo Y']
      if (!isLow && lowModels.some(k => model.indexOf(k) >= 0)) isLow = true
    } catch (e) {
      isLow = false
    }
    this.globalData.perfLow = isLow
    if (isLow) {
      // 低端机：每次页面切换后，对当前页根节点注入 'perf-low'（wxml 已绑定 {{perfLowClass}}）
      const apply = () => {
        const cur = getCurrentPages()
        if (cur && cur.length) {
          const page = cur[cur.length - 1]
          if (page && typeof page.setData === 'function') {
            page.setData({ perfLowClass: 'perf-low' })
          }
        }
      }
      if (typeof wx.onAppRoute === 'function') {
        wx.onAppRoute(() => { setTimeout(apply, 0) })
      }
      setTimeout(apply, 0)
    }
  },

  globalData: {
    userInfo: null,
    // 后端地址由 miniprogram/config.js 按微信环境（develop/trial/release）提供。
    // 这里刻意留空：留空才能让 request.js 回落到按环境配置；
    // 若在此写死 localhost，真机会请求失败（localhost 指向手机自身）。
    baseUrl: '',
    token: '',
    campusList: ['主校区', '南校区', '北校区', '东校区'],
    currentCampus: '主校区'
  },

  checkUpdate() {
    const updateManager = wx.getUpdateManager()
    updateManager.onUpdateReady(function () {
      wx.showModal({
        title: '更新提示',
        content: '新版本已经准备好，是否重启应用？',
        success(res) {
          if (res.confirm) {
            updateManager.applyUpdate()
          }
        }
      })
    })
  },

  initUserInfo() {
    const userInfo = wx.getStorageSync('userInfo')
    const token = wx.getStorageSync('token')
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }
    if (token) {
      this.globalData.token = token
    }
  },

  checkLogin() {
    return !!this.globalData.token
  },

  requireLogin(callback, action = '') {
    if (this.checkLogin()) {
      callback && callback()
      return true
    } else {
      wx.showModal({
        title: '需要登录',
        content: action ? `${action}需要先登录微信账号` : '请先登录微信账号',
        confirmText: '去登录',
        success: res => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/mine/profile/profile?needLogin=true'
            })
          }
        }
      })
      return false
    }
  }
})
