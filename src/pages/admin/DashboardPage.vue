<script setup lang="ts">
/**
 * 数据总览：六项指标卡（可点击下钻到对应预置筛选页）
 * + 近7天三系列趋势折线图（echarts）
 * + 板块帖子分布 / 学院用户分布 横向条形图（echarts）
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { FileCheck, Flag, Users, FileText, UserPlus, CheckCircle } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import TrendChart from '@/components/admin/charts/TrendChart.vue'
import DistBarChart from '@/components/admin/charts/DistBarChart.vue'

const router = useRouter()

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
interface DistItem {
  name: string
  count: number
}
interface StatsData {
  cards: StatsCards
  trend: TrendDay[]
  sectionDist: DistItem[]
  collegeDist: { college?: string; name?: string; count: number }[]
}

const stats = ref<StatsData | null>(null)
const loading = ref(true)

// 卡片下钻目标：与 ContentPage(?tab=) / ReportsPage(?status=) 的 query 初始化约定对齐
const cards = computed(() => {
  const c = stats.value?.cards
  return [
    {
      label: '待审内容',
      value: c?.pendingPosts ?? 0,
      icon: FileCheck,
      color: 'text-amber-600 bg-amber-50',
      to: { path: '/admin/posts', query: { tab: 'pending_review' } },
    },
    {
      label: '待处理举报',
      value: c?.pendingReports ?? 0,
      icon: Flag,
      color: 'text-red-600 bg-red-50',
      to: { path: '/admin/reports', query: { status: 'pending' } },
    },
    {
      label: '用户总数',
      value: c?.totalUsers ?? 0,
      icon: Users,
      color: 'text-brand-600 bg-brand-50',
      to: { path: '/admin/users' },
    },
    {
      label: '帖子总数',
      value: c?.totalPosts ?? 0,
      icon: FileText,
      color: 'text-purple-600 bg-purple-50',
      to: { path: '/admin/posts' },
    },
    {
      label: '今日新增',
      value: (c?.todayUsers ?? 0) + (c?.todayPosts ?? 0) + (c?.todayComments ?? 0),
      icon: UserPlus,
      color: 'text-blue-600 bg-blue-50',
      to: { path: '/admin/users' },
    },
    {
      label: '审核通过率',
      value: (c?.auditPassRate ?? 0) + '%',
      icon: CheckCircle,
      color: 'text-emerald-600 bg-emerald-50',
      to: { path: '/admin/posts', query: { tab: 'published' } },
    },
  ]
})

function goCard(card: { to?: any }) {
  if (card.to) router.push(card.to)
}

// 后端 collegeDist 行键为 college（老数据兼容 name），统一归一为 {name,count}
const sectionDist = computed<DistItem[]>(() => stats.value?.sectionDist || [])
const collegeDist = computed<DistItem[]>(() =>
  (stats.value?.collegeDist || []).map((r) => ({ name: r.college ?? r.name ?? '-', count: r.count }))
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
    <!-- 指标卡片（点击下钻） -->
    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <div
        v-for="card in cards"
        :key="card.label"
        class="bg-white rounded-xl p-4 border border-zinc-100 shadow-sm cursor-pointer transition hover:border-brand-200 hover:shadow-md"
        @click="goCard(card)"
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

    <!-- 近7天三系列趋势（echarts 折线） -->
    <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
      <h2 class="text-sm font-medium text-zinc-900 mb-4">近7天趋势</h2>
      <TrendChart :trend="stats?.trend || []" :loading="loading" />
    </div>

    <!-- 分布横条图（echarts）：板块帖子 / 学院用户 -->
    <div class="grid md:grid-cols-2 gap-4">
      <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
        <h2 class="text-sm font-medium text-zinc-900 mb-4">板块帖子分布</h2>
        <DistBarChart :data="sectionDist" color="#8b5cf6" :loading="loading" />
      </div>

      <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
        <h2 class="text-sm font-medium text-zinc-900 mb-4">学院用户分布 Top10</h2>
        <DistBarChart :data="collegeDist" color="#38bdf8" :loading="loading" />
      </div>
    </div>
  </div>
</template>
