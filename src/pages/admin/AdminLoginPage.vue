<script setup lang="ts">
/**
 * 管理员登录页：账号 + 密码，校验管理员角色
 * V4：墨色海报头 + 白纸卡；账号文案与前台统一（不再叫学号）
 */
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Shield, Eye, EyeOff, Loader2 } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { toast, safeRedirect } from '@/utils/request'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const form = reactive({ studentId: '', password: '' })
const showPassword = ref(false)
const loading = ref(false)

async function handleSubmit() {
  if (!form.studentId.trim()) return toast.error('请输入管理员账号')
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
    const redirect = safeRedirect(route.query.redirect, '/admin')
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
    <!-- 墨色海报头 -->
    <header class="hero px-5 pt-9 pb-12 rounded-b-[24px] text-center">
      <div class="flex items-center justify-center gap-2">
        <span class="ds-sticker ds-sticker--coral">ADMIN</span>
        <span class="ds-label" style="color: rgb(247 242 232 / 0.5)">仅限管理员</span>
      </div>
      <h1 class="ds-display ds-display-xl mt-3 text-white flex items-center justify-center gap-2.5">
        <span class="w-8 h-8 rounded-[10px] inline-flex items-center justify-center shrink-0" style="background: var(--lime)">
          <Shield class="w-5 h-5" style="color: var(--ink)" />
        </span>
        管理后台
      </h1>
      <p class="mt-2 text-[13px]" style="color: rgb(247 242 232 / 0.65)">内容治理 · 用户管理 · 数据总览</p>
    </header>

    <div class="px-4 mt-3 max-w-sm mx-auto space-y-3">
      <section class="ds-card p-5 space-y-4">
        <div>
          <label for="admin-account" class="ds-label block mb-1.5">管理员账号</label>
          <input
            id="admin-account"
            v-model="form.studentId"
            type="text"
            autocomplete="username"
            placeholder="请输入管理员账号"
            class="ds-input"
            @keyup.enter="handleSubmit"
          />
        </div>

        <div>
          <label for="admin-password" class="ds-label block mb-1.5">密码</label>
          <div class="relative">
            <input
              id="admin-password"
              v-model="form.password"
              :type="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入密码"
              class="ds-input !pr-11"
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
        </div>

        <button
          type="button"
          :disabled="loading"
          class="ds-btn ds-btn--primary w-full !py-3.5"
          @click="handleSubmit"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </section>

      <section class="ds-card ds-card--flat px-4 py-3 text-[12px] leading-relaxed" style="color: var(--ink-mute)">
        默认账号见 README（超管 23770001 / 密码 admin123）
      </section>

      <p class="text-center text-[13px] pt-1">
        <router-link to="/" class="font-bold underline underline-offset-2" style="color: var(--violet)">返回前台</router-link>
      </p>
    </div>
  </div>
</template>
