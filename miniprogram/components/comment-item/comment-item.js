const { timeAgo } = require('../../utils/util')

Component({
  properties: {
    comment: {
      type: Object,
      value: {}
    }
  },

  observers: {
    'comment': function (comment) {
      if (comment && comment.time) {
        this.setData({
          timeAgoText: timeAgo(comment.time)
        })
      }
      if (comment && comment.replies) {
        const replies = comment.replies.map(r => ({
          ...r,
          timeAgoText: timeAgo(r.time)
        }))
        this.setData({
          'comment.replies': replies
        })
      }
    }
  },

  data: {
    timeAgoText: ''
  },

  methods: {
    onLikeComment() {
      this.triggerEvent('likecomment', { id: this.properties.comment.id })
    },

    onReply() {
      this.triggerEvent('reply', { comment: this.properties.comment })
    },

    onLikeReply(e) {
      const index = e.currentTarget.dataset.index
      const reply = this.properties.comment.replies[index]
      this.triggerEvent('likereply', { commentId: this.properties.comment.id, replyId: reply.id })
    },

    onReplyReply(e) {
      const index = e.currentTarget.dataset.index
      const reply = this.properties.comment.replies[index]
      this.triggerEvent('replyreply', { comment: this.properties.comment, reply })
    }
  }
})
