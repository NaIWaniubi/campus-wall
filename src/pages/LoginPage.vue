<script setup lang="ts">
/**
 * 登录页：学号 + 密码登录
 */
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Eye, EyeOff, GraduationCap, Loader2, X } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/request'

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
    const redirect = (route.query.redirect as string) || '/'
    router.replace(redirect)
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 py-8">
    <div class="w-full max-w-sm">
      <!-- Logo + 标题 -->
      <div class="text-center mb-8">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 mb-4">
          <GraduationCap class="w-11 h-11 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-zinc-900">校园墙</h1>
        <p class="text-sm text-zinc-400 mt-1">让校园生活更有温度</p>
      </div>

      <!-- 表单卡片 -->
      <div class="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">学号</label>
          <input
            v-model="form.studentId"
            type="text"
            placeholder="请输入学号"
            class="w-full px-4 py-3 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-zinc-900 placeholder-zinc-400"
            @keyup.enter="handleSubmit"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">密码</label>
          <div class="relative">
            <input
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="请输入密码"
              class="w-full px-4 py-3 pr-11 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition text-zinc-900 placeholder-zinc-400"
              @keyup.enter="handleSubmit"
            />
            <button
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
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
          class="w-full py-3 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-300 text-white rounded-full font-medium transition flex items-center justify-center gap-2"
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

      <p class="text-center text-sm text-zinc-500 mt-6">
        没有账号？
        <router-link
          :to="{ path: '/register', query: route.query.redirect ? { redirect: route.query.redirect } : {} }"
          class="text-brand-600 font-medium hover:text-brand-700"
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

