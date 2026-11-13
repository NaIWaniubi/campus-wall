<script setup lang="ts">
/**
 * 发布页：板块选择、标题、正文、图片、匿名、敏感词检测、板块差异化字段
 */
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, X, ImagePlus, Loader2, ShieldAlert, ChevronDown, FileText, Sparkles, Wand2 } from '@lucide/vue'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { postApi, uploadApi, draftApi, aiApi } from '@/utils/api'
import { assessRisk } from '@/utils/helpers'
import { toast } from '@/utils/request'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import PostCard from '@/components/PostCard.vue'

const router = useRouter()
const route = useRoute()
const appStore = useAppStore()
const userStore = useUserStore()

const form = reactive({
  sectionId: 0,
  title: '',
  content: '',
  images: [] as string[],
  isAnonymous: false,
  extraFields: {} as Record<string, any>,
})
const loading = ref(false)
const uploading = ref(false)
const dragOver = ref(false)
const showSectionPicker = ref(false)

const sensitive = computed(() => assessRisk(form.title, form.content))
const selectedSection = computed(() => appStore.sections.find((s) => s.id === form.sectionId))
// 差异化字段按板块稳定 id 映射（1二手 2失物 3表白 4树洞 5互助 6活动 7拼车 8组队），板块改名不受影响
const SECTION_KIND_MAP: Record<number, string> = {
  1: 'trade',
  2: 'lost',
  3: 'confession',
  4: 'treehole',
  5: 'help',
  6: 'activity',
  7: 'carpool',
  8: 'teamup',
}
const sectionKind = computed(() => SECTION_KIND_MAP[form.sectionId] || '')
const creditScore = computed(() => userStore.user?.creditScore ?? 0)

// 所有信誉门槛拒绝统一文案：讲清门槛、现状与恢复路径
function creditDenyToast(need: number) {
  toast.error(`需要信誉分 ${need}，当前 ${creditScore.value}。通过交易互评可提升信誉`)
}

// ── 编辑模式（?edit=:id）：读取详情回填表单，提交切换到 PUT /posts/:id（24h 内可编辑）──
// 差异化字段回填与双向同步已对齐：服务端下发的 extraFields 经白名单过滤后回填至 form.extraFields；
// 提交时保持字段结构一致，由后端合并语义保障扩展字段完整性。
const editId = computed(() => {
  const n = Number(route.query.edit)
  return Number.isInteger(n) && n > 0 ? n : 0
})
const editingPost = ref<any>(null) // 编辑中的原帖详情（含 rejectReason）

async function loadEditing() {
  try {
    const res: any = await postApi.detail(editId.value)
    const p = res.data
    if (!p.isMine) {
      toast.error('只能编辑自己的帖子')
      router.replace('/publish')
      return
    }
    editingPost.value = p
    applyDraftData({
      sectionId: p.section?.id,
      title: p.title,
      content: p.content,
      images: p.images,
      isAnonymous: p.isAnonymous,
      // 剥离非表单字段：soldAt/riskFlag 由服务端白名单/合并语义维护，不随表单带回
      extraFields: Object.fromEntries(
        Object.entries(p.extraFields || {}).filter(([k]) => k !== 'soldAt' && k !== 'riskFlag')
      ),
    })
  } catch {
    // 错误已由拦截器 toast
    router.replace('/publish')
  }
}

onMounted(() => {
  if (!appStore.sections.length) appStore.fetchSections()
  if (!userStore.canPost) {
    creditDenyToast(60)
  }
  // 编辑模式：回填帖子详情，跳过草稿恢复
  if (editId.value) {
    loadEditing()
    return
  }
  // 恢复草稿：优先草稿箱跳转带入的云端草稿，其次本地未发布的实时草稿
  const restore = sessionStorage.getItem('campus-wall-draft-restore')
  if (restore) {
    try {
      applyDraftData(JSON.parse(restore))
      sessionStorage.removeItem('campus-wall-draft-restore')
      localStorage.removeItem(LOCAL_DRAFT_KEY)
      toast.info('已恢复草稿内容')
    } catch {}
  } else {
    const local = localStorage.getItem(LOCAL_DRAFT_KEY)
    if (local) {
      try {
        applyDraftData(JSON.parse(local))
        toast.info('已恢复上次未发布的编辑')
      } catch {
        localStorage.removeItem(LOCAL_DRAFT_KEY)
      }
    }
  }
})

