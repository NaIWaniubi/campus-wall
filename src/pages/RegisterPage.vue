<script setup lang="ts">
/**
 * 注册页：学号、密码、昵称、学院、年级
 */
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Eye, EyeOff, Loader2, GraduationCap } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/request'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const form = reactive({
  studentId: '',
  password: '',
  confirmPassword: '',
  nickname: '',
  college: '',
  grade: '',
  agreement: false,
})
const showPassword = ref(false)
const loading = ref(false)

const errors = computed(() => ({
  studentId: form.studentId && !/^\d{6,12}$/.test(form.studentId) ? '学号为6-12位数字' : '',
  password: form.password && form.password.length < 6 ? '密码至少6位' : '',
  confirmPassword: form.confirmPassword && form.confirmPassword !== form.password ? '两次密码不一致' : '',
  nickname: form.nickname && form.nickname.trim().length < 1 ? '请输入昵称' : '',
}))

const canSubmit = computed(() =>
  /^\d{6,12}$/.test(form.studentId) &&
  form.password.length >= 6 &&
  form.confirmPassword === form.password &&
  form.nickname.trim().length >= 1 &&
  form.agreement
)

async function handleSubmit() {
  if (!canSubmit.value) {
    if (!form.agreement) toast.error('请先同意用户协议')
    else toast.error('请检查表单填写')
    return
  }
  if (loading.value) return
  loading.value = true
  try {
    await userStore.register({
      studentId: form.studentId,
      password: form.password,
      nickname: form.nickname.trim(),
      college: form.college.trim() || undefined,
      grade: form.grade.trim() || undefined,
    })
    toast.success('注册成功，已自动登录')
    // 回到登录前想去的页面，不再固定落首页
    router.replace((route.query.redirect as string) || '/')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-brand-50 to-white">
    <!-- 顶部返回栏 -->
    <div class="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-medium text-zinc-900">注册账号</span>
      </div>
    </div>

    <div class="max-w-[960px] mx-auto px-4 py-6">
      <div class="text-center mb-6">
        <div class="w-16 h-16 mx-auto rounded-2xl bg-brand-500 flex items-center justify-center shadow-lg shadow-brand-500/30 mb-3">
          <GraduationCap class="w-9 h-9 text-white" />
        </div>
        <h1 class="text-xl font-bold text-zinc-900">加入校园墙</h1>
      </div>

      <div class="bg-white rounded-2xl shadow-sm p-5 space-y-4">
        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">学号 <span class="text-red-500">*</span></label>
          <input v-model="form.studentId" type="text" inputmode="numeric" maxlength="12" placeholder="6-12位数字"
            class="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition" />
          <p v-if="errors.studentId" class="text-xs text-red-500 mt-1">{{ errors.studentId }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">密码 <span class="text-red-500">*</span></label>
          <div class="relative">
            <input v-model="form.password" :type="showPassword ? 'text' : 'password'" placeholder="至少6位"
              class="w-full px-4 py-2.5 pr-11 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
              @keyup.enter="handleSubmit" />
            <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600" @click="showPassword = !showPassword">
              <Eye v-if="showPassword" class="w-5 h-5" />
              <EyeOff v-else class="w-5 h-5" />
            </button>
          </div>
          <p v-if="errors.password" class="text-xs text-red-500 mt-1">{{ errors.password }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">确认密码 <span class="text-red-500">*</span></label>
          <input v-model="form.confirmPassword" type="password" placeholder="再次输入密码"
            class="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition"
            @keyup.enter="handleSubmit" />
          <p v-if="errors.confirmPassword" class="text-xs text-red-500 mt-1">{{ errors.confirmPassword }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">昵称 <span class="text-red-500">*</span></label>
          <input v-model="form.nickname" type="text" maxlength="20" placeholder="给自己起个名字"
            class="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition" />
          <p v-if="errors.nickname" class="text-xs text-red-500 mt-1">{{ errors.nickname }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">学院</label>
          <input v-model="form.college" type="text" maxlength="50" placeholder="如：计算机学院"
            class="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition" />
        </div>

        <div>
          <label class="block text-sm font-medium text-zinc-700 mb-1.5">年级</label>
          <input v-model="form.grade" type="text" maxlength="20" placeholder="如：2023级"
            class="w-full px-4 py-2.5 rounded-xl bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition" />
        </div>

        <label class="flex items-start gap-2 text-sm text-zinc-600 cursor-pointer">
          <input v-model="form.agreement" type="checkbox" class="mt-0.5 w-4 h-4 rounded accent-brand-500" />
          <span>我已阅读并同意 <a class="text-brand-600">《用户协议》</a> 和 <a class="text-brand-600">《隐私政策》</a></span>
        </label>

        <button type="button" :disabled="loading || !canSubmit"
          class="w-full py-3 bg-brand-500 hover:bg-brand-600 active:bg-brand-700 disabled:bg-brand-300 text-white rounded-full font-medium transition flex items-center justify-center gap-2"
          @click="handleSubmit">
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? '注册中...' : '注册' }}
        </button>
      </div>

      <p class="text-center text-sm text-zinc-500 mt-6">
        已有账号？
        <router-link to="/login" class="text-brand-600 font-medium hover:text-brand-700">去登录</router-link>
      </p>
    </div>
  </div>
</template>

