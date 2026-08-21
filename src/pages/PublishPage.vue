<script setup lang="ts">
/**
 * 发布页：板块选择、标题、正文、图片、匿名、敏感词检测、板块差异化字段
 */
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, X, ImagePlus, Loader2, ShieldAlert, ChevronDown, FileText } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { useUserStore } from '@/stores/user'
import { postApi, uploadApi, draftApi } from '@/utils/api'
import { checkSensitive } from '@/utils/helpers'
import { toast } from '@/utils/request'

const router = useRouter()
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
const showSectionPicker = ref(false)

const sensitive = computed(() => checkSensitive(form.title + ' ' + form.content))
const selectedSection = computed(() => appStore.sections.find((s) => s.id === form.sectionId))
const sectionKind = computed(() => {
  const name = selectedSection.value?.name || ''
  if (name.includes('二手') || name.includes('交易')) return 'trade'
  if (name.includes('失物') || name.includes('招领')) return 'lost'
  if (name.includes('活动')) return 'activity'
  return ''
})

onMounted(() => {
  if (!appStore.sections.length) appStore.fetchSections()
  if (!userStore.canPost) {
    toast.error('信誉分低于60，暂不可发帖')
  }
  // 恢复草稿
  const restore = sessionStorage.getItem('campus-wall-draft-restore')
  if (restore) {
    try {
      const d = JSON.parse(restore)
      form.sectionId = d.sectionId || 0
      form.title = d.title || ''
      form.content = d.content || ''
      form.images = d.images || []
      form.isAnonymous = !!d.isAnonymous
      form.extraFields = d.extraFields || {}
      sessionStorage.removeItem('campus-wall-draft-restore')
      toast.info('已恢复草稿内容')
    } catch {}
  }
})

// 自动保存草稿（30秒一次）；登录用户进入页面后立即启动定时器
const autoSaveTimer = ref<any>(null)
function startAutoSave() {
  if (autoSaveTimer.value) return
  autoSaveTimer.value = setInterval(() => {
    if (form.title.trim() || form.content.trim()) {
      autoSaveDraft()
    }
  }, 30000)
}
function stopAutoSave() {
  if (autoSaveTimer.value) {
    clearInterval(autoSaveTimer.value)
    autoSaveTimer.value = null
  }
}
async function autoSaveDraft() {
  if (!userStore.isLoggedIn) return
  try {
    await draftApi.save({
      sectionId: form.sectionId || undefined,
      title: form.title,
      content: form.content,
      images: form.images,
      isAnonymous: form.isAnonymous,
      extraFields: form.extraFields,
    })
  } catch {}
}
// 登录用户进入页面后启动自动保存（不再要求标题先有内容）
onMounted(() => {
  if (userStore.isLoggedIn) {
    setTimeout(startAutoSave, 2000)
  }
})
onUnmounted(() => {
  stopAutoSave()
  // 离开前若有内容，自动保存草稿
  if (userStore.isLoggedIn && (form.title.trim() || form.content.trim())) {
    autoSaveDraft()
  }
})

