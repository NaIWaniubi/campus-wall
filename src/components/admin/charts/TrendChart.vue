<script setup lang="ts">
/**
 * 近 N 天三系列趋势折线图（echarts 按需引入：core + Line + Grid/Tooltip/Legend）
 * 数据来自 adminApi.stats().trend（用户/帖子/评论）
 * V5：颜色跟随主题（echarts 画布不认 CSS 变量，所以按 light/dark 取调色板）
 */
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useThemeStore } from '@/stores/theme'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps<{
  trend: { date: string; users: number; posts: number; comments: number }[]
  loading?: boolean
}>()

const themeStore = useThemeStore()

/** 纸/墨两套画布调色板：轴线、文字用中性，系列用 V4 四色 */
const PALETTE = {
  light: { label: '#6E6659', axis: '#DED3BF', split: 'rgba(20,17,15,0.08)', users: '#0EA5C4', posts: '#6D3BF5', comments: '#FF4D2E' },
  dark: { label: '#9A9184', axis: '#3A342C', split: 'rgba(242,235,221,0.10)', users: '#38D6F5', posts: '#9B7BFF', comments: '#FF7A5C' },
} as const

const option = computed(() => {
  const p = PALETTE[themeStore.effective === 'dark' ? 'dark' : 'light']
  return {
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { fontSize: 11, color: p.label } },
    grid: { left: 8, right: 8, top: 16, bottom: 36, containLabel: true },
    xAxis: {
      type: 'category',
      data: props.trend.map((d) => d.date.slice(5)),
      axisLine: { lineStyle: { color: p.axis } },
      axisTick: { show: false },
      axisLabel: { color: p.label, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: p.split } },
      axisLabel: { color: p.label, fontSize: 11 },
    },
    series: [
      { name: '用户', type: 'line', smooth: true, symbolSize: 4, data: props.trend.map((d) => d.users), itemStyle: { color: p.users }, lineStyle: { width: 2 } },
      { name: '帖子', type: 'line', smooth: true, symbolSize: 4, data: props.trend.map((d) => d.posts), itemStyle: { color: p.posts }, lineStyle: { width: 2 } },
      { name: '评论', type: 'line', smooth: true, symbolSize: 4, data: props.trend.map((d) => d.comments), itemStyle: { color: p.comments }, lineStyle: { width: 2 } },
    ],
  }
})
</script>

<template>
  <div v-if="loading" class="h-48 flex items-center justify-center text-sm" style="color: var(--ink-mute)">加载中...</div>
  <VChart v-else class="h-48" :option="option" autoresize />
</template>
