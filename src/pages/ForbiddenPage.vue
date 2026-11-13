<script setup lang="ts">
/**
 * 403 无权限 / 404 兜底页（V4：墨色贴纸 + 大字 + 明确出口）
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ShieldX, Home } from '@lucide/vue'

const router = useRouter()
const route = useRoute()
// 同一路由组件承载 403 与 404：/403 与命名路由是权限拦截，其余视为页面不存在
const is404 = computed(() => route.name === 'notFound')
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center px-4 py-16" style="background: var(--paper)">
    <div
      class="w-20 h-20 flex items-center justify-center mb-6"
      style="background: var(--coral); border: 1.5px solid var(--ink); border-radius: 22px; box-shadow: var(--shadow-hard)"
    >
      <ShieldX class="w-10 h-10" style="color: #F7F2E8" />
    </div>
    <span class="ds-sticker ds-sticker--sky">{{ is404 ? '404' : '403' }}</span>
    <h1 class="ds-display ds-display-lg mt-3 text-center" style="color: var(--ink)">
      {{ is404 ? '页面不存在' : '无权限访问' }}
    </h1>
    <p class="mt-2 text-[13px] text-center max-w-[300px] leading-relaxed" style="color: var(--ink-mute)">
      {{ is404 ? '链接可能过期或输错了地址，回首页重新找找' : '抱歉，您没有访问该页面的权限' }}
    </p>
    <button type="button" class="ds-btn ds-btn--primary mt-8 !px-7 !py-3" @click="router.replace('/')">
      <Home class="w-4 h-4" /> 返回首页
    </button>
  </div>
</template>
