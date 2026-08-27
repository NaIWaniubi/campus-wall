/**
 * Axios 请求封装：统一拦截器、Token、错误处理
 */
import axios from 'axios'
import { useUserStore } from '@/stores/user'
import router from '@/router'

const request = axios.create({
  baseURL: '/api',
  timeout: 10000,
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    if (userStore.token) {
      config.headers.Authorization = `Bearer ${userStore.token}`
    }
    config.headers['X-Request-Time'] = Date.now().toString()
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器
request.interceptors.response.use(
  (response) => {
    const res = response.data
    if (res.code === 200) {
      return res
    }
    // 401：未登录或Token过期
    if (res.code === 401) {
      const userStore = useUserStore()
      // 用 fullPath 而非 path：保留 query（如 /search?keyword=考研），避免回跳丢参
      const currentPath = router.currentRoute.value.fullPath
      const wasAdmin = userStore.isAdmin
      // 清空登录状态
      userStore.logout()
      // 后台路由跳后台登录页，前台跳前台登录页（保留 redirect 便于回跳）
      if (currentPath.startsWith('/admin')) {
        if (currentPath !== '/admin/login') {
          router.push({ path: '/admin/login', query: { redirect: currentPath } })
        }
      } else {
        if (currentPath !== '/login') {
          router.push({ path: '/login', query: { redirect: currentPath } })
        }
      }
      showToast(res.message || (wasAdmin ? '登录已过期，请重新登录' : '请先登录'), 'error')
      return Promise.reject(new Error(res.message || '请先登录'))
    }
    // 403：无权限
    if (res.code === 403) {
      showToast(res.message || '无权限访问', 'error')
      return Promise.reject(new Error(res.message || '无权限'))
    }
    // 其他错误
    showToast(res.message || '请求失败', 'error')
    return Promise.reject(new Error(res.message || '请求失败'))
  },
  (error) => {
    if (error.response?.status === 404) {
      showToast('请求的资源不存在', 'error')
    } else if (error.code === 'ECONNABORTED') {
      showToast('请求超时，请重试', 'error')
    } else if (!error.response) {
      showToast('网络异常，请检查网络连接', 'error')
    } else {
      showToast(error.response.data?.message || '服务器错误', 'error')
    }
    return Promise.reject(error)
  }
)

// 简易 Toast 实现
type ToastType = 'success' | 'error' | 'info'
let toastContainer: HTMLElement | null = null
// 短时间内的相同消息去重，避免网络异常时多个并发请求触发重复 toast
let lastToastKey = ''
let lastToastTime = 0

function showToast(message: string, type: ToastType = 'info') {
  if (!toastContainer) {
    toastContainer = document.createElement('div')
    toastContainer.id = 'toast-container'
    toastContainer.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;'
    document.body.appendChild(toastContainer)
  }
  // 同一消息在 800ms 内只弹一次，避免并发失败时连续弹出多个相同提示
  const now = Date.now()
  const key = `${type}:${message}`
  if (key === lastToastKey && now - lastToastTime < 800) {
    return
  }
  lastToastKey = key
  lastToastTime = now
  const toast = document.createElement('div')
  const colors: Record<ToastType, string> = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6',
  }
  toast.textContent = message
  toast.style.cssText = `background:${colors[type]};color:#fff;padding:10px 20px;border-radius:9999px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);animation:fadeIn 0.2s ease-out;max-width:90vw;word-break:break-word;`
  toastContainer.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.3s'
    setTimeout(() => toast.remove(), 300)
  }, 2000)
}

export const toast = {
  success: (msg: string) => showToast(msg, 'success'),
  error: (msg: string) => showToast(msg, 'error'),
  info: (msg: string) => showToast(msg, 'info'),
}

export default request
