<script setup lang="ts">
/**
 * 数据总览：六项指标卡（待审内容/待处理举报/用户总数/帖子总数/今日新增/审核通过率）
 * + 近7天趋势（简易占位图，后续可替换为图表库）
 */
import { ref, computed, onMounted } from 'vue'
import { FileCheck, Flag, Users, FileText, UserPlus, CheckCircle } from '@lucide/vue'
import { adminApi } from '@/utils/api'

interface StatsCards {
  pendingPosts: number
  pendingReports: number
  totalUsers: number
  totalPosts: number
  todayUsers: number
  todayPosts: number
  todayComments: number
  auditPassRate: number
}
interface TrendDay {
  date: string
  users: number
  posts: number
  comments: number
}
interface StatsData {
  cards: StatsCards
  trend: TrendDay[]
}

const stats = ref<StatsData | null>(null)
const loading = ref(true)

const cards = computed(() => {
  const c = stats.value?.cards
  return [
    { label: '待审内容', value: c?.pendingPosts ?? 0, icon: FileCheck, color: 'text-amber-600 bg-amber-50' },
    { label: '待处理举报', value: c?.pendingReports ?? 0, icon: Flag, color: 'text-red-600 bg-red-50' },
    { label: '用户总数', value: c?.totalUsers ?? 0, icon: Users, color: 'text-brand-600 bg-brand-50' },
    { label: '帖子总数', value: c?.totalPosts ?? 0, icon: FileText, color: 'text-purple-600 bg-purple-50' },
    {
      label: '今日新增',
      value: (c?.todayUsers ?? 0) + (c?.todayPosts ?? 0) + (c?.todayComments ?? 0),
      icon: UserPlus,
      color: 'text-blue-600 bg-blue-50',
    },
    { label: '审核通过率', value: (c?.auditPassRate ?? 0) + '%', icon: CheckCircle, color: 'text-emerald-600 bg-emerald-50' },
  ]
})

const trendMax = computed(() =>
  Math.max(1, ...(stats.value?.trend || []).map((d) => d.users + d.posts + d.comments))
)

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.stats()
    stats.value = res.data
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <!-- 指标卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <div
        v-for="card in cards"
        :key="card.label"
        class="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs text-zinc-500">{{ card.label }}</span>
          <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="card.color">
            <component :is="card.icon" class="w-4 h-4" />
          </div>
        </div>
        <div class="text-2xl font-bold text-zinc-900">{{ card.value }}</div>
      </div>
    </div>

    <!-- 近7天趋势（简易占位） -->
    <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-medium text-zinc-900">近7天趋势</h2>
        <span class="text-xs text-zinc-400">用户 / 帖子 / 评论</span>
      </div>
      <div v-if="loading" class="h-40 flex items-center justify-center text-sm text-zinc-400">加载中...</div>
      <template v-else>
        <div class="flex items-end gap-2 h-40">
          <div
            v-for="d in stats?.trend || []"
            :key="d.date"
            class="flex-1 flex flex-col items-center justify-end h-full relative group"
          >
            <span class="absolute -top-5 text-xs text-zinc-500 opacity-0 group-hover:opacity-100 transition whitespace-nowrap">
              {{ d.users }}/{{ d.posts }}/{{ d.comments }}
            </span>
            <div
              class="w-full max-w-[28px] mx-auto bg-brand-500 rounded-t hover:bg-brand-600 transition-all"
              :style="{ height: Math.max(2, ((d.users + d.posts + d.comments) / trendMax) * 100) + '%' }"
            ></div>
          </div>
        </div>
        <div class="flex gap-2 mt-1">
          <div v-for="d in stats?.trend || []" :key="'l' + d.date" class="flex-1 text-center text-xs text-zinc-400">
            {{ d.date.slice(5) }}
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
