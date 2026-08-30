/**
 * 草稿箱（Q4 收尾）：云端草稿列表（最近 10 条，跨设备可见）
 * - 点击「继续编辑」→ storage 中转 publishDraftId → switchTab 发布页恢复
 * - 单条删除（确认弹窗）；删除后本地单槽如与该草稿同源不再强校验，下次保存会重新上云
 */
const app = getApp()
const { drafts } = require('../../../utils/api')
const { timeAgo, showModal, showToast } = require('../../../utils/util')
const { SECTION_LIST } = require('../../../utils/constants')

Page({
  data: {
    loading: true,
    isLoggedIn: false,
    list: []
  },

  onShow() {
    this.loadDrafts()
  },

  async loadDrafts() {
    if (!app.checkLogin()) {
      this.setData({ isLoggedIn: false, loading: false, list: [] })
      return
    }
    this.setData({ isLoggedIn: true, loading: true })
    try {
      const draftsList = await drafts.list()
      this.setData({
        list: (draftsList || []).map(d => {
          const section = SECTION_LIST.find(s => s.id === Number(d.sectionId))
          return {
            id: d.id,
            sectionName: (section && section.name) || '未分类',
            title: d.title || '无标题',
            content: d.content || '',
            timeText: d.createdAt ? timeAgo(new Date(d.createdAt).getTime()) : ''
          }
        })
      })
    } catch (e) {
      console.error('加载云草稿失败', e)
      this.setData({ list: [] })
    } finally {
      this.setData({ loading: false })
    }
  },

  /** 继续编辑：publish 是 tabBar 页，经 storage 一次性中转由 publish.onShow 消费 */
  onTapDraft(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    wx.setStorageSync('publishDraftId', id)
    wx.switchTab({ url: '/pages/publish/publish' })
  },

  onDeleteDraft(e) {
    const id = e.currentTarget.dataset.id
    if (!id) return
    showModal('删除草稿', '删除后不可恢复，确定删除该草稿吗？').then(ok => {
      if (!ok) return
      drafts.remove(id)
        .then(() => {
          showToast('已删除', 'success')
          this.loadDrafts()
        })
        .catch(() => showToast('删除失败'))
    })
  },

  onGoLogin() {
    wx.navigateTo({ url: '/pages/mine/profile/profile?needLogin=true' })
  }
})
