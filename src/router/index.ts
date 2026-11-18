/**
 * 路由配置：用户端 + 管理后台
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/request'
import { isChunkLoadError, shouldReloadOnChunkError } from '@/utils/errorGuard'

// 用户端页面（首屏相关保持静态，其余路由级懒分包）
import HomePage from '@/pages/HomePage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import RegisterPage from '@/pages/RegisterPage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'
import SettingsPage from '@/pages/SettingsPage.vue'
import SectionPage from '@/pages/SectionPage.vue'

// 管理后台（首屏 AdminLogin + Layout 静态，子页全动态）
import AdminLoginPage from '@/pages/admin/AdminLoginPage.vue'
import AdminLayout from '@/pages/admin/AdminLayout.vue'

const routes = [
  // 用户端
  { path: '/', name: 'home', component: HomePage, meta: { title: '校园墙' } },
  { path: '/login', name: 'login', component: LoginPage, meta: { title: '登录', guestOnly: true } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { title: '注册', guestOnly: true } },
  { path: '/legal/:doc', name: 'legal', component: () => import('@/pages/LegalPage.vue'), meta: { title: '协议' } },
  { path: '/search', name: 'search', component: () => import('@/pages/SearchPage.vue'), meta: { title: '搜索' } },
  { path: '/topics', name: 'topics', component: () => import('@/pages/TopicsPage.vue'), meta: { title: '话题' } },
  { path: '/post/:id', name: 'postDetail', component: () => import('@/pages/PostDetailPage.vue'), meta: { title: '帖子详情' } },
  { path: '/user/:id', name: 'userProfile', component: () => import('@/pages/UserProfilePage.vue'), meta: { title: '个人主页' } },
  { path: '/section/:id', name: 'section', component: SectionPage, meta: { title: '板块' } },
  { path: '/publish', name: 'publish', component: () => import('@/pages/PublishPage.vue'), meta: { title: '发布', requireAuth: true } },
  { path: '/message', name: 'message', component: () => import('@/pages/MessagePage.vue'), meta: { title: '消息', requireAuth: true } },
  { path: '/profile', name: 'profile', component: ProfilePage, meta: { title: '我的', requireAuth: true } },
  { path: '/profile/posts', name: 'myPosts', component: () => import('@/pages/MyPostsPage.vue'), meta: { title: '我的帖子', requireAuth: true } },
  { path: '/profile/comments', name: 'myComments', component: () => import('@/pages/MyCommentsPage.vue'), meta: { title: '我的评论', requireAuth: true } },
  { path: '/profile/favorites', name: 'myFavorites', component: () => import('@/pages/MyFavoritesPage.vue'), meta: { title: '我的收藏', requireAuth: true } },
  { path: '/my-likes', name: 'myLikes', component: () => import('@/pages/MyLikesPage.vue'), meta: { title: '我的点赞', requireAuth: true } },
  { path: '/profile/settings', name: 'settings', component: SettingsPage, meta: { title: '设置', requireAuth: true } },
  { path: '/profile/drafts', name: 'drafts', component: () => import('@/pages/DraftsPage.vue'), meta: { title: '草稿箱', requireAuth: true } },
  { path: '/profile/subscriptions', name: 'mySubscriptions', component: () => import('@/pages/MySubscriptionsPage.vue'), meta: { title: '我的订阅', requireAuth: true } },

  // 管理后台
  { path: '/admin/login', name: 'adminLogin', component: AdminLoginPage, meta: { title: '管理员登录', guestOnly: true } },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requireAuth: true, requireAdmin: true },
    children: [
      { path: '', name: 'adminDashboard', component: () => import('@/pages/admin/DashboardPage.vue'), meta: { title: '数据总览', superOnly: true } },
      { path: 'posts', name: 'adminPosts', component: () => import('@/pages/admin/ContentPage.vue'), meta: { title: '帖子治理' } },
      { path: 'comments', name: 'adminComments', component: () => import('@/pages/admin/CommentsPage.vue'), meta: { title: '评论管理' } },
      { path: 'reports', name: 'adminReports', component: () => import('@/pages/admin/ReportsPage.vue'), meta: { title: '举报处理' } },
      { path: 'users', name: 'adminUsers', component: () => import('@/pages/admin/UsersPage.vue'), meta: { title: '用户管理', superOnly: true } },
      { path: 'sections', name: 'adminSections', component: () => import('@/pages/admin/SectionsPage.vue'), meta: { title: '板块管理', superOnly: true } },
      { path: 'feedbacks', name: 'adminFeedbacks', component: () => import('@/pages/admin/FeedbacksPage.vue'), meta: { title: '意见反馈', superOnly: true } },
      { path: 'announcements', name: 'adminAnnouncements', component: () => import('@/pages/admin/AnnouncementsPage.vue'), meta: { title: '公告管理', superOnly: true } },
      { path: 'ai', name: 'adminAi', component: () => import('@/pages/admin/AdminAiPage.vue'), meta: { title: 'AI 设置', superOnly: true } },
    ],
  },

  // 403
  { path: '/403', name: 'forbidden', component: () => import('@/pages/ForbiddenPage.vue'), meta: { title: '无权限' } },
  // 404 / 兜底：命中未知路径 → ForbiddenPage（复用 403 视觉，承载"页面不存在"语义）
  {
    path: '/:pathMatch(.*)*',
    name: 'notFound',
    component: () => import('@/pages/ForbiddenPage.vue'),
  },
] as RouteRecordRaw[]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 }
  },
})

// 全局前置守卫
router.beforeEach(async (to, _from, next) => {
  document.title = `${to.meta.title || ''} - 校园墙`

  const userStore = useUserStore()

  if (to.meta.requireAuth && !userStore.isLoggedIn) {
    // access 只在内存：刷新/深链进入时先尝试静默续期，失败才打回登录页
    if (userStore.refreshToken) await userStore.ensureSession()
    if (!userStore.isLoggedIn) {
      next({ path: '/login', query: { redirect: to.fullPath } })
      return
    }
  }

  // 已登录用户访问登录页 → 弹回首页（反向守卫）。
  // 原实现只有「未登录访问受保护页」方向，没有这条：
  // 已登录后手动输网址进 /login，看到的还是登录表单，
  // 可误触发再次登录覆盖当前会话。
  if (to.meta.guestOnly && userStore.isLoggedIn) {
    next(userStore.isAdmin ? '/admin' : '/')
    return
  }

  if (to.meta.requireAdmin && !userStore.isAdmin) {
    // 非管理员（角色以登录响应 user.role 为准）访问后台：重定向首页并提示无权限
    toast.error('无权限访问管理后台')
    next('/')
    return
  }

  if (to.meta.superOnly && !userStore.isSuperAdmin) {
    // 板块管理员越权访问超管专属页：已登录管理员回落到内容审核，其余回首页
    toast.error('该页面仅超级管理员可访问')
    next(userStore.isAdmin ? '/admin/posts' : '/')
    return
  }

  next()
})

/**
 * 路由错误兜底（V5）：
 * - 懒加载 chunk 加载失败（典型场景：发版后用户还停在旧页面点了新路由，
 *   旧 index.html 引用的 hash chunk 已不存在）→ 自动硬刷新拉新模板，只刷一次防死循环。
 * - 其它导航错误：提示而非白屏。
 */
router.onError((err) => {
  if (isChunkLoadError(err) && shouldReloadOnChunkError(sessionStorage)) {
    location.reload()
    return
  }
  toast.error('页面加载失败，请检查网络后重试')
})

export default router
