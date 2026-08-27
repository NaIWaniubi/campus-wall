const app = getApp()
const { timeAgo } = require('../../utils/util')
const { getCategoryById } = require('../../utils/category')
const { get, post, followStatus } = require('../../utils/api')
const { showToast, showModal } = require('../../utils/util')
const { optimisticToggle } = require('../../utils/optimistic')

Page({
  data: {
    postId: '',
    post: {},
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
    canFollowAuthor: false
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

  async loadPost() {
    try {
      const post = await get('/posts/' + this.data.postId, {}, false)
      const category = getCategoryById(post.category)
      const me = app.globalData.userInfo
      this.setData({
        post,
        timeAgoText: timeAgo(post.time),
        categoryName: category ? category.name : '',
        categoryColor: category ? category.color : '#4A90D9',
        // 匿名帖/自己 authored 的帖子不展示关注按钮
        canFollowAuthor: !!(post.author && post.author.id && !post.author.isAnonymous && (!me || me.id !== post.author.id))
      })
      this.loadFollowStatus()
      // 「可能相关」仅失物招领板块请求（后端对其他板块返回空，省一次请求）
      if (post.category === 'lost') this.loadMatches()
    } catch (e) {
      showToast('加载失败')
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
