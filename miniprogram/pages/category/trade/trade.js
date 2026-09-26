const app = getApp()
const { get, post } = require('../../../utils/api')
const { getCategoryById } = require('../../../utils/category')
const { buildPostShare } = require('../../../utils/share')
const { optimisticToggle } = require('../../../utils/optimistic')

Page({
  data: {
    posts: [],
    typeList: ['全部', '课本教材', '电子数码', '美妆护肤', '生活用品', '运动器材', '其他'],
    priceList: ['全部', '0-50', '50-100', '100-500', '500以上'],
    sortList: ['最新发布', '价格最低', '价格最高'],
    selectedType: '', selectedPrice: '', selectedSort: '',
    loadMoreStatus: 'nomore', page: 1, pageSize: 10, hasMore: false, loading: true
  },

  onLoad() { this.loadPosts(1) },

  async loadPosts(targetPage) {
    const page = targetPage || this.data.page
    // 过期响应令牌：快速切 Tab/筛选时丢弃旧请求结果，避免旧数据覆盖新列表
    const seq = (this.reqSeq = (this.reqSeq || 0) + 1)
    this.setData({ loading: true })
    try {
      const params = { category: 'trade', page, pageSize: this.data.pageSize }
      if (this.data.selectedCampus) params.campus = this.data.selectedCampus
      if (this.data.selectedType && this.data.selectedType !== '全部') {
        const cat = getCategoryById('trade')
        const sub = cat ? cat.subTypes.find(s => s.name === this.data.selectedType) : null
        if (sub) params.subType = sub.id
      }
      if (this.data.selectedPrice && this.data.selectedPrice !== '全部') params.priceRange = this.data.selectedPrice
      if (this.data.selectedSort === '最新发布') params.sort = 'new'
      if (this.data.selectedSort === '价格最低') params.sort = 'price_asc'
      if (this.data.selectedSort === '价格最高') params.sort = 'price_desc'
      // 排序/筛选全部上抛后端，在全局数据上执行后再分页（避免对已分页子集错误排序）
      const result = await get('/posts', params, false)
      if (seq !== this.reqSeq) return
      const posts = result.list || []
      this.setData({
        page,
        posts: page === 1 ? posts : [...this.data.posts, ...posts],
        hasMore: result.hasMore, loadMoreStatus: result.hasMore ? 'more' : 'nomore',
        loading: false
      })
    } catch (e) {
      if (seq !== this.reqSeq) return
      // 失败不推进 page：点重试仍请求同一页，避免整页数据被跳过
      this.setData({ loading: false, loadMoreStatus: 'error' })
    }
  },

  onTypeFilter(e) { this.setData({ selectedType: this.data.typeList[e.detail.value] === '全部' ? '' : this.data.typeList[e.detail.value], page: 1, posts: [] }); this.loadPosts(1) },
  onPriceFilter(e) { this.setData({ selectedPrice: this.data.priceList[e.detail.value] === '全部' ? '' : this.data.priceList[e.detail.value], page: 1, posts: [] }); this.loadPosts(1) },
  onSortFilter(e) { this.setData({ selectedSort: this.data.sortList[e.detail.value], page: 1, posts: [] }); this.loadPosts(1) },
  onTapPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.post.id}` }) },
  async onLikePost(e) {
    if (!app.requireLogin(null, '点赞')) return
    const id = e.detail.id
    const idx = this.data.posts.findIndex(item => item.id === id)
    if (idx < 0) return
    const postItem = this.data.posts[idx]
    await optimisticToggle({
      applyLocal: () => {
        const prev = { isLiked: postItem.isLiked, likes: postItem.likes }
        const next = { ...postItem, isLiked: !postItem.isLiked, likes: postItem.likes + (postItem.isLiked ? -1 : 1) }
        this.setData({ posts: this.data.posts.map(item => item.id === id ? next : item) })
        return () => { this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...prev } : item) }) }
      },
      doRemote: () => post(`/posts/${id}/like`, {}, false)
    })
  },
  onCommentPost(e) { wx.navigateTo({ url: `/pages/detail/detail?id=${e.detail.id}&focus=true` }) },
  async onFavoritePost(e) {
    if (!app.requireLogin(null, '收藏')) return
    const id = e.detail.id
    const idx = this.data.posts.findIndex(item => item.id === id)
    if (idx < 0) return
    const postItem = this.data.posts[idx]
    await optimisticToggle({
      applyLocal: () => {
        const prev = { isFavorited: postItem.isFavorited, favorites: postItem.favorites }
        const next = { ...postItem, isFavorited: !postItem.isFavorited, favorites: postItem.favorites + (postItem.isFavorited ? -1 : 1) }
        this.setData({ posts: this.data.posts.map(item => item.id === id ? next : item) })
        return () => { this.setData({ posts: this.data.posts.map(item => item.id === id ? { ...item, ...prev } : item) }) }
      },
      doRemote: () => post(`/posts/${id}/favorite`, {}, false)
    })
  },
  onLoadMore() {
    if (!this.data.hasMore || this.data.loading) return
    this.setData({ loadMoreStatus: 'loading' })
    this.loadPosts(this.data.page + 1)
  },
  onGoPublish() { app.requireLogin(() => { wx.setStorageSync('publishCategory', 'trade'); wx.switchTab({ url: '/pages/publish/publish' }) }) },
  onShareAppMessage(e) { const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''; const post = this.data.posts.find(item => item.id === id); return buildPostShare(post, id) }
})
