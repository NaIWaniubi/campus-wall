<script setup lang="ts">
/**
 * 话题页：复刻原生小程序 pages/category/category（渐变头 + 分类卡片网格）
 * 卡片左侧为分类色竖条，含简介、动态数、查看入口。
 */
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { postApi } from '@/utils/api'
import { sectionColor, sectionGradient, sectionDesc } from '@/utils/sections'

const router = useRouter()
const appStore = useAppStore()

/** 板块 id -> 动态数（进入页面后并发拉取，失败保持 0，不阻塞渲染） */
const counts = ref<Record<number, number>>({})
const loading = ref(true)

async function loadCounts() {
  const list = appStore.sections
  await Promise.all(
    list.map(async (s: any) => {
      try {
        const res: any = await postApi.list({ page: 1, pageSize: 1, sectionId: s.id })
        counts.value[s.id] = res?.data?.total ?? 0
      } catch {
        counts.value[s.id] = 0
      }
    })
  )
  loading.value = false
}

onMounted(async () => {
  if (!appStore.sections.length) {
    try { await appStore.fetchSections() } catch { /* 页面内给出空态即可 */ }
  }
  loadCounts()
})
</script>

<template>
  <div class="min-h-screen pb-6" style="background: var(--color-bg)">
    <!-- 渐变头（对齐小程序 .topic-header） -->
    <header class="hero pt-6 pb-8 px-5 rounded-b-[20px]">
      <h1 class="text-[22px] font-bold tracking-wide">校园话题</h1>
      <p class="mt-1 text-[13px] text-white/80">找到同频的聊天和互助频道</p>
    </header>

    <!-- 分类卡片网格 -->
    <div class="px-3 -mt-5 space-y-2.5 max-w-[1280px] mx-auto">
      <button
        v-for="(s, idx) in appStore.sections"
        :key="s.id"
        class="card-premium rise-in relative w-full text-left p-4 flex flex-col gap-2 overflow-hidden"
        :style="{ animationDelay: `${Math.min(idx, 8) * 45}ms` }"
        @click="router.push(`/section/${s.id}`)"
      >
        <!-- 分类渐变光晕：左上角一圈彩色氛围 -->
        <span
          class="pointer-events-none absolute -right-8 -top-10 w-32 h-32 rounded-full opacity-25 blur-2xl"
          :style="{ background: sectionGradient(s.id, s.name) }"
          aria-hidden="true"
        ></span>
        <span class="absolute left-0 top-0 bottom-0 w-[3px]" :style="{ background: sectionGradient(s.id, s.name) }" aria-hidden="true"></span>
        <div class="flex items-center gap-2">
          <span
            class="w-8 h-8 rounded-xl flex items-center justify-center text-[14px] font-bold text-white"
            :style="{ background: sectionGradient(s.id, s.name), boxShadow: '0 6px 14px -6px rgba(20,24,40,.45)' }"
          >
            {{ s.name.charAt(0) }}
          </span>
          <span class="text-[15px] font-semibold text-[#1A1A2E]">{{ s.name }}</span>
        </div>
        <p class="text-[12px] text-zinc-500 leading-relaxed">{{ sectionDesc(s.name) }}</p>
        <div class="flex items-center justify-between pt-0.5">
          <span class="text-[11px] text-zinc-400">{{ counts[s.id] ?? 0 }} 条动态</span>
          <span class="text-[12px] font-semibold flex items-center gap-0.5" :style="{ color: sectionColor(s.id, s.name) }">
            查看 <ChevronRight class="w-3.5 h-3.5" />
          </span>
        </div>
      </button>

      <!-- 板块接口失败时的兜底 -->
      <div v-if="!appStore.sections.length && !loading" class="card p-6 text-center text-sm text-zinc-500">
        板块加载失败，请下拉重试
      </div>
    </div>
  </div>
</template>
