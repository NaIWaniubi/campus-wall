<script setup lang="ts">
/**
 * 帖子列表骨架屏
 */
defineProps<{
  count?: number
}>()
</script>

<template>
  <div class="space-y-3">
    <div v-for="i in (count || 3)" :key="i" class="bg-white rounded-xl p-4 shadow-sm">
      <div class="flex items-center gap-2 mb-3">
        <div class="w-8 h-8 rounded-full skeleton"></div>
        <div class="flex-1">
          <div class="h-3 w-20 skeleton rounded mb-1"></div>
          <div class="h-2 w-32 skeleton rounded"></div>
        </div>
      </div>
      <div class="h-4 w-3/4 skeleton rounded mb-2"></div>
      <div class="h-3 w-full skeleton rounded mb-1"></div>
      <div class="h-3 w-2/3 skeleton rounded mb-3"></div>
      <div class="flex gap-2 mb-3">
        <div class="w-16 h-16 rounded-lg skeleton"></div>
        <div class="w-16 h-16 rounded-lg skeleton"></div>
        <div class="w-16 h-16 rounded-lg skeleton"></div>
      </div>
      <div class="flex gap-4">
        <div class="h-3 w-10 skeleton rounded"></div>
        <div class="h-3 w-10 skeleton rounded"></div>
        <div class="h-3 w-10 skeleton rounded"></div>
      </div>
    </div>
  </div>
</template>
