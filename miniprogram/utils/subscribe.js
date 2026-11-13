/**
 * 订阅消息授权助手（V5）：system 模板（评论/匹配/系统通知离线触达）
 * - 服务端 /wx/push-config 未配置模板 → 静默不调（与 chat.js 的 chat 模板同口径）
 * - 每会话只请求一次；必须在用户 tap 调用链内发起（微信硬要求，异步回调里调会 fail）
 * - 拒绝/失败不影响主流程
 */
const { get } = require('./api')

let cached = null // push-config 结果（进程级缓存，避免每次 tap 都打接口）
let asked = false // 本会话是否已请求过

function ensureSystemSubscribe() {
  if (asked || !wx.requestSubscribeMessage) return
  const fire = (cfg) => {
    const id = cfg && cfg.systemTemplateId
    if (!id) return
    asked = true
    wx.requestSubscribeMessage({ tmplIds: [id], fail: () => {} })
  }
  if (cached) return fire(cached)
  get('/wx/push-config', {}, false)
    .then((cfg) => {
      cached = cfg
      fire(cfg)
    })
    .catch(() => {})
}

module.exports = { ensureSystemSubscribe }
