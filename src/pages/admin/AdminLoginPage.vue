<script setup lang="ts">
/**
 * 管理员登录页：学号 + 密码，校验管理员角色
 */
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Shield, Eye, EyeOff, Loader2 } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/request'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const form = reactive({ studentId: '', password: '' })
const showPassword = ref(false)
const loading = ref(false)

async function handleSubmit() {
  if (!form.studentId.trim()) return toast.error('请输入学号')
  if (!form.password) return toast.error('请输入密码')
  if (loading.value) return
  loading.value = true
  try {
    await userStore.login(form.studentId.trim(), form.password)
    if (!userStore.isAdmin) {
      toast.error('无管理员权限')
      userStore.logout()
      return
    }
    toast.success('登录成功')
    const redirect = (route.query.redirect as string) || '/admin'
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
      <div class="text-center mb-8">
        <div class="w-20 h-20 mx-auto rounded-3xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 mb-4">
          <Shield class="w-11 h-11 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-zinc-900">校园墙管理后台</h1>
        <p class="text-sm text-zinc-400 mt-1">仅限管理员登录</p>
      </div>

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
      </div>

      <div class="mt-6 p-3 rounded-xl bg-brand-50/60 border border-brand-100 text-xs text-brand-700 text-center">
        默认管理员账号：admin / admin123
      </div>
      <p class="text-center text-sm text-zinc-500 mt-4">
        <router-link to="/" class="text-brand-600 font-medium hover:text-brand-700">返回前台</router-link>
      </p>
    </div>
  </div>
</template>

