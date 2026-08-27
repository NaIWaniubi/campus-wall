/**
 * 管理端 · 内容治理台（对接新后端 /api/admin/*）
 *
 * 能力：
 *  1. 数据卡：GET /admin/stats -> cards（待审内容/待处理举报/用户/帖子/今日新增/通过率）
 *  2. 内容审核：GET /admin/posts?status= 列表，默认 pending_review 人工审核队列；
 *     通过/驳回走 PUT /admin/posts/:id/audit {action:'approve'|'reject', reason}
 *  3. 举报处理：GET /admin/reports?status=；条目含 revealedAuthor（匿名帖举报达阈值
 *     后端揭示的真实作者）时渲染橙色警示条；处理走 PUT /admin/reports/:id
 *     {action:'delete_content'|'dismiss'|'ban_user', result}
 *  4. 意见反馈：GET /admin/feedbacks?status=open|closed 双态切换列表
 *  5. 用户管理精简版：GET /admin/users?keyword= 搜索列表 + 封禁/解封
 *     （重置密码/信誉调整属高危操作，仅网页端提供）
 *  6. 角色门槛：登录返回的 user.role 必须为 super_admin/section_admin，
 *     非管理员弹窗提示后跳转离开（接口层另有权限矩阵兜底）。
 *     权限矩阵与后端对齐：section_admin 仅可见 内容审核/举报处理，
 *     意见反馈与用户管理 tab 仅超管显示（对应接口超管专属）。
 */
const { get, put } = require('../../../utils/api')
const { requireLogin } = require('../../../utils/auth')
const { timeAgo } = require('../../../utils/util')

const PAGE_SIZE = 10

// 帖子状态 -> 展示文案
const POST_STATUS_TEXT = {
  pending_review: '人工审核',
  pending: '机审拦截',
  published: '已发布',
  rejected: '已驳回',
  deleted: '已删除'
}

// 举报对象类型 -> 展示文案
const TARGET_TYPE_TEXT = { post: '帖子', comment: '评论' }

