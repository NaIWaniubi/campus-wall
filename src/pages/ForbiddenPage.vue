<script setup lang="ts">
/**
 * 403 无权限页
 */
import { useRouter } from 'vue-router'
import { ShieldX, Home } from 'lucide-vue-next'

const router = useRouter()
</script>

<template>
  <div class="min-h-screen flex flex-col items-center justify-center bg-zinc-50 px-4">
    <div class="w-24 h-24 rounded-full bg-red-50 flex items-center justify-center mb-6">
      <ShieldX class="w-12 h-12 text-red-500" />
    </div>
    <h1 class="text-xl font-bold text-zinc-900 mb-2">无权限访问</h1>
    <p class="text-sm text-zinc-400 mb-8">抱歉，您没有访问该页面的权限</p>
    <button class="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-full font-medium transition"
      @click="router.replace('/')">
      <Home class="w-4 h-4" /> 返回首页
    </button>
  </div>
</template>