// ── 本地草稿：localStorage 实时保存，不再定时自动 POST 云端；显式「存草稿」才上传 ──
const LOCAL_DRAFT_KEY = 'campus-wall-draft-local'

function applyDraftData(d: any) {
  form.sectionId = d.sectionId || 0
  form.title = d.title || ''
  form.content = d.content || ''
  form.images = d.images || []
  form.isAnonymous = !!d.isAnonymous
  form.extraFields = d.extraFields || {}
}

// ── AI 一键成稿（V3）：一句话 → 标题 / 正文 / 板块 / 价格 / 标签 ──
const aiRaw = ref('')
const aiWriting = ref(false)
const aiTags = ref<string[]>([])

async function aiCompose() {
  if (!userStore.isLoggedIn) {
    toast.info('登录后可用 AI 成稿')
    return
  }
  const raw = (aiRaw.value || `${form.title} ${form.content}`).trim()
  if (!raw) {
    toast.info('先用一句话说清要点，例如：出一个九成新 iPad，1500 元，可小刀')
    return
  }
  aiWriting.value = true
  try {
    const res: any = await aiApi.draft({ raw, sectionId: form.sectionId || undefined })
    const d = res?.data
    if (!d || !d.title) throw new Error('empty draft')
    form.title = d.title
    form.content = d.content || form.content
    if (d.sectionId) form.sectionId = Number(d.sectionId)
    // 价格只填空白项，避免覆盖用户已手填的值
    if (d.price && !form.extraFields.price) setExtra('price', String(d.price))
    aiTags.value = Array.isArray(d.tags) ? d.tags.slice(0, 4) : []
    // 标签以话题形式挂在正文末尾（帖子模型无独立标签字段）
    if (aiTags.value.length) {
      const tagLine = aiTags.value.map((t: string) => `#${t}`).join(' ')
      if (!form.content.includes(tagLine)) form.content = `${form.content}\n\n${tagLine}`
    }
    toast.success(d.offline ? '已按站内规则生成草稿，可继续修改' : 'AI 已生成，请按实际情况修改')
  } catch {
    toast.error('AI 成稿失败，请稍后重试或直接手写')
  } finally {
    aiWriting.value = false
  }
}

watch(form, () => {
  // 编辑模式不写本地草稿：避免把「对已发布帖的修改」误存成新建草稿
  if (editId.value) return
  const hasContent = form.title.trim() || form.content.trim() || form.images.length
  if (hasContent) {
    localStorage.setItem(LOCAL_DRAFT_KEY, JSON.stringify({
      sectionId: form.sectionId,
      title: form.title,
      content: form.content,
      images: form.images,
      isAnonymous: form.isAnonymous,
      extraFields: form.extraFields,
    }))
  } else {
    localStorage.removeItem(LOCAL_DRAFT_KEY)
  }
}, { deep: true })

async function saveDraft() {
  if (!userStore.isLoggedIn) {
    toast.info('登录后才能保存云端草稿')
    return
  }
  if (!form.title.trim() && !form.content.trim()) {
    toast.info('还没有可保存的内容')
    return
  }
  try {
    await draftApi.save({
      sectionId: form.sectionId || undefined,
      title: form.title,
      content: form.content,
      images: form.images,
      isAnonymous: form.isAnonymous,
      extraFields: form.extraFields,
    })
    // 已上云的本地副本清掉，避免与云端重复
    localStorage.removeItem(LOCAL_DRAFT_KEY)
    toast.success('草稿已保存到云端草稿箱')
  } catch {}
}

// 强匿名板块不再自动开启匿名（<90 用户会被提交时拦截、自相矛盾），
// 改为在模板中展示说明；见「选择板块」卡片内的提示与匿名开关旁注。

// 切换板块：已填差异化字段时先弹确认再清空，避免静默丢失
const showSwitchConfirm = ref(false)
const pendingSectionId = ref(0)
const hasExtraFields = computed(() =>
  Object.values(form.extraFields).some((v) => v !== '' && v !== undefined && v !== null),
)

function applySection(id: number) {
  form.sectionId = id
  form.extraFields = {}
}

function pickSection(id: number) {
  showSectionPicker.value = false
  if (id === form.sectionId) return
  if (hasExtraFields.value) {
    pendingSectionId.value = id
    showSwitchConfirm.value = true
    return
  }
  applySection(id)
}

