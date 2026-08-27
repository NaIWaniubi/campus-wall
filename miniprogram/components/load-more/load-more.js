Component({
  properties: {
    status: {
      type: String,
      value: 'more'
    }
  },

  methods: {
    onTapLoadMore() {
      if (this.properties.status === 'loading') return
      this.triggerEvent('loadmore')
    }
  }
})
