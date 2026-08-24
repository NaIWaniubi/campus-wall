<script setup lang="ts">
/**
 * 数据总览：六项指标卡（可点击下钻到对应预置筛选页）
 * + 近7天三系列趋势（用户/帖子/评论 分色细条）
 * + 板块帖子分布 / 学院用户分布 横向百分比条形图
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { FileCheck, Flag, Users, FileText, UserPlus, CheckCircle } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import EmptyState from '@/components/EmptyState.vue'

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

// 三系列各自归一：以单日单系列最大值为高度基准，避免求和掩盖结构
const trendMax = computed(() =>
  Math.max(1, ...(stats.value?.trend || []).flatMap((d) => [d.users, d.posts, d.comments]))
)
const trendSeries = [
  { key: 'users' as const, label: '用户', barCls: 'bg-sky-400 hover:bg-sky-500' },
  { key: 'posts' as const, label: '帖子', barCls: 'bg-purple-400 hover:bg-purple-500' },
  { key: 'comments' as const, label: '评论', barCls: 'bg-emerald-400 hover:bg-emerald-500' },
]
function barHeight(v: number) {
  return Math.max(2, (v / trendMax.value) * 100) + '%'
}

// 后端 collegeDist 行键为 college（老数据兼容 name），统一归一为 {name,count}
const sectionDist = computed<DistItem[]>(() => stats.value?.sectionDist || [])
const collegeDist = computed<DistItem[]>(() =>
  (stats.value?.collegeDist || []).map((r) => ({ name: r.college ?? r.name ?? '-', count: r.count }))
)
function distWidth(v: number, list: DistItem[]) {
  const max = Math.max(1, ...list.map((d) => d.count))
  return Math.max(2, Math.round((v / max) * 100)) + '%'
}

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

    <!-- 近7天三系列趋势 -->
    <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-sm font-medium text-zinc-900">近7天趋势</h2>
        <div class="flex items-center gap-3 text-xs text-zinc-500">
          <span v-for="s in trendSeries" :key="s.key" class="flex items-center gap-1">
            <span class="w-2 h-2 rounded-sm" :class="s.barCls"></span>{{ s.label }}
          </span>
        </div>
      </div>
      <div v-if="loading" class="h-40 flex items-center justify-center text-sm text-zinc-400">加载中...</div>
      <template v-else>
        <div class="flex items-end gap-2 h-40">
          <div
            v-for="d in stats?.trend || []"
            :key="d.date"
            class="flex-1 h-full relative group flex flex-col justify-end"
          >
            <span class="absolute -top-5 text-xs text-zinc-500 opacity-0 group-hover:opacity-100 transition whitespace-nowrap left-1/2 -translate-x-1/2">
              {{ d.users }}/{{ d.posts }}/{{ d.comments }}
            </span>
            <div class="h-full flex items-end justify-center gap-[3px] pt-6">
              <div
                v-for="s in trendSeries"
                :key="s.key"
                class="flex-1 max-w-[8px] rounded-t transition-all"
                :class="s.barCls"
                :style="{ height: barHeight(d[s.key]) }"
              ></div>
            </div>
          </div>
        </div>
        <div class="flex gap-2 mt-1">
          <div v-for="d in stats?.trend || []" :key="'l' + d.date" class="flex-1 text-center text-xs text-zinc-400">
            {{ d.date.slice(5) }}
          </div>
        </div>
      </template>
    </div>

    <!-- 分布横条图：板块帖子 / 学院用户 -->
    <div class="grid md:grid-cols-2 gap-4">
      <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
        <h2 class="text-sm font-medium text-zinc-900 mb-4">板块帖子分布</h2>
        <div v-if="loading" class="py-8 text-center text-sm text-zinc-400">加载中...</div>
        <EmptyState v-else-if="!sectionDist.length" text="暂无数据" />
        <div v-else class="space-y-3">
          <div v-for="d in sectionDist" :key="d.name">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-zinc-600 truncate">{{ d.name }}</span>
              <span class="text-zinc-400 ml-2 shrink-0">{{ d.count }}</span>
            </div>
            <div class="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div class="h-full bg-brand-500 rounded-full" :style="{ width: distWidth(d.count, sectionDist) }"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-white rounded-xl p-4 md:p-6 border border-zinc-100 shadow-sm">
        <h2 class="text-sm font-medium text-zinc-900 mb-4">学院用户分布 Top10</h2>
        <div v-if="loading" class="py-8 text-center text-sm text-zinc-400">加载中...</div>
        <EmptyState v-else-if="!collegeDist.length" text="暂无数据" />
        <div v-else class="space-y-3">
          <div v-for="d in collegeDist" :key="d.name">
            <div class="flex items-center justify-between text-xs mb-1">
              <span class="text-zinc-600 truncate">{{ d.name }}</span>
              <span class="text-zinc-400 ml-2 shrink-0">{{ d.count }}</span>
            </div>
            <div class="h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div class="h-full bg-sky-500 rounded-full" :style="{ width: distWidth(d.count, collegeDist) }"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
