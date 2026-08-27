<script setup lang="ts">
/**
 * 帖子卡片骨架：与 PostCard 视觉等比，避免加载后高度跳动
 * - 默认 3 条
 * - showMedia 决定是否渲染图片占位
 */
import Skeleton from '@/components/Skeleton.vue'

withDefaults(defineProps<{
  count?: number
  showMedia?: boolean
}>(), {
  count: 3,
  showMedia: true,
})
</script>

<template>
  <div role="status" aria-label="加载中" class="space-y-3">
    <div
      v-for="i in count"
      :key="i"
      class="rounded-xl p-4"
      style="background-color: var(--color-surface); box-shadow: var(--shadow-sm); border: 1px solid var(--color-border);"
    >
      <!-- 头部：头像 + 名字 + 时间 -->
      <div class="flex items-center gap-3 mb-3">
        <Skeleton variant="circle" :width="40" :height="40" />
        <div class="flex-1 space-y-2">
          <Skeleton variant="text" width="40%" :height="14" />
          <Skeleton variant="text" width="25%" :height="12" />
        </div>
      </div>
      <!-- 文本：3 行 -->
      <div class="space-y-2 mb-3">
        <Skeleton variant="text" width="95%" :height="14" />
        <Skeleton variant="text" width="80%" :height="14" />
        <Skeleton variant="text" width="60%" :height="14" />
      </div>
      <!-- 图片占位 -->
      <Skeleton
        v-if="showMedia"
        variant="rounded"
        width="100%"
        :height="180"
        class="mb-3"
      />
      <!-- 底部：3 个操作 -->
      <div class="flex gap-4">
        <Skeleton variant="text" :width="60" :height="12" />
        <Skeleton variant="text" :width="60" :height="12" />
        <Skeleton variant="text" :width="60" :height="12" />
      </div>
    </div>
    <span class="sr-only">内容加载中</span>
  </div>
</template>
