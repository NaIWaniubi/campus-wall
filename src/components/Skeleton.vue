<script setup lang="ts">
/**
 * 基础骨架原子：text/circle/rounded/block 四种变体
 * - 默认 shimmer 动画；prefers-reduced-motion 时停
 * - 颜色走 token（var(--color-surface-2) / var(--color-surface-3)）
 */
import { computed } from 'vue'

type Variant = 'text' | 'circle' | 'rounded' | 'block'
type Animation = 'pulse' | 'shimmer' | 'none'

const props = withDefaults(defineProps<{
  variant?: Variant
  width?: number | string
  height?: number | string
  animation?: Animation
  /** 自定义类名 */
  class?: string
}>(), {
  variant: 'text',
  width: '100%',
  height: 14,
  animation: 'shimmer',
})

const style = computed(() => {
  const w = typeof props.width === 'number' ? `${props.width}px` : props.width
  const h = typeof props.height === 'number' ? `${props.height}px` : props.height
  const radius =
    props.variant === 'circle' ? '50%' :
    props.variant === 'rounded' ? 'var(--radius-md)' :
    props.variant === 'block' ? 'var(--radius-md)' :
    'var(--radius-sm)'
  return { width: w, height: h, borderRadius: radius }
})

const animClass = computed(() => {
  if (props.animation === 'pulse') return 'skeleton-pulse'
  if (props.animation === 'shimmer') return 'skeleton-shimmer'
  return ''
})
</script>

<template>
  <span
    :class="['inline-block', animClass, $props.class]"
    :style="style"
    aria-hidden="true"
  />
</template>

<style scoped>
@keyframes sk-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.55; }
}
@keyframes sk-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
.skeleton-pulse {
  background-color: var(--color-surface-2);
  animation: sk-pulse 1.4s ease-in-out infinite;
}
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    var(--color-surface-2) 0%,
    var(--color-surface-3) 50%,
    var(--color-surface-2) 100%
  );
  background-size: 200% 100%;
  animation: sk-shimmer 1.4s ease-in-out infinite;
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-pulse,
  .skeleton-shimmer { animation: none; }
}
</style>
