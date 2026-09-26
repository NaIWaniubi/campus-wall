const app = getApp()
const { get, post } = require('../../../utils/api')
const { getCategoryById, getSubTypeList } = require('../../../utils/category')
const { buildPostShare } = require('../../../utils/share')
const { optimisticToggle } = require('../../../utils/optimistic')

Page({
  data: {
    posts: [],
    // 方向双 tab：found=失物招领（捡到待认领）/ lost=寻物启事（丢失求助）
    activeTab: 'found',
    emptyText: '暂无失物招领，捡到东西记得来这里发布',
    itemTypeList: ['全部', '校园卡', '钥匙', '手机', '衣物', '证件', '其他'],
    campusList: ['全部', '主校区', '南校区', '北校区', '东校区'],
    timeList: ['全部', '今天', '3天内', '一周内', '一个月内'],
    selectedType: '',
    selectedCampus: '',
    selectedTime: '',
    loadMoreStatus: 'nomore',
    page: 1,
    pageSize: 10,
    hasMore: false,
    loading: true
  },

  onLoad(options) { this.loadPosts(1) },

  async loadPosts(targetPage) {
    const page = targetPage || this.data.page
    // 过期响应令牌：快速切 Tab/筛选时丢弃旧请求结果，避免旧数据覆盖新列表
    const seq = (this.reqSeq = (this.reqSeq || 0) + 1)
    this.setData({ loading: true })
    try {
      // direction 上抛后端 json_extract 过滤（found=捡到 / lost=丢失）
      const params = { category: 'lost', direction: this.data.activeTab, page, pageSize: this.data.pageSize }
      if (this.data.selectedCampus && this.data.selectedCampus !== '全部') params.campus = this.data.selectedCampus
      if (this.data.selectedType && this.data.selectedType !== '全部') {
        const cat = getCategoryById('lost')
        const sub = cat ? cat.subTypes.find(s => s.name === this.data.selectedType) : null
        if (sub) params.subType = sub.id
      }
      if (this.data.selectedTime && this.data.selectedTime !== '全部') params.timeRange = this.data.selectedTime
      // 类型/时间区间筛选上抛后端，在全局数据上执行后再分页
      const result = await get('/posts', params, false)
      if (seq !== this.reqSeq) return
      const posts = result.list || []
      this.setData({
        page,
        posts: page === 1 ? posts : [...this.data.posts, ...posts],
        hasMore: result.hasMore,
        loadMoreStatus: result.hasMore ? 'more' : 'nomore',
        loading: false
      })
    } catch (e) {
      if (seq !== this.reqSeq) return
      // 失败不推进 page：点重试仍请求同一页，避免整页数据被跳过
      this.setData({ loading: false, loadMoreStatus: 'error' })
    }
  },

  // 切换方向 tab：重置分页与筛选后重新拉取
  onSwitchTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (!tab || tab === this.data.activeTab) return
    this.setData({
      activeTab: tab,
      emptyText: tab === 'lost' ? '暂无寻物启事，丢了东西快来发布寻找' : '暂无失物招领，捡到东西记得来这里发布',
      page: 1,
      posts: [],
      loadMoreStatus: 'nomore'
    })
    this.loadPosts(1)
  },

  onTypeFilter(e) {
    const index = e.detail.value
    const type = this.data.itemTypeList[index]
    this.setData({ selectedType: type === '全部' ? '' : type, page: 1, posts: [] })
    this.loadPosts(1)
  },

  onCampusFilter(e) {
    const index = e.detail.value
    const campus = this.data.campusList[index]
    this.setData({ selectedCampus: campus === '全部' ? '' : campus, page: 1, posts: [] })
    this.loadPosts(1)
  },

  onTimeFilter(e) {
    const index = e.detail.value
    const time = this.data.timeList[index]
    this.setData({ selectedTime: time === '全部' ? '' : time, page: 1, posts: [] })
    this.loadPosts(1)
  },

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

  onGoPublish() {
    app.requireLogin(() => { wx.setStorageSync('publishCategory', 'lost'); wx.switchTab({ url: '/pages/publish/publish' }) })
  },

  onShareAppMessage(e) {
    const id = e && e.target && e.target.dataset ? e.target.dataset.id : ''
    const post = this.data.posts.find(item => item.id === id)
    return buildPostShare(post, id)
  }
})
