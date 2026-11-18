<script setup lang="ts">
/**
 * 板块管理：公开列表（含停用）+ 新建/编辑/删除
 * 契约：GET /api/sections?all=1；POST/PUT /api/admin/sections（name/icon/sort/needAudit 等 camelCase）；DELETE 有帖时后端拒绝（拦截器自动 toast）
 */
import { ref, reactive, onMounted } from 'vue'
import { Plus, Pencil, Trash2 } from '@lucide/vue'
import { sectionApi, adminApi } from '@/utils/api'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'

const list = ref<any[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res: any = await sectionApi.list(true)
    list.value = res.data
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

// 新建/编辑弹窗
const formModal = reactive({
  visible: false,
  id: 0,
  name: '',
  icon: '',
  sort: 0,
  needAudit: false,
  isActive: true,
})
function openCreate() {
  formModal.id = 0
  formModal.name = ''
  formModal.icon = ''
  formModal.sort = list.value.length + 1
  formModal.needAudit = false
  formModal.isActive = true
  formModal.visible = true
}
function openEdit(s: any) {
  formModal.id = s.id
  formModal.name = s.name
  formModal.icon = s.icon || ''
  formModal.sort = s.sort ?? 0
  formModal.needAudit = !!s.needAudit
  formModal.isActive = s.isActive !== false
  formModal.visible = true
}
function submitForm() {
  if (!formModal.name.trim()) return toast.error('请输入板块名称')
  const data = {
    name: formModal.name.trim(),
    icon: formModal.icon.trim(),
    sort: Number(formModal.sort) || 0,
    needAudit: formModal.needAudit,
    isActive: formModal.isActive,
  }
  const req = formModal.id ? adminApi.updateSection(formModal.id, data) : adminApi.createSection(data)
  req.then(() => {
    toast.success(formModal.id ? '板块已更新' : '板块已创建')
    formModal.visible = false
    load()
  }).catch(() => {})
}

// 删除（有帖时后端会拒，错误由拦截器 toast）
const deleteTarget = ref<any>(null)
async function submitDelete() {
  try {
    await adminApi.deleteSection(deleteTarget.value.id)
    toast.success('板块已删除')
    deleteTarget.value = null
    load()
  } catch {}
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen space-y-4">
    <!-- 页头：海报式标题 + 统计 -->
    <header class="flex flex-wrap items-end justify-between gap-3 pb-3" style="border-bottom: 1.5px solid var(--ink)">
      <div class="min-w-0">
        <div class="flex items-center gap-2 mb-2">
          <span class="ds-sticker ds-sticker--sky">SECTIONS</span>
          <span class="ds-label">板块编排</span>
        </div>
        <h1 class="ds-display ds-display-lg" style="color: var(--ink)">板块管理</h1>
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-baseline gap-1.5">
          <span class="ds-label">共</span>
          <span class="ds-display ds-display-lg ds-num" style="color: var(--ink)">{{ list.length }}</span>
          <span class="ds-label">个板块</span>
        </div>
        <button type="button" class="ds-btn ds-btn--primary" @click="openCreate">
          <Plus class="w-4 h-4" />新建板块
        </button>
      </div>
    </header>

    <!-- 列表：纸感表格 -->
    <section class="ds-card ds-card--flat overflow-x-auto">
      <table class="w-full text-[13px]">
        <thead>
          <tr style="background: var(--paper); border-bottom: 1.5px solid var(--ink)">
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">板块</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">排序</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">发帖审核</th>
            <th class="ds-label text-left px-3 py-2.5 font-normal" style="color: var(--ink-soft)">状态</th>
            <th class="ds-label text-right px-3 py-2.5 font-normal" style="color: var(--ink-soft)">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in list"
            :key="s.id"
            class="align-middle hover:bg-[var(--paper)]"
            style="border-bottom: 1px solid var(--hairline)"
          >
            <td class="px-3 py-2.5">
              <div class="flex items-center gap-2.5">
                <span
                  v-if="s.icon"
                  class="w-8 h-8 flex items-center justify-center text-base shrink-0"
                  style="border-radius: 9px; border: 1.5px solid var(--ink); background: var(--card)"
                >{{ s.icon }}</span>
                <div
                  v-else
                  class="w-8 h-8 flex items-center justify-center text-[11px] font-bold shrink-0"
                  style="border-radius: 9px; border: 1.5px solid var(--ink); background: var(--lime); color: var(--ink)"
                >{{ s.name?.charAt(0) }}</div>
                <span class="font-semibold" style="color: var(--ink)">{{ s.name }}</span>
              </div>
            </td>
            <td class="px-3 py-2.5 ds-num" style="color: var(--ink-soft)">{{ s.sort }}</td>
            <td class="px-3 py-2.5">
              <span class="ds-tag">
                <span class="ds-tag-dot" :style="{ background: s.needAudit ? 'var(--coral)' : 'var(--sky)' }"></span>
                {{ s.needAudit ? '需要审核' : '直接发布' }}
              </span>
            </td>
            <td class="px-3 py-2.5">
              <span class="ds-tag">
                <span class="ds-tag-dot" :style="{ background: s.isActive ? 'var(--lime)' : 'var(--coral)' }"></span>
                {{ s.isActive ? '启用中' : '已停用' }}
              </span>
            </td>
            <td class="px-3 py-2.5">
              <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                <button type="button" class="ds-btn ds-btn--sm" @click="openEdit(s)">
                  <Pencil class="w-3 h-3" />编辑
                </button>
                <button type="button" class="ds-btn ds-btn--sm ds-btn--danger" @click="deleteTarget = s">
                  <Trash2 class="w-3 h-3" />删除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && !list.length" text="暂无板块，点击右上角新建" />
      <div v-if="loading" class="py-10 text-center ds-sub">加载中...</div>
    </section>

    <!-- 新建/编辑弹窗 -->
    <Teleport to="body">
      <div v-if="formModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="formModal.visible = false">
        <div class="absolute inset-0" style="background: rgb(20 17 15 / 0.55)"></div>
        <div role="dialog" aria-modal="true" class="relative ds-card w-full max-w-sm p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="ds-sticker ds-sticker--sky">{{ formModal.id ? 'EDIT' : 'NEW' }}</span>
            <span class="ds-label">板块编排</span>
          </div>
          <h3 class="ds-title mb-4" style="color: var(--ink)">{{ formModal.id ? '编辑板块' : '新建板块' }}</h3>
          <div class="mb-3">
            <label class="ds-label block mb-1.5">名称<span style="color: var(--coral)">*</span></label>
            <input
              v-model="formModal.name"
              placeholder="板块名称"
              class="ds-input"
            />
          </div>
          <div class="mb-3 flex gap-3">
            <div class="w-24">
              <label class="ds-label block mb-1.5">图标</label>
              <input
                v-model="formModal.icon"
                placeholder="emoji"
                maxlength="4"
                class="ds-input"
              />
            </div>
            <div class="w-24">
              <label class="ds-label block mb-1.5">排序</label>
              <input
                v-model.number="formModal.sort"
                type="number"
                class="ds-input"
              />
            </div>
          </div>
          <label class="flex items-center gap-2 mb-2 cursor-pointer">
            <input v-model="formModal.needAudit" type="checkbox" style="accent-color: var(--ink)" />
            <span class="text-[13px]" style="color: var(--ink-soft)">发帖需要审核</span>
          </label>
          <label class="flex items-center gap-2 mb-4 cursor-pointer">
            <input v-model="formModal.isActive" type="checkbox" style="accent-color: var(--ink)" />
            <span class="text-[13px]" style="color: var(--ink-soft)">启用该板块（停用后前台不可见）</span>
          </label>
          <div class="flex gap-3">
            <button type="button" class="ds-btn flex-1" @click="formModal.visible = false">取消</button>
            <button type="button" class="ds-btn ds-btn--primary flex-1" @click="submitForm">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="deleteTarget = null">
        <div class="absolute inset-0" style="background: rgb(20 17 15 / 0.55)"></div>
        <div role="dialog" aria-modal="true" class="relative ds-card w-full max-w-sm p-5">
          <div class="flex items-center gap-2 mb-3">
            <span class="ds-sticker ds-sticker--coral">DELETE</span>
            <span class="ds-label">危险操作</span>
          </div>
          <h3 class="ds-title mb-2" style="color: var(--ink)">删除板块</h3>
          <p class="text-[13px] mb-4 leading-relaxed" style="color: var(--ink-soft)">
            确定删除「{{ deleteTarget.name }}」？板块下还有帖子时将无法删除（可改为停用）。
          </p>
          <div class="flex gap-3">
            <button type="button" class="ds-btn flex-1" @click="deleteTarget = null">取消</button>
            <button type="button" class="ds-btn ds-btn--danger flex-1" @click="submitDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
