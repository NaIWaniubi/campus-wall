<script setup lang="ts">
/**
 * 数据总览：六项指标卡（可点击下钻到对应预置筛选页）
 * + 近7天三系列趋势折线图（echarts）
 * + 板块帖子分布 / 学院用户分布 横向条形图（echarts）
 * V4：纸感控制台 —— ds-card 指标卡 + 编号章节头 + 四色调色板
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
interface Growth {
  registered: number
  activeToday: number
  active7d: number
  postsTotal: number
  tradesCompleted: number
  activationRate: number
}
interface StatsData {
  cards: StatsCards
  trend: TrendDay[]
  sectionDist: DistItem[]
  collegeDist: { college?: string; name?: string; count: number }[]
  growth?: Growth
  auditLatencyHours?: number | null
}

const stats = ref<StatsData | null>(null)
const loading = ref(true)

// V4 四色：荧光块（底 + 字），语义 —— 待办用珊瑚、增长用天蓝、总量用紫、通过用墨底荧光
const TONES = {
  coral: { background: 'var(--coral)', color: '#FFFFFF' },
  sky: { background: 'var(--sky)', color: 'var(--ink)' },
  violet: { background: 'var(--violet)', color: '#FFFFFF' },
  lime: { background: 'var(--lime)', color: 'var(--ink)' },
  ink: { background: 'var(--ink)', color: 'var(--lime)' },
} as const
type Tone = keyof typeof TONES

// 卡片下钻目标：与 ContentPage(?tab=) / ReportsPage(?status=) 的 query 初始化约定对齐
const cards = computed(() => {
  const c = stats.value?.cards
  return [
    {
      label: '待审内容',
      value: c?.pendingPosts ?? 0,
      icon: FileCheck,
      tone: 'coral' as Tone,
      to: { path: '/admin/posts', query: { tab: 'pending_review' } },
    },
    {
      label: '待处理举报',
      value: c?.pendingReports ?? 0,
      icon: Flag,
      tone: 'coral' as Tone,
      to: { path: '/admin/reports', query: { status: 'pending' } },
    },
    {
      label: '用户总数',
      value: c?.totalUsers ?? 0,
      icon: Users,
      tone: 'sky' as Tone,
      to: { path: '/admin/users' },
    },
    {
      label: '帖子总数',
      value: c?.totalPosts ?? 0,
      icon: FileText,
      tone: 'violet' as Tone,
      to: { path: '/admin/posts' },
    },
    {
      label: '今日新增',
      value: (c?.todayUsers ?? 0) + (c?.todayPosts ?? 0) + (c?.todayComments ?? 0),
      icon: UserPlus,
      tone: 'lime' as Tone,
      to: { path: '/admin/users' },
    },
    {
      label: '审核通过率',
      value: (c?.auditPassRate ?? 0) + '%',
      icon: CheckCircle,
      tone: 'ink' as Tone,
      to: { path: '/admin/posts', query: { tab: 'published' } },
    },
  ]
})

/**
 * 增长指标（评委看「实效验证」时最先问的数字）：
 * 注册 / 今日活跃 / 7 日活跃 / 激活率 / 成交数 / 审核时效
 */
const growthCards = computed(() => {
  const g = stats.value?.growth
  const latency = stats.value?.auditLatencyHours
  return [
    { label: '今日活跃', value: g?.activeToday ?? 0, hint: '有行为事件的用户' },
    { label: '7 日活跃', value: g?.active7d ?? 0, hint: '近 7 天有行为' },
    { label: '激活率', value: `${Math.round((g?.activationRate ?? 0) * 100)}%`, hint: '注册后发布过内容' },
    { label: '成交闭环', value: g?.tradesCompleted ?? 0, hint: '已标记完成的二手交易' },
    { label: '审核时效', value: latency != null ? `${latency}h` : '—', hint: '提交→过审平均耗时' },
    { label: '注册用户', value: g?.registered ?? 0, hint: '不含管理员' },
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
    <!-- 01 指标卡片（点击下钻） -->
    <section>
      <div class="ds-section-head mb-3">
        <span class="ds-section-head__num">01</span>
        <h2 class="ds-title">治理看板</h2>
        <span class="ds-section-head__line"></span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <button
          v-for="card in cards"
          :key="card.label"
          type="button"
          class="ds-card ds-card--hover p-4 text-left transition active:translate-x-[2px] active:translate-y-[2px]"
          @click="goCard(card)"
        >
          <div class="flex items-center justify-between mb-2">
            <span class="ds-label" style="color: var(--ink-mute)">{{ card.label }}</span>
            <span
              class="w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0"
              :style="TONES[card.tone]"
            >
              <component :is="card.icon" class="w-4 h-4" />
            </span>
          </div>
          <div class="ds-display ds-num text-[26px] leading-none" style="color: var(--ink)">{{ card.value }}</div>
        </button>
      </div>
    </section>

    <!-- 02 增长与转化（答辩时最先被问的数字） -->
    <section class="ds-card p-4 md:p-5">
      <div class="ds-section-head mb-3">
        <span class="ds-section-head__num">02</span>
        <h2 class="ds-title">增长与转化</h2>
        <span class="ds-section-head__line"></span>
        <span class="ds-tag shrink-0"><span class="ds-tag-dot" style="background: var(--sky)"></span>行为埋点实测</span>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div v-for="g in growthCards" :key="g.label" class="p-3" style="background: var(--color-surface); border: 1px solid var(--hairline); border-radius: 12px">
          <div class="ds-label" style="color: var(--ink-mute)">{{ g.label }}</div>
          <div class="ds-display ds-num text-[22px] mt-1 leading-none" style="color: var(--ink)">{{ g.value }}</div>
          <div class="text-[11px] mt-1" style="color: var(--ink-mute)">{{ g.hint }}</div>
        </div>
      </div>
    </section>

    <!-- 03 近7天三系列趋势（echarts 折线） -->
    <section class="ds-card p-4 md:p-5">
      <div class="ds-section-head mb-4">
        <span class="ds-section-head__num">03</span>
        <h2 class="ds-title">近 7 天趋势</h2>
        <span class="ds-section-head__line"></span>
      </div>
      <TrendChart :trend="stats?.trend || []" :loading="loading" />
    </section>

    <!-- 04 分布横条图（echarts）：板块帖子 / 学院用户 -->
    <div class="grid md:grid-cols-2 gap-4">
      <section class="ds-card p-4 md:p-5">
        <div class="ds-section-head mb-4">
          <span class="ds-section-head__num">04</span>
          <h2 class="ds-title">板块帖子分布</h2>
          <span class="ds-section-head__line"></span>
        </div>
        <DistBarChart :data="sectionDist" color="#6D3BF5" :loading="loading" />
      </section>

      <section class="ds-card p-4 md:p-5">
        <div class="ds-section-head mb-4">
          <span class="ds-section-head__num">05</span>
          <h2 class="ds-title">学院用户分布 Top10</h2>
          <span class="ds-section-head__line"></span>
        </div>
        <DistBarChart :data="collegeDist" color="#38D6F5" :loading="loading" />
      </section>
    </div>
  </div>
</template>
