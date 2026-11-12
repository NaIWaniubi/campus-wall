/**
 * 底层请求封装：基于 wx.request / wx.uploadFile
 * - 401 统一清登录态并跳登录页（保存当前路由用于登录后回跳）
 * - code === 200 才 resolve，401 触发 handleUnauthorized 后 reject
 * - silentCodes：业务码命中时静默 reject，不弹错误
 *
 * 上层 (legacy-adapter.js) 接管路径/字段映射；端点 (endpoints.js) 用 request() 组合业务调用。
 */
const { showToast, showLoading, hideLoading } = require('./util')
const { API_BASE_URL: CONFIG_BASE_URL, ENV_VERSION, isPlaceholderDomain } = require('../config')

// 兜底值仅用于配置缺失的极端情况；正常路径由 config.js 按微信环境提供
const DEFAULT_BASE_URL = CONFIG_BASE_URL || 'http://localhost:3001/api'
const DEFAULT_ORIGIN = DEFAULT_BASE_URL.replace(/\/api\/?$/, '')

function getAppSafe() {
  return typeof getApp === 'function' ? getApp() : null
}

function getBaseUrl() {
  const app = getAppSafe()
  // 优先级：运行时覆盖（调试/灰度）> 按环境配置
  const runtime = app && app.globalData && app.globalData.baseUrl
  return runtime || DEFAULT_BASE_URL
}

// 启动自检：体验版/正式版仍指向占位域名时明确告警，避免带着 example.com 提审
function checkBaseUrlConfig() {
  if ((ENV_VERSION === 'trial' || ENV_VERSION === 'release') && isPlaceholderDomain()) {
    console.error('[校园墙] 当前为 ' + ENV_VERSION + ' 环境，但后端域名仍是占位地址 api.example.com，请先修改 miniprogram/config.js')
  }
}
checkBaseUrlConfig()

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

/**
 * 安全获取当前页面路径：getCurrentPages 仅在页面级上下文可用，且必须是同步调用。
 * 包一层 try-catch，非页面上下文（App.onLaunch 等）返回空串，由调用方兜底。
 */
function getCurrentRoute() {
  try {
    if (typeof getCurrentPages !== 'function') return ''
    const pages = getCurrentPages()
    if (!pages || !pages.length) return ''
    const cur = pages[pages.length - 1]
    return cur && cur.route ? '/' + cur.route : ''
  } catch (e) {
    return ''
  }
}

/** 401 统一处理：清登录态、保存原始路由并跳登录页（登录后可回跳） */
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
  // 记录当前页面路径，登录页登录成功后据此回跳
  const currentRoute = getCurrentRoute()
  if (currentRoute && currentRoute !== '/pages/mine/profile/profile') {
    try {
      wx.setStorageSync('auth:redirect', currentRoute)
    } catch (e) { /* storage 异常忽略 */ }
  }
  setTimeout(() => {
    const target = '/pages/mine/profile/profile?needLogin=1'
      + (currentRoute && currentRoute !== '/pages/mine/profile/profile'
        ? '&redirect=' + encodeURIComponent(currentRoute)
        : '')
    // reLaunch 确保无论从哪跳过来，目标页都是栈底
    wx.reLaunch({ url: target })
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
  getCurrentRoute,
}
