<script setup lang="ts">
/**
 * 法律文本页（用户协议 / 隐私政策）
 * 内容与小程序 pages/legal 同源（src/content/legal.ts，由 gen-legal-web.mjs 生成），
 * 注册页的协议链接跳到本页——不再用「正在完善中」的占位 toast。
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LEGAL_DOCS } from '@/content/legal'

const route = useRoute()
const router = useRouter()

type DocKey = keyof typeof LEGAL_DOCS

// 直接访问 /legal/privacy 时也允许（分享卡/搜索直达），query.doc 更友好但非必需。
// 白名单校验：非法值（如 /legal/xxx）不渲染 doc.title（那会抛 TypeError 白屏），走 404 面板。
const docKey = computed<DocKey | undefined>(() => {
  const raw = typeof route.query.doc === 'string' ? route.query.doc : route.params.doc
  if (typeof raw === 'string' && raw in LEGAL_DOCS) return raw as DocKey
  return undefined
})
const doc = computed(() => (docKey.value ? LEGAL_DOCS[docKey.value] : undefined))

function onBack() {
  // 优先回到来源页，没有则首页
  const back = router.options.history.state.back
  if (back) router.back()
  else router.push('/')
}
</script>

<template>
  <div class="legal-page mx-auto max-w-[720px] px-5 py-8">
    <div class="mb-4 flex items-center justify-between">
      <button class="text-sm font-bold" style="color: var(--violet)" @click="onBack">← 返回</button>
      <span v-if="doc" class="text-xs" style="color: var(--ink-mute)">{{ doc.title }}</span>
    </div>

    <!-- 非法 doc：渲染 404 面板而非白屏（原实现 doc 为 undefined 时渲染即抛 TypeError） -->
    <div v-if="!doc" class="flex flex-col items-center gap-3 rounded-xl p-10 text-center" style="background: var(--paper); box-shadow: var(--shadow-card)">
      <p class="text-sm font-bold" style="color: var(--ink)">这份协议不存在</p>
      <p class="text-xs" style="color: var(--ink-mute)">链接可能有误，正确入口是注册页的《用户协议》《隐私政策》链接。</p>
      <router-link to="/" class="mt-1 rounded-lg px-4 py-2 text-xs font-bold" style="background: var(--ink); color: var(--paper)">回首页</router-link>
    </div>

    <article v-else class="rounded-xl p-6" style="background: var(--paper); box-shadow: var(--shadow-card)">
      <template v-for="(b, i) in doc.blocks" :key="i">
        <h1 v-if="b.k === 'h1'" class="legal-title">{{ b.v }}</h1>
        <p v-else-if="b.k === 'meta'" class="legal-meta">{{ b.v }}</p>
        <h2 v-else-if="b.k === 'h2'" class="legal-h2">{{ b.v }}</h2>
        <h3 v-else-if="b.k === 'h3'" class="legal-h3">{{ b.v }}</h3>
        <p v-else class="legal-p" :class="{ 'legal-indent': b.v.startsWith('\u3000') }">{{ b.v }}</p>
      </template>
    </article>
  </div>
</template>

<style scoped>
.legal-page {
  color: var(--ink);
}
.legal-title {
  margin: 0 0 6px;
  font-size: 21px;
  font-weight: 800;
  line-height: 1.35;
}
.legal-meta {
  margin: 0 0 14px;
  font-size: 12.5px;
  color: var(--ink-mute);
  line-height: 1.7;
}
.legal-h2 {
  margin: 18px 0 8px;
  font-size: 15.5px;
  font-weight: 700;
}
.legal-h3 {
  margin: 12px 0 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--ink-soft);
}
.legal-p {
  margin: 0 0 8px;
  font-size: 13px;
  line-height: 1.9;
}
.legal-indent {
  padding-left: 1em;
  color: var(--ink-soft);
}
</style>