<script setup lang="ts">
/**
 * 评论管理（内容治理三区之二）：关键词搜索 + 列表（帖标题/评论人/内容/时间）+ 删除（确认弹窗）
 * 说明：后端 /admin/comments 固定返回 active 评论、无 status 维度，筛选走 keyword
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Trash2, ChevronLeft, ChevronRight, Heart } from '@lucide/vue'
import { adminApi } from '@/utils/api'
import { formatTime } from '@/utils/helpers'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()

const list = ref<any[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const keyword = ref('')

async function load() {
  loading.value = true
  try {
    const res: any = await adminApi.comments({
      keyword: keyword.value || undefined,
      page: page.value,
      pageSize,
    })
    list.value = res.data.list
    total.value = res.data.total
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  load()
}
function prevPage() {
  if (page.value > 1) {
    page.value--
    load()
  }
}
function nextPage() {
  if (page.value * pageSize < total.value) {
    page.value++
    load()
  }
}

function goPost(postId?: number) {
  if (postId) router.push(`/post/${postId}`)
}

const delDialog = reactive({ visible: false, comment: null as any })
function openDelete(c: any) {
  delDialog.comment = c
  delDialog.visible = true
}
async function confirmDelete() {
  const c = delDialog.comment
  delDialog.visible = false
  if (!c) return
  try {
    await adminApi.deleteComment(c.id)
    toast.success('评论已删除')
    load()
  } catch {}
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen space-y-4">
    <!-- 页头：海报式标题 + 统计数字 -->
    <header class="flex flex-wrap items-end justify-between gap-3 pb-3" style="border-bottom: 1.5px solid var(--ink)">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-2">
          <span class="ds-sticker ds-sticker--sky">COMMENTS</span>
          <span class="ds-label">内容治理</span>
        </div>
        <h1 class="ds-display ds-display-lg" style="color: var(--ink)">评论管理</h1>
      </div>
      <div class="flex items-baseline gap-2">
        <span class="ds-display ds-display-lg ds-num" style="color: var(--ink)">{{ total }}</span>
        <span class="ds-label">COMMENTS</span>
      </div>
    </header>

    <!-- 搜索 -->
    <section class="ds-card p-3 md:p-4 flex flex-wrap items-center gap-2">
      <div class="relative flex-1 min-w-[180px]">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style="color: var(--ink-mute)" />
        <input
          v-model="keyword"
          type="text"
          placeholder="搜索评论内容"
          class="ds-input"
          style="padding-left: 38px"
          @keyup.enter="onSearch"
        />
      </div>
      <button type="button" class="ds-btn ds-btn--primary" @click="onSearch">搜索</button>
    </section>

    <!-- 列表：纸感表格 -->
    <section class="ds-card ds-card--flat overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-[13px]">
          <thead>
            <tr style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">所属帖子</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">评论人</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">内容</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">点赞</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">时间</th>
              <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in list"
              :key="c.id"
              class="align-top hover:bg-[var(--paper)]"
              style="border-bottom: 1px solid var(--hairline)"
            >
              <td class="px-3 py-2.5 max-w-[220px]">
                <button
                  type="button"
                  class="text-left truncate max-w-[220px] block font-semibold underline underline-offset-2"
                  style="color: var(--violet)"
                  @click="goPost(c.post?.id)"
                >
                  {{ c.post?.title || `帖子 #${c.post?.id ?? '-'}` }}
                </button>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap">
                <span style="color: var(--ink-soft)">{{ c.author?.nickname || '未知用户' }}</span>
                <span v-if="c.isAnonymous" class="ds-tag ml-1" style="background: var(--sky)">匿名发布</span>
              </td>
              <td class="px-3 py-2.5 max-w-[320px]">
                <p class="line-clamp-2 leading-relaxed" style="color: var(--ink)">{{ c.content }}</p>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap">
                <span class="inline-flex items-center gap-1 text-xs ds-num" style="color: var(--ink-mute)">
                  <Heart class="w-3 h-3" style="color: var(--coral)" />{{ c.likeCount ?? c.like_count ?? 0 }}
                </span>
              </td>
              <td class="px-3 py-2.5 whitespace-nowrap ds-num text-xs" style="color: var(--ink-mute)">{{ formatTime(c.createdAt) }}</td>
              <td class="px-3 py-2.5 whitespace-nowrap">
                <button
                  type="button"
                  class="ds-btn ds-btn--sm ds-btn--danger"
                  @click="openDelete(c)"
                >
                  <Trash2 class="w-3 h-3" />删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <EmptyState v-if="!loading && !list.length" text="暂无评论" />
      <div v-if="loading" class="py-10 text-center ds-sub">加载中...</div>
    </section>

    <!-- 分页 -->
    <div class="flex flex-wrap items-center justify-between gap-2 ds-sub">
      <span class="ds-num">共 {{ total }} 条，第 {{ page }} 页 / 共 {{ Math.max(1, Math.ceil(total / pageSize)) }} 页</span>
      <div class="flex gap-2">
        <button
          type="button"
          class="ds-btn ds-btn--sm"
          aria-label="上一页"
          :disabled="page <= 1"
          @click="prevPage"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="ds-btn ds-btn--sm"
          aria-label="下一页"
          :disabled="page * pageSize >= total"
          @click="nextPage"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>
    </div>

    <ConfirmDialog
      :visible="delDialog.visible"
      title="删除评论"
      :content="`确定删除该评论吗？删除后前台不可见。`"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="delDialog.visible = false"
    />
  </div>
</template>
