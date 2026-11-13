/**
 * 分享卡片统一出口（V5）：
 * - 有图帖：首图绝对化（微信 imageUrl 不收相对路径）
 * - 无图帖：服务端 V4 纸感分享卡 /api/posts/:id/share-card.png（不再让微信截页面当封面）
 */
const { absUrl, getServerOrigin } = require('./request')

function buildPostShare(post, fallbackId = '') {
  const safePost = post || {}
  const id = safePost.id || fallbackId
  const content = safePost.title || safePost.content || '校园墙'
  const title = content.length > 30 ? `${content.slice(0, 30)}...` : content
  const images = Array.isArray(safePost.images) ? safePost.images : []

  return {
    title,
    path: id ? `/pages/detail/detail?id=${id}` : '/pages/index/index',
    imageUrl: images.length > 0 ? absUrl(images[0]) : (id ? `${getServerOrigin()}/api/posts/${id}/share-card.png` : '')
  }
}

module.exports = {
  buildPostShare
}
