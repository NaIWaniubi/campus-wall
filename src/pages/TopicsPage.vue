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
import { sectionGradient, sectionDesc } from '@/utils/sections'

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
  <div class="min-h-screen pb-24" style="background: var(--color-bg)">
    <!-- 墨色海报头：贴纸 + 字距标签 + 大字标题 -->
    <header class="hero px-5 pt-6 pb-7 rounded-b-[20px]">
      <div class="flex items-center gap-2">
        <span class="ds-sticker ds-sticker--coral">TOPICS</span>
        <span class="ds-label ds-num" style="color: rgb(255 255 255 / 0.45)">{{ appStore.sections.length }} 板块 · 本校</span>
      </div>
      <h1 class="ds-display ds-display-lg mt-2 text-white">校园话题</h1>
      <p class="mt-1 text-[13px] text-white/60">找到同频的聊天和互助频道</p>
    </header>

    <!-- 分类卡片列表：编号 + 分类色圆点 + 分类名 + 简介 + 动态数 + 箭头 -->
    <div class="max-w-[960px] mx-auto px-3 mt-3 space-y-3">
      <button
        v-for="(s, idx) in appStore.sections"
        :key="s.id"
        class="ds-card ds-card--hover w-full text-left p-4 flex items-start gap-3"
        @click="router.push(`/section/${s.id}`)"
      >
        <span class="ds-section-head__num shrink-0" style="padding-top: 5px">{{ String(idx + 1).padStart(2, '0') }}</span>
        <span
          class="ds-tag-dot shrink-0"
          style="margin-top: 9px"
          :style="{ background: sectionGradient(s.id, s.name) }"
          aria-hidden="true"
        ></span>
        <div class="flex-1 min-w-0">
          <h2 class="ds-title truncate">{{ s.name }}</h2>
          <p class="ds-sub mt-0.5 line-clamp-2">{{ sectionDesc(s.name) }}</p>
          <div class="mt-2 flex items-center justify-between gap-3">
            <span class="ds-num text-[12px] font-bold" style="color: var(--ink-mute)">{{ counts[s.id] ?? 0 }} 条动态</span>
            <span class="flex items-center gap-0.5 text-[12px] font-bold shrink-0" style="color: var(--ink)">
              查看 <ChevronRight class="w-4 h-4" />
            </span>
          </div>
        </div>
      </button>

      <!-- 板块接口失败时的兜底 -->
      <div v-if="!appStore.sections.length && !loading" class="ds-card ds-card--flat p-6 text-center">
        <p class="ds-sub">板块加载失败，请下拉重试</p>
      </div>
    </div>
  </div>
</template>
