<script setup lang="ts">
/**
 * 信誉分等级称号徽章：四档（≥90 信誉之星 / ≥80 可靠达人 / ≥60 诚信新人 / <60 待改进）
 * 数据来自 helpers.creditTitle，用于个人页与帖子卡片作者旁
 */
import { computed } from 'vue'
import { Trophy, Medal, Award, ShieldAlert } from '@lucide/vue'
import { creditTitle } from '@/utils/helpers'

const props = defineProps<{
  score: number
  /** sm 用于昵称旁等紧凑场景，md 用于卡片内强调展示 */
  size?: 'sm' | 'md'
}>()

const title = computed(() => creditTitle(props.score))
const ICON_MAP = {
  trophy: Trophy,
  medal: Medal,
  award: Award,
  'shield-alert': ShieldAlert,
} as const
const iconComp = computed(() => ICON_MAP[title.value.icon])
</script>

<template>
  <span
    class="inline-flex items-center gap-1 rounded-full font-medium whitespace-nowrap"
    :class="size === 'md' ? 'px-2.5 py-0.5 text-xs' : 'px-1.5 py-0.5 text-[11px]'"
    :style="{ color: title.color, backgroundColor: title.color + '1a', border: '1px solid ' + title.color + '40' }"
  >
    <component :is="iconComp" :class="size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'" />
    {{ title.name }}
  </span>
</template>
