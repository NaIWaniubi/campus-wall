<script setup lang="ts">
/**
 * 账号设置：编辑资料 + 修改密码 + 危险操作
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Bell, Camera, Loader2, Lock, LogOut, Monitor, Moon, Sun, UserX } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { uploadApi, authApi, pushApi } from '@/utils/api'
import { toast } from '@/utils/request'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

// ---------- 消息推送（Web Push，服务端 VAPID 未配置时入口自动隐藏） ----------
const pushAvailable = ref(false)
const pushEnabled = ref(false)
const pushBusy = ref(false)

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

onMounted(async () => {
  try {
    const res: any = await pushApi.publicKey()
    const key: string | null = res.data?.publicKey
    if (!key || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    pushAvailable.value = true
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    pushEnabled.value = !!sub
  } catch {
    pushAvailable.value = false
  }
})

/** 关闭推送：退订当前浏览器订阅并同步服务端 */
async function disablePush() {
  pushBusy.value = true
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) {
      await pushApi.unsubscribe(sub.endpoint)
      await sub.unsubscribe()
    }
    pushEnabled.value = false
    toast.success('消息推送已关闭')
  } catch {
    toast.error('关闭失败，请重试')
  } finally {
    pushBusy.value = false
  }
}

async function enablePush() {
  if (pushEnabled.value || pushBusy.value) return
  pushBusy.value = true
  try {
    const res: any = await pushApi.publicKey()
    const key: string | null = res.data?.publicKey
    if (!key) return
    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') {
        toast.error('通知权限未授予')
        return
      }
    }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) })
    await pushApi.subscribe(sub.toJSON())
    pushEnabled.value = true
    toast.success('消息推送已开启')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    pushBusy.value = false
  }
}

// 外观三态：亮色 / 暗色 / 跟随系统
const themeOptions: { mode: ThemeMode; label: string; icon: any }[] = [
  { mode: 'light', label: '亮色', icon: Sun },
  { mode: 'dark', label: '暗色', icon: Moon },
  { mode: 'system', label: '跟随系统', icon: Monitor },
]

const profileForm = reactive({
  nickname: '',
  signature: '',
  avatar: '',
})
const pwdForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})
const savingProfile = ref(false)
const savingPassword = ref(false)
const uploading = ref(false)
const showLogout = ref(false)
const showDelete = ref(false)

const profileDirty = computed(() =>
  profileForm.nickname !== (userStore.user?.nickname || '') ||
  profileForm.signature !== (userStore.user?.signature || '') ||
  profileForm.avatar !== (userStore.user?.avatar || '')
)

function initForm() {
  if (userStore.user) {
    profileForm.nickname = userStore.user.nickname || ''
    profileForm.signature = userStore.user.signature || ''
    profileForm.avatar = userStore.user.avatar || ''
  }
}

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (file.size > 5 * 1024 * 1024) {
    toast.error('图片不能超过5MB')
    input.value = ''
    return
  }
  uploading.value = true
  try {
    const res: any = await uploadApi.upload(file)
    profileForm.avatar = res.data.url
  } catch {
    // 错误已由拦截器 toast
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function saveProfile() {
  if (!profileForm.nickname.trim()) {
    toast.error('昵称不能为空')
    return
  }
  if (profileForm.signature.length > 100) {
    toast.error('个性签名最多100字')
    return
  }
  savingProfile.value = true
  try {
    await userStore.updateProfile({
      nickname: profileForm.nickname.trim(),
      signature: profileForm.signature.trim(),
      avatar: profileForm.avatar,
    })
    toast.success('资料已更新')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    savingProfile.value = false
  }
}

async function savePassword() {
  if (!pwdForm.oldPassword || !pwdForm.newPassword) {
    toast.error('请填写完整密码')
    return
  }
  if (pwdForm.newPassword.length < 6) {
    toast.error('新密码至少6位')
    return
  }
  if (pwdForm.newPassword !== pwdForm.confirmPassword) {
    toast.error('两次密码不一致')
    return
  }
  if (pwdForm.newPassword === pwdForm.oldPassword) {
    toast.error('新密码不能与原密码相同')
    return
  }
  savingPassword.value = true
  try {
    await authApi.updatePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    })
    toast.success('密码已修改')
    pwdForm.oldPassword = ''
    pwdForm.newPassword = ''
    pwdForm.confirmPassword = ''
  } catch {
    // 错误已由拦截器 toast
  } finally {
    savingPassword.value = false
  }
}

function confirmLogout() {
  showLogout.value = false
  userStore.logout()
  toast.success('已退出登录')
  router.replace('/login')
}

function confirmDeleteAccount() {
  showDelete.value = false
  toast.info('账号注销申请已提交，请联系管理员处理')
}

