<script setup lang="ts">
/**
 * 我的订阅：列出已订阅板块 + 一键退订 + 跳进板块
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, BellRing, ChevronRight, Loader2 } from '@lucide/vue'
import { subscriptionApi } from '@/utils/api'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import SkeletonList from '@/components/SkeletonList.vue'

const router = useRouter()
const list = ref<any[]>([])
const loading = ref(true)
// id → 退订进行中标记
const removing = ref<Set<number>>(new Set())

async function load() {
  loading.value = true
  try {
    const res: any = await subscriptionApi.list()
    list.value = (res.data || []).map((s: any) => ({
      id: s.sectionId,
      name: s.sectionName,
      icon: s.sectionIcon,
      createdAt: s.createdAt,
    }))
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

async function remove(s: any) {
  if (removing.value.has(s.id)) return
  const s2 = new Set(removing.value)
  s2.add(s.id)
  removing.value = s2
  try {
    await subscriptionApi.toggle(s.id)
    list.value = list.value.filter((x) => x.id !== s.id)
    toast.success('已取消订阅')
  } catch {
    // 错误已由拦截器 toast
  } finally {
    const s3 = new Set(removing.value)
    s3.delete(s.id)
    removing.value = s3
  }
}

function goSection(s: any) {
  router.push(`/section/${s.id}`)
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen pb-24" style="background: var(--paper)">
    <header class="sticky top-0 z-10" style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button type="button" class="ds-icon-btn !w-9 !h-9 -ml-1" style="border-color: var(--hairline); box-shadow: none" aria-label="返回" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-extrabold" style="color: var(--ink)">我的订阅</span>
        <span class="ml-2 text-xs ds-sub">共 {{ list.length }} 个</span>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-3">
      <SkeletonList v-if="loading" :count="3" :show-media="false" />

      <template v-else>
        <div v-if="list.length" class="ds-card overflow-hidden">
          <div
            v-for="s in list"
            :key="s.id"
            class="flex items-center gap-3 px-4 py-3.5 ds-hairline-b last:!border-b-0"
          >
            <button class="flex items-center gap-3 flex-1 min-w-0 text-left" @click="goSection(s)">
              <div class="w-10 h-10 rounded-[10px] flex items-center justify-center flex-shrink-0" style="background: var(--lime); border: 1.5px solid var(--ink)">
                <BellRing class="w-5 h-5" style="color: var(--ink)" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold truncate" style="color: var(--ink)">{{ s.name }}</div>
                <div class="text-xs ds-sub mt-0.5">每日摘要将推送该板块新帖</div>
              </div>
              <ChevronRight class="w-4 h-4 flex-shrink-0" style="color: var(--ink-mute)" />
            </button>
            <button
              type="button"
              class="ds-chip flex-shrink-0 ml-2 !py-1 !text-[11.5px] active:scale-95 transition flex items-center gap-1"
              :disabled="removing.has(s.id)"
              @click="remove(s)"
            >
              <Loader2 v-if="removing.has(s.id)" class="w-3 h-3 animate-spin" />
              退订
            </button>
          </div>
        </div>
        <EmptyState
          v-else
          text="还没有订阅的板块"
          action-text="去逛逛"
          @action="router.push('/')"
        />
      </template>
    </main>
  </div>
</template>
