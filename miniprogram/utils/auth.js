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

// 账号规则（与服务端 commonSchemas.account 一致）：3-32 位，字母/数字/下划线/点/中划线/@
const ACCOUNT_RE = /^[A-Za-z0-9_.@-]{3,32}$/
// 兼容旧命名：历史代码 import 了 STUDENT_ID_RE
const STUDENT_ID_RE = ACCOUNT_RE

function saveSession(result) {
  const app = getAppSafe()
  const user = normalizeUser(result.user || {})
  if (app && app.globalData) {
    app.globalData.token = result.token
    app.globalData.refreshToken = result.refreshToken || ''
    app.globalData.userInfo = user
  }
  wx.setStorageSync('token', result.token)
  if (result.refreshToken) wx.setStorageSync('refreshToken', result.refreshToken)
  wx.setStorageSync('userInfo', user)
  return result
}

function clearSession() {
  const app = getAppSafe()
  if (app && app.globalData) {
    app.globalData.token = ''
    app.globalData.refreshToken = ''
    app.globalData.userInfo = null
  }
  try {
    wx.removeStorageSync('token')
    wx.removeStorageSync('refreshToken')
    wx.removeStorageSync('userInfo')
  } catch (e) { /* 忽略 */ }
}

/** 账号密码登录：POST /auth/login -> {token, user}（账号可为手机号/拼音/邮箱前缀/原学号） */
async function login(studentId, password) {
  if (!ACCOUNT_RE.test(String(studentId))) {
    const err = { message: '账号 3-32 位，可用字母、数字、下划线、点、中划线或 @' }
    showToast(err.message)
    throw err
  }
  if (!password) {
    const err = { message: '请输入密码' }
    showToast(err.message)
    throw err
  }
  const result = await rawRequest({ url: '/auth/login', method: 'POST', data: { account: studentId, password }, loading: false })
  return saveSession(result)
}

/** 注册：账号 3-32 位 ASCII；密码 ≥6 位且含字母+数字；昵称必填；学院选填 */
async function register(payload) {
  const { studentId, password, nickname, college, grade } = payload || {}
  let invalid = null
  if (!ACCOUNT_RE.test(String(studentId))) {
    invalid = '账号 3-32 位，可用字母、数字、下划线、点、中划线或 @'
  } else if (!password || password.length < 6 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    invalid = '密码至少 6 位，且包含字母和数字'
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
    data: { account: studentId, password, nickname: nickname.trim(), college: college || '', grade: grade || '' },
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
  ACCOUNT_RE,
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
