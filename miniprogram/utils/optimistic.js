// 统一乐观更新 + 失败回滚工具
// 适用：点赞 / 收藏 / 关注等可本地先改 UI、后端失败再回滚的异步操作。
const { showToast } = require('./util')

// optimisticToggle
// @param {Object} opts
//   applyLocal(): 返回「回滚函数」或「旧状态快照」——在调用前同步修改本地 data（乐观更新），
//                 并返回能在失败时恢复原状的函数。
//                 推荐返回回滚函数：() => void
//   doRemote():   返回 Promise，远程请求；失败则回滚并提示。
//   onError(msg): 可选，自定义失败提示。
function optimisticToggle({ applyLocal, doRemote, onError } = {}) {
  if (typeof applyLocal !== 'function' || typeof doRemote !== 'function') {
    return Promise.reject(new Error('optimisticToggle 需要 applyLocal 与 doRemote'))
  }
  let rollback = null
  try {
    rollback = applyLocal()
  } catch (e) {
    // 本地更新失败，直接走远端
  }
  return doRemote().catch(err => {
    if (typeof rollback === 'function') {
      try { rollback() } catch (e) { /* 回滚失败不影响提示 */ }
    }
    const msg = (onError && onError(err)) || err && err.msg || '操作失败，请重试'
    showToast(typeof msg === 'string' ? msg : '操作失败，请重试')
    throw err
  })
}

/**
 * 极简签名（无 opts 对象）：适用于「翻转某个布尔字段 + 调整对应计数」的常见场景。
 * @param {Object} page      Page 实例（须有 setData）
 * @param {string} field     主字段名，如 'liked'
 * @param {number} delta     计数增量（+1 / -1）
 * @param {Function} apiCall 远程调用，返回 Promise；失败时回滚
 * @param {string} [successMsg] 成功提示（可选）
 */
function optimisticToggleSimple(page, field, delta, apiCall, successMsg) {
  const countField = field + 'Count'
  const original = page.data[field]
  const originalCount = page.data[countField] || 0
  page.setData({
    [field]: !original,
    [countField]: Math.max(0, originalCount + delta),
  })
  return apiCall().then(res => {
    if (typeof successMsg === 'string' && successMsg) showToast(successMsg, 'success')
    return res
  }).catch(err => {
    page.setData({ [field]: original, [countField]: originalCount })
    showToast((err && err.msg) || '操作失败', 'none')
    throw err
  })
}

module.exports = { optimisticToggle, optimisticToggleSimple }
