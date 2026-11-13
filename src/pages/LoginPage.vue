<script setup lang="ts">
/**
 * 登录页：账号 + 密码登录（账号可为手机号 / 拼音 / 邮箱前缀 / 原学号）
 * V5：新增「一键体验」（演示账号直接进入）与「游客逛逛」，字段级内联错误 + 自动聚焦
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Eye, EyeOff, Loader2, X, ArrowRight, Zap } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { toast, safeRedirect } from '@/utils/request'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const DEMO_ACCOUNT = '23770001'
const DEMO_PASSWORD = 'demo1234'

const form = reactive({
  studentId: '',
  password: '',
})
const showPassword = ref(false)
const loading = ref(false)
const quickLoading = ref(false)
const showForgot = ref(false)
const accountInput = ref<HTMLInputElement | null>(null)
const fieldError = reactive({ account: '', password: '' })

onMounted(() => {
  // 桌面端自动聚焦账号；移动端延迟聚焦避免键盘顶起页面
  if (window.matchMedia('(min-width: 768px)').matches) {
    accountInput.value?.focus()
  }
})

function validate(): boolean {
  fieldError.account = form.studentId.trim() ? '' : '请输入账号'
  fieldError.password = form.password ? '' : '请输入密码'
  return !fieldError.account && !fieldError.password
}

async function handleSubmit() {
  if (!validate()) return
  if (loading.value) return
  loading.value = true
  try {
    await userStore.login(form.studentId.trim(), form.password)
    toast.success('登录成功')
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}

/** 一键体验：演示账号直接登录，评委/新用户零输入看到完整产品 */
async function quickStart() {
  if (loading.value || quickLoading.value) return
  quickLoading.value = true
  form.studentId = DEMO_ACCOUNT
  form.password = DEMO_PASSWORD
  try {
    await userStore.login(DEMO_ACCOUNT, DEMO_PASSWORD)
    toast.success('已进入演示账号')
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch {
    // 演示账号被改密时给出明确出口，不让人卡死
    toast.error('演示账号不可用，请手动登录或注册')
  } finally {
    quickLoading.value = false
  }
}

/** 游客逛逛：不登录直接看公开内容；受保护页面的 redirect 不生效 */
function browseAsGuest() {
  const raw = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
  const target = /^\/(publish|message|profile)/.test(raw) ? '/' : raw
  router.replace(safeRedirect(target, '/'))
}
</script>

<template>
  <div class="min-h-screen pb-24" style="background: var(--paper)">
    <!-- V4 墨色海报头：字标 + 贴纸 + slogan（纯墨底 + 荧光字，无渐变） -->
    <header class="hero px-5 pt-9 pb-12 rounded-b-[24px] text-center">
      <div class="flex items-center justify-center gap-2">
        <span class="ds-sticker ds-sticker--coral">CAMPUS</span>
        <span class="ds-label" style="color: rgb(247 242 232 / 0.5)">本校 · 账号登录</span>
      </div>
      <h1 class="ds-display ds-display-xl mt-3 text-white">
        校园<span style="color: var(--lime)">墙</span>
      </h1>
      <p class="mt-2 text-[13px] leading-relaxed" style="color: rgb(247 242 232 / 0.65)">
        让校园生活更有温度
      </p>
    </header>

    <div class="px-4 mt-3 max-w-sm mx-auto space-y-3">
      <!-- 表单卡：白纸 + 1.5px 墨线 + 硬投影 -->
      <section class="ds-card p-5 space-y-4">
        <div>
          <label for="login-student-id" class="ds-label block mb-1.5">账号</label>
          <input
            id="login-student-id"
            ref="accountInput"
            v-model="form.studentId"
            type="text"
            autocomplete="username"
            aria-required="true"
            :aria-invalid="!!fieldError.account"
            :aria-describedby="fieldError.account ? 'login-account-error' : undefined"
            placeholder="手机号 / 拼音 / 账号"
            class="ds-input"
            :style="fieldError.account ? 'border-color: var(--coral)' : ''"
            @input="fieldError.account = ''"
            @blur="form.studentId.trim() || (fieldError.account = '')"
            @keyup.enter="handleSubmit"
          />
          <p v-if="fieldError.account" id="login-account-error" class="mt-1.5 text-[12px] font-bold" style="color: var(--coral)">
            {{ fieldError.account }}
          </p>
        </div>

        <div>
          <label for="login-password" class="ds-label block mb-1.5">密码</label>
          <div class="relative">
            <input
              id="login-password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              aria-required="true"
              :aria-invalid="!!fieldError.password"
              :aria-describedby="fieldError.password ? 'login-password-error' : undefined"
              placeholder="请输入密码"
              class="ds-input !pr-11"
              :style="fieldError.password ? 'border-color: var(--coral)' : ''"
              @input="fieldError.password = ''"
              @keyup.enter="handleSubmit"
            />
            <button
              type="button"
              class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5"
              style="color: var(--ink-mute)"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Eye v-if="showPassword" class="w-5 h-5" />
              <EyeOff v-else class="w-5 h-5" />
            </button>
          </div>
          <p v-if="fieldError.password" id="login-password-error" class="mt-1.5 text-[12px] font-bold" style="color: var(--coral)">
            {{ fieldError.password }}
          </p>
        </div>

        <!-- 主操作：墨底荧光字（页面唯一视觉重心） -->
        <button
          type="button"
          :disabled="loading || quickLoading"
          class="ds-btn ds-btn--primary w-full !py-3.5"
          @click="handleSubmit"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <!-- 次级操作：纯文字下划线，不与主按钮抢焦点 -->
        <button
          type="button"
          class="w-full text-center text-[12.5px] font-bold underline underline-offset-2 transition active:translate-y-[1px]"
          style="color: var(--ink-mute)"
          @click="showForgot = true"
        >
          忘记密码？
        </button>
      </section>

      <!-- 零输入入口：一键体验 / 游客逛逛 -->
      <section class="ds-card ds-card--flat p-3.5 space-y-2.5">
        <div class="flex items-center gap-2">
          <span class="ds-tag-dot shrink-0" style="background: var(--lime)"></span>
          <span class="ds-label">DEMO · 演示账号</span>
        </div>
        <p class="text-[12px] ds-num leading-relaxed" style="color: var(--ink-mute)">
          {{ DEMO_ACCOUNT }} / {{ DEMO_PASSWORD }}
        </p>
        <button
          type="button"
          class="ds-btn ds-btn--accent w-full !py-2.5"
          :disabled="loading || quickLoading"
          @click="quickStart"
        >
          <Zap v-if="!quickLoading" class="w-4 h-4" />
          <Loader2 v-else class="w-4 h-4 animate-spin" />
          {{ quickLoading ? '进入中...' : '一键体验（免输入）' }}
        </button>
        <button
          type="button"
          class="w-full flex items-center justify-center gap-1 text-[12.5px] font-bold transition active:translate-y-[1px]"
          style="color: var(--ink-soft)"
          @click="browseAsGuest"
        >
          先随便逛逛 <ArrowRight class="w-3.5 h-3.5" />
        </button>
      </section>

      <p class="text-center text-[13px] pt-2" style="color: var(--ink-mute)">
        没有账号？
        <router-link
          :to="{ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }"
          class="font-bold underline underline-offset-2"
          style="color: var(--violet)"
        >去注册</router-link>
      </p>
    </div>

    <!-- 忘记密码引导：本站无自助找回，唯一途径是管理员重置 -->
    <Teleport to="body">
      <div v-if="showForgot" class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" @click.self="showForgot = false">
        <div class="ds-scrim absolute inset-0"></div>
        <div class="relative ds-card w-full max-w-sm p-6 animate-scale-in">
          <button
            class="ds-icon-btn !w-8 !h-8 absolute top-3 right-3"
            aria-label="关闭"
            @click="showForgot = false"
          >
            <X class="w-4 h-4" />
          </button>
          <span class="ds-sticker ds-sticker--coral">HELP</span>
          <h3 class="ds-title mt-2.5" style="color: var(--ink)">忘记密码</h3>
          <div class="mt-2 mb-4 text-[13px] space-y-1.5 leading-relaxed" style="color: var(--ink-soft)">
            <p>暂不支持自助找回密码，可通过以下方式重置：</p>
            <p>1. 请管理员在后台为你重置；</p>
            <p>2. 或携带学生证到 XX 处办理。</p>
          </div>
          <div class="ds-card ds-card--flat px-4 py-3 text-[12px] leading-relaxed" style="color: var(--ink-mute)">
            <p>管理员联系方式（占位，请替换为实际信息）：</p>
            <p>QQ / 微信：__________</p>
            <p>邮箱：admin@example.edu.cn</p>
          </div>
          <button
            class="mt-4 ds-btn ds-btn--primary w-full"
            @click="showForgot = false"
          >
            我知道了
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