// 当选中板块为强制匿名时，自动开启匿名开关
watch(() => form.sectionId, (id) => {
  const sec = appStore.sections.find((s) => s.id === id)
  if (sec?.forceAnonymous && !form.isAnonymous) {
    form.isAnonymous = true
    toast.info('该板块要求匿名发布，已自动开启匿名')
  }
})

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
onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
})

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  const remaining = 9 - form.images.length
  if (remaining <= 0) {
    toast.error('最多上传9张图片')
    input.value = ''
    return
  }
  const files = Array.from(input.files).slice(0, remaining)
  if (input.files.length > remaining) {
    toast.info(`仅上传前 ${remaining} 张，已达上限`)
  }
  uploading.value = true
  try {
    for (const file of files) {
      if (form.images.length >= 9) break
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} 超过5MB，请压缩后上传`)
        continue
      }
      const res: any = await uploadApi.upload(file)
      form.images.push(res.data.url)
    }
  } catch {
    // 错误已由拦截器 toast
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function removeImage(idx: number) {
  form.images.splice(idx, 1)
}

function onAnonymousChange(v: boolean) {
  if (v && !userStore.canAnonymous) {
    toast.error('信誉分低于90，不可匿名发布')
    return
  }
  if (v) toast.info('匿名发布后台可溯源，请文明发言')
  form.isAnonymous = v
}

function setExtra(key: string, value: any) {
  form.extraFields[key] = value
}

async function handleSubmit() {
  if (loading.value) return
  if (!userStore.canPost) {
    toast.error('信誉分过低，暂不可发帖')
    return
  }
  if (!form.sectionId) {
    toast.error('请选择板块')
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
  if (sensitive.value.hit) {
    toast.error(`内容包含敏感词：${sensitive.value.words.join('、')}`)
    return
  }
  if (form.isAnonymous && !userStore.canAnonymous) {
    toast.error('信誉分低于90，不可匿名发布')
    return
  }
  if (selectedSection.value?.forceAnonymous && !form.isAnonymous) {
    toast.error('该板块必须匿名发布')
    return
  }
  loading.value = true
  try {
    const res: any = await postApi.publish({
      sectionId: form.sectionId,
      title: form.title.trim(),
      content: form.content,
      images: form.images,
      isAnonymous: form.isAnonymous,
      extraFields: form.extraFields,
    })
    toast.success(res.message || '发布成功')
    router.replace(`/post/${res.data.id}`)
  } catch {
    // 错误已由拦截器 toast
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-zinc-50 pb-24">
    <!-- 顶部 -->
    <header class="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-zinc-100">
      <div class="max-w-[960px] mx-auto flex items-center justify-between h-14 px-3">
        <button class="p-2 -ml-2 text-zinc-600 hover:text-zinc-900" @click="router.back()">
          <ArrowLeft class="w-5 h-5" />
        </button>
        <span class="font-medium text-zinc-900">发布</span>
        <div class="flex items-center gap-2">
          <button class="p-2 text-zinc-500 hover:text-zinc-700" title="草稿箱" @click="router.push('/profile/drafts')">
            <FileText class="w-5 h-5" />
          </button>
          <button
            :disabled="loading"
            class="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white rounded-full text-sm font-medium transition"
            @click="handleSubmit"
          >
            发布
          </button>
        </div>
      </div>
    </header>

    <main class="max-w-[960px] mx-auto px-4 py-4 space-y-4">
      <!-- 信誉分提示 -->
      <div v-if="!userStore.canPost" class="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">
        <ShieldAlert class="w-4 h-4 flex-shrink-0" /> 信誉分低于60，暂不可发帖
      </div>

      <!-- 板块选择 -->
      <div ref="sectionPickerRef" class="bg-white rounded-xl p-4">
        <label class="block text-sm font-medium text-zinc-700 mb-2">选择板块 <span class="text-red-500">*</span></label>
        <button
          class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-sm"
          @click="showSectionPicker = !showSectionPicker"
        >
          <span :class="form.sectionId ? 'text-zinc-900' : 'text-zinc-400'">
            {{ selectedSection?.name || '请选择板块' }}
          </span>
          <ChevronDown class="w-4 h-4 text-zinc-400 transition-transform" :class="showSectionPicker ? 'rotate-180' : ''" />
        </button>
        <div v-if="showSectionPicker" class="mt-2 grid grid-cols-3 gap-2">
          <button
            v-for="s in appStore.sections"
            :key="s.id"
            class="px-2 py-2 rounded-lg text-sm border transition"
            :class="form.sectionId === s.id ? 'border-brand-500 bg-brand-50 text-brand-600' : 'border-zinc-200 text-zinc-600 hover:border-brand-300'"
            @click="form.sectionId = s.id; form.extraFields = {}; showSectionPicker = false"
          >
            {{ s.name }}
          </button>
        </div>
      </div>

      <!-- 标题 -->
      <div class="bg-white rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-zinc-700">标题 <span class="text-red-500">*</span></label>
          <span class="text-xs" :class="form.title.length > 50 ? 'text-red-500' : 'text-zinc-400'">{{ form.title.length }}/50</span>
        </div>
        <input v-model="form.title" type="text" maxlength="50" placeholder="一句话概括"
          class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition" />
      </div>

      <!-- 正文 -->
      <div class="bg-white rounded-xl p-4">
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm font-medium text-zinc-700">正文 <span class="text-red-500">*</span></label>
          <span class="text-xs" :class="form.content.length > 500 ? 'text-red-500' : 'text-zinc-400'">{{ form.content.length }}/500</span>
        </div>
        <textarea v-model="form.content" maxlength="500" rows="6" placeholder="说点什么，至少10个字"
          class="w-full px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100 transition resize-none post-content"></textarea>
        <!-- 敏感词提示 -->
        <div v-if="sensitive.hit" class="mt-2 flex items-start gap-1.5 text-xs text-red-500">
          <ShieldAlert class="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>检测到敏感词：{{ sensitive.words.join('、') }}，请修改后再发布</span>
        </div>
      </div>

      <!-- 图片上传 -->
      <div class="bg-white rounded-xl p-4">
        <label class="block text-sm font-medium text-zinc-700 mb-2">图片（最多9张）</label>
        <div class="grid grid-cols-3 gap-2">
          <div v-for="(img, i) in form.images" :key="i" class="relative aspect-square rounded-lg overflow-hidden bg-zinc-100">
            <img :src="img" class="w-full h-full object-cover" alt="" />
            <button class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center" @click="removeImage(i)">
              <X class="w-3 h-3" />
            </button>
          </div>
          <label v-if="form.images.length < 9" class="aspect-square rounded-xl border-2 border-dashed border-zinc-200 flex flex-col items-center justify-center text-zinc-400 hover:border-brand-400 hover:text-brand-500 hover:bg-brand-50/50 cursor-pointer transition" :class="uploading ? 'pointer-events-none opacity-60' : ''">
            <ImagePlus v-if="!uploading" class="w-7 h-7 mb-1" />
            <Loader2 v-else class="w-7 h-7 animate-spin" />
            <span v-if="!uploading" class="text-xs">上传图片</span>
            <span v-else class="text-xs">上传中</span>
            <input type="file" accept="image/jpeg,image/png" multiple class="hidden" :disabled="uploading" @change="onUpload" />
          </label>
        </div>
      </div>

      <!-- 板块差异化字段 -->
      <div v-if="sectionKind === 'trade'" class="bg-white rounded-xl p-4 space-y-3">
        <h4 class="text-sm font-medium text-zinc-700">交易信息</h4>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">价格</span>
          <input v-model="form.extraFields.price" type="text" placeholder="¥ 金额" @input="setExtra('price', form.extraFields.price)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">新旧</span>
          <select v-model="form.extraFields.condition" class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm">
            <option value="">请选择</option>
            <option value="全新">全新</option>
            <option value="九成新">九成新</option>
            <option value="八成新">八成新</option>
            <option value="七成新及以下">七成新及以下</option>
          </select>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">联系方式</span>
          <input v-model="form.extraFields.contact" type="text" placeholder="微信/QQ" @input="setExtra('contact', form.extraFields.contact)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
      </div>

      <div v-else-if="sectionKind === 'lost'" class="bg-white rounded-xl p-4 space-y-3">
        <h4 class="text-sm font-medium text-zinc-700">失物信息</h4>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">地点</span>
          <input v-model="form.extraFields.location" type="text" placeholder="丢失/拾到地点" @input="setExtra('location', form.extraFields.location)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">时间</span>
          <input v-model="form.extraFields.time" type="text" placeholder="如：今天上午" @input="setExtra('time', form.extraFields.time)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">物品类型</span>
          <input v-model="form.extraFields.itemType" type="text" placeholder="如：校园卡/钥匙" @input="setExtra('itemType', form.extraFields.itemType)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
      </div>

      <div v-else-if="sectionKind === 'activity'" class="bg-white rounded-xl p-4 space-y-3">
        <h4 class="text-sm font-medium text-zinc-700">活动信息</h4>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">时间</span>
          <input v-model="form.extraFields.time" type="text" placeholder="活动时间" @input="setExtra('time', form.extraFields.time)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">地点</span>
          <input v-model="form.extraFields.location" type="text" placeholder="活动地点" @input="setExtra('location', form.extraFields.location)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm text-zinc-500 w-16">主办方</span>
          <input v-model="form.extraFields.organizer" type="text" placeholder="主办方/社团" @input="setExtra('organizer', form.extraFields.organizer)"
            class="flex-1 px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
        </div>
      </div>

      <!-- 匿名开关 -->
      <div class="bg-white rounded-xl p-4 flex items-center justify-between">
        <div>
          <p class="text-sm font-medium text-zinc-700">匿名发布</p>
          <p class="text-xs text-zinc-400 mt-0.5">匿名发布后台可溯源，请文明发言</p>
        </div>
        <button
          class="relative w-11 h-6 rounded-full transition"
          :class="form.isAnonymous ? 'bg-brand-500' : 'bg-zinc-200'"
          @click="onAnonymousChange(!form.isAnonymous)"
        >
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform" :class="form.isAnonymous ? 'translate-x-5' : ''"></span>
        </button>
      </div>

      <button
        :disabled="loading"
        class="w-full py-3 bg-brand-500 hover:bg-brand-600 disabled:bg-brand-300 text-white rounded-full font-medium transition flex items-center justify-center gap-2"
        @click="handleSubmit"
      >
        <Loader2 v-if="loading" class="w-5 h-5 animate-spin" />
        {{ loading ? '发布中...' : '发布' }}
      </button>
    </main>
  </div>
</template>
