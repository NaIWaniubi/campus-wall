<script setup lang="ts">
/**
 * 近 N 天三系列趋势折线图（echarts 按需引入：core + Line + Grid/Tooltip/Legend）
 * 数据来自 adminApi.stats().trend（用户/帖子/评论）
 */
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent, LegendComponent])

const props = defineProps<{
  trend: { date: string; users: number; posts: number; comments: number }[]
  loading?: boolean
}>()

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { bottom: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { fontSize: 11, color: '#71717a' } },
  grid: { left: 8, right: 8, top: 16, bottom: 36, containLabel: true },
  xAxis: {
    type: 'category',
    data: props.trend.map((d) => d.date.slice(5)),
    axisLine: { lineStyle: { color: '#d4d4d8' } },
    axisTick: { show: false },
    axisLabel: { color: '#a1a1aa', fontSize: 11 },
  },
  yAxis: {
    type: 'value',
    minInterval: 1,
    splitLine: { lineStyle: { color: '#f4f4f5' } },
    axisLabel: { color: '#a1a1aa', fontSize: 11 },
  },
  series: [
    { name: '用户', type: 'line', smooth: true, symbolSize: 4, data: props.trend.map((d) => d.users), itemStyle: { color: '#38bdf8' }, lineStyle: { width: 2 } },
    { name: '帖子', type: 'line', smooth: true, symbolSize: 4, data: props.trend.map((d) => d.posts), itemStyle: { color: '#a78bfa' }, lineStyle: { width: 2 } },
    { name: '评论', type: 'line', smooth: true, symbolSize: 4, data: props.trend.map((d) => d.comments), itemStyle: { color: '#C026D3' }, lineStyle: { width: 2 } },
  ],
}))
</script>

<template>
  <div v-if="loading" class="h-48 flex items-center justify-center text-sm text-zinc-400">加载中...</div>
  <VChart v-else class="h-48" :option="option" autoresize />
</template>
