const app = getApp()
const { post } = require('../../../utils/api')
const { showToast } = require('../../../utils/util')

Page({
  data: {
    content: '',
    contact: '',
    typeList: ['功能建议', 'Bug反馈', '内容投诉', '其他'],
    selectedType: '功能建议',
    isSubmitting: false
  },

  onInputContent(e) {
    this.setData({ content: e.detail.value })
  },

  onInputContact(e) {
    this.setData({ contact: e.detail.value })
  },

  onSelectType(e) {
    this.setData({ selectedType: this.data.typeList[e.detail.value] })
  },

  resetForm() {
    this.setData({
      content: '',
      contact: '',
      imageList: [],
      isSubmitting: false
    })
  },

  /** 提交反馈：POST /feedback {content(≤500), contact(≤100 选填)} */
  async onSubmit() {
    if (this.data.isSubmitting) return
    const content = this.data.content.trim()
    const contact = this.data.contact.trim()
    if (!content) {
      showToast('请输入反馈内容')
      return
    }
    if (content.length > 500) {
      showToast('反馈内容最多500字')
      return
    }
    if (contact.length > 100) {
      showToast('联系方式最多100字')
      return
    }
    if (!app.checkLogin()) {
      showToast('请先登录')
      return
    }

    this.setData({ isSubmitting: true })
    wx.showLoading({ title: '提交中...' })
    try {
      await post('/feedback', { content, contact })
      wx.hideLoading()
      showToast('反馈已提交，感谢您的建议', 'success')
      this.resetForm()
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (e) {
      wx.hideLoading()
      this.setData({ isSubmitting: false })
      if (!e || !e.message) showToast('提交失败，请重试')
    }
  }
})