Page({
  data: {
    role: '',
    // ---- 数据卡 ----
    cards: [],
    // ---- 主 Tab ----
    mainTab: 'posts', // posts | reports | feedback | users
    statusTabs: [
      { key: 'pending_review', name: '人工审核' },
      { key: 'pending', name: '机审拦截' },
      { key: 'published', name: '已发布' },
      { key: 'rejected', name: '已驳回' }
    ],
    activeStatus: 'pending_review',
    posts: [],
    postsHasMore: false,
    postsLoading: false,
    // ---- 举报 ----
    reportTabs: [
      { key: 'pending', name: '待处理' },
      { key: 'handled', name: '已处理' },
      { key: '', name: '全部' }
    ],
    activeReportStatus: 'pending',
    reports: [],
    reportsHasMore: false,
    reportsLoading: false,
    // ---- 意见反馈 ----
    feedbackTabs: [
      { key: 'open', name: '待处理' },
      { key: 'closed', name: '已关闭' }
    ],
    activeFeedbackStatus: 'open',
    feedbacks: [],
    feedbacksHasMore: false,
    feedbacksLoading: false,
    feedbacksLoaded: false,
    // ---- 用户管理（精简版） ----
    userKeyword: '',
    users: [],
    usersHasMore: false,
    usersLoading: false,
    usersLoaded: false,
    busyId: ''
  },

  onLoad() {
    if (!requireLogin('管理后台')) return
    if (!this.checkAdminRole()) return
    this.refreshAll()
  },

  /** 角色门槛：user.role ∈ {super_admin, section_admin}，否则提示并退出 */
  checkAdminRole() {
    const app = typeof getApp === 'function' ? getApp() : null
    let user = (app && app.globalData && app.globalData.userInfo) || null
    if (!user || !user.role) {
      try { user = wx.getStorageSync('userInfo') || null } catch (e) { user = null }
    }
    const role = (user && user.role) || ''
    if (role !== 'super_admin' && role !== 'section_admin') {
      wx.showModal({
        title: '无访问权限',
        content: '该页面仅对管理员开放，如需权限请联系超级管理员开通。',
        showCancel: false,
        confirmText: '知道了',
        success: () => {
          wx.switchTab({ url: '/pages/mine/mine' })
        }
      })
      setTimeout(() => { wx.switchTab({ url: '/pages/mine/mine' }) }, 1500)
      return false
    }
    this.setData({ role })
    return true
  },

  refreshAll() {
    this.loadStats()
    this.reloadPosts()
    this.reloadReports()
  },

  /* ---------------- 数据卡 ---------------- */

  async loadStats() {
    try {
      const data = await get('/admin/stats', {}, false)
      const c = (data && data.cards) || {}
      const cards = [
        { key: 'pendingPosts', label: '待审内容', value: c.pendingPosts || 0, accent: true },
        { key: 'pendingReports', label: '待处理举报', value: c.pendingReports || 0, accent: true },
        { key: 'totalUsers', label: '用户总数', value: c.totalUsers || 0 },
        { key: 'totalPosts', label: '帖子总数', value: c.totalPosts || 0 },
        { key: 'todayNew', label: '今日新增', value: (c.todayPosts || 0) + (c.todayUsers || 0) },
        { key: 'auditPassRate', label: '审核通过率', value: (c.auditPassRate != null ? c.auditPassRate : 100) + '%' }
      ]
      this.setData({ cards })
    } catch (e) {
      /* 数据卡加载失败不阻塞主流程 */
    }
  },

  /* ---------------- 主 Tab ---------------- */

  onMainTab(e) {
    const tab = e.currentTarget.dataset.tab
    if (tab === this.data.mainTab) return
    this.setData({ mainTab: tab })
    // 新 tab 首次进入时懒加载，避免 onLoad 一次发四个请求
    if (tab === 'feedback' && !this.data.feedbacksLoaded) this.reloadFeedbacks()
    if (tab === 'users' && !this.data.usersLoaded) this.reloadUsers()
  },

  /* ---------------- 内容审核列表 ---------------- */

  onStatusTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeStatus) return
    this.setData({ activeStatus: key })
    this.reloadPosts()
  },

  async reloadPosts() {
    this.setData({ postsLoading: true, posts: [], postsHasMore: false })
    await this.fetchPosts(1)
  },

  async fetchPosts(page) {
    if (this.data.postsLoading && page > 1) return
    this.setData({ postsLoading: true })
    try {
      const data = await get('/admin/posts', {
        status: this.data.activeStatus,
        page,
        pageSize: PAGE_SIZE
      }, false)
      const list = (data && Array.isArray(data.list) ? data.list : []).map(p => ({
        id: p.id,
        title: p.title || '(无标题)',
        content: p.content || '',
        sectionName: (p.section && p.section.name) || '未知板块',
        authorName: (p.author && p.author.nickname) || '未知用户',
        studentId: (p.author && p.author.studentId) || '-',
        imageCount: Array.isArray(p.images) ? p.images.length : 0,
        rejectReason: p.rejectReason || '',
        statusText: POST_STATUS_TEXT[p.status] || p.status,
        status: p.status,
        timeText: p.createdAt ? timeAgo(new Date(p.createdAt).getTime()) : ''
      }))
      const total = (data && data.total) != null ? data.total : list.length
      const merged = page > 1 ? this.data.posts.concat(list) : list
      this.setData({
        posts: merged,
        postsHasMore: merged.length < total,
        postsLoading: false
      })
    } catch (e) {
      this.setData({ postsLoading: false })
    }
  },

  /** 通过审核 */
  async onApprove(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.busyId === id) return
    this.setData({ busyId: id })
    try {
      await put(`/admin/posts/${id}/audit`, { action: 'approve' }, false)
      wx.showToast({ title: '已通过', icon: 'success' })
      this.removePost(id)
      this.loadStats()
    } catch (e2) { /* 失败 toast 已由 api 层提示 */ }
    this.setData({ busyId: '' })
  },

  /** 驳回：填写原因 */
  onReject(e) {
    const id = e.currentTarget.dataset.id
    if (!id || this.data.busyId === id) return
    wx.showModal({
      title: '驳回该内容',
      editable: true,
      placeholderText: '请填写驳回原因（必填）',
      success: async (res) => {
        if (!res.confirm) return
        const reason = (res.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写驳回原因', icon: 'none' })
          return
        }
        this.setData({ busyId: id })
        try {
          await put(`/admin/posts/${id}/audit`, { action: 'reject', reason }, false)
          wx.showToast({ title: '已驳回', icon: 'success' })
          this.removePost(id)
          this.loadStats()
        } catch (e2) { /* api 层已提示 */ }
        this.setData({ busyId: '' })
      }
    })
  },

  removePost(id) {
    this.setData({
      posts: this.data.posts.filter(p => String(p.id) !== String(id))
    })
  },

  /* ---------------- 举报处理 ---------------- */

  onReportTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeReportStatus) return
    this.setData({ activeReportStatus: key })
    this.reloadReports()
  },

  async reloadReports() {
    this.setData({ reportsLoading: true, reports: [], reportsHasMore: false })
    await this.fetchReports(1)
  },

  async fetchReports(page) {
    if (this.data.reportsLoading && page > 1) return
    this.setData({ reportsLoading: true })
    const params = { page, pageSize: PAGE_SIZE }
    if (this.data.activeReportStatus) params.status = this.data.activeReportStatus
    try {
      // api.js 对 /admin/reports 返回归一化数组
      const listRaw = await get('/admin/reports', params, false)
      const arr = Array.isArray(listRaw) ? listRaw : []
      const list = arr.map(r => ({
        id: r.id,
        targetTypeText: TARGET_TYPE_TEXT[r.targetType] || r.targetType,
        targetId: r.targetId,
        reason: r.reason || '(未填写)',
        status: r.status,
        priority: r.priority,
        handleResult: r.handleResult || '',
        reporterName: (r.reporter && r.reporter.nickname) || '匿名用户',
        reporterStudentId: (r.reporter && r.reporter.studentId) || '-',
        reportCount: r.reportCount || 0,
        revealedAuthor: r.revealedAuthor || null,
        warnText: r.revealedAuthor
          ? `⚠ 匿名帖已达举报阈值(${r.reportCount}人)，作者：${r.revealedAuthor.nickname}(${r.revealedAuthor.studentId})`
          : '',
        timeText: r.createdAt ? timeAgo(new Date(r.createdAt).getTime()) : ''
      }))
      const merged = page > 1 ? this.data.reports.concat(list) : list
      this.setData({
        reports: merged,
        reportsHasMore: list.length >= PAGE_SIZE,
        reportsLoading: false
      })
    } catch (e) {
      this.setData({ reportsLoading: false })
    }
  },

  /** 处理举报统一入口：action ∈ delete_content | dismiss | ban_user */
  onHandleReport(e) {
    const { id, action } = e.currentTarget.dataset
    if (!id || !action || this.data.busyId === id) return

    const presets = {
      delete_content: { tip: '删除被举报内容？该操作不可恢复。', result: '已删除违规内容', ok: '已删除' },
      dismiss: { tip: '核实无违规，忽略该举报？', result: '已核实无违规', ok: '已忽略' },
      ban_user: { tip: '封禁被举报内容的作者？', result: '已封禁作者', ok: '已封禁' }
    }
    const preset = presets[action]
    if (!preset) return

    wx.showModal({
      title: '处理举报',
      content: preset.tip,
      success: async (res) => {
        if (!res.confirm) return
        this.setData({ busyId: id })
        try {
          await put(`/admin/reports/${id}`, { action, result: preset.result }, false)
          wx.showToast({ title: preset.ok, icon: 'success' })
          this.setData({ reports: this.data.reports.filter(r => String(r.id) !== String(id)) })
          this.loadStats()
        } catch (e2) { /* api 层已提示 */ }
        this.setData({ busyId: '' })
      }
    })
  },

  /* ---------------- 意见反馈 ---------------- */

  onFeedbackTab(e) {
    const key = e.currentTarget.dataset.key
    if (key === this.data.activeFeedbackStatus) return
    this.setData({ activeFeedbackStatus: key })
    this.reloadFeedbacks()
  },

  async reloadFeedbacks() {
    this.setData({ feedbacksLoading: true, feedbacks: [], feedbacksHasMore: false, feedbacksLoaded: true })
    await this.fetchFeedbacks(1)
  },

  async fetchFeedbacks(page) {
    if (this.data.feedbacksLoading && page > 1) return
    this.setData({ feedbacksLoading: true })
    try {
      // 后端契约：{list:[{id,content,contact,status,nickname,studentId,createdAt}], total}
      const data = await get('/admin/feedbacks', {
        status: this.data.activeFeedbackStatus,
        page,
        pageSize: PAGE_SIZE
      }, false)
      const list = (data && Array.isArray(data.list) ? data.list : []).map(f => ({
        id: f.id,
        content: f.content || '(无内容)',
        contact: f.contact || '-',
        status: f.status || 'open',
        statusText: f.status === 'closed' ? '已关闭' : '待处理',
        nickname: f.nickname || '匿名用户',
        studentId: f.studentId || '-',
        timeText: f.createdAt ? timeAgo(new Date(f.createdAt).getTime()) : ''
      }))
      const total = (data && data.total) != null ? data.total : list.length
      const merged = page > 1 ? this.data.feedbacks.concat(list) : list
      this.setData({
        feedbacks: merged,
        feedbacksHasMore: merged.length < total,
        feedbacksLoading: false
      })
    } catch (e) {
      this.setData({ feedbacksLoading: false })
    }
  },

  /* ---------------- 用户管理（精简版） ---------------- */

  onUserKeywordInput(e) {
    this.setData({ userKeyword: e.detail.value })
  },

  onUserSearch() {
    this.reloadUsers()
  },

  async reloadUsers() {
    this.setData({ usersLoading: true, users: [], usersHasMore: false, usersLoaded: true })
    await this.fetchUsers(1)
  },

  async fetchUsers(page) {
    if (this.data.usersLoading && page > 1) return
    this.setData({ usersLoading: true })
    try {
      // 后端契约：{list:[...snake_case 字段 student_id/credit_score...], total}，防御性兼容两种命名
      const data = await get('/admin/users', {
        keyword: (this.data.userKeyword || '').trim(),
        page,
        pageSize: PAGE_SIZE
      }, false)
      const list = (data && Array.isArray(data.list) ? data.list : []).map(u => ({
        id: u.id,
        nickname: u.nickname || '未知用户',
        studentId: u.studentId != null ? u.studentId : (u.student_id || '-'),
        creditScore: u.creditScore != null ? u.creditScore : (u.credit_score != null ? u.credit_score : 100),
        status: u.status || 'active',
        isBanned: (u.status || 'active') === 'banned'
      }))
      const total = (data && data.total) != null ? data.total : list.length
      const merged = page > 1 ? this.data.users.concat(list) : list
      this.setData({
        users: merged,
        usersHasMore: merged.length < total,
        usersLoading: false
      })
    } catch (e) {
      this.setData({ usersLoading: false })
    }
  },

  /**
   * 封禁/解封切换。
   * 封禁先填原因（editable modal）再选时长（action sheet）再二次确认；
   * 复用后端既有 duration 参数（与网页端 UsersPage 同一契约：'1'|'7'|'30'|'forever'），
   * 杜绝手一抖一键永久封（审计 P2-8）。
   */
  onToggleBan(e) {
    const { id, banned } = e.currentTarget.dataset
    if (!id || this.data.busyId === id) return
    const isBanned = banned === true || banned === 'true'
    if (isBanned) {
      wx.showModal({
        title: '解封该用户',
        content: '确认解除该用户的封禁状态？',
        success: async (res) => {
          if (res.confirm) await this.submitBan(id, 'unban', '')
        }
      })
      return
    }
    wx.showModal({
      title: '封禁该用户',
      editable: true,
      placeholderText: '请输入封禁原因',
      success: async (modalRes) => {
        if (!modalRes.confirm) return
        const reason = (modalRes.content || '').trim()
        if (!reason) {
          wx.showToast({ title: '请填写封禁原因', icon: 'none' })
          return
        }
        const durationItems = ['封禁 1 天', '封禁 7 天', '封禁 30 天', '永久封禁']
        wx.showActionSheet({
          itemList: durationItems,
          success: (res) => {
            const durations = ['1', '7', '30', 'forever']
            const duration = durations[res.tapIndex]
            if (!duration) return
            wx.showModal({
              title: '确认封禁',
              content: duration === 'forever'
                ? '永久封禁不会自动解封，确认执行？'
                : '封禁期内该用户无法登录和发帖，到期自动解封。',
              success: async (m) => {
                if (m.confirm) await this.submitBan(id, 'ban', duration, reason)
              }
            })
          }
        })
      }
    })
  },

  /** 执行封禁/解封请求并同步列表状态 */
  async submitBan(id, action, duration, reason) {
    this.setData({ busyId: id })
    try {
      const payload = action === 'ban' ? { action, reason: reason || '违规', duration } : { action }
      await put(`/admin/users/${id}/ban`, payload, false)
      const isBanned = action === 'ban'
      wx.showToast({ title: isBanned ? '已封禁' : '已解封', icon: 'success' })
      this.setData({
        users: this.data.users.map(u => (
          String(u.id) === String(id)
            ? Object.assign({}, u, { status: isBanned ? 'banned' : 'active', isBanned })
            : u
        ))
      })
    } catch (e2) { /* api 层已提示 */ }
    this.setData({ busyId: '' })
  },

  /* ---------------- 分页与刷新 ---------------- */

  onLoadMore() {
    if (this.data.mainTab === 'posts') {
      if (!this.data.postsHasMore || this.data.postsLoading) return
      this.fetchPosts(Math.floor(this.data.posts.length / PAGE_SIZE) + 1)
    } else if (this.data.mainTab === 'reports') {
      if (!this.data.reportsHasMore || this.data.reportsLoading) return
      this.fetchReports(Math.floor(this.data.reports.length / PAGE_SIZE) + 1)
    } else if (this.data.mainTab === 'feedback') {
      if (!this.data.feedbacksHasMore || this.data.feedbacksLoading) return
      this.fetchFeedbacks(Math.floor(this.data.feedbacks.length / PAGE_SIZE) + 1)
    } else if (this.data.mainTab === 'users') {
      if (!this.data.usersHasMore || this.data.usersLoading) return
      this.fetchUsers(Math.floor(this.data.users.length / PAGE_SIZE) + 1)
    }
  },

  onPullDownRefresh() {
    if (!this.checkAdminRole()) {
      wx.stopPullDownRefresh()
      return
    }
    const tasks = [this.loadStats(), this.reloadPosts(), this.reloadReports()]
    if (this.data.feedbacksLoaded) tasks.push(this.reloadFeedbacks())
    if (this.data.usersLoaded) tasks.push(this.reloadUsers())
    Promise.all(tasks)
      .catch(() => {})
      .then(() => wx.stopPullDownRefresh())
  },

  onReachBottom() {
    this.onLoadMore()
  }
})
