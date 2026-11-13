<script setup lang="ts">
/**
 * 注册页：账号（手机号/拼音/邮箱前缀均可）、密码、昵称、学院（选填）、年级（选填）
 */
import { ref, reactive, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ArrowLeft, Eye, EyeOff, Loader2 } from '@lucide/vue'
import { useUserStore } from '@/stores/user'
import { toast, safeRedirect } from '@/utils/request'

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

const ACCOUNT_RE = /^[A-Za-z0-9_.@-]{3,32}$/
const PASSWORD_OK = (v: string) => v.length >= 6 && /[A-Za-z]/.test(v) && /[0-9]/.test(v)

const errors = computed(() => ({
  studentId:
    form.studentId && !ACCOUNT_RE.test(form.studentId)
      ? '账号 3-32 位，可用字母、数字、下划线、点、中划线或 @'
      : '',
  password: form.password && !PASSWORD_OK(form.password) ? '密码至少 6 位，且包含字母和数字' : '',
  confirmPassword: form.confirmPassword && form.confirmPassword !== form.password ? '两次密码不一致' : '',
  nickname: form.nickname && form.nickname.trim().length < 1 ? '请输入昵称' : '',
}))

const canSubmit = computed(() =>
  ACCOUNT_RE.test(form.studentId) &&
  PASSWORD_OK(form.password) &&
  form.confirmPassword === form.password &&
  form.nickname.trim().length >= 1 &&
  form.agreement
)

function showAgreement() {
  toast.info('用户协议与隐私政策正在完善中')
}

