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

// 静默续期：并发请求同时 401 时只发起一次 refresh
// 三态：true 成功 / false 服务端拒绝 / null 网络异常（异常时不清会话，等重试）
let refreshPromise: Promise<boolean | null> | null = null
function tryRefreshOnce(): Promise<boolean | null> {
  if (!refreshPromise) {
    const userStore = useUserStore()
    refreshPromise = userStore.refreshAccessToken().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/**
 * 401 统一处理（HTTP 200 + body.code=401 与真实 HTTP 401 两个入口共用）：
 * 1. 先尝试静默续期一次（单飞），成功则重放原请求；
 * 2. 续期失败/已重试过：快照回跳位置 → 清登录态 → 跳对应登录页。
 *
 * 为什么两个入口都要接：后端 unauthorized() 发的是真实 HTTP 401（response.ts），
 * axios 对非 2xx 直接走 error 拦截器——只在 response 拦截器处理 body.code，
 * 会让「access 2h 到期后的任何请求」直接报「服务器错误」并掉登录，静默续期形同虚设。
 */
async function handleUnauthorized(config: any, message?: string): Promise<any> {
  const userStore = useUserStore()
  if (config && !config.__skipAuthRefresh && !config.__retriedAfterRefresh) {
    config.__retriedAfterRefresh = true
    const ok = await tryRefreshOnce()
    if (ok) return request(config)
  }
  // 在清空登录态之前，先快照原始位置（pathname + search + hash），便于登录后回跳
  const rawLocation =
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}${window.location.hash}`
      : '') || router.currentRoute.value.fullPath
  const currentPath = rawLocation
  const wasAdmin = userStore.isAdmin
  // 将回跳路径暂存到 sessionStorage，登录页可读取
  try {
    sessionStorage.setItem('auth:redirect-after-login', currentPath)
  } catch {
    /* sessionStorage 不可用时忽略 */
  }
  // 清空登录状态
  userStore.logout()
  // 后台路由跳后台登录页，前台跳前台登录页（保留 redirect 便于回跳）
  const target = wasAdmin ? '/admin/login' : '/login'
  if (currentPath !== target) {
    router.push({ path: target, query: { redirect: currentPath } })
  }
  showToast(message || (wasAdmin ? '登录已过期，请重新登录' : '请先登录'), 'error')
  return Promise.reject(new Error(message || '请先登录'))
}

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    const userStore = useUserStore()
    // refresh 请求自身跳过 401 续期逻辑，避免递归
    if (String(config.url || '').includes('/auth/refresh')) {
      ;(config as any).__skipAuthRefresh = true
    }
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
  async (response) => {
    const res = response.data
    if (res.code === 200) {
      return res
    }
    // 401：未登录或Token过期 —— 先尝试静默续期一次，成功则重放原请求
    if (res.code === 401) {
      return handleUnauthorized(response.config as any, res.message)
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
    // 真实 HTTP 401（后端 unauthorized/forbidden 系列发的是真状态码）：
    // 与 body.code=401 共用同一套续期+重放逻辑，否则过期 token 会直接掉登录
    if (error.response?.status === 401) {
      return handleUnauthorized(error.config, error.response.data?.message)
    }
    if (error.response?.status === 403) {
      showToast(error.response.data?.message || '无权限访问', 'error')
    } else if (error.response?.status === 404) {
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
    // 读屏播报：错误/成功提示必须进入 live region，否则屏幕阅读器用户完全感知不到
    toastContainer.setAttribute('role', 'status')
    toastContainer.setAttribute('aria-live', 'polite')
    toastContainer.setAttribute('aria-atomic', 'true')
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
  // V4 贴纸 toast：全部走 CSS 变量，深色主题自动换色
  const colors: Record<ToastType, string> = {
    success: 'background:var(--lime);color:var(--ink)',
    error: 'background:var(--coral);color:var(--paper)',
    info: 'background:var(--card);color:var(--ink)',
  }
  toast.textContent = message
  toast.style.cssText = `${colors[type]};padding:9px 16px;border:1.5px solid var(--ink);border-radius:12px;font-size:13px;font-weight:800;box-shadow:3px 3px 0 var(--ink);animation:fadeIn 0.2s ease-out;max-width:90vw;word-break:break-word;`
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

/**
 * 校验回跳路径是否同源且安全：仅允许以 '/' 开头且不以 '//' / '/\' 开头的相对路径，
 * 拒绝协议相对 URL、绝对 URL、控制字符、CRLF 等，防止开放重定向攻击。
 * 命中非法值时回退到 '/'.
 */
export function safeRedirect(input: unknown, fallback = '/'): string {
  if (typeof input !== 'string') return fallback
  const s = input.trim()
  if (!s) return fallback
  if (s.length > 512) return fallback
  if (!s.startsWith('/')) return fallback
  if (s.startsWith('//') || s.startsWith('/\\')) return fallback
  if (/[\r\n\t]/.test(s)) return fallback
  return s
}

/**
 * 带鉴权的 fetch（专供 SSE / 流式接口——它们绕不开 axios 拦截器）：
 * 401 时静默续期一次并用新 token 重发；续期失败原样返回 401 响应，由调用方处理。
 * 两处流式调用（AI 助手 / Agent 助手）共用，避免过期 token 时流式功能直接失效。
 */
export async function fetchWithAuth(input: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const userStore = useUserStore()
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) || {}) }
  if (userStore.token) headers.Authorization = `Bearer ${userStore.token}`
  const resp = await fetch(input, { ...init, headers })
  if (resp.status === 401 && retry && userStore.refreshToken) {
    const ok = await tryRefreshOnce()
    if (ok) return fetchWithAuth(input, init, false)
  }
  return resp
}

export default request
