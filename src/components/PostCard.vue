<script setup lang="ts">
/**
 * 帖子卡片组件：用于列表展示
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, Heart, Eye, Bookmark } from '@lucide/vue'
import { formatTime } from '@/utils/helpers'
import CreditBadge from '@/components/CreditBadge.vue'

const props = defineProps<{
  post: any
  keyword?: string
}>()

const router = useRouter()

const author = computed(() => props.post.author || {})
const section = computed(() => props.post.section || {})
const images = computed(() => props.post.images || [])
const thumbs = computed(() => props.post.thumbImages || [])

// 缩略图加载失败（旧图未生成缩略图）时回退原图
function onThumbError(e: Event, fallback: string) {
  const el = e.target as HTMLImageElement
  if (el.src.endsWith('.thumb.webp')) el.src = fallback
}

function goDetail() {
  router.push(`/post/${props.post.id}`)
}

// 高亮关键词
function highlight(text: string): string {
  if (!text) return ''
  // 先转义 HTML 特殊字符，避免 v-html 渲染引发 XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  const kw = typeof props.keyword === 'string' ? props.keyword.trim() : ''
  if (!kw) return escaped
  const reg = new RegExp(`(${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return escaped.replace(reg, '<span class="highlight">$1</span>')
}
</script>

<template>
  <div class="bg-white rounded-2xl p-4 shadow-sm shadow-zinc-100/50 hover:shadow-md hover:shadow-zinc-200/50 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer active:bg-zinc-50/50" @click="goDetail">
    <!-- 作者信息 -->
    <div class="flex items-center gap-3 mb-3">
      <div class="w-10 h-10 rounded-full bg-gradient-to-br from-brand-100 to-brand-200 flex items-center justify-center overflow-hidden flex-shrink-0 ring-2 ring-brand-50">
        <img v-if="author.avatar" :src="author.avatar" class="w-full h-full object-cover" alt="头像" />
        <span v-else class="text-sm font-bold text-brand-700">{{ author.nickname?.charAt(0) || '匿' }}</span>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1.5">
          <span class="text-sm font-semibold text-zinc-900 truncate">{{ author.nickname || '匿名用户' }}</span>
          <CreditBadge v-if="!post.isAnonymous && author.creditScore != null" :score="author.creditScore" size="sm" />
          <span v-if="post.isTop" class="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium border border-red-100">置顶</span>
        </div>
        <div class="text-xs text-zinc-400 flex items-center gap-1.5 mt-0.5">
          <span class="text-brand-600/80">{{ section.name }}</span>
          <span class="w-0.5 h-0.5 rounded-full bg-zinc-300"></span>
          <span>{{ formatTime(post.createdAt) }}</span>
        </div>
      </div>
    </div>

    <!-- 标题 -->
    <h3 class="font-bold text-zinc-900 mb-1.5 line-clamp-1 text-[15px]" v-html="highlight(post.title)"></h3>

    <!-- 正文 -->
    <p class="text-sm text-zinc-600 line-clamp-2 mb-3 post-content leading-relaxed" v-html="highlight(post.content)"></p>

    <!-- 图片 -->
    <div v-if="images.length > 0" class="grid grid-cols-3 gap-1.5 mb-3">
      <div v-for="(img, i) in images.slice(0, 3)" :key="i" class="aspect-square rounded-lg overflow-hidden bg-zinc-100 relative">
        <img :src="thumbs[i] || img" class="w-full h-full object-cover hover:scale-105 transition-transform duration-300" loading="lazy" alt="" @error="onThumbError($event, img)" />
        <!-- 第三张上叠加 +N 提示还有更多图片 -->
        <div v-if="i === 2 && images.length > 3" class="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-medium text-lg">
          +{{ images.length - 3 }}
        </div>
      </div>
    </div>

    <!-- 扩展字段（价格等） -->
    <div v-if="post.extraFields?.price" class="text-brand-600 font-bold text-lg mb-2.5 flex items-baseline gap-1">
      <span class="text-sm">¥</span>{{ post.extraFields.price }}
    </div>

    <!-- 互动数据 -->
    <div class="flex items-center gap-4 text-xs text-zinc-400 pt-2.5 border-t border-zinc-50">
      <span class="flex items-center gap-1">
        <Eye class="w-3.5 h-3.5" />
        {{ post.viewCount }}
      </span>
      <span class="flex items-center gap-1" :class="post.likeCount > 0 ? 'text-red-400' : ''">
        <Heart class="w-3.5 h-3.5" />
        {{ post.likeCount }}
      </span>
      <span class="flex items-center gap-1" :class="post.commentCount > 0 ? 'text-brand-400' : ''">
        <MessageCircle class="w-3.5 h-3.5" />
        {{ post.commentCount }}
      </span>
      <span class="flex items-center gap-1 ml-auto">
        <Bookmark class="w-3.5 h-3.5" />
        {{ post.favoriteCount }}
      </span>
    </div>
  </div>
</template>

