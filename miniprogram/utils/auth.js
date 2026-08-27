/**
 * 登录体系（学号 + 密码 JWT）：
 *   login / register / wxLogin / logout
 *   + saveSession / clearSession（写 storage + globalData）
 *   + isLoggedIn / requireLogin（页面守卫）
 *
 * 微信静默登录：wxLogin（501 静默回退表单），由 rawRequest.silentCodes 拦截不弹错误。
 */
const { rawRequest, getAppSafe } = require('./request')
const { normalizeUser } = require('./legacy-adapter')
const { showToast } = require('./util')

const STUDENT_ID_RE = /^\d{6,12}$/

function saveSession(result) {
  const app = getAppSafe()
  const user = normalizeUser(result.user || {})
  if (app && app.globalData) {
    app.globalData.token = result.token
    app.globalData.userInfo = user
  }
  wx.setStorageSync('token', result.token)
  wx.setStorageSync('userInfo', user)
  return result
}

function clearSession() {
  const app = getAppSafe()
  if (app && app.globalData) {
    app.globalData.token = ''
    app.globalData.userInfo = null
  }
  try {
    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
  } catch (e) { /* 忽略 */ }
}

/** 学号密码登录：POST /auth/login -> {token, user} */
async function login(studentId, password) {
  if (!STUDENT_ID_RE.test(String(studentId))) {
    const err = { message: '学号应为6-12位数字' }
    showToast(err.message)
    throw err
  }
  if (!password) {
    const err = { message: '请输入密码' }
    showToast(err.message)
    throw err
  }
  const result = await rawRequest({ url: '/auth/login', method: 'POST', data: { studentId, password }, loading: false })
  return saveSession(result)
}

/** 注册：studentId 6-12 位数字；password ≥6 位；nickname 必填 */
async function register(payload) {
  const { studentId, password, nickname, college, grade } = payload || {}
  let invalid = null
  if (!STUDENT_ID_RE.test(String(studentId))) {
    invalid = '学号应为6-12位数字'
  } else if (!password || password.length < 6) {
    invalid = '密码长度至少6位'
  } else if (!nickname || !nickname.trim()) {
    invalid = '昵称不能为空'
  }
  if (invalid) {
    showToast(invalid)
    throw { message: invalid }
  }
  const result = await rawRequest({
    url: '/auth/register',
    method: 'POST',
    data: { studentId, password, nickname: nickname.trim(), college: college || '', grade: grade || '' },
    loading: false
  })
  return saveSession(result)
}

/**
 * 微信静默登录：wx.login 的 code -> POST /auth/wx-login -> {token, user}。
 * 后端未配置微信登录时返回 code 501（silentCodes 特判不弹错误），由调用方
 * 静默降级为学号密码表单登录；其余失败同样抛给调用方处理。
 */
async function wxLogin(code) {
  if (!code) throw { code: 'NO_CODE', message: '缺少 wx.login code' }
  const result = await rawRequest({
    url: '/auth/wx-login',
    method: 'POST',
    data: { code },
    loading: false,
    silentCodes: [501]
  })
  return saveSession(result)
}

async function logout() {
  try { await rawRequest({ url: '/auth/logout', method: 'POST', data: {}, loading: false }) } catch (e) { /* 幂等 */ }
  clearSession()
}

function isLoggedIn() {
  const app = getApp()
  return !!app.globalData.token
}

function requireLogin(action) {
  if (isLoggedIn()) return true
  wx.showModal({
    title: '需要登录',
    content: action ? `${action}需要先登录微信账号` : '请先登录微信账号',
    confirmText: '去登录',
    success: res => {
      if (res.confirm) wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
    }
  })
  return false
}

module.exports = {
  STUDENT_ID_RE,
  saveSession,
  clearSession,
  login,
  register,
  wxLogin,
  logout,
  isLoggedIn,
  requireLogin
}
