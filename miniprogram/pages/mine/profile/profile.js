const app = getApp()
const { get, put, uploadFile, login, register, logout } = require('../../../utils/api')
const { showToast, showModal } = require('../../../utils/util')

// 开放重定向防护：仅允许 /pages/ 开头的相对路径，禁止协议、绝对 URL、特殊字符
function sanitizeMiniPath(input) {
  if (typeof input !== 'string' || !input) return ''
  const s = input.trim()
  if (!s.startsWith('/pages/')) return ''
  if (s.length > 256) return ''
  if (/[\r\n\t]/.test(s)) return ''
  if (s.includes('//') || s.includes(':\\')) return ''
  return s
}

Page({
  data: {
    userInfo: {},
    campusList: [],
    campusIndex: 0,
    isLoggedIn: false,
    authMode: 'login',
    studentId: '',
    password: '',
    nickname: '',
    college: '',
    authLoading: false,
    agreed: false,
    pendingRedirect: '' // 登录/注册成功后回跳的页面路径
  },

  onLoad(options) {
    const campusList = app.globalData.campusList
    const userInfo = app.globalData.userInfo || {}
    const campusIndex = campusList.indexOf(userInfo.campus)
    // 401 跳过来时会带 redirect 参数；此处解码保存，登录成功后回跳
    let pendingRedirect = ''
    if (options && options.redirect) {
      try {
        pendingRedirect = decodeURIComponent(options.redirect)
      } catch (e) {
        pendingRedirect = options.redirect || ''
      }
      // 开放重定向防护：仅允许 /pages/ 开头的同包内路径，禁止绝对 URL/外部跳转
      pendingRedirect = sanitizeMiniPath(pendingRedirect)
    }
    this.setData({
      userInfo,
      campusList,
      campusIndex: campusIndex >= 0 ? campusIndex : 0,
      isLoggedIn: app.checkLogin(),
      pendingRedirect
    })
  },

  ensureLoggedIn(action) {
    if (app.checkLogin()) return true
    wx.showModal({
      title: '需要登录',
      content: action ? `${action}需要先登录` : '请先登录',
      confirmText: '去登录',
      success: res => {
        if (res.confirm) this.setData({ authMode: 'login' })
      }
    })
    return false
  },

  async onChangeAvatar() {
    if (!this.ensureLoggedIn('修改头像')) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: async (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        try {
          const result = await uploadFile(tempPath)
          await put('/user/info', { avatar: result.url })
          this.setData({ 'userInfo.avatar': result.url })
          app.globalData.userInfo = this.data.userInfo
          wx.setStorageSync('userInfo', this.data.userInfo)
          showToast('头像已更新')
        } catch (e) {
          showToast('头像上传失败')
        }
      }
    })
  },

  async onEditNickname() {
    if (!this.ensureLoggedIn('修改昵称')) return
    wx.showModal({
      title: '修改昵称',
      editable: true,
      placeholderText: '请输入昵称',
      content: this.data.userInfo.nickname || '',
      success: async (res) => {
        if (res.confirm && res.content) {
          this.setData({ 'userInfo.nickname': res.content })
          app.globalData.userInfo = this.data.userInfo
          wx.setStorageSync('userInfo', this.data.userInfo)
          try {
            await put('/user/info', { nickname: res.content })
          } catch (e) {
            console.error('更新昵称失败', e)
          }
          showToast('昵称已更新')
        }
      }
    })
  },

  async onEditSignature() {
    if (!this.ensureLoggedIn('修改签名')) return
    wx.showModal({
      title: '修改签名',
      editable: true,
      placeholderText: '请输入个性签名',
      content: this.data.userInfo.signature || '',
      success: async (res) => {
        if (res.confirm && res.content) {
          this.setData({ 'userInfo.signature': res.content })
          app.globalData.userInfo = this.data.userInfo
          wx.setStorageSync('userInfo', this.data.userInfo)
          try {
            await put('/user/info', { signature: res.content })
          } catch (e) {
            console.error('更新签名失败', e)
          }
          showToast('签名已更新')
        }
      }
    })
  },

  async onCampusChange(e) {
    if (!this.ensureLoggedIn('修改校区')) return
    this.setData({ campusIndex: e.detail.value })
    this.setData({ 'userInfo.campus': this.data.campusList[e.detail.value] })
    app.globalData.userInfo = this.data.userInfo
    wx.setStorageSync('userInfo', this.data.userInfo)
    try {
      await put('/user/info', { campus: this.data.campusList[e.detail.value] })
    } catch (e) {
      console.error('更新校区失败', e)
    }
  },

  onSwitchAuthMode(e) {
    this.setData({ authMode: e.currentTarget.dataset.mode })
  },

  onAuthInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },

  /** 勾选/取消协议同意 */
  onToggleAgree() {
    this.setData({ agreed: !this.data.agreed })
  },

  /** 打开法律文本页（与 Web /legal 同源） */
  onOpenLegal(e) {
    const page = e.currentTarget.dataset.page // privacyPolicy | userAgreement
    wx.navigateTo({ url: '/pages/legal/' + page })
  },
  /** 账号 + 密码 JWT 登录 / 注册（POST /auth/login | /auth/register） */
  async onAuthSubmit() {
    if (this.data.authLoading) return
    const { authMode, studentId, password, nickname, college, agreed } = this.data
    if (!studentId.trim()) { showToast('请输入账号'); return }
    if (!password) { showToast('请输入密码'); return }
    if (authMode === 'register' && !nickname.trim()) { showToast('请输入昵称'); return }
    if (authMode === 'register' && !agreed) {
      showToast('请先阅读并勾选同意《用户协议》和《隐私政策》')
      return
    }

    this.setData({ authLoading: true })
    try {
      const result = authMode === 'login'
        ? await login(studentId.trim(), password)
        : await register({ studentId: studentId.trim(), password, nickname, college })
      this.setData({
        userInfo: result.user || app.globalData.userInfo,
        isLoggedIn: true
      })
      showToast(authMode === 'login' ? '登录成功' : '注册成功', 'success')
      // 登录/注册成功后回跳：优先用 onLoad 传入的 redirect，否则读 storage 中的 auth:redirect
      let redirect = this.data.pendingRedirect || wx.getStorageSync('auth:redirect') || ''
      // storage 来源不在本次请求链路，再次走白名单校验
      if (redirect) redirect = sanitizeMiniPath(redirect)
      if (redirect) {
        try { wx.removeStorageSync('auth:redirect') } catch (e) { /* ignore */ }
        // 兜底：防止 redirect 指回当前页造成死循环
        if (redirect !== '/pages/mine/profile/profile') {
          wx.reLaunch({ url: redirect })
        }
      }
    } catch (e) {
      // 业务错误 message 已由适配层 toast，这里兜底网络类失败
      if (!e || !e.message) showToast(authMode === 'login' ? '登录失败，请重试' : '注册失败，请重试')
    } finally {
      this.setData({ authLoading: false })
    }
  },

  async onLogout() {
    const confirmed = await showModal('确认退出', '确定要退出登录吗？')
    if (confirmed) {
      await logout()
      this.setData({
        userInfo: {},
        isLoggedIn: false,
        password: ''
      })
      showToast('已退出登录')
    }
  }
})
