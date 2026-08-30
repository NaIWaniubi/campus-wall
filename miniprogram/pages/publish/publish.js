const app = getApp()
const { getCategoryList, getSubTypeList } = require('../../utils/category')
const { get, post, put, uploadFile, drafts } = require('../../utils/api')
const { CATEGORY_TO_SECTION, SECTION_TO_CATEGORY } = require('../../utils/constants')
const { showToast, chooseImage } = require('../../utils/util')

/**
 * 各板块补充字段（键名必须在后端 extraFields 白名单内：
 * price/contact/location/tradeType/condition/time/itemType/organizer/direction）。
 * itemType 由「具体类型」选择经适配层 subType->extraFields.itemType 写入；
 * direction 由失物板块「类型」选择（我捡到了=found / 我丢失了=lost）写入。
 * 树洞（daily）后端 force_anonymous，前端同步锁定匿名开关。
 */
const requiredExtraFields = {
  lost: ['direction', 'time', 'location'],
  trade: ['price', 'condition', 'tradeType'],
  activity: ['time', 'location'],
  carshare: ['time', 'location'],
  team: []
}

// 树洞板块强制匿名（sections.force_anonymous=1）
const FORCED_ANONYMOUS_CATEGORIES = ['daily']

const conditionList = ['全新', '99新', '9成新', '8成新', '7成新及以下']
const tradeTypeList = ['出售', '求购', '以物换物']

