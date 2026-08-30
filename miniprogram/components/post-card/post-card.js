const { timeAgo } = require('../../utils/util')
const { getCategoryById } = require('../../utils/category')

Component({
  properties: {
    post: {
      type: Object,
      value: {}
    },
    currentUserId: {
      type: String,
      value: ''
    }
  },

  observers: {
    'post': function (post) {
      if (!post) return
      const next = {}
      if (post.time) {
        next.timeAgoText = timeAgo(post.time)
      }
      if (post.category) {
        const category = getCategoryById(post.category)
        if (category) {
          next.categoryName = category.name
          next.categoryColor = category.color
        }
      }
      // 信誉徽章：author.creditScore 四档配色；匿名/无分不显示（后端匿名帖 creditScore=null）
      const score = Number(post.author && post.author.creditScore)
      if (!post.author || post.author.isAnonymous == null || !post.author.isAnonymous) {
        if (post.author && post.author.creditScore != null && !isNaN(score)) {
          next.creditTier = score >= 90 ? 'gold' : score >= 80 ? 'blue' : score >= 60 ? 'orange' : 'gray'
          next.showCredit = true
        } else {
          next.showCredit = false
        }
      } else {
        next.showCredit = false
      }
      // 九宫格展示缩略图，预览仍用原图；缩略图缺失或数量不齐时回退原图
      const images = post.images || []
      const thumbs = post.thumbImages || []
      next.gridImages = thumbs.length > 0 && thumbs.length === images.length ? thumbs : images
      // 小红书式封面：有任何图就取首图做 cover（多图时其余进九宫格）
      next.hasCover = next.gridImages.length > 0
      next.coverImage = next.gridImages[0] || ''
      // 二手帖价格角标：已标记交易完成则显示「已售」
      next.showPriceBadge = post.category === 'trade' && !!(post.extra && post.extra.price)
      next.isSold = !!(post.extra && post.extra.soldAt)
      this.setData(next)
    }
  },

  data: {
    timeAgoText: '',
    categoryName: '',
    categoryColor: '#4A90D9',
    showCredit: false,
    creditTier: 'gray',
    gridImages: [],
    hasCover: false,
    coverImage: '',
    showPriceBadge: false,
    isSold: false,
    perfLow: false
  },

  lifetimes: {
    attached() {
      // 低端机降级：app.js 启动时探测，本组件关闭 transform/shadow 动画
      this.setData({ perfLow: !!(getApp().globalData && getApp().globalData.perfLow) })
    }
  },

  methods: {
    onTapCard() {
      const post = this.properties.post
      this.triggerEvent('tap', { post })
    },

    onLike(e) {
      e.stopPropagation()
      const id = e.currentTarget.dataset.id
      this.triggerEvent('like', { id })
    },

    onComment(e) {
      e.stopPropagation()
      const id = e.currentTarget.dataset.id
      this.triggerEvent('comment', { id })
    },

    onFavorite(e) {
      e.stopPropagation()
      const id = e.currentTarget.dataset.id
      this.triggerEvent('favorite', { id })
    },

    onFollow(e) {
      e.stopPropagation()
      const userId = e.currentTarget.dataset.id
      this.triggerEvent('follow', { userId })
    },

    onShare(e) {
      e.stopPropagation()
      const id = e.currentTarget.dataset.id
      this.triggerEvent('share', { id })
    },

    onPreviewImage(e) {
      e.stopPropagation()
      const index = e.currentTarget.dataset.index
      const images = this.properties.post.images || []
      wx.previewImage({
        current: images[index],
        urls: images
      })
    },

    /** 缩略图加载失败回退原图（老图无 .thumb.webp） */
    onErrorImage(e) {
      const index = e.currentTarget.dataset.index
      const images = this.properties.post.images || []
      if (!images[index]) return
      const gridImages = this.data.gridImages.slice()
      if (gridImages[index] === images[index]) return
      gridImages[index] = images[index]
      this.setData({ gridImages })
    }
  }
})
