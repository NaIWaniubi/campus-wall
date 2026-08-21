/**
 * 路由配置：用户端 + 管理后台
 */
import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/stores/user'

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
import SettingsPage from '@/pages/SettingsPage.vue'
import DraftsPage from '@/pages/DraftsPage.vue'
import SectionPage from '@/pages/SectionPage.vue'

// 管理后台页面
import AdminLoginPage from '@/pages/admin/AdminLoginPage.vue'
import AdminDashboardPage from '@/pages/admin/AdminDashboardPage.vue'
import AdminUsersPage from '@/pages/admin/AdminUsersPage.vue'
import AdminPostsPage from '@/pages/admin/AdminPostsPage.vue'
import AdminCommentsPage from '@/pages/admin/AdminCommentsPage.vue'
import AdminReportsPage from '@/pages/admin/AdminReportsPage.vue'
import AdminSectionsPage from '@/pages/admin/AdminSectionsPage.vue'
import AdminAnnouncementsPage from '@/pages/admin/AdminAnnouncementsPage.vue'

const routes = [
  // 用户端
  { path: '/', name: 'home', component: HomePage, meta: { title: '校园墙' } },
  { path: '/login', name: 'login', component: LoginPage, meta: { title: '登录' } },
  { path: '/register', name: 'register', component: RegisterPage, meta: { title: '注册' } },
  { path: '/search', name: 'search', component: SearchPage, meta: { title: '搜索' } },
  { path: '/post/:id', name: 'postDetail', component: PostDetailPage, meta: { title: '帖子详情' } },
  { path: '/section/:id', name: 'section', component: SectionPage, meta: { title: '板块' } },
  { path: '/publish', name: 'publish', component: PublishPage, meta: { title: '发布', requireAuth: true } },
  { path: '/message', name: 'message', component: MessagePage, meta: { title: '消息', requireAuth: true } },
  { path: '/profile', name: 'profile', component: ProfilePage, meta: { title: '我的', requireAuth: true } },
  { path: '/profile/posts', name: 'myPosts', component: MyPostsPage, meta: { title: '我的帖子', requireAuth: true } },
  { path: '/profile/comments', name: 'myComments', component: MyCommentsPage, meta: { title: '我的评论', requireAuth: true } },
  { path: '/profile/favorites', name: 'myFavorites', component: MyFavoritesPage, meta: { title: '我的收藏', requireAuth: true } },
  { path: '/profile/settings', name: 'settings', component: SettingsPage, meta: { title: '设置', requireAuth: true } },
  { path: '/profile/drafts', name: 'drafts', component: DraftsPage, meta: { title: '草稿箱', requireAuth: true } },

  // 管理后台
  { path: '/admin/login', name: 'adminLogin', component: AdminLoginPage, meta: { title: '管理员登录' } },
  { path: '/admin', name: 'adminDashboard', component: AdminDashboardPage, meta: { title: '数据看板', requireAuth: true, requireAdmin: true } },
  { path: '/admin/users', name: 'adminUsers', component: AdminUsersPage, meta: { title: '用户管理', requireAuth: true, requireAdmin: true } },
  { path: '/admin/posts', name: 'adminPosts', component: AdminPostsPage, meta: { title: '内容审核', requireAuth: true, requireAdmin: true } },
  { path: '/admin/comments', name: 'adminComments', component: AdminCommentsPage, meta: { title: '评论管理', requireAuth: true, requireAdmin: true } },
  { path: '/admin/reports', name: 'adminReports', component: AdminReportsPage, meta: { title: '举报处理', requireAuth: true, requireAdmin: true } },
  { path: '/admin/sections', name: 'adminSections', component: AdminSectionsPage, meta: { title: '板块管理', requireAuth: true, requireAdmin: true } },
  { path: '/admin/announcements', name: 'adminAnnouncements', component: AdminAnnouncementsPage, meta: { title: '公告管理', requireAuth: true, requireAdmin: true } },

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
    next('/403')
    return
  }

  next()
})

export default router
