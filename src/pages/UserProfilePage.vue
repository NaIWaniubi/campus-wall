<script setup lang="ts">
/**
 * 他人主页（公开，游客可看）：资料卡 + 交易互评记录
 * 注：该用户公开帖子列表依赖 GET /posts?authorId= 参数，后端暂未支持，
 *     页面内已注明「暂未开放」，待后端补参数后接入（见任务 t2 说明）。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Star, FileText } from '@lucide/vue'
import { userApi, tradeApi } from '@/utils/api'
import { creditColor, formatTime } from '@/utils/helpers'
import CreditBadge from '@/components/CreditBadge.vue'

const route = useRoute()
const router = useRouter()
const userId = computed(() => Number(route.params.id))

const user = ref<any>(null)
const loading = ref(true)
const notFound = ref(false)
const credit = computed(() => user.value?.credit_score || 0)

// ---------- 交易互评 ----------
const ratings = ref<any[]>([])
const ratingTotal = ref(0)
const ratingAvg = ref<number | null>(null)

async function loadUser() {
  loading.value = true
  try {
    const res: any = await userApi.info(userId.value)
    user.value = res.data
  } catch {
    // 错误已由拦截器 toast
    notFound.value = true
  } finally {
    loading.value = false
  }
}

async function loadRatings() {
  try {
    const res: any = await tradeApi.ratingsOf(userId.value)
    ratings.value = res.data.list || []
    ratingTotal.value = res.data.total || 0
    ratingAvg.value = res.data.avg ?? null
  } catch {
    // 静默失败，不打扰主页
  }
}

onMounted(() => {
  loadUser()
  loadRatings()
})
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-10">
    <!-- 顶部导航 -->
    <header class="sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ml-1 font-medium text-zinc-900">个人主页</span>
      </div>
    </header>

    <!-- 加载骨架 -->
    <main v-if="loading" class="max-w-[960px] mx-auto px-4 py-6 space-y-4">
      <div class="bg-white rounded-xl p-5 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-full skeleton flex-shrink-0"></div>
          <div class="flex-1">
            <div class="h-5 w-28 skeleton rounded mb-2"></div>
            <div class="h-3 w-40 skeleton rounded"></div>
          </div>
        </div>
      </div>
      <div class="h-24 bg-white rounded-xl skeleton"></div>
    </main>

    <!-- 用户不存在 -->
    <main v-else-if="notFound" class="max-w-[960px] mx-auto px-4 py-16 text-center text-sm text-zinc-400">
      用户不存在或已被封禁
    </main>

    <main v-else-if="user" class="max-w-[960px] mx-auto px-4 py-4 space-y-4">
      <!-- 公开资料卡 -->
      <div class="bg-gradient-to-b from-brand-500 to-brand-600 rounded-2xl text-white p-5 shadow-sm">
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-white/30 to-white/10 overflow-hidden border-2 border-white/50 flex items-center justify-center flex-shrink-0 shadow">
            <img v-if="user.avatar" :src="user.avatar" class="w-full h-full object-cover" alt="头像" />
            <span v-else class="text-xl font-bold text-white drop-shadow">{{ user.nickname?.charAt(0) || '友' }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-lg font-bold truncate">{{ user.nickname || '未知用户' }}</span>
              <CreditBadge :score="credit" size="sm" />
            </div>
            <p class="text-xs text-white/80 mt-1">{{ user.college || '未设置学院' }}<template v-if="user.grade"> · {{ user.grade }}</template></p>
          </div>
        </div>
        <p v-if="user.signature" class="mt-3 text-sm text-white/90 italic line-clamp-2">"{{ user.signature }}"</p>
        <p class="mt-2 text-[11px] text-white/60">校园墙第 {{ user.id }} 位同学 · 加入于 {{ formatTime(user.created_at) }}</p>
      </div>

      <!-- 信誉分 -->
      <div class="bg-white rounded-xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-zinc-700">信誉分</span>
            <CreditBadge :score="credit" size="md" />
          </div>
          <span class="text-xl font-bold" :style="{ color: creditColor(credit) }">{{ credit }}</span>
        </div>
        <div class="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
          <div class="h-full rounded-full transition-all duration-500" :style="{ width: Math.min(credit, 100) + '%', backgroundColor: creditColor(credit) }"></div>
        </div>
      </div>

      <!-- 交易评价 -->
      <div class="bg-white rounded-xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-zinc-700">交易评价</span>
            <span v-if="ratingAvg !== null" class="text-xs font-medium text-amber-500">{{ ratingAvg }} 分</span>
          </div>
          <span v-if="ratingTotal > 0" class="text-xs text-zinc-400">共 {{ ratingTotal }} 条</span>
        </div>
        <p v-if="!ratings.length" class="text-xs text-zinc-400 py-2">暂无交易评价</p>
        <div v-else class="divide-y divide-zinc-50">
          <div v-for="r in ratings" :key="r.id" class="flex items-start gap-2.5 py-2.5">
            <div class="w-7 h-7 rounded-full bg-zinc-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
              <img v-if="r.rater?.avatar" :src="r.rater.avatar" class="w-full h-full object-cover" alt="" />
              <span v-else class="text-xs text-zinc-400">{{ r.rater?.nickname?.charAt(0) || '匿' }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-zinc-600 truncate">{{ r.rater?.nickname || '匿名用户' }}</span>
                <div class="flex gap-px">
                  <Star v-for="i in 5" :key="i" class="w-3 h-3"
                    :class="i <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-zinc-200'" />
                </div>
                <span class="ml-auto text-[11px] text-zinc-300 flex-shrink-0">{{ formatTime(r.createdAt) }}</span>
              </div>
              <p v-if="r.comment" class="text-xs text-zinc-500 mt-0.5 line-clamp-2">{{ r.comment }}</p>
              <button class="text-[11px] text-brand-500 hover:text-brand-600 mt-0.5 truncate max-w-full block text-left" @click="r.postId && router.push(`/post/${r.postId}`)">
                来自「{{ r.postTitle || '已删除帖子' }}」
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 公开帖子列表：后端 GET /posts 暂不支持 authorId 过滤，先占位注明 -->
      <div class="bg-white rounded-xl shadow-sm p-4">
        <div class="flex items-center gap-2">
          <FileText class="w-4 h-4 text-brand-500" />
          <span class="text-sm font-medium text-zinc-700">TA 的帖子</span>
        </div>
        <p class="text-xs text-zinc-400 py-3 text-center">暂未开放，敬请期待</p>
      </div>
    </main>
  </div>
</template>
