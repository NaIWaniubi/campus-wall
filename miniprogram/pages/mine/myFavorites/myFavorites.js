const app = getApp()
const { get, post } = require('../../../utils/api')
const { buildPostShare } = require('../../../utils/share')

Page({
  data: { posts: [], loading: true },
  async onLoad() {
    try {
      const posts = await get('/user/favorites', {}, false)
      this.setData({ posts })
    } catch (e) {
      this.setData({ posts: [] })
    } finally {
      this.setData({ loading: false })
    }
  },
  onTapPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.post.id}` }) },
  async onLikePost(e) {
    if (!app.requireLogin(null, '点赞')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/like`, {}, false)
    this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) })
  },
  onCommentPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}&focus=true` }) },
  async onFavoritePost(e) {
    if (!app.requireLogin(null, '收藏')) return
    const id = e.detail.id
    const updated = await post(`/posts/${id}/favorite`, {}, false)
    this.setData({ posts: updated.isFavorited ? this.data.posts.map(item => item.id === id ? { ...item, ...updated } : item) : this.data.posts.filter(item => item.id !== id) })
  },

  onShareAppMessage(e) {
    const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''
    const post = this.data.posts.find(item => item.id === id)
    return buildPostShare(post, id)
  }
})
