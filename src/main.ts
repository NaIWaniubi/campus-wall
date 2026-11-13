import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import * as Sentry from '@sentry/vue'
import './style.css'
import './styles/v4.css'
import App from './App.vue'
import router from './router'
import { useWebSocket } from './composables/useWebSocket'
import { toast } from './utils/request'

// 创建Vue应用实例
const app = createApp(App)

// 全局错误兜底（V5）：未捕获的 Vue 渲染/侦听错误只提示不白屏，且节流防刷屏
app.config.errorHandler = (err, _inst, info) => {
  console.error('[vue-error]', info, err)
  toast.error('页面出了点小问题，如持续异常请刷新')
}
if (import.meta.env.PROD) {
  window.addEventListener('unhandledrejection', (e) => {
    // 路由 chunk 失败已由 router.onError 处理；这里兜底其余 Promise 异常，不拦截
    console.error('[unhandled-rejection]', e.reason)
  })
}

// 前端 Sentry：VITE_SENTRY_DSN 未配置时 no-op（构建期内联，未配置即零开销）
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    app,
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
  })
}

// 创建Pinia并启用持久化插件
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// 使用Pinia和路由
app.use(pinia)
app.use(router)

// 启动 WS：无条件 start（内部仅有 token 时才真连接，并 $subscribe 跟随登录/换号/登出）。
// 若只在已登录时 start，游客→登录路径就没人装 watch，登录后收不到实时推送。
useWebSocket().start()

// PWA：仅生产环境注册 Service Worker（开发环境不注册，避免缓存干扰 HMR）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// 挂载应用
app.mount('#app')
