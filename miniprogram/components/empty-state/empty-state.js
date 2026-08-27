const PRESET_TYPES = {
  data: { icon: '📭', text: '暂无内容' },
  network: { icon: '📡', text: '网络似乎出了问题' },
  search: { icon: '🔍', text: '未找到相关内容' },
  message: { icon: '🔔', text: '暂无消息' },
  error: { icon: '⚠️', text: '出了点问题' },
  cart: { icon: '🛒', text: '购物车是空的' },
  favorite: { icon: '⭐', text: '还没有收藏内容' },
  like: { icon: '👍', text: '还没有点赞内容' }
}

Component({
  options: {
    multipleSlots: true
  },

  properties: {
    text: {
      type: String,
      value: ''
    },
    subText: {
      type: String,
      value: ''
    },
    type: {
      type: String,
      value: ''
    },
    customIcon: {
      type: String,
      value: ''
    },
    image: {
      type: String,
      value: ''
    },
    btnText: {
      type: String,
      value: ''
    },
    actionText: {
      type: String,
      value: ''
    },
    size: {
      type: String,
      value: 'default'
    },
    show: {
      type: Boolean,
      value: true
    },
    animated: {
      type: Boolean,
      value: true
    }
  },

  observers: {
    'type, text, customIcon': function (type, text, customIcon) {
      let displayIcon = customIcon
      let displayText = text

      if (type && PRESET_TYPES[type]) {
        if (!customIcon) {
          displayIcon = PRESET_TYPES[type].icon
        }
        if (!text) {
          displayText = PRESET_TYPES[type].text
        }
      }

      this.setData({
        displayIcon,
        displayText: displayText || '暂无内容'
      })
    }
  },

  data: {
    displayIcon: '',
    displayText: '暂无内容'
  },

  methods: {
    onTapBtn() {
      this.triggerEvent('btntap')
    },

    onAction() {
      this.triggerEvent('action')
    },

    onRetry() {
      this.triggerEvent('retry')
    }
  }
})