Page({
  data: {
    categoryList: [],
    selectedCategory: '',
    subTypeList: [],
    selectedSubType: '',
    isAnonymous: true,
    forcedAnonymous: false,
    title: '',
    content: '',
    imageList: [],
    submitting: false,
    canPublish: false,
    conditionList,
    conditionIndex: -1,
    tradeTypeList,
    tradeTypeIndex: -1,
    extraData: {},
    editId: '',
    draftCloudId: 0,
    isEdit: false,
    publishTip: '先选择一个分类'
  },

  onLoad(options) {
    this.setData({ categoryList: getCategoryList() })

    if (options.editId) {
      this.setData({ editId: options.editId, isEdit: true })
      this.loadPostForEdit(options.editId)
    } else if (options.draftId) {
      // 草稿箱跳入：按云端草稿 id 恢复（发布为 tabBar 页，经 storage 中转由 onShow 消费）
    } else {
      const draft = wx.getStorageSync('publishDraft')
      if (draft) this.restoreDraft(draft)
      // 云端优先：异步拉取云草稿，拉到则覆盖本地单槽（Q4 跨设备可见）
      this.hydrateCloudDraft()
    }

    if (options.category) {
      this.onSelectCategory({ currentTarget: { dataset: { id: options.category } } })
    }
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 })
    }
    const editId = wx.getStorageSync('publishEditId')
    if (editId) {
      wx.removeStorageSync('publishEditId')
      this.resetForm()
      this.setData({ editId, isEdit: true })
      this.loadPostForEdit(editId)
      return
    }
    // 草稿箱「继续编辑」：恢复指定云草稿（一次性消费，避免每次切 tab 触发）
    const draftId = wx.getStorageSync('publishDraftId')
    if (draftId) {
      wx.removeStorageSync('publishDraftId')
      this.resetForm()
      this.setData({ editId: '', isEdit: false })
      this.loadCloudDraft(Number(draftId))
      return
    }
    const category = wx.getStorageSync('publishCategory')
    if (category) {
      wx.removeStorageSync('publishCategory')
      if (this.data.isEdit) this.resetForm()
      this.onSelectCategory({ currentTarget: { dataset: { id: category } } })
    }
  },

  // ---------- 云端草稿（Q4）：表单 <-> /drafts 契约 ----------

  /** 表单 → 云草稿 payload：分类转 sectionId；本地临时图不上云（仅 http）；subType 挂 extraFields */
  collectCloudPayload(localDraft) {
    const d = localDraft || this.data
    const extraFields = Object.assign({}, d.extraData, { subType: d.selectedSubType || '' })
    return {
      sectionId: CATEGORY_TO_SECTION[d.selectedCategory],
      title: d.title || '',
      content: d.content || '',
      images: (d.imageList || []).filter(function (i) { return /^https?:/i.test(i) }),
      isAnonymous: !!d.isAnonymous,
      extraFields: extraFields
    }
  },

  /** 云草稿 → 表单并恢复；同时镜像到本地单槽，弱网下次冷启动可恢复同一份 */
  applyCloudDraft(cloud) {
    if (!cloud || !cloud.id) return
    const extra = cloud.extraFields || {}
    const subType = extra.subType || ''
    const extraData = Object.assign({}, extra)
    delete extraData.subType
    const form = {
      selectedCategory: SECTION_TO_CATEGORY[Number(cloud.sectionId)] || '',
      selectedSubType: subType,
      title: cloud.title || '',
      content: cloud.content || '',
      imageList: Array.isArray(cloud.images) ? cloud.images : [],
      isAnonymous: !!cloud.isAnonymous,
      extraData: extraData
    }
    this.restoreDraft(form)
    wx.setStorageSync('publishDraft', form)
    this.setData({ draftCloudId: cloud.id })
  },

  /** 草稿箱「继续编辑」：按 id 拉取并恢复 */
  async loadCloudDraft(id) {
    try {
      const list = await drafts.list()
      const target = (list || []).find(function (d) { return Number(d.id) === id })
      if (!target) {
        showToast('草稿不存在或已被清理')
        return
      }
      this.applyCloudDraft(target)
    } catch (e) {
      showToast('草稿加载失败')
    }
  },

  /** 冷启动云端优先：拉最近一条云草稿覆盖本地恢复（静默，离线走本地） */
  async hydrateCloudDraft() {
    if (!app.checkLogin()) return
    try {
      const list = await drafts.list()
      if (list && list.length) this.applyCloudDraft(list[0])
    } catch (e) { /* 离线/游客态静默走本地 */ }
  },

  /** 发布前静默上云：已有云 id 走 PUT（更新原稿，不挤占 10 条上限），否则 POST 新建 */
  async saveDraftToCloud(localDraft) {
    try {
      const payload = this.collectCloudPayload(localDraft)
      if (!payload.title && !payload.content) return
      const cloudId = this.data.draftCloudId
      if (cloudId) {
        await drafts.update(cloudId, payload)
      } else {
        const res = await drafts.save(payload)
        const newId = res && res.id ? res.id : (res && res.data && res.data.id)
        if (newId) this.setData({ draftCloudId: Number(newId) })
      }
    } catch (e) {
      console.warn('云端草稿保存失败（本地兜底仍有效）', e)
    }
  },

  restoreDraft(draft) {
    const patch = Object.assign({
      selectedCategory: '',
      selectedSubType: '',
      isAnonymous: true,
      title: '',
      content: '',
      imageList: [],
      extraData: {}
    }, draft)
    patch.forcedAnonymous = FORCED_ANONYMOUS_CATEGORIES.includes(patch.selectedCategory)
    patch.subTypeList = patch.selectedCategory ? getSubTypeList(patch.selectedCategory) : []
    patch.conditionIndex = conditionList.indexOf(patch.extraData.condition)
    patch.tradeTypeIndex = tradeTypeList.indexOf(patch.extraData.tradeType)
    this.setData(patch)
    this.checkCanPublish()
  },

  resetForm() {
    this.setData({
      selectedCategory: '',
      subTypeList: [],
      selectedSubType: '',
      isAnonymous: true,
      forcedAnonymous: false,
      title: '',
      content: '',
      imageList: [],
      showHotTopics: false,
      canPublish: false,
      conditionIndex: -1,
      tradeTypeIndex: -1,
      extraData: {},
      editId: '',
      isEdit: false,
      publishTip: '先选择一个分类'
    })
  },

  async loadPostForEdit(id) {
    try {
      const post = await get('/posts/' + id, {}, false)
      const category = post.category
      const extra = post.extra || {}
      this.setData({
        selectedCategory: category,
        subTypeList: getSubTypeList(category),
        selectedSubType: post.subType || '',
        isAnonymous: !!(post.author && post.author.isAnonymous),
        forcedAnonymous: FORCED_ANONYMOUS_CATEGORIES.includes(category),
        title: post.title || '',
        content: post.content || '',
        imageList: post.images || [],
        extraData: extra,
        conditionIndex: conditionList.indexOf(extra.condition),
        tradeTypeIndex: tradeTypeList.indexOf(extra.tradeType)
      })
      this.checkCanPublish()
    } catch (e) {
      showToast('加载帖子失败')
    }
  },

  onSelectCategory(e) {
    const id = e.currentTarget.dataset.id
    const forcedAnonymous = FORCED_ANONYMOUS_CATEGORIES.includes(id)
    this.setData({
      selectedCategory: id,
      subTypeList: getSubTypeList(id),
      selectedSubType: '',
      // 树洞强制匿名：选中即锁定为匿名且不可关闭
      isAnonymous: forcedAnonymous ? true : this.data.isAnonymous,
      forcedAnonymous,
      extraData: {},
      conditionIndex: -1,
      tradeTypeIndex: -1
    })
    this.checkCanPublish()
  },

  onSelectSubType(e) {
    this.setData({ selectedSubType: e.currentTarget.dataset.id })
    this.checkCanPublish()
  },

  onToggleAnonymous(e) {
    if (this.data.forcedAnonymous) return
    this.setData({ isAnonymous: e.detail.value })
  },

  onTitleInput(e) {
    this.setData({ title: e.detail.value })
    this.checkCanPublish()
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
    this.checkCanPublish()
  },

  async onChooseImage() {
    const remaining = 6 - this.data.imageList.length
    if (remaining <= 0) {
      showToast('最多添加6张图片')
      return
    }
    try {
      const tempFiles = await chooseImage(remaining)
      this.setData({ imageList: [...this.data.imageList, ...tempFiles] })
    } catch (e) {
      console.error('选择图片失败', e)
    }
  },

  onDeleteImage(e) {
    const index = e.currentTarget.dataset.index
    const imageList = [...this.data.imageList]
    imageList.splice(index, 1)
    this.setData({ imageList })
  },

  onPreviewImage(e) {
    const index = e.currentTarget.dataset.index
    wx.previewImage({
      current: this.data.imageList[index],
      urls: this.data.imageList
    })
  },

  /** 时间类字段统一文本输入（如「下周五 19:00」），date picker 无法表达时段 */
  onExtraInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [`extraData.${field}`]: e.detail.value })
    this.checkCanPublish()
  },

  // 失物方向：我捡到了=found / 我丢失了=lost，写入 extraData.direction 随 extra 提交
  onDirectionSelect(e) {
    this.setData({ 'extraData.direction': e.currentTarget.dataset.dir })
    this.checkCanPublish()
  },

  onConditionChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      conditionIndex: index,
      'extraData.condition': conditionList[index]
    })
    this.checkCanPublish()
  },

  onTradeTypeChange(e) {
    const index = Number(e.detail.value)
    this.setData({
      tradeTypeIndex: index,
      'extraData.tradeType': tradeTypeList[index]
    })
    this.checkCanPublish()
  },

  checkCanPublish() {
    const { selectedCategory, selectedSubType, content, title, extraData } = this.data
    const hasTitle = title.trim().length >= 2
    const hasContent = content.trim().length >= 10
    const hasSubType = !!selectedSubType
    const requiredFields = requiredExtraFields[selectedCategory] || []
    const hasExtras = requiredFields.every(field => String(extraData[field] || '').trim().length > 0)
    this.setData({
      canPublish: !!selectedCategory && hasSubType && hasContent && hasTitle && hasExtras,
      publishTip: this.getPublishTip({ selectedCategory, selectedSubType, content, title, extraData })
    })
  },

  getPublishTip({ selectedCategory, selectedSubType, content, title, extraData }) {
    if (!selectedCategory) return '先选择一个分类'
    if (!selectedSubType) return '再选择一个具体类型'
    if (title.trim().length < 2) return '标题至少写 2 个字'
    if (content.trim().length < 10) return '内容至少写 10 个字'
    const labelMap = {
      price: '价格',
      condition: '新旧程度',
      tradeType: '交易类型',
      direction: '类型（捡到/丢失）',
      time: '时间',
      location: '地点'
    }
    const requiredFields = requiredExtraFields[selectedCategory] || []
    const missing = requiredFields.find(field => String(extraData[field] || '').trim().length === 0)
    if (missing) return `还差：${labelMap[missing] || '补充信息'}`
    return '内容准备好了，可以发布'
  },

  /** 压缩后再上传：wx.compressImage quality 80，压缩失败回退原图 */
  compressThenUpload(filePath) {
    return new Promise((resolve) => {
      wx.compressImage({
        src: filePath,
        quality: 80,
        success: res => resolve(res.tempFilePath),
        fail: () => resolve(filePath)
      })
    }).then(compressed => uploadFile(compressed))
  },

  async onPublish() {
    if (!this.data.canPublish) return
    if (!app.checkLogin()) {
      showToast('请先登录')
      return
    }
    if (this.data.submitting) return
    this.setData({ submitting: true })

    const { title, content, selectedCategory, selectedSubType, isAnonymous, imageList, extraData, editId, isEdit } = this.data

    // 落草稿：上传/请求中断后可恢复（本地单槽兜底 + 云端 upsert 跨设备可见）
    const localDraft = {
      selectedCategory,
      selectedSubType,
      title,
      content,
      imageList,
      isAnonymous,
      extraData
    }
    wx.setStorageSync('publishDraft', localDraft)
    this.saveDraftToCloud(localDraft)

    wx.showLoading({ title: isEdit ? '保存中...' : '发布中...' })

    try {
      let uploadedImages = []
      for (const img of imageList) {
        if (img.startsWith('http')) {
          uploadedImages.push(img)
        } else {
          const result = await this.compressThenUpload(img)
          uploadedImages.push(result.url)
        }
      }

      // 只提交白名单内的扩展键，避免脏数据入库
      const whitelist = ['price', 'contact', 'location', 'tradeType', 'condition', 'time', 'itemType', 'organizer', 'direction']
      const cleanExtra = {}
      whitelist.forEach(key => {
        const v = extraData[key]
        if (v !== undefined && v !== null && String(v).trim() !== '') cleanExtra[key] = String(v)
      })

      const postData = {
        category: selectedCategory,
        subType: selectedSubType,
        title,
        content,
        images: uploadedImages,
        isAnonymous,
        extra: cleanExtra
      }

      if (isEdit) {
        await put('/posts/' + editId, postData)
        showToast('修改成功', 'success')
      } else {
        await post('/posts', postData)
        showToast('发布成功', 'success')
      }

      wx.removeStorageSync('publishDraft')
      // 发布成功：云草稿一并清理（静默，失败由 10 条上限轮换兜底）
      const cloudId = this.data.draftCloudId
      if (cloudId) drafts.remove(cloudId).catch(() => {})
      this.setData({ draftCloudId: 0 })

      setTimeout(() => {
        this.resetForm()
        wx.switchTab({ url: '/pages/index/index' })
      }, 1500)
    } catch (e) {
      showToast(isEdit ? '修改失败' : '发布失败')
    } finally {
      wx.hideLoading()
      this.setData({ submitting: false })
    }
  }
})