onMounted(() => {
  if (!userStore.user) {
    userStore.fetchCurrentUser().then(initForm).catch(() => {})
  } else {
    initForm()
  }
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-6">
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-medium text-zinc-900">设置</span>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-4">
      <!-- 编辑资料 -->
      <section class="bg-white rounded-xl p-4 space-y-4">
        <h3 class="text-sm font-medium text-zinc-700">编辑资料</h3>
        <!-- 头像 -->
        <div class="flex items-center gap-3">
          <div class="relative">
            <div class="w-16 h-16 rounded-full bg-brand-100 overflow-hidden flex items-center justify-center">
              <img v-if="profileForm.avatar" :src="profileForm.avatar" class="w-full h-full object-cover" alt="头像" />
              <span v-else class="text-xl font-medium text-brand-600">{{ profileForm.nickname.charAt(0) || '我' }}</span>
            </div>
            <label class="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center cursor-pointer">
              <Loader2 v-if="uploading" class="w-3 h-3 animate-spin" />
              <Camera v-else class="w-3 h-3" />
              <input type="file" accept="image/jpeg,image/png" class="hidden" @change="onAvatarChange" />
            </label>
          </div>
          <span class="text-xs text-zinc-400">点击图标更换头像</span>
        </div>
        <!-- 昵称 -->
        <div>
          <label class="block text-sm text-zinc-700 mb-1.5">昵称</label>
          <input v-model="profileForm.nickname" type="text" maxlength="20" placeholder="请输入昵称"
            class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-sm" />
        </div>
        <!-- 签名 -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-sm text-zinc-700">个性签名</label>
            <span class="text-xs" :class="profileForm.signature.length > 100 ? 'text-red-500' : 'text-zinc-400'">{{ profileForm.signature.length }}/100</span>
          </div>
          <textarea v-model="profileForm.signature" maxlength="100" rows="2" placeholder="一句话介绍自己"
            class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-sm resize-none"></textarea>
        </div>
        <button :disabled="!profileDirty || savingProfile"
          class="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white rounded-full text-sm font-medium transition flex items-center justify-center gap-2"
          @click="saveProfile">
          <Loader2 v-if="savingProfile" class="w-4 h-4 animate-spin" />
          {{ savingProfile ? '保存中...' : '保存资料' }}
        </button>
      </section>

      <!-- 修改密码 -->
      <section class="bg-white rounded-xl p-4 space-y-3">
        <h3 class="flex items-center gap-1.5 text-sm font-medium text-zinc-700">
          <Lock class="w-4 h-4" /> 修改密码
        </h3>
        <input v-model="pwdForm.oldPassword" type="password" placeholder="原密码"
          class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-sm" />
        <input v-model="pwdForm.newPassword" type="password" placeholder="新密码（至少6位）"
          class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-sm" />
        <input v-model="pwdForm.confirmPassword" type="password" placeholder="确认新密码"
          class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-sm" />
        <button :disabled="savingPassword"
          class="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white rounded-full text-sm font-medium transition flex items-center justify-center gap-2"
          @click="savePassword">
          <Loader2 v-if="savingPassword" class="w-4 h-4 animate-spin" />
          {{ savingPassword ? '提交中...' : '修改密码' }}
        </button>
      </section>

      <!-- 外观设置 -->
      <section class="bg-white rounded-xl p-4 space-y-3">
        <h3 class="text-sm font-medium text-zinc-700">外观</h3>
        <div class="grid grid-cols-3 gap-2">
          <button v-for="opt in themeOptions" :key="opt.mode"
            class="flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs transition"
            :class="themeStore.mode === opt.mode
              ? 'border-brand-500 bg-brand-50 text-brand-600 font-medium'
              : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-700'"
            @click="themeStore.setMode(opt.mode)">
            <component :is="opt.icon" class="w-5 h-5" />
            {{ opt.label }}
          </button>
        </div>
      </section>

      <!-- 消息推送（服务端 VAPID 未配置时整块隐藏） -->
      <section v-if="pushAvailable" class="bg-white rounded-xl p-4 space-y-3">
        <h3 class="flex items-center gap-1.5 text-sm font-medium text-zinc-700">
          <Bell class="w-4 h-4" /> 消息推送
        </h3>
        <div class="flex items-center justify-between">
          <span class="text-xs text-zinc-400">离线时通过浏览器通知提醒新消息</span>
          <div class="flex items-center gap-2">
            <button :disabled="pushBusy || pushEnabled"
              class="px-4 py-1.5 rounded-full text-xs font-medium transition"
              :class="pushEnabled ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-500 text-white hover:bg-brand-600'"
              @click="enablePush">
              {{ pushEnabled ? '已开启' : (pushBusy ? '开启中...' : '开启') }}
            </button>
            <button v-if="pushEnabled" :disabled="pushBusy"
              class="px-3 py-1.5 rounded-full text-xs text-zinc-500 hover:text-zinc-700 transition"
              @click="disablePush">
              关闭
            </button>
          </div>
        </div>
      </section>

      <!-- 危险操作 -->
      <section class="bg-white rounded-xl p-4 space-y-1">
        <h3 class="text-sm font-medium text-zinc-700 mb-2">危险操作</h3>
        <button class="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-50 transition"
          @click="showDelete = true">
          <span class="flex items-center gap-2 text-sm text-red-500">
            <UserX class="w-4 h-4" /> 账号注销
          </span>
          <span class="text-xs text-zinc-400">7天冷静期</span>
        </button>
        <button class="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-zinc-50 transition"
          @click="showLogout = true">
          <span class="flex items-center gap-2 text-sm text-zinc-700">
            <LogOut class="w-4 h-4" /> 退出登录
          </span>
        </button>
      </section>
    </main>

    <ConfirmDialog :visible="showLogout" content="确定要退出登录吗？" confirm-text="退出" danger
      @confirm="confirmLogout" @cancel="showLogout = false" />
    <ConfirmDialog :visible="showDelete" content="账号注销将进入7天冷静期，期间登录可恢复账号。冷静期后账号及所有数据将被永久删除，确定继续吗？" title="账号注销" confirm-text="确认注销" danger
      @confirm="confirmDeleteAccount" @cancel="showDelete = false" />
  </div>
</template>

