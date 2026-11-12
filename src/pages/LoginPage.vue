<script setup lang="ts">
/**
 * 登录页：学号 + 密码登录
 */
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Eye, EyeOff, GraduationCap, Loader2, X } from '@lucide/vue'
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
    toast.error('请输入学号')
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
  <div class="min-h-screen pb-10 relative" style="background: var(--color-bg)">
    <div class="aurora-bg" aria-hidden="true"></div>
    <!-- 渐变头（与首页同源：V3 紫→品红 多巴胺极光） -->
    <div class="hero pt-12 pb-14 px-6 rounded-b-[28px] text-center">
      <div class="w-[72px] h-[72px] mx-auto rounded-[22px] glass flex items-center justify-center shadow-lg">
        <GraduationCap class="w-9 h-9 text-white drop-shadow" />
      </div>
      <h1 class="mt-3 text-xl font-bold tracking-wide">校园墙</h1>
      <p class="mt-1 text-[13px] text-white/85">让校园生活更有温度</p>
    </div>

    <div class="px-4 -mt-8 max-w-sm mx-auto">
      <!-- 表单卡片 -->
      <div class="glass rounded-[22px] px-6 pb-6 pt-10 space-y-4 shadow-[var(--shadow-lift)]">
        <div>
          <label for="login-student-id" class="block text-sm font-medium text-zinc-700 mb-1.5">学号</label>
          <input
            id="login-student-id"
            v-model="form.studentId"
            type="text"
            inputmode="numeric"
            autocomplete="username"
            aria-required="true"
            placeholder="请输入学号"
            class="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-zinc-900 placeholder-zinc-400"
            @keyup.enter="handleSubmit"
          />
        </div>

        <div>
          <label for="login-password" class="block text-sm font-medium text-zinc-700 mb-1.5">密码</label>
          <div class="relative">
            <input
              id="login-password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              aria-required="true"
              placeholder="请输入密码"
              class="w-full px-4 py-3 pr-11 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-zinc-900 placeholder-zinc-400"
              @keyup.enter="handleSubmit"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              :aria-pressed="showPassword"
              @click="showPassword = !showPassword"
            >
              <Eye v-if="showPassword" class="w-5 h-5" />
              <EyeOff v-else class="w-5 h-5" />
            </button>
          </div>
        </div>

        <button
          type="button"
          :disabled="loading"
          class="btn-grad w-full py-3 flex items-center justify-center gap-2 disabled:opacity-70"
          @click="handleSubmit"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? '登录中...' : '登录' }}
        </button>

        <button
          type="button"
          class="w-full text-center text-xs text-zinc-400 hover:text-zinc-600 transition"
          @click="showForgot = true"
        >
          忘记密码？
        </button>
      </div>

      <p class="text-center text-sm text-zinc-500 mt-5">
        没有账号？
        <router-link
          :to="{ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }"
          class="text-brand-500 font-medium hover:text-brand-600"
        >去注册</router-link>
      </p>
    </div>

    <!-- 忘记密码引导：本站无自助找回，唯一途径是管理员重置 -->
    <Teleport to="body">
      <div v-if="showForgot" class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" @click.self="showForgot = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6 animate-scale-in">
          <button class="absolute top-3 right-3 text-zinc-400 hover:text-zinc-600" @click="showForgot = false">
            <X class="w-5 h-5" />
          </button>
          <h3 class="text-lg font-semibold text-zinc-900 mb-2">忘记密码</h3>
          <div class="text-sm text-zinc-600 space-y-2 mb-4">
            <p>暂不支持自助找回密码，可通过以下方式重置：</p>
            <p>1. 请管理员在后台为你重置；</p>
            <p>2. 或携带学生证到 XX 处办理。</p>
          </div>
          <div class="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500 leading-relaxed">
            <p>管理员联系方式（占位，请替换为实际信息）：</p>
            <p>QQ / 微信：__________</p>
            <p>邮箱：admin@example.edu.cn</p>
          </div>
          <button
            class="mt-4 w-full py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-full text-sm font-medium transition"
            @click="showForgot = false"
          >
            我知道了
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

