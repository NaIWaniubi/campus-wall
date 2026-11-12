<script setup lang="ts">
/**
 * 登录页：账号 + 密码登录（账号可为手机号 / 拼音 / 邮箱前缀 / 原学号）
 */
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Eye, EyeOff, Loader2, X } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { toast, safeRedirect } from '@/utils/request'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const form = reactive({
  studentId: '',
  password: '',
})
const showPassword = ref(false)
const loading = ref(false)
const showForgot = ref(false)

async function handleSubmit() {
  if (!form.studentId.trim()) {
    toast.error('请输入账号')
    return
  }
  if (!form.password) {
    toast.error('请输入密码')
    return
  }
  if (loading.value) return
  loading.value = true
  try {
    await userStore.login(form.studentId.trim(), form.password)
    toast.success('登录成功')
    const redirect = safeRedirect(route.query.redirect, '/')
    router.replace(redirect)
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
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
            v-model="form.studentId"
            type="text"
            autocomplete="username"
            aria-required="true"
            placeholder="手机号 / 拼音 / 账号"
            class="ds-input"
            @keyup.enter="handleSubmit"
          />
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
              placeholder="请输入密码"
              class="ds-input !pr-11"
              @keyup.enter="handleSubmit"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2"
              style="color: var(--ink-mute)"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Eye v-if="showPassword" class="w-5 h-5" />
              <EyeOff v-else class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- 主操作：墨底荧光字（页面唯一视觉重心） -->
        <button
          type="button"
          :disabled="loading"
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

      <!-- 演示账号提示条：平卡（无投影）= 备注区 -->
      <section class="ds-card ds-card--flat p-3.5">
        <div class="flex items-center gap-2">
          <span class="ds-tag-dot shrink-0" style="background: var(--lime)"></span>
          <span class="ds-label">演示账号 DEMO</span>
        </div>
        <p class="mt-1.5 text-[12.5px] ds-num leading-relaxed" style="color: var(--ink-soft)">
          账号 23770001 · 密码 demo1234
        </p>
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
        <div class="absolute inset-0" style="background: var(--ink); opacity: 0.55"></div>
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
