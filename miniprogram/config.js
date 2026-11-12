/**
 * 小程序环境配置：按微信环境（开发/体验/正式）切换后端地址。
 *
 * 部署前必改：把 trial / release 的域名换成你自己的 HTTPS 后端域名，
 * 并在「微信公众平台 → 开发管理 → 服务器域名」里把该域名加入 request 合法域名。
 *
 * 为什么不在 utils/request.js 里写死 localhost：
 * 真机上 localhost 指向手机自身，所有请求必然失败；而开发者工具里又需要 localhost。
 * 用 envVersion 区分是最稳妥的做法（wx.getAccountInfoSync 在开发者工具/真机都可用）。
 */
const ENV_VERSION = (() => {
  try {
    const info = wx.getAccountInfoSync()
    return (info && info.miniProgram && info.miniProgram.envVersion) || 'develop'
  } catch (e) {
    return 'develop'
  }
})()

/** 各环境的后端地址（正式上线前必须替换 trial/release 的占位域名） */
const API_BASE_URLS = {
  develop: 'http://localhost:3001/api',
  trial: 'https://api.example.com/api',
  release: 'https://api.example.com/api'
}

/** 占位域名是否仍未替换（供启动时告警，避免带着 example.com 提审） */
function isPlaceholderDomain() {
  const url = API_BASE_URLS[ENV_VERSION] || ''
  return url.indexOf('example.com') >= 0
}

module.exports = {
  ENV_VERSION,
  API_BASE_URL: API_BASE_URLS[ENV_VERSION] || API_BASE_URLS.develop,
  API_BASE_URLS,
  isPlaceholderDomain
}
