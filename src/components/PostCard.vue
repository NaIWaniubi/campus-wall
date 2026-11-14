<script setup lang="ts">
/**
 * 帖子卡片组件：用于列表展示
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { MessageCircle, Heart, Eye, Bookmark } from '@lucide/vue'
import { formatTime } from '@/utils/helpers'
import CreditBadge from '@/components/CreditBadge.vue'
import { sectionColor } from '@/utils/sections'

const props = defineProps<{
  post: any
  keyword?: string
}>()

const router = useRouter()

const author = computed(() => props.post.author || {})
const section = computed(() => props.post.section || {})
const images = computed(() => props.post.images || [])
const thumbs = computed(() => props.post.thumbImages || [])
/** 分类标签配色（对齐原生小程序分类色标签；V4 纯色，不再用渐变） */
const catColor = computed(() => sectionColor(section.value?.id, section.value?.name))

// 缩略图加载失败（旧图未生成缩略图）时回退原图
function onThumbError(e: Event, fallback: string) {
  const el = e.target as HTMLImageElement
  if (el.src.endsWith('.thumb.webp')) el.src = fallback
}

/** 解码完成 → 挂淡入类（纯 DOM 操作免每卡状态；缓存竞态时最坏不播动画，绝不影响显示） */
function onImgLoad(e: Event) {
  (e.target as HTMLImageElement | null)?.classList?.add('pc-img-ready')
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
  <!-- 卡片主体可点击：div 必须补 role/tabindex 与 Enter/Space 处理，否则键盘用户无法打开任何帖子 -->
  <div
    class="card-premium p-4 cursor-pointer active:scale-[0.997] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
    role="button"
    tabindex="0"
    :aria-label="`查看帖子：${post.title}`"
    @click="goDetail"
    @keydown.enter.prevent="goDetail"
    @keydown.space.prevent="goDetail"
  >
    <!-- 作者信息 + 分类标签（右对齐，对齐原生小程序 post-card 结构） -->
    <div class="flex items-start justify-between gap-3 mb-2.5">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="avatar-ring shrink-0">
          <span class="w-9 h-9 bg-white flex items-center justify-center overflow-hidden">
            <img v-if="author.avatar" :src="author.avatar" class="w-full h-full object-cover" loading="lazy" decoding="async" alt="头像" />
            <span v-else class="text-sm font-bold" :style="{ color: catColor }">{{ author.nickname?.charAt(0) || '匿' }}</span>
          </span>
        </div>
        <div class="min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="text-[13.5px] font-bold truncate" style="color: var(--ink)">{{ author.nickname || '匿名用户' }}</span>
            <CreditBadge v-if="!post.isAnonymous && author.creditScore != null" :score="author.creditScore" size="sm" />
            <span v-if="post.isTop" class="ds-tag !py-0 !px-1.5 !text-[10px]" style="background: var(--coral); color: #fff; border-color: var(--ink)">置顶</span>
          </div>
          <div class="text-[11px] mt-0.5" style="color: var(--ink-mute)">{{ formatTime(post.createdAt) }}</div>
        </div>
      </div>
      <span v-if="section.name" class="cat-tag-grad mt-0.5" :style="{ background: catColor }">{{ section.name }}</span>
    </div>

    <!-- 标题 -->
    <h3 v-if="post.title" class="font-extrabold text-[16.5px] leading-[1.45] mb-1.5 line-clamp-1" style="color: var(--ink)" v-html="highlight(post.title)"></h3>

    <!-- 正文 -->
    <p class="text-[14px] leading-[1.7] mb-2.5 post-content" style="color: var(--ink-soft)" :class="post.title ? 'line-clamp-2' : 'line-clamp-3'" v-html="highlight(post.content)"></p>

    <!-- 图片 -->
    <!-- 图片：单图也走等高封面带（消除解码前塌高的 CLS 抖动），纸色占位底防白闪 -->
    <div v-if="images.length > 0" class="mb-2.5">
      <div v-if="images.length === 1" class="overflow-hidden h-[200px]" style="border: 1.5px solid var(--ink); border-radius: 12px; background: var(--color-surface-2, #EFE9DC)">
        <img :src="thumbs[0] || images[0]" class="w-full h-full object-cover pc-img" loading="lazy" decoding="async" alt="" @load="onImgLoad" @error="onThumbError($event, images[0])" />
      </div>
      <div v-else class="grid grid-cols-3 gap-1">
        <div v-for="(img, i) in images.slice(0, 3)" :key="i" class="h-[100px] overflow-hidden relative group" style="border: 1.5px solid var(--ink); border-radius: 10px; background: var(--color-surface-2, #EFE9DC)">
          <img :src="thumbs[i] || img" class="w-full h-full object-cover group-hover:scale-[1.06] transition-transform duration-500 pc-img" loading="lazy" decoding="async" alt="" @load="onImgLoad" @error="onThumbError($event, img)" />
          <!-- 第三张上叠加 +N 提示还有更多图片 -->
          <div v-if="i === 2 && images.length > 3" class="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-medium text-lg">
            +{{ images.length - 3 }}
          </div>
        </div>
      </div>
    </div>

    <!-- 扩展字段（价格等） -->
    <div v-if="post.extraFields?.price" class="mb-2.5">
      <span
        class="inline-flex items-baseline gap-1 px-2.5 py-1 text-[17px] font-black ds-num"
        style="background: var(--lime); color: #14110F; border: 1.5px solid var(--ink); border-radius: 8px; box-shadow: 2px 2px 0 var(--ink)"
      >
        <span class="text-[12px] font-extrabold">¥</span>{{ post.extraFields.price }}
      </span>
    </div>

    <!-- 互动数据 -->
    <div class="flex items-center gap-5 text-[12px] pt-2.5" style="border-top: 1px solid var(--hairline); color: var(--ink-mute)">
      <span class="flex items-center gap-1">
        <Eye class="w-3.5 h-3.5" />
        {{ post.viewCount }}
      </span>
      <span class="flex items-center gap-1 transition" :style="post.likeCount > 0 ? { color: '#F43F5E' } : undefined">
        <Heart class="w-3.5 h-3.5" :fill="post.likeCount > 0 ? '#F43F5E' : 'none'" />
        {{ post.likeCount }}
      </span>
      <span class="flex items-center gap-1 transition" :style="post.commentCount > 0 ? { color: '#3B82F6' } : undefined">
        <MessageCircle class="w-3.5 h-3.5" />
        {{ post.commentCount }}
      </span>
      <span class="flex items-center gap-1 ml-auto transition" :style="post.favoriteCount > 0 ? { color: '#F59E0B' } : undefined">
        <Bookmark class="w-3.5 h-3.5" />
        {{ post.favoriteCount }}
      </span>
    </div>
  </div>
</template>

