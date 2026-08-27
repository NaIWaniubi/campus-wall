/**
 * API facade：旧页面 require('./utils/api') 入口保持不变。
 * 实际实现拆为 4 个职责文件，由本 facade 透传。
 *
 *   - request.js       底层 wx.request + 401 拦截 + 静默码
 *   - legacy-adapter.js 旧路径/字段 -> 新后端契约的翻译层
 *   - endpoints.js     按域分组的业务端点 + http 别名（get/post/put/del/upload）
 *   - auth.js          登录/注册/微信静默登录/会话读写
 */
const endpoints = require('./endpoints')
const auth = require('./auth')
const { absUrl } = require('./request')

module.exports = Object.assign({}, endpoints, auth, { absUrl })
