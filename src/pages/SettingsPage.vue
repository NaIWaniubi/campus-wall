<script setup lang="ts">
/**
 * 账号设置：编辑资料 + 修改密码 + 外观 + 帮助 + 危险操作
 * V5：整页 V4 化；新增账号只读展示、密码可见性切换
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, Bell, Camera, Download, Eye, EyeOff, Loader2, Lock, LogOut, Monitor, Moon, Sparkles, Sun, UserX } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { useThemeStore, type ThemeMode } from '@/stores/theme'
import { uploadApi, authApi, pushApi } from '@/utils/api'
import { toast } from '@/utils/request'
import { usePwaInstall } from '@/composables/usePwaInstall'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()
const { canInstall, installed: appInstalled, install: pwaInstall } = usePwaInstall()
const installing = ref(false)
async function onInstallApp() {
  installing.value = true
  const r = await pwaInstall()
  installing.value = false
  if (r === 'accepted') toast.success('已添加到设备，桌面图标见「校园墙」')
  else if (r === 'dismissed') toast.info('已取消安装')
}

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
  } catch (err: any) {
    // HTTP 错误已由 axios 拦截器 toast；但 subscribe/权限层的异常不走拦截器，
    // 静默吞掉会让按钮看起来「点了没反应」——必须给用户可读的失败原因
    if (!err?.isAxiosError) {
      toast.error(
        err?.name === 'NotAllowedError'
          ? '推送被浏览器拦截：请在地址栏检查通知权限'
          : '浏览器推送服务暂不可达，稍后重试'
      )
    }
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
const showPwd = ref(false)

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
    const res: any = await authApi.updatePassword({
      oldPassword: pwdForm.oldPassword,
      newPassword: pwdForm.newPassword,
    })
    // 服务端改密后旧 token 立即失效（token_version 递增），必须换用返回的新 token，
    // 否则当前设备会在下一次请求时被 401 踢下线
    const newToken = res?.data?.token || res?.token
    if (newToken) userStore.setToken(newToken)
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
function replayOnboarding() {
  window.dispatchEvent(new CustomEvent('onboarding:open'))
}
</script>

<template>
  <div class="min-h-screen pb-24" style="background: var(--paper)">
    <!-- V4 海报头 -->
    <header class="hero px-5 pt-6 pb-10 rounded-b-[24px]">
      <div class="max-w-[960px] mx-auto">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <span class="ds-sticker ds-sticker--coral shrink-0">SETTINGS</span>
            <span class="ds-label text-white/45 truncate">账号与偏好</span>
          </div>
          <button
            class="ds-icon-btn shrink-0"
            style="width:34px;height:34px;background:rgb(255 255 255 / 0.1);border-color:rgb(255 255 255 / 0.32);color:rgb(255 255 255);box-shadow:none"
            aria-label="返回" @click="router.back()"
          >
            <ArrowLeft class="w-4 h-4" />
          </button>
        </div>
        <h1 class="ds-display ds-display-lg mt-2 text-white">设置</h1>
        <p class="mt-1 text-[13px] text-white/60">资料、密码、外观，都在这儿</p>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-3 mt-3 space-y-3">
      <!-- 01 编辑资料 -->
      <section class="ds-card p-4 sm:p-5 space-y-4">
        <div class="ds-section-head">
          <span class="ds-section-head__num">01</span>
          <h2 class="ds-title">编辑资料</h2>
          <span class="ds-section-head__line"></span>
        </div>

        <!-- 头像 + 账号 -->
        <div class="flex items-center gap-3.5">
          <div class="relative shrink-0">
            <div
              class="w-[64px] h-[64px] overflow-hidden flex items-center justify-center"
              style="border: 1.5px solid var(--line); border-radius: 16px; background: var(--color-surface); box-shadow: var(--shadow-hard-sm)"
            >
              <img v-if="profileForm.avatar" :src="profileForm.avatar" class="w-full h-full object-cover" alt="头像" />
              <span v-else class="ds-display text-[24px]" style="color: var(--ink)">{{ profileForm.nickname.charAt(0) || '我' }}</span>
            </div>
            <label
              class="absolute -bottom-1.5 -right-1.5 w-[26px] h-[26px] flex items-center justify-center cursor-pointer"
              style="background: var(--lime); border: 1.5px solid var(--line); border-radius: 9px; box-shadow: var(--shadow-hard-sm)"
              aria-label="更换头像"
            >
              <Loader2 v-if="uploading" class="w-3.5 h-3.5 animate-spin" style="color: var(--ink)" />
              <Camera v-else class="w-3.5 h-3.5" style="color: var(--ink)" />
              <input type="file" accept="image/jpeg,image/png" class="hidden" @change="onAvatarChange" />
            </label>
          </div>
          <div class="min-w-0">
            <p class="text-[13.5px] font-extrabold truncate" style="color: var(--ink)">{{ profileForm.nickname || '未设置昵称' }}</p>
            <p class="mt-0.5 text-[12px] ds-num truncate" style="color: var(--ink-mute)">
              账号 {{ userStore.user?.studentId || '—' }} · 注册后不可修改
            </p>
            <p class="mt-1 text-[11.5px]" style="color: var(--ink-mute)">点击左下角相机更换头像（≤5MB）</p>
          </div>
        </div>

        <div>
          <label for="set-nickname" class="ds-label block mb-1.5">昵称</label>
          <input id="set-nickname" v-model="profileForm.nickname" type="text" maxlength="20" placeholder="请输入昵称" class="ds-input" />
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="set-signature" class="ds-label">个性签名</label>
            <span class="text-[11px] ds-num" :style="{ color: profileForm.signature.length > 100 ? 'var(--coral)' : 'var(--ink-mute)' }">{{ profileForm.signature.length }}/100</span>
          </div>
          <textarea id="set-signature" v-model="profileForm.signature" maxlength="100" rows="2" placeholder="一句话介绍自己" class="ds-input resize-none"></textarea>
        </div>

        <button
          type="button"
          :disabled="!profileDirty || savingProfile"
          class="ds-btn ds-btn--primary w-full !py-3"
          @click="saveProfile"
        >
          <Loader2 v-if="savingProfile" class="w-4 h-4 animate-spin" />
          {{ savingProfile ? '保存中...' : (profileDirty ? '保存资料' : '资料已是最新') }}
        </button>
      </section>

      <!-- 02 修改密码 -->
      <section class="ds-card p-4 sm:p-5 space-y-3">
        <div class="ds-section-head">
          <span class="ds-section-head__num">02</span>
          <h2 class="ds-title flex items-center gap-1.5"><Lock class="w-4 h-4" /> 修改密码</h2>
          <span class="ds-section-head__line"></span>
          <button
            type="button"
            class="shrink-0 ds-icon-btn !w-8 !h-8"
            :aria-label="showPwd ? '隐藏密码' : '显示密码'"
            :aria-pressed="showPwd"
            @click="showPwd = !showPwd"
          >
            <Eye v-if="showPwd" class="w-4 h-4" />
            <EyeOff v-else class="w-4 h-4" />
          </button>
        </div>
        <input v-model="pwdForm.oldPassword" :type="showPwd ? 'text' : 'password'" placeholder="原密码" class="ds-input" autocomplete="current-password" />
        <input v-model="pwdForm.newPassword" :type="showPwd ? 'text' : 'password'" placeholder="新密码（至少 6 位）" class="ds-input" autocomplete="new-password" />
        <input v-model="pwdForm.confirmPassword" :type="showPwd ? 'text' : 'password'" placeholder="确认新密码" class="ds-input" autocomplete="new-password" />
        <button
          type="button"
          :disabled="savingPassword"
          class="ds-btn ds-btn--primary w-full !py-3"
          @click="savePassword"
        >
          <Loader2 v-if="savingPassword" class="w-4 h-4 animate-spin" />
          {{ savingPassword ? '提交中...' : '修改密码' }}
        </button>
      </section>

      <!-- 03 外观 -->
      <section class="ds-card p-4 sm:p-5 space-y-3">
        <div class="ds-section-head">
          <span class="ds-section-head__num">03</span>
          <h2 class="ds-title">外观</h2>
          <span class="ds-section-head__line"></span>
        </div>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="opt in themeOptions"
            :key="opt.mode"
            type="button"
            class="ds-chip flex-col !py-3.5 !rounded-[12px] justify-center"
            :class="{ 'is-active': themeStore.mode === opt.mode }"
            :aria-pressed="themeStore.mode === opt.mode"
            @click="themeStore.setMode(opt.mode)"
          >
            <component :is="opt.icon" class="w-5 h-5" />
            <span class="text-[11.5px] font-bold">{{ opt.label }}</span>
          </button>
        </div>
        <!-- PWA：像原生 App 一样使用（V5） -->
        <div class="flex items-center justify-between gap-3 ds-hairline-b" style="border-top: 1px solid var(--hairline); padding-top: 12px; border-bottom: 0">
          <span class="flex items-center gap-2 text-[13px] font-semibold" style="color: var(--ink)">
            <Download class="w-4 h-4" /> 安装校园墙
            <span class="text-[11px] font-normal" style="color: var(--ink-mute)">{{ appInstalled ? '正在以应用模式运行' : '离线可看 · 桌面图标 · 全屏无地址栏' }}</span>
          </span>
          <div class="flex items-center gap-2 shrink-0">
            <span v-if="appInstalled" class="ds-tag"><span class="ds-tag-dot" style="background: var(--lime)"></span>已安装</span>
            <button v-else-if="canInstall" type="button" class="ds-ink-btn !px-3.5 !py-1.5 text-[12px]" :disabled="installing" @click="onInstallApp">
              <Loader2 v-if="installing" class="w-3.5 h-3.5 animate-spin" />
              {{ installing ? '安装中…' : '一键安装' }}
            </button>
            <span v-else class="text-[11px]" style="color: var(--ink-mute)">浏览器菜单 → 添加到主屏幕</span>
          </div>
        </div>
      </section>

      <!-- 04 通知与帮助 -->
      <section class="ds-card p-4 sm:p-5 space-y-1">
        <div class="ds-section-head mb-2">
          <span class="ds-section-head__num">04</span>
          <h2 class="ds-title">通知与帮助</h2>
          <span class="ds-section-head__line"></span>
        </div>

        <div v-if="pushAvailable" class="flex items-center justify-between gap-3 py-2.5">
          <span class="flex items-center gap-2 text-[13px] font-semibold" style="color: var(--ink)">
            <Bell class="w-4 h-4" /> 消息推送
            <span class="text-[11px] font-normal" style="color: var(--ink-mute)">离线也能收到提醒</span>
          </span>
          <div class="flex items-center gap-2 shrink-0">
            <button
              v-if="!pushEnabled"
              type="button"
              :disabled="pushBusy"
              class="ds-btn ds-btn--sm"
              @click="enablePush"
            >{{ pushBusy ? '开启中...' : '开启' }}</button>
            <template v-else>
              <span class="ds-tag"><span class="ds-tag-dot" style="background: var(--lime)"></span>已开启</span>
              <button type="button" :disabled="pushBusy" class="text-[11.5px] font-bold underline underline-offset-2" style="color: var(--ink-mute)" @click="disablePush">关闭</button>
            </template>
          </div>
        </div>

        <button type="button" class="w-full flex items-center justify-between py-3 text-left" @click="replayOnboarding">
          <span class="flex items-center gap-2 text-[13px] font-semibold" style="color: var(--ink)">
            <Sparkles class="w-4 h-4" /> 重新查看新手引导
          </span>
          <span class="ds-tag">30 秒</span>
        </button>
      </section>

      <!-- 05 危险操作 -->
      <section class="ds-card p-4 sm:p-5">
        <div class="ds-section-head mb-2">
          <span class="ds-section-head__num" style="color: var(--coral)">05</span>
          <h2 class="ds-title" style="color: var(--coral)">危险操作</h2>
          <span class="ds-section-head__line"></span>
        </div>
        <button type="button" class="w-full flex items-center justify-between py-3 text-left" @click="showDelete = true">
          <span class="flex items-center gap-2 text-[13px] font-semibold" style="color: var(--coral)">
            <UserX class="w-4 h-4" /> 账号注销
          </span>
          <span class="text-[11.5px]" style="color: var(--ink-mute)">7 天冷静期</span>
        </button>
        <div class="ds-hairline"></div>
        <button type="button" class="w-full flex items-center justify-between py-3 text-left" @click="showLogout = true">
          <span class="flex items-center gap-2 text-[13px] font-semibold" style="color: var(--ink)">
            <LogOut class="w-4 h-4" /> 退出登录
          </span>
          <span class="text-[11.5px]" style="color: var(--ink-mute)">当前设备</span>
        </button>
      </section>
    </main>

    <ConfirmDialog :visible="showLogout" content="确定要退出登录吗？" confirm-text="退出" danger
      @confirm="confirmLogout" @cancel="showLogout = false" />
    <ConfirmDialog :visible="showDelete" content="账号注销将进入7天冷静期，期间登录可恢复账号。冷静期后账号及所有数据将被永久删除，确定继续吗？" title="账号注销" confirm-text="确认注销" danger
      @confirm="confirmDeleteAccount" @cancel="showDelete = false" />
  </div>
</template>
