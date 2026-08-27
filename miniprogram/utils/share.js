function buildPostShare(post, fallbackId = '') {
  const safePost = post || {}
  const id = safePost.id || fallbackId
  const content = safePost.title || safePost.content || '校园墙'
  const title = content.length > 30 ? `${content.slice(0, 30)}...` : content
  const images = Array.isArray(safePost.images) ? safePost.images : []

  return {
    title,
    path: id ? `/pages/detail/detail?id=${id}` : '/pages/index/index',
    imageUrl: images.length > 0 ? images[0] : ''
  }
}

module.exports = {
  buildPostShare
}