async function handleSubmit() {
  if (!canSubmit.value) {
    // 逐项指出不满足的字段（先必填校验，再选填 + 协议）
    const missing: string[] = []
    if (!ACCOUNT_RE.test(form.studentId)) missing.push('账号（3-32 位字母/数字/下划线）')
    if (!PASSWORD_OK(form.password)) missing.push('密码（至少 6 位且含字母和数字）')
    if (form.confirmPassword !== form.password) missing.push('两次密码不一致')
    if (form.nickname.trim().length < 1) missing.push('昵称')
    if (!form.agreement) missing.push('同意用户协议')
    toast.error(missing.length ? `请检查：${missing.join('、')}` : '请检查表单填写')
    return
  }
  if (loading.value) return
  loading.value = true
  try {
    await userStore.register({
      account: form.studentId.trim(),
      password: form.password,
      nickname: form.nickname.trim(),
      college: form.college.trim() || undefined,
      grade: form.grade.trim() || undefined,
    })
    toast.success('注册成功，已自动登录')
    // 回到登录前想去的页面，不再固定落首页
    router.replace(safeRedirect(route.query.redirect, '/'))
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen pb-24">
    <!-- V4 海报头：墨色画布 + 贴纸 + 大字标题（与登录页同一套 hero） -->
    <header class="hero px-5 pt-6 pb-7 rounded-b-[20px]">
      <div class="flex items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <span class="ds-sticker ds-sticker--coral shrink-0">JOIN</span>
          <span class="ds-label text-white/45 truncate">本校 · 账号注册</span>
        </div>
        <button
          class="ds-icon-btn shrink-0"
          style="width:34px;height:34px;background:rgb(255 255 255 / 0.1);border-color:rgb(255 255 255 / 0.32);color:rgb(255 255 255);box-shadow:none"
          aria-label="返回" @click="router.back()"
        >
          <ArrowLeft class="w-4 h-4" />
        </button>
      </div>
      <h1 class="ds-display ds-display-lg mt-2 text-white">加入校园墙</h1>
      <p class="mt-1 text-[13px] text-white/60">不用学号也能注册，手机号 / 拼音 / 邮箱前缀都行</p>
    </header>

    <main class="max-w-[520px] mx-auto px-3 mt-3 space-y-3">
      <!-- 白卡表单 -->
      <section class="ds-card p-4 sm:p-5 space-y-4">
        <div>
          <label for="reg-student-id" class="ds-label block mb-1.5">账号 <span style="color: var(--coral)">*</span></label>
          <input id="reg-student-id" aria-required="true" v-model="form.studentId" autocomplete="username" type="text" maxlength="32" placeholder="手机号 / 拼音 / 邮箱前缀"
            class="ds-input" />
          <p class="mt-1.5 text-[11.5px] leading-relaxed" style="color: var(--ink-mute)">
            3-32 位，可用字母、数字、下划线、点、中划线或 @；注册后不可修改，请记牢
          </p>
          <p v-if="errors.studentId" class="mt-1.5 text-[12px] font-bold" style="color: var(--coral)">{{ errors.studentId }}</p>
        </div>

        <div>
          <label for="reg-password" class="ds-label block mb-1.5">密码 <span style="color: var(--coral)">*</span></label>
          <div class="relative">
            <input id="reg-password" aria-required="true" v-model="form.password" autocomplete="new-password" :type="showPassword ? 'text' : 'password'" placeholder="至少 6 位，含字母和数字"
              class="ds-input !pr-11"
              @keyup.enter="handleSubmit" />
            <button type="button" class="absolute right-2 top-1/2 -translate-y-1/2 p-1.5"
              style="color: var(--ink-mute)"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'" :aria-pressed="showPassword"
              @click="showPassword = !showPassword">
              <Eye v-if="showPassword" class="w-5 h-5" />
              <EyeOff v-else class="w-5 h-5" />
            </button>
          </div>
          <!-- 密码强度提示：纯展示，判定阈值与脚本 canSubmit 一致（6 位） -->
          <div class="mt-1.5 flex flex-wrap items-center gap-2">
            <span class="ds-tag">
              <span
                class="ds-tag-dot"
                :style="{ background: form.password.length >= 10 ? 'var(--lime)' : (form.password.length >= 6 ? 'var(--sky)' : 'var(--coral)') }"
              ></span>
              {{ form.password.length === 0 ? '密码强度 待输入' : (form.password.length >= 10 ? '密码强度 强' : (form.password.length >= 6 ? '密码强度 中' : '密码强度 弱')) }}
            </span>
          </div>
          <p v-if="errors.password" class="mt-1.5 text-[12px] font-bold" style="color: var(--coral)">{{ errors.password }}</p>
        </div>

        <div>
          <label for="reg-confirm" class="ds-label block mb-1.5">确认密码 <span style="color: var(--coral)">*</span></label>
          <input id="reg-confirm" aria-required="true" v-model="form.confirmPassword" autocomplete="new-password" type="password" placeholder="再次输入密码"
            class="ds-input"
            @keyup.enter="handleSubmit" />
          <p v-if="errors.confirmPassword" class="mt-1.5 text-[12px] font-bold" style="color: var(--coral)">{{ errors.confirmPassword }}</p>
        </div>

        <div>
          <label for="reg-nickname" class="ds-label block mb-1.5">昵称 <span style="color: var(--coral)">*</span></label>
          <input id="reg-nickname" aria-required="true" v-model="form.nickname" autocomplete="nickname" type="text" maxlength="20" placeholder="给自己起个名字"
            class="ds-input" />
          <p v-if="errors.nickname" class="mt-1.5 text-[12px] font-bold" style="color: var(--coral)">{{ errors.nickname }}</p>
        </div>

        <div>
          <label for="reg-college" class="ds-label block mb-1.5">学院 <span class="font-normal" style="color: var(--ink-mute)">（选填）</span></label>
          <input id="reg-college" v-model="form.college" autocomplete="organization" type="text" maxlength="50" placeholder="如：计算机学院"
            class="ds-input" />
        </div>

        <div>
          <label for="reg-grade" class="ds-label block mb-1.5">年级 <span class="font-normal" style="color: var(--ink-mute)">（选填）</span></label>
          <input id="reg-grade" v-model="form.grade" autocomplete="off" type="text" maxlength="20" placeholder="如：2023级"
            class="ds-input" />
        </div>

        <div class="ds-hairline"></div>

        <label class="flex items-start gap-2 cursor-pointer" style="color: var(--ink-soft)">
          <input v-model="form.agreement" type="checkbox" class="mt-0.5 w-4 h-4 shrink-0" style="accent-color: var(--coral)" />
          <span class="text-[12.5px] leading-relaxed">我已阅读并同意 <a class="cursor-pointer font-bold underline underline-offset-2" style="color: var(--violet)" @click.prevent="showAgreement">《用户协议》</a> 和 <a class="cursor-pointer font-bold underline underline-offset-2" style="color: var(--violet)" @click.prevent="showAgreement">《隐私政策》</a></span>
        </label>

        <button
          type="button"
          class="ds-btn ds-btn--primary w-full !py-3"
          :disabled="loading"
          @click="handleSubmit"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? '注册中...' : '注册' }}
        </button>
      </section>

      <p class="text-center text-[13px] pt-1" style="color: var(--ink-mute)">
        已有账号？
        <router-link to="/login" class="font-bold underline underline-offset-2" style="color: var(--violet)">去登录</router-link>
      </p>
    </main>
  </div>
</template>

