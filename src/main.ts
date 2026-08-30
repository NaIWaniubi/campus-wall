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

// 挂载应用
app.mount('#app')
