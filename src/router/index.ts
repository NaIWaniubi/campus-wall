/**
 * 路由配置：用户端 + 管理后台
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/request'

// 用户端页面
import HomePage from '@/pages/HomePage.vue'
import LoginPage from '@/pages/LoginPage.vue'
import RegisterPage from '@/pages/RegisterPage.vue'
import SearchPage from '@/pages/SearchPage.vue'
import PostDetailPage from '@/pages/PostDetailPage.vue'
import PublishPage from '@/pages/PublishPage.vue'
import MessagePage from '@/pages/MessagePage.vue'
import ProfilePage from '@/pages/ProfilePage.vue'
import MyPostsPage from '@/pages/MyPostsPage.vue'
import MyCommentsPage from '@/pages/MyCommentsPage.vue'
import MyFavoritesPage from '@/pages/MyFavoritesPage.vue'
import MyLikesPage from '@/pages/MyLikesPage.vue'
import SettingsPage from '@/pages/SettingsPage.vue'
import DraftsPage from '@/pages/DraftsPage.vue'
import SectionPage from '@/pages/SectionPage.vue'
import UserProfilePage from '@/pages/UserProfilePage.vue'
import MySubscriptionsPage from '@/pages/MySubscriptionsPage.vue'

// 管理后台页面
import AdminLoginPage from '@/pages/admin/AdminLoginPage.vue'
import AdminLayout from '@/pages/admin/AdminLayout.vue'
import DashboardPage from '@/pages/admin/DashboardPage.vue'
import UsersPage from '@/pages/admin/UsersPage.vue'
import ContentPage from '@/pages/admin/ContentPage.vue'
import CommentsPage from '@/pages/admin/CommentsPage.vue'
import ReportsPage from '@/pages/admin/ReportsPage.vue'
import SectionsPage from '@/pages/admin/SectionsPage.vue'
import FeedbacksPage from '@/pages/admin/FeedbacksPage.vue'
import AnnouncementsPage from '@/pages/admin/AnnouncementsPage.vue'
import AdminAiPage from '@/pages/admin/AdminAiPage.vue'

const routes = [
  // 用户端
  { path: '/', name: 'home', component: HomePage, meta: { title: '校园墙' } },
  { path: '/login', name: 'login', component: LoginPage, meta: { title: '登录' } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { title: '注册' } },
  { path: '/search', name: 'search', component: SearchPage, meta: { title: '搜索' } },
  { path: '/post/:id', name: 'postDetail', component: PostDetailPage, meta: { title: '帖子详情' } },
  { path: '/user/:id', name: 'userProfile', component: UserProfilePage, meta: { title: '个人主页' } },
  { path: '/section/:id', name: 'section', component: SectionPage, meta: { title: '板块' } },
  { path: '/publish', name: 'publish', component: PublishPage, meta: { title: '发布', requireAuth: true } },
  { path: '/message', name: 'message', component: MessagePage, meta: { title: '消息', requireAuth: true } },
  { path: '/profile', name: 'profile', component: ProfilePage, meta: { title: '我的', requireAuth: true } },
  { path: '/profile/posts', name: 'myPosts', component: MyPostsPage, meta: { title: '我的帖子', requireAuth: true } },
  { path: '/profile/comments', name: 'myComments', component: MyCommentsPage, meta: { title: '我的评论', requireAuth: true } },
  { path: '/profile/favorites', name: 'myFavorites', component: MyFavoritesPage, meta: { title: '我的收藏', requireAuth: true } },
  { path: '/my-likes', name: 'myLikes', component: MyLikesPage, meta: { title: '我的点赞', requireAuth: true } },
  { path: '/profile/settings', name: 'settings', component: SettingsPage, meta: { title: '设置', requireAuth: true } },
  { path: '/profile/drafts', name: 'drafts', component: DraftsPage, meta: { title: '草稿箱', requireAuth: true } },
  { path: '/profile/subscriptions', name: 'mySubscriptions', component: MySubscriptionsPage, meta: { title: '我的订阅', requireAuth: true } },

  // 管理后台
  { path: '/admin/login', name: 'adminLogin', component: AdminLoginPage, meta: { title: '管理员登录' } },
  {
    path: '/admin',
    component: AdminLayout,
    meta: { requireAuth: true, requireAdmin: true },
    children: [
      { path: '', name: 'adminDashboard', component: DashboardPage, meta: { title: '数据总览', superOnly: true } },
      { path: 'posts', name: 'adminPosts', component: ContentPage, meta: { title: '帖子治理' } },
      { path: 'comments', name: 'adminComments', component: CommentsPage, meta: { title: '评论管理' } },
      { path: 'reports', name: 'adminReports', component: ReportsPage, meta: { title: '举报处理' } },
      { path: 'users', name: 'adminUsers', component: UsersPage, meta: { title: '用户管理', superOnly: true } },
      { path: 'sections', name: 'adminSections', component: SectionsPage, meta: { title: '板块管理', superOnly: true } },
      { path: 'feedbacks', name: 'adminFeedbacks', component: FeedbacksPage, meta: { title: '意见反馈', superOnly: true } },
      { path: 'announcements', name: 'adminAnnouncements', component: AnnouncementsPage, meta: { title: '公告管理', superOnly: true } },
      { path: 'ai', name: 'adminAi', component: AdminAiPage, meta: { title: 'AI 设置', superOnly: true } },
    ],
  },

  // 403
  { path: '/403', name: 'forbidden', component: () => import('@/pages/ForbiddenPage.vue'), meta: { title: '无权限' } },
  { path: '/:pathMatch(.*)*', redirect: '/' } as any,
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(_to, _from, savedPosition) {
    return savedPosition || { top: 0 }
  },
})

// 全局前置守卫
router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || ''} - 校园墙`

  const userStore = useUserStore()

  if (to.meta.requireAuth && !userStore.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } })
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

export default router
