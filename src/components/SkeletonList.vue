<script setup lang="ts">
/**
 * 通用列表骨架：props.count 控制数量（默认 5）
 * 默认渲染 SkeletonCard；可用 itemComponent slot 自定义
 */
import SkeletonCard from '@/components/SkeletonCard.vue'

withDefaults(defineProps<{
  count?: number
  showMedia?: boolean
}>(), {
  count: 5,
  showMedia: false,
})
</script>

<template>
  <div role="status" aria-label="加载中">
    <slot name="item" :count="count" :show-media="showMedia">
      <SkeletonCard :count="count" :show-media="showMedia" />
    </slot>
    <span class="sr-only">内容加载中</span>
  </div>
</template>
