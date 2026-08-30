import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import './style.css'
import App from './App.vue'
import router from './router'
import { useUserStore } from './stores/user'
import { useWebSocket } from './composables/useWebSocket'

// 创建Vue应用实例
const app = createApp(App)

// 创建Pinia并启用持久化插件
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

// 使用Pinia和路由
app.use(pinia)
app.use(router)

// 登录态下启动 WS 实时连接（私信 + 通知；token 变化自动跟随，登出断开）
if (useUserStore().isLoggedIn) useWebSocket().start()

// PWA：仅生产环境注册 Service Worker（开发环境不注册，避免缓存干扰 HMR）
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// 挂载应用
app.mount('#app')
