const app = getApp()
const { timeAgo } = require('../../utils/util')
const { getCategoryById } = require('../../utils/category')
const { get, post, followStatus, trades, radar } = require('../../utils/api')
const { showToast, showModal } = require('../../utils/util')
const { optimisticToggle } = require('../../utils/optimistic')

Page({
  data: {
    postId: '',
    post: {},
    postLoadFailed: false,
    comments: [],
    commentText: '',
    replyPlaceholder: '写评论...',
    replyTarget: null,
    replyType: 'post',
    inputFocus: false,
    timeAgoText: '',
    categoryName: '',
    categoryColor: '#4A90D9',
    scrollIntoView: '',
    matches: [],
    radarMatches: [],
    radarLabel: '信息',
    isTradePost: false,
    offersState: { isSeller: false, hasAccepted: false, myOffer: null, offers: [] },
    showOfferModal: false,
    offerPriceInput: '',
    offerMessageInput: '',
    offerBusy: false,
    canFollowAuthor: false,
    canContactAuthor: false
  },

  onLoad(options) {
    const id = options.id
    const focus = options.focus === 'true'
    this.setData({ postId: id })

    this.loadPost()
    this.loadComments()

    if (focus) {
      setTimeout(() => {
        this.setData({
          inputFocus: true,
          scrollIntoView: 'comment-section'
        })
      }, 500)
    }
  },

  /** 空操作：用于 catchtap 阻断冒泡（微信要求 handler 必须是真实方法，写 "true" 会报错） */
  onNoop() {},

  /** 加载失败后的重试：清掉失败标记重新拉取 */
  onRetryLoad() {
    this.setData({ postLoadFailed: false })
    this.loadPost()
    this.loadComments()
  },

  async loadPost() {
    try {
      const post = await get('/posts/' + this.data.postId, {}, false)
      const category = getCategoryById(post.category)
      const me = app.globalData.userInfo
      const isTrade = post.category === 'trade' || !!(post.extra && post.extra.price)
      const radarLabel = (post.extra && post.extra.direction === 'lost') ? '招领' : '寻物'

      this.setData({
        post,
        timeAgoText: timeAgo(post.time),
        categoryName: category ? category.name : '',
        categoryColor: category ? category.color : '#4A90D9',
        isTradePost: isTrade,
        radarLabel,
        // 匿名帖/自己 authored 的帖子不展示关注按钮
        canFollowAuthor: !!(post.author && post.author.id && !post.author.isAnonymous && (!me || me.id !== post.author.id)),
        // 私信作者入口：同口径（非匿名、有 id、非自己）——底部死文案「即将上线」下线
        canContactAuthor: !!(post.author && post.author.id && !post.author.isAnonymous && (!me || me.id !== post.author.id))
      })
      this.loadFollowStatus()
      // 「可能相关」仅失物招领板块请求（后端对其他板块返回空，省一次请求）
      if (post.category === 'lost') {
        this.loadMatches()
        this.loadRadar()
      }
      if (isTrade) {
        this.loadOffers()
      }
    } catch (e) {
      this.setData({ postLoadFailed: true })
      showToast('加载失败')
    }
  },

  /** 智能雷达：失物招领 FTS5 反向高精度召回 */
  async loadRadar() {
    try {
      const res = await radar.matches(this.data.postId)
      const all = (res && Array.isArray(res.matches)) ? res.matches : []
      // 去重：关键词匹配（matches）与雷达会命中同一批帖子，同一张卡不应出现两次
      const shown = new Set((this.data.matches || []).map((m) => m.id))
      this.setData({ radarMatches: all.filter((m) => !shown.has(m.postId)) })
    } catch (e) {
      console.error('加载智能雷达失败', e)
    }
  },

  onTapRadarMatch(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  /** 意向出价列表拉取 */
  async loadOffers() {
    if (!this.data.isTradePost || !app.checkLogin()) return
    try {
      const res = await trades.offers(this.data.postId)
      this.setData({
        offersState: res || { isSeller: false, hasAccepted: false, myOffer: null, offers: [] }
      })
    } catch (e) {
      console.error('加载出价列表失败', e)
    }
  },

  onOpenOfferModal() {
    if (!app.requireLogin(null, '发起出价')) return
    if (this.data.post.extra && this.data.post.extra.soldAt) {
      showToast('该物品已售出')
      return
    }
    this.setData({
      showOfferModal: true,
      offerPriceInput: '',
      offerMessageInput: ''
    })
  },

  onCloseOfferModal() {
    this.setData({ showOfferModal: false })
  },

  onOfferPriceInput(e) {
    this.setData({ offerPriceInput: e.detail.value })
  },

  onOfferMessageInput(e) {
    this.setData({ offerMessageInput: e.detail.value })
  },

  async onSubmitOffer() {
    const price = parseFloat(this.data.offerPriceInput)
    if (!price || isNaN(price) || price <= 0) {
      showToast('请输入有效金额')
      return
    }
    if (price > 1000000) {
      showToast('出价金额超出上限')
      return
    }

    this.setData({ offerBusy: true })
    try {
      await trades.createOffer(this.data.postId, {
        offerPrice: price,
        message: (this.data.offerMessageInput || '').trim()
      })
      showToast('出价成功')
      this.setData({ showOfferModal: false, offerPriceInput: '', offerMessageInput: '' })
      await this.loadOffers()
    } catch (err) {
      showToast((err && err.message) || '出价提交失败')
    } finally {
      this.setData({ offerBusy: false })
    }
  },

  async onActOffer(e) {
    const { id, action } = e.currentTarget.dataset
    if (!id || !action || this.data.offerBusy) return

    let confirmMsg = '确定执行此操作吗？'
    if (action === 'accept') confirmMsg = '接受出价后将锁定交易并自动拒绝其他出价，确定接受吗？'
    else if (action === 'reject') confirmMsg = '确定要拒绝该出价吗？'
    else if (action === 'cancel') confirmMsg = '确定要取消您的出价吗？'

    const ok = await showModal('确认提示', confirmMsg)
    if (!ok) return

    this.setData({ offerBusy: true })
    try {
      if (action === 'accept') {
        await trades.acceptOffer(id)
        showToast('已接受出价，交易锁定')
      } else if (action === 'reject') {
        await trades.rejectOffer(id)
        showToast('已拒绝该出价')
      } else if (action === 'cancel') {
        await trades.cancelOffer(id)
        showToast('已取消出价')
      }
      await this.loadOffers()
    } catch (err) {
      showToast((err && err.message) || '操作失败')
    } finally {
      this.setData({ offerBusy: false })
    }
  },

  /** 进入详情时拉取与作者的关注状态（仅登录态请求，避免游客触发 401 跳登录） */
  async loadFollowStatus() {
    if (!this.data.canFollowAuthor || !app.checkLogin()) return
    try {
      const st = await followStatus(this.data.post.author.id)
      this.setData({ 'post.author.isFollowing': !!(st && st.following) })
    } catch (e) {
      console.error('查询关注状态失败', e)
    }
  },

  async loadMatches() {
    try {
      const matches = await get('/posts/' + this.data.postId + '/matches', {}, false)
      this.setData({ matches: Array.isArray(matches) ? matches : [] })
    } catch (e) {
      console.error('加载可能相关帖子失败', e)
    }
  },

  onTapMatch(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id })
  },

  async loadComments() {
    try {
      const comments = await get('/posts/' + this.data.postId + '/comments', {}, false)
      this.setData({ comments })
    } catch (e) {
      console.error('加载评论失败', e)
    }
  },

  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.post.images[index],
      urls: this.data.post.images
    })
  },

  async onToggleLike() {
    if (!app.checkLogin()) {
      showToast('请先登录')
      return
    }
    const prev = { isLiked: this.data.post.isLiked, likes: this.data.post.likes }
    await optimisticToggle({
      applyLocal: () => {
        const post = { ...this.data.post, isLiked: !this.data.post.isLiked, likes: this.data.post.likes + (this.data.post.isLiked ? -1 : 1) }
        this.setData({ post })
        return () => this.setData({ post: { ...this.data.post, ...prev } })
      },
      doRemote: () => post('/posts/' + this.data.postId + '/like', {}, false),
      onError: () => '点赞失败，请重试'
    })
  },

  async onToggleFavorite() {
    if (!app.checkLogin()) {
      showToast('请先登录')
      return
    }
    const prev = { isFavorited: this.data.post.isFavorited, favorites: this.data.post.favorites }
    await optimisticToggle({
      applyLocal: () => {
        const post = { ...this.data.post, isFavorited: !this.data.post.isFavorited, favorites: this.data.post.favorites + (this.data.post.isFavorited ? -1 : 1) }
        this.setData({ post })
        return () => this.setData({ post: { ...this.data.post, ...prev } })
      },
      doRemote: () => post('/posts/' + this.data.postId + '/favorite', {}, false),
      onError: () => '收藏失败，请重试'
    })
  },

  async onFollowAuthor() {
    if (!app.requireLogin(null, '关注')) return
    const author = this.data.post.author
    if (!author || author.isAnonymous) return
    const prevFollowing = author.isFollowing
    await optimisticToggle({
      applyLocal: () => {
        this.setData({ post: { ...this.data.post, author: { ...author, isFollowing: !author.isFollowing } } })
        return () => this.setData({ post: { ...this.data.post, author: { ...author, isFollowing: prevFollowing } } })
      },
      doRemote: () => post(`/users/${author.id}/follow`, {}, false),
      onError: () => '关注失败，请重试'
    })
    showToast(this.data.post.author.isFollowing ? '已关注' : '已取消关注')
  },

  onContactAuthor() {
    if (!app.requireLogin(null, '私信作者')) return
    const post = this.data.post
    if (!post || !post.author || !post.author.id) return
    // 匿名帖不能私信真实作者
    if (post.author.isAnonymous) {
      showToast('匿名用户无法私信')
      return
    }
    wx.navigateTo({
      url: `/pages/message/chat/chat?receiverId=${post.author.id}&postId=${post.id}`
    })
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  onInputBlur() {
    if (!this.data.commentText) {
      this.setData({
        replyPlaceholder: '写评论...',
        replyTarget: null,
        replyType: 'post'
      })
    }
  },

  async onSendComment() {
    const text = this.data.commentText.trim()
    if (!text) {
      showToast('请输入评论内容')
      return
    }
    if (!app.checkLogin()) {
      showToast('请先登录')
      return
    }

    try {
      const data = { content: text }
      if (this.data.replyType === 'reply' && this.data.replyTarget) {
        data.replyToId = this.data.replyTarget.commentId
        data.replyToName = this.data.replyTarget.authorName
      } else if (this.data.replyType === 'comment' && this.data.replyTarget) {
        data.replyToId = this.data.replyTarget.id
        data.replyToName = this.data.replyTarget.author.nickname
      }

      await post('/posts/' + this.data.postId + '/comments', data)
      showToast('评论成功')
      this.loadComments()

      const post = { ...this.data.post }
      post.comments = post.comments + 1
      this.setData({
        commentText: '',
        post,
        replyPlaceholder: '写评论...',
        replyTarget: null,
        replyType: 'post'
      })
    } catch (e) {
      showToast('评论失败')
    }
  },

  onReplyComment(e) {
    const comment = e.detail.comment
    this.setData({
      replyPlaceholder: `回复 ${comment.author.nickname}...`,
      replyTarget: comment,
      replyType: 'comment',
      inputFocus: true
    })
  },

  onReplyReply(e) {
    const { comment, reply } = e.detail
    this.setData({
      replyPlaceholder: `回复 ${reply.author.nickname}...`,
      replyTarget: {
        commentId: comment.id,
        authorId: reply.author.id,
        authorName: reply.author.nickname
      },
      replyType: 'reply',
      inputFocus: true
    })
  },

  async onLikeComment(e) {
    const id = e.detail.id
    if (!app.checkLogin()) return
    try {
      await post('/comments/' + id + '/like', {}, false)
      this.loadComments()
    } catch (e) {
      console.error('点赞失败', e)
    }
  },

  async onLikeReply(e) {
    const { replyId } = e.detail
    if (!app.checkLogin()) return
    try {
      await post('/comments/' + replyId + '/like', {}, false)
      this.loadComments()
    } catch (e) {
      console.error('点赞失败', e)
    }
  },

  async onReport() {
    const confirmed = await showModal('举报', '确定要举报这条内容吗？')
    if (!confirmed) return

    wx.showActionSheet({
      itemList: ['违规内容', '诈骗信息', '色情低俗', '恶意骚扰', '其他'],
      success: async (res) => {
        const reasons = ['违规内容', '诈骗信息', '色情低俗', '恶意骚扰', '其他']
        try {
          await post('/report', {
            targetType: 'post',
            targetId: this.data.postId,
            reason: reasons[res.tapIndex]
          })
          showToast('举报已提交')
        } catch (e) {
          showToast('举报失败')
        }
      }
    })
  },

  onShareAppMessage() {
    const post = this.data.post
    return {
      title: post.title || post.content.substring(0, 30),
      path: `/pages/detail/detail?id=${post.id}`,
      imageUrl: post.images && post.images.length > 0 ? post.images[0] : ''
    }
  }
})
