<script setup lang="ts">
/**
 * 帖子列表骨架屏（V4：纸感海报风格，墨线卡片 + 纸灰占位块）
 */
defineProps<{
  count?: number
}>()
</script>

<template>
  <div class="space-y-3">
    <div
      v-for="i in (count || 3)"
      :key="i"
      class="ds-card p-4"
      aria-hidden="true"
    >
      <div class="flex items-center gap-2.5 mb-3">
        <div class="w-9 h-9 rounded-[10px] skeleton shrink-0"></div>
        <div class="flex-1">
          <div class="h-3 w-20 skeleton rounded mb-1.5"></div>
          <div class="h-2 w-28 skeleton rounded"></div>
        </div>
        <div class="h-5 w-16 skeleton rounded-md"></div>
      </div>
      <div class="h-4 w-3/4 skeleton rounded mb-2"></div>
      <div class="h-3 w-full skeleton rounded mb-1.5"></div>
      <div class="h-3 w-2/3 skeleton rounded mb-3"></div>
      <div class="flex gap-2 mb-3">
        <div class="w-20 h-20 rounded-[10px] skeleton"></div>
        <div class="w-20 h-20 rounded-[10px] skeleton"></div>
        <div class="w-20 h-20 rounded-[10px] skeleton"></div>
      </div>
      <div class="flex gap-5 pt-2.5" style="border-top: 1px solid var(--hairline)">
        <div class="h-3 w-10 skeleton rounded"></div>
        <div class="h-3 w-10 skeleton rounded"></div>
        <div class="h-3 w-10 skeleton rounded"></div>
      </div>
    </div>
  </div>
</template>
