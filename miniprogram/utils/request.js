/**
 * 底层请求封装：基于 wx.request / wx.uploadFile
 * - 401 统一清登录态并跳登录页
 * - code === 200 才 resolve，401 触发 handleUnauthorized 后 reject
 * - silentCodes：业务码命中时静默 reject，不弹错误
 *
 * 上层 (legacy-adapter.js) 接管路径/字段映射；端点 (endpoints.js) 用 request() 组合业务调用。
 */
const { showToast, showLoading, hideLoading } = require('./util')

const DEFAULT_BASE_URL = 'http://localhost:3001/api'
const DEFAULT_ORIGIN = 'http://localhost:3001'

function getAppSafe() {
  return typeof getApp === 'function' ? getApp() : null
}

function getBaseUrl() {
  const app = getAppSafe()
  return (app && app.globalData && app.globalData.baseUrl) || DEFAULT_BASE_URL
}

function getServerOrigin() {
  const base = getBaseUrl()
  const m = base.match(/^(https?:\/\/[^/]+)/)
  return m ? m[1] : DEFAULT_ORIGIN
}

function getToken() {
  const app = getAppSafe()
  if (app && app.globalData && app.globalData.token) return app.globalData.token
  try { return wx.getStorageSync('token') || '' } catch (e) { return '' }
}

/** 相对地址（/uploads/xx）补全为可显示的绝对地址 */
function absUrl(u) {
  if (!u || typeof u !== 'string') return u
  return /^https?:\/\//.test(u) ? u : getServerOrigin() + u
}

/** ISO 时间 -> 毫秒时间戳（旧页面 timeAgo()/24h 可编辑判断均消费 ms 数值） */
function toMs(v) {
  if (v == null || typeof v === 'number') return v
  const t = new Date(v).getTime()
  return isNaN(t) ? v : t
}

/** 401 统一处理：清登录态并跳登录页 */
function handleUnauthorized() {
  showToast('登录已过期，请重新登录')
  const app = getAppSafe()
  if (app && app.globalData) {
    app.globalData.token = ''
    app.globalData.userInfo = null
  }
  try {
    wx.removeStorageSync('token')
    wx.removeStorageSync('userInfo')
  } catch (e) { /* storage 异常忽略 */ }
  setTimeout(() => {
    wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
  }, 1200)
}

const warnedUnsupported = {}

function warnUnsupported(tag) {
  if (warnedUnsupported[tag]) return
  warnedUnsupported[tag] = true
  console.warn('[api] 新后端暂未支持该接口，已降级:', tag)
}

const rawRequest = (options) => {
  const { method = 'GET', header = {}, loading = true, silentCodes = [] } = options

  if (loading) showLoading()

  return new Promise((resolve, reject) => {
    wx.request({
      url: getBaseUrl() + options.url,
      method: method,
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (getToken() || ''),
        ...header
      },
      success: (res) => {
        if (loading) hideLoading()
        const body = res.data || {}
        if (typeof body.code === 'number') {
          if (body.code === 200) {
            resolve(body.data)
          } else if (body.code === 401) {
            handleUnauthorized()
            reject(body)
          } else if (silentCodes.indexOf(body.code) >= 0) {
            // 指定业务码不弹错误（如 501 微信登录未配置），由调用方静默降级
            reject(body)
          } else {
            showToast(body.message || body.msg || '请求失败')
            reject(body)
          }
        } else if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body.data !== undefined ? body.data : body)
        } else {
          showToast('网络请求失败')
          reject(res)
        }
      },
      fail: (err) => {
        if (loading) hideLoading()
        showToast('网络连接失败')
        reject(err)
      }
    })
  })
}

module.exports = {
  rawRequest,
  absUrl,
  toMs,
  handleUnauthorized,
  warnUnsupported,
  getBaseUrl,
  getServerOrigin,
  getToken,
  getAppSafe,
}
