<script setup lang="ts">
/**
 * 横向条形分布图（板块帖子分布 / 学院用户分布共用）
 * echarts 按需引入：core + Bar + Grid/Tooltip；条数即高度，容器随数据自适应
 * V5：文字/数值颜色跟随主题（画布不认 CSS 变量）
 */
import { computed } from 'vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { useThemeStore } from '@/stores/theme'

use([CanvasRenderer, BarChart, GridComponent, TooltipComponent])

const props = withDefaults(
  defineProps<{
    data: { name: string; count: number }[]
    color?: string
    loading?: boolean
  }>(),
  { color: '#6D3BF5' },
)

const themeStore = useThemeStore()

const option = computed(() => {
  const dark = themeStore.effective === 'dark'
  const label = dark ? '#9A9184' : '#6E6659'
  const value = dark ? '#F2EBDD' : '#14110F'
  // 横条 y 轴自下而上渲染：升序排列让最大值在顶部
  const rows = [...props.data].sort((a, b) => a.count - b.count)
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 8, right: 32, top: 8, bottom: 8, containLabel: true },
    xAxis: { type: 'value', minInterval: 1, splitLine: { show: false }, axisLabel: { show: false } },
    yAxis: {
      type: 'category',
      data: rows.map((d) => d.name),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: label, fontSize: 11, width: 92, overflow: 'truncate' },
    },
    series: [
      {
        type: 'bar',
        data: rows.map((d) => d.count),
        barMaxWidth: 10,
        itemStyle: { color: props.color, borderRadius: [0, 5, 5, 0] },
        label: { show: true, position: 'right', color: value, fontSize: 11, fontWeight: 700 },
      },
    ],
  }
})

const height = computed(() => Math.max(120, props.data.length * 32 + 24) + 'px')
</script>

<template>
  <div v-if="loading" class="py-8 text-center text-sm" style="color: var(--ink-mute)">加载中...</div>
  <div v-else-if="!data.length" class="py-8 text-center text-sm" style="color: var(--ink-mute)">暂无数据</div>
  <VChart v-else class="w-full" :style="{ height }" :option="option" autoresize />
</template>