function confirmSwitch() {
  showSwitchConfirm.value = false
  if (pendingSectionId.value) applySection(pendingSectionId.value)
  pendingSectionId.value = 0
}

// 板块选择面板点击外部关闭
const sectionPickerRef = ref<HTMLElement | null>(null)
function onDocumentClick(e: MouseEvent) {
  if (!showSectionPicker.value) return
  const target = e.target as HTMLElement
  if (sectionPickerRef.value && !sectionPickerRef.value.contains(target)) {
    showSectionPicker.value = false
  }
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})
onMounted(() => { document.addEventListener('paste', onPaste) })
onUnmounted(() => {
  document.removeEventListener('paste', onPaste)
  document.removeEventListener('click', onDocumentClick)
})

// 浏览器端 canvas 压缩：最长边 ≤1600、jpeg 质量 0.85；≤200KB 不压
async function compressImage(file: File): Promise<File> {
  if (file.size <= 200 * 1024) return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // 解码失败（如部分环境的 HEIC）则原样上传，交由服务端处理
  }
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
  if (!blob || blob.size >= file.size) return file
  return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' })
}

/** 把一批图片压缩上传并塞进 form.images（点选 / 粘贴 / 拖拽共用同一入口） */
async function addFiles(files: File[]): Promise<void> {
  const remaining = 9 - form.images.length
  if (remaining <= 0) {
    toast.error('最多上传9张图片')
    return
  }
  const picked = files.slice(0, remaining)
  if (files.length > remaining) {
    toast.info(`仅上传前 ${remaining} 张，已达上限`)
  }
  uploading.value = true
  try {
    // 并发上传：分块（每块 ≤3 张）+ Promise.all，替代原先的串行 for-await
    const CONCURRENCY = 3
    const validFiles: File[] = []
    for (const file of picked) {
      if (form.images.length + validFiles.length >= 9) break
      if (file.size > 20 * 1024 * 1024) {
        toast.error(`${file.name || '图片'} 超过20MB，无法上传`)
        continue
      }
      validFiles.push(file)
    }
    // 上传单个文件：先本地压缩再请求上传；返回 url 或抛错
    async function uploadOne(file: File): Promise<string> {
      const payload = await compressImage(file)
      const res: any = await uploadApi.upload(payload)
      return res.data.url as string
    }
    // 按 CONCURRENCY 分块，块内并发、块间串行（避免一次性建太多并发连接）
    const chunks: File[][] = []
    for (let i = 0; i < validFiles.length; i += CONCURRENCY) {
      chunks.push(validFiles.slice(i, i + CONCURRENCY))
    }
    for (const chunk of chunks) {
      const urls = await Promise.all(chunk.map(uploadOne))
      for (const url of urls) {
        if (form.images.length < 9) form.images.push(url)
      }
    }
  } catch {
    // 错误已由拦截器 toast
  } finally {
    uploading.value = false
  }
}

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const files = Array.from(input.files)
  input.value = ''
  await addFiles(files)
}

// 拖拽上传：拖图片进图片区直接上传（dragleave 在子元素间抖动可忽略）
function onDragOver(e: DragEvent) {
  if (!e.dataTransfer?.types?.includes('Files')) return
  e.preventDefault()
  dragOver.value = true
}
function onDragLeave(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
}
function onDrop(e: DragEvent) {
  dragOver.value = false
  if (!e.dataTransfer?.files?.length) return
  e.preventDefault()
  const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
  if (files.length) addFiles(files)
}

// 粘贴上传：剪贴板里有图片才接管，纯文本粘贴不拦截（截图 Ctrl+V 直接进图床）
function onPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  const imgs: File[] = []
  for (const it of Array.from(items)) {
    if (it.kind === 'file' && it.type.startsWith('image/')) {
      const f = it.getAsFile()
      if (f) imgs.push(f)
    }
  }
  if (!imgs.length) return
  e.preventDefault()
  addFiles(imgs)
}

function removeImage(idx: number) {
  form.images.splice(idx, 1)
}

// ── 发布前预览：复用 PostCard 所见即所得；捕获阶段 stop 冒泡避免预览里的点击真的触发点赞/跳转 ──
const showPreview = ref(false)
const previewPost = computed(() => ({
  id: 0,
  title: form.title || '（标题还没写）',
  content: form.content || '（正文还没写）',
  images: form.images,
  thumbImages: form.images.slice(0, 4),
  section: selectedSection.value || {},
  author: {
    nickname: form.isAnonymous ? '匿名同学' : (userStore.user?.nickname || '我'),
    avatar: form.isAnonymous ? '' : (userStore.user?.avatar || ''),
  },
  isAnonymous: form.isAnonymous,
  extraFields: { ...form.extraFields },
  likeCount: 0,
  commentCount: 0,
  favoriteCount: 0,
  viewCount: 0,
  createdAt: new Date().toISOString(),
}))
function openPreview() {
  if (!form.title.trim() && !form.content.trim()) {
    toast.error('先写点内容再预览')
    return
  }
  showPreview.value = true
}

function onAnonymousChange(v: boolean) {
  if (v && !userStore.canAnonymous) {
    creditDenyToast(90)
    return
  }
  if (v) toast.info('匿名发布后台可溯源，请文明发言')
  form.isAnonymous = v
}

function setExtra(key: string, value: any) {
  form.extraFields[key] = value
}

function retrySections() {
  appStore.fetchSections().catch(() => {})
}

async function handleSubmit() {
  if (loading.value) return
  if (!userStore.canPost) {
    creditDenyToast(60)
    return
  }
  if (!form.sectionId) {
    // 区分「没选」与「板块列表没加载出来」，后者引导重试而不是让用户干瞪眼
    toast.error(appStore.sectionsError && !appStore.sections.length ? '板块加载失败，请点上方重试' : '请选择板块')
    return
  }
  if (!form.title.trim()) {
    toast.error('请输入标题')
    return
  }
  if (form.title.length > 50) {
    toast.error('标题最多50字')
    return
  }
  if (form.content.length < 10 || form.content.length > 500) {
    toast.error('正文需10-500字')
    return
  }
  // 与后端分级一致：review 硬词才拦截，warn 仅提示不阻断
  if (sensitive.value.level === 'review') {
    toast.error(`内容包含违规敏感词：${sensitive.value.hits.join('、')}，请修改后再发布`)
    return
  }
  if (form.isAnonymous && !userStore.canAnonymous) {
    creditDenyToast(90)
    return
  }
  if (selectedSection.value?.forceAnonymous && !form.isAnonymous) {
    toast.error('该板块必须匿名发布')
    return
  }
  // 失物招领必须选方向：雷达匹配与「丢失/拾获」双 Tab 都以 direction 为前提，
  // 缺省会让这条帖子既不进雷达也不进任一方向 Tab
  if (sectionKind.value === 'lost' && !form.extraFields.direction) {
    toast.error('请选择「我丢失了」或「我捡到了」')
    return
  }
  loading.value = true
  try {
    // 编辑模式：提交走 PUT /posts/:id（服务端 24h 窗口校验，状态由服务端推导）
    if (editId.value) {
      const res: any = await postApi.edit(editId.value, {
        sectionId: form.sectionId,
        title: form.title.trim(),
        content: form.content,
        images: form.images,
        isAnonymous: form.isAnonymous,
        extraFields: form.extraFields,
      })
      toast.success(res.message || '修改成功')
      router.replace(`/post/${editId.value}`)
      return
    }
    const res: any = await postApi.publish({
      sectionId: form.sectionId,
      title: form.title.trim(),
      content: form.content,
      images: form.images,
      isAnonymous: form.isAnonymous,
      extraFields: form.extraFields,
    })
    toast.success(res.message || '发布成功')
    // 发布成功：清空本地草稿，且不再回存云端草稿
    localStorage.removeItem(LOCAL_DRAFT_KEY)
    // 失物招领智能匹配：命中候选帖时提示
    if (res.data?.matchedCount > 0) toast.info('发现疑似匹配的帖子，可在详情页查看')
    router.replace(`/post/${res.data.id}`)
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen pb-24" style="background: var(--paper)">
    <!-- 顶部：墨色海报条 -->
    <header class="hero sticky top-0 z-10">
      <div class="max-w-[960px] mx-auto flex items-center justify-between gap-2 h-14 px-3">
        <button class="shrink-0 p-2 -ml-2 text-white/90 hover:text-white transition" aria-label="返回" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="ds-display text-[17px] text-white truncate">{{ editId ? '编辑帖子' : '发布' }}</span>
        <div class="flex items-center gap-2 shrink-0">
          <button v-if="!editId" class="p-2 text-white/80 hover:text-white transition" title="草稿箱" @click="router.push('/profile/drafts')">
            <FileText class="w-5 h-5" />
          </button>
          <button
            :disabled="loading"
            class="ds-btn ds-btn--accent ds-btn--sm"
            @click="handleSubmit"
          >
            {{ editId ? '保存' : '发布' }}
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-4">
      <!-- 信誉分提示 -->
      <div v-if="!userStore.canPost" class="ds-card ds-card--flat flex items-center gap-2 p-3 text-xs" style="border-color: var(--coral); color: var(--coral)">
        <ShieldAlert class="w-4 h-4 flex-shrink-0" /> 需要信誉分 60，当前 {{ creditScore }} 分。通过交易互评可提升信誉
      </div>

      <!-- 编辑模式：驳回原因提示（修改重发场景） -->
      <div v-if="editId && editingPost?.rejectReason" class="ds-card ds-card--flat flex items-start gap-2 p-3 text-xs leading-relaxed" style="border-color: var(--coral); color: var(--coral)">
        <ShieldAlert class="w-4 h-4 flex-shrink-0 mt-0.5" />
        <span>该帖曾被驳回：{{ editingPost.rejectReason }}。请修改内容后保存，将重新提交审核</span>
      </div>

      <!-- AI 一键成稿：荧光贴纸卡（lime 头部 + ds-input + ds-btn--primary） -->
      <section class="ds-card overflow-hidden">
        <div class="flex items-center gap-2 px-4 py-2.5" style="background: var(--lime); border-bottom: 1.5px solid var(--ink)">
          <Wand2 class="w-4 h-4 shrink-0" style="color: var(--ink)" />
          <span class="ds-display text-[14px]" style="color: var(--ink)">AI 一键成稿</span>
          <span class="ds-sticker ds-sticker--coral ml-auto shrink-0">30 秒发一条</span>
        </div>
        <div class="p-4">
          <div class="flex gap-2">
            <input
              v-model="aiRaw"
              type="text"
              maxlength="120"
              placeholder="一句话说清要点：出九成新 iPad，1500 元，可小刀"
              class="ds-input flex-1 min-w-0"
              @keyup.enter="aiCompose"
            />
            <button
              type="button"
              :disabled="aiWriting"
              class="ds-btn ds-btn--primary shrink-0"
              @click="aiCompose"
            >
              <Loader2 v-if="aiWriting" class="w-4 h-4 animate-spin" />
              <Sparkles v-else class="w-4 h-4" />
              {{ aiWriting ? '生成中' : '生成' }}
            </button>
          </div>
          <p class="ds-sub mt-2">
            自动补全标题、正文、板块与价格；生成后请按实际情况修改再发布（未接入大模型时按站内规则生成）
          </p>
          <div v-if="aiTags.length" class="mt-2 flex flex-wrap gap-1.5">
            <span v-for="t in aiTags" :key="t" class="ds-tag">#{{ t }}</span>
          </div>
        </div>
      </section>

      <!-- 板块选择：触发框用墨线输入框，选项用 ds-chip -->
      <section ref="sectionPickerRef" class="ds-card p-4">
        <label class="ds-label block mb-2">选择板块 <span style="color: var(--coral)">*</span></label>
        <!-- 板块接口失败时给出重试：否则选择器为空、每次提交都被「请选择板块」挡住 -->
        <div v-if="appStore.sectionsError && !appStore.sections.length" class="ds-card ds-card--flat mb-2 flex items-center gap-2 p-3 text-xs" style="border-color: var(--coral); border-style: dashed; color: var(--coral)">
          <span class="flex-1">板块加载失败，请重试</span>
          <button class="ds-btn ds-btn--danger ds-btn--sm" @click="retrySections">重试</button>
        </div>
        <button
          class="ds-input flex items-center justify-between gap-2 text-left"
          @click="showSectionPicker = !showSectionPicker"
        >
          <span class="truncate" :style="form.sectionId ? 'color: var(--ink)' : 'color: var(--ink-mute)'">
            {{ selectedSection?.name || '请选择板块' }}
          </span>
          <ChevronDown class="w-4 h-4 shrink-0 transition-transform" style="color: var(--ink-mute)" :class="showSectionPicker ? 'rotate-180' : ''" />
        </button>
        <div v-if="showSectionPicker" class="mt-3 flex flex-wrap gap-2">
          <button
            v-for="s in appStore.sections"
            :key="s.id"
            class="ds-chip"
            :class="{ 'is-active': form.sectionId === s.id }"
            @click="pickSection(s.id)"
          >
            {{ s.name }}
          </button>
        </div>
        <!-- 强匿名板块说明：不再自动开启匿名开关，改为明示规则 -->
        <p v-if="selectedSection?.forceAnonymous" class="ds-card ds-card--flat mt-2 p-3 text-xs leading-relaxed" style="border-style: dashed; border-color: var(--ink-mute); color: var(--ink-mute)">
          「{{ selectedSection.name }}」为强匿名板块：需开启下方「匿名发布」后才能发布<template v-if="!userStore.canAnonymous">；开启匿名需要信誉分 ≥90，当前 {{ creditScore }} 分，暂不能在该板块发布</template>。
        </p>
      </section>

      <!-- 标题 -->
      <section class="ds-card p-4">
        <div class="flex items-center justify-between mb-2">
          <label class="ds-label">标题 <span style="color: var(--coral)">*</span></label>
          <span class="ds-num text-xs" :style="form.title.length > 50 ? 'color: var(--coral)' : 'color: var(--ink-mute)'">{{ form.title.length }}/50</span>
        </div>
        <input v-model="form.title" type="text" maxlength="50" placeholder="一句话概括" class="ds-input" />
      </section>

      <!-- 正文 -->
      <section class="ds-card p-4">
        <div class="flex items-center justify-between mb-2">
          <label class="ds-label">正文 <span style="color: var(--coral)">*</span></label>
          <span class="ds-num text-xs" :style="form.content.length > 500 ? 'color: var(--coral)' : 'color: var(--ink-mute)'">{{ form.content.length }}/500</span>
        </div>
        <textarea v-model="form.content" maxlength="500" rows="6" placeholder="说点什么，至少10个字" class="ds-input resize-none post-content"></textarea>
        <!-- 敏感词提示：review 拦截、warn 仅提示 -->
        <div v-if="sensitive.level === 'review'" class="mt-2 flex items-start gap-1.5 text-xs" style="color: var(--coral)">
          <ShieldAlert class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>内容包含违规敏感词：{{ sensitive.hits.join('、') }}，请修改后再发布</span>
        </div>
        <div v-else-if="sensitive.level === 'warn'" class="mt-2 flex items-start gap-1.5 text-xs" style="color: var(--ink-mute)">
          <ShieldAlert class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>检测到敏感表述：{{ sensitive.hits.join('、') }}，建议斟酌用词（不影响发布）</span>
        </div>
      </section>

      <!-- 图片上传：墨线虚线框，支持点选 / Ctrl+V 粘贴 / 拖拽 -->
      <section class="ds-card p-4" :class="{ 'is-dropzone': dragOver }">
        <div class="flex items-center justify-between mb-2">
          <label class="ds-label">图片（最多9张）</label>
          <span class="text-[10.5px]" style="color: var(--ink-mute)">可粘贴截图 / 拖入图片</span>
        </div>
        <div class="grid grid-cols-3 gap-2" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
          <div v-for="(img, i) in form.images" :key="i" class="relative aspect-square rounded-xl overflow-hidden" style="border: 1.5px solid var(--ink)">
            <img :src="img" class="w-full h-full object-cover" alt="" />
            <button class="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center" style="background: var(--coral); color: var(--paper)" @click="removeImage(i)">
              <X class="w-3 h-3" />
            </button>
          </div>
          <label v-if="form.images.length < 9" class="pub-upload ds-card ds-card--hover aspect-square flex flex-col items-center justify-center gap-1 cursor-pointer" :class="uploading ? 'pointer-events-none opacity-60' : ''">
            <ImagePlus v-if="!uploading" class="w-7 h-7" />
            <Loader2 v-else class="w-7 h-7 animate-spin" />
            <span v-if="!uploading" class="ds-label">上传图片</span>
            <span v-else class="ds-label">上传中</span>
            <input type="file" accept="image/jpeg,image/png,image/heic" multiple class="hidden" :disabled="uploading" @change="onUpload" />
          </label>
        </div>
      </section>

      <!-- 板块差异化字段 -->
      <section v-if="sectionKind === 'trade'" class="ds-card p-4 space-y-3">
        <h4 class="ds-label">交易信息</h4>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">价格</span>
          <input v-model="form.extraFields.price" type="text" placeholder="¥ 金额" @input="setExtra('price', form.extraFields.price)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">新旧</span>
          <select v-model="form.extraFields.condition" class="ds-input flex-1 min-w-0">
            <option value="">请选择</option>
            <option value="全新">全新</option>
            <option value="九成新">九成新</option>
            <option value="八成新">八成新</option>
            <option value="七成新及以下">七成新及以下</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">联系方式</span>
          <input v-model="form.extraFields.contact" type="text" placeholder="微信/QQ" @input="setExtra('contact', form.extraFields.contact)"
            class="ds-input flex-1 min-w-0" />
        </div>
      </section>

      <section v-else-if="sectionKind === 'lost'" class="ds-card p-4 space-y-3">
        <h4 class="ds-label">失物信息</h4>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">类型</span>
          <div class="flex-1 min-w-0 flex gap-2">
            <button v-for="d in [{ v: 'lost', t: '我丢失了' }, { v: 'found', t: '我捡到了' }]" :key="d.v"
              type="button" class="ds-chip flex-1 justify-center"
              :class="{ 'is-active': form.extraFields.direction === d.v }"
              @click="setExtra('direction', d.v)">
              {{ d.t }}
            </button>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">地点</span>
          <input v-model="form.extraFields.location" type="text" placeholder="丢失/拾到地点" @input="setExtra('location', form.extraFields.location)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">时间</span>
          <input v-model="form.extraFields.time" type="text" placeholder="如：今天上午" @input="setExtra('time', form.extraFields.time)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">物品类型</span>
          <input v-model="form.extraFields.itemType" type="text" placeholder="如：校园卡/钥匙" @input="setExtra('itemType', form.extraFields.itemType)"
            class="ds-input flex-1 min-w-0" />
        </div>
      </section>

      <section v-else-if="sectionKind === 'activity'" class="ds-card p-4 space-y-3">
        <h4 class="ds-label">活动信息</h4>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">时间</span>
          <input v-model="form.extraFields.time" type="text" placeholder="活动时间" @input="setExtra('time', form.extraFields.time)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">地点</span>
          <input v-model="form.extraFields.location" type="text" placeholder="活动地点" @input="setExtra('location', form.extraFields.location)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">主办方</span>
          <input v-model="form.extraFields.organizer" type="text" placeholder="主办方/社团" @input="setExtra('organizer', form.extraFields.organizer)"
            class="ds-input flex-1 min-w-0" />
        </div>
      </section>

      <section v-else-if="sectionKind === 'carpool'" class="ds-card p-4 space-y-3">
        <h4 class="ds-label">拼车信息</h4>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">出发时间</span>
          <input v-model="form.extraFields.time" type="text" placeholder="如：周五 18:00" @input="setExtra('time', form.extraFields.time)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">集合点</span>
          <input v-model="form.extraFields.location" type="text" placeholder="如：东门/校车站" @input="setExtra('location', form.extraFields.location)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">分摊费用</span>
          <input v-model="form.extraFields.price" type="text" placeholder="如：人均 ¥30" @input="setExtra('price', form.extraFields.price)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">联系方式</span>
          <input v-model="form.extraFields.contact" type="text" placeholder="微信/QQ" @input="setExtra('contact', form.extraFields.contact)"
            class="ds-input flex-1 min-w-0" />
        </div>
      </section>

      <section v-else-if="sectionKind === 'teamup'" class="ds-card p-4 space-y-3">
        <h4 class="ds-label">组队信息</h4>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">活动时间</span>
          <input v-model="form.extraFields.time" type="text" placeholder="如：周六全天" @input="setExtra('time', form.extraFields.time)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">集合地点</span>
          <input v-model="form.extraFields.location" type="text" placeholder="集合地点" @input="setExtra('location', form.extraFields.location)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">主办方</span>
          <input v-model="form.extraFields.organizer" type="text" placeholder="主办方/社团" @input="setExtra('organizer', form.extraFields.organizer)"
            class="ds-input flex-1 min-w-0" />
        </div>
        <div class="flex items-center gap-2">
          <span class="ds-label w-16 shrink-0">联系方式</span>
          <input v-model="form.extraFields.contact" type="text" placeholder="微信/QQ" @input="setExtra('contact', form.extraFields.contact)"
            class="ds-input flex-1 min-w-0" />
        </div>
      </section>

      <!-- 匿名开关 -->
      <section class="ds-card p-4 flex items-center justify-between gap-3">
        <div class="min-w-0">
          <p class="ds-label">匿名发布</p>
          <p class="ds-sub mt-0.5">匿名发布后台可溯源，请文明发言</p>
          <p v-if="!userStore.canAnonymous" class="ds-sub mt-0.5" style="color: var(--coral)">信誉分 ≥90 可匿名，当前 {{ creditScore }} 分</p>
          <p v-if="selectedSection?.forceAnonymous" class="ds-sub mt-0.5" style="color: var(--violet)">当前板块要求匿名发布</p>
        </div>
        <button
          class="relative w-12 h-7 rounded-full shrink-0 transition"
          :style="{ background: form.isAnonymous ? 'var(--ink)' : 'rgb(20 17 15 / 0.14)' }"
          :class="!userStore.canAnonymous ? 'opacity-50 cursor-not-allowed' : ''"
          :disabled="!userStore.canAnonymous"
          @click="onAnonymousChange(!form.isAnonymous)"
        >
          <span class="absolute top-1 left-1 w-5 h-5 rounded-full transition-transform" style="background: var(--card); border: 1.5px solid var(--ink); box-sizing: border-box" :class="form.isAnonymous ? 'translate-x-5' : ''"></span>
        </button>
      </section>

      <!-- 底部提交条：墨底 + 荧光大按钮（唯一视觉重心） -->
      <section class="ds-poster flex items-center gap-3 p-3" style="border-radius: 18px">
        <button
          v-if="!editId"
          class="pub-draft ds-btn shrink-0"
          @click="openPreview"
        >
          预览
        </button>
        <button
          v-if="!editId"
          class="pub-draft ds-btn shrink-0"
          @click="saveDraft"
        >
          存草稿
        </button>
        <button
          :disabled="loading"
          class="pub-submit ds-btn ds-btn--accent flex-1"
          @click="handleSubmit"
        >
          <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
          {{ loading ? (editId ? '保存中...' : '发布中...') : (editId ? '保存修改' : '发布') }}
        </button>
      </section>
    </main>

    <!-- 切换板块确认：避免静默清空已填的差异化字段 -->
    <!-- 发布前预览弹窗 -->
    <Teleport to="body">
      <div v-if="showPreview" class="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-3 animate-fade-in" role="dialog" aria-modal="true" aria-label="发布预览" @click.self="showPreview = false">
        <div class="absolute inset-0 ds-scrim"></div>
        <div class="relative w-full max-w-[540px] flex flex-col" style="max-height: 82vh">
          <div class="flex items-center gap-2 px-1 pb-2">
            <span class="ds-sticker ds-sticker--sky">PREVIEW</span>
            <span class="ds-label" style="color: rgb(247 242 232 / 0.72)">这就是发布后的样子（预览中不可互动）</span>
            <button type="button" class="ds-icon-btn !w-8 !h-8 ml-auto" style="background: rgb(255 255 255 / 0.12); border-color: rgb(255 255 255 / 0.34); color: #fff; box-shadow: none" aria-label="关闭预览" @click="showPreview = false">
              <X class="w-4 h-4" />
            </button>
          </div>
          <div class="overflow-y-auto overscroll-contain px-1 pb-1" @click.capture.stop @touchstart.stop.capture>
            <PostCard :post="previewPost" />
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog
      :visible="showSwitchConfirm"
      title="切换板块"
      content="切换板块将清空已填的板块专属信息"
      confirm-text="继续切换"
      @confirm="confirmSwitch"
      @cancel="showSwitchConfirm = false"
    />
  </div>
</template>

<style scoped>
.pub-upload { border-style: dashed; border-color: var(--ink); color: var(--ink-mute); }
.pub-upload:hover { color: var(--ink); }
.pub-card { transition: box-shadow 0.15s ease; }
.is-dropzone { box-shadow: 0 0 0 3px var(--lime), var(--shadow-hard); }
/* 恒暗提交条上的幽灵按钮：文字必须恒亮（--paper 深色会翻黑） */
.pub-draft {
  padding: 12px 18px;
  background: transparent;
  color: #F7F2E8;
  border-color: rgb(255 255 255 / 0.42);
  box-shadow: none;
}
.pub-submit { padding: 13px 20px; font-size: 15px; }
</style>

