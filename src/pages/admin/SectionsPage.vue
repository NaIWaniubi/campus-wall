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
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between">
      <p class="text-sm text-zinc-500">共 {{ list.length }} 个板块</p>
      <button class="flex items-center gap-1.5 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="openCreate">
        <Plus class="w-4 h-4" />新建板块
      </button>
    </div>

    <!-- 列表 -->
    <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
            <th class="text-left px-3 py-2 font-medium">板块</th>
            <th class="text-left px-3 py-2 font-medium">排序</th>
            <th class="text-left px-3 py-2 font-medium">发帖审核</th>
            <th class="text-left px-3 py-2 font-medium">状态</th>
            <th class="text-right px-3 py-2 font-medium">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in list" :key="s.id" class="border-b border-zinc-50 hover:bg-zinc-50/50">
            <td class="px-3 py-2">
              <div class="flex items-center gap-2">
                <span v-if="s.icon" class="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center text-base">{{ s.icon }}</span>
                <div v-else class="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 text-xs font-semibold">{{ s.name?.charAt(0) }}</div>
                <span class="text-zinc-900">{{ s.name }}</span>
              </div>
            </td>
            <td class="px-3 py-2 text-zinc-600">{{ s.sort }}</td>
            <td class="px-3 py-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium" :class="s.needAudit ? 'bg-amber-100 text-amber-600' : 'bg-zinc-100 text-zinc-500'">
                {{ s.needAudit ? '需要审核' : '直接发布' }}
              </span>
            </td>
            <td class="px-3 py-2">
              <span class="px-2 py-0.5 rounded text-xs font-medium" :class="s.isActive ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'">
                {{ s.isActive ? '启用中' : '已停用' }}
              </span>
            </td>
            <td class="px-3 py-2">
              <div class="flex items-center justify-end gap-1.5 whitespace-nowrap">
                <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100" @click="openEdit(s)">
                  <Pencil class="w-3 h-3" />编辑
                </button>
                <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100" @click="deleteTarget = s">
                  <Trash2 class="w-3 h-3" />删除
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <EmptyState v-if="!loading && !list.length" text="暂无板块，点击右上角新建" />
      <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中...</div>
    </div>

    <!-- 新建/编辑弹窗 -->
    <Teleport to="body">
      <div v-if="formModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="formModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">{{ formModal.id ? '编辑板块' : '新建板块' }}</h3>
          <div class="mb-3">
            <label class="block text-sm text-zinc-600 mb-1">名称<span class="text-red-500">*</span></label>
            <input
              v-model="formModal.name"
              placeholder="板块名称"
              class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
            />
          </div>
          <div class="mb-3 flex gap-3">
            <div class="w-24">
              <label class="block text-sm text-zinc-600 mb-1">图标</label>
              <input
                v-model="formModal.icon"
                placeholder="emoji"
                maxlength="4"
                class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
              />
            </div>
            <div class="w-24">
              <label class="block text-sm text-zinc-600 mb-1">排序</label>
              <input
                v-model.number="formModal.sort"
                type="number"
                class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm"
              />
            </div>
          </div>
          <label class="flex items-center gap-2 mb-2 cursor-pointer">
            <input v-model="formModal.needAudit" type="checkbox" class="accent-brand-500" />
            <span class="text-sm text-zinc-600">发帖需要审核</span>
          </label>
          <label class="flex items-center gap-2 mb-4 cursor-pointer">
            <input v-model="formModal.isActive" type="checkbox" class="accent-brand-500" />
            <span class="text-sm text-zinc-600">启用该板块（停用后前台不可见）</span>
          </label>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="formModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitForm">保存</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="deleteTarget" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="deleteTarget = null">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-3">删除板块</h3>
          <p class="text-sm text-zinc-500 mb-4">
            确定删除「{{ deleteTarget.name }}」？板块下还有帖子时将无法删除（可改为停用）。
          </p>
          <div class="flex gap-3">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="deleteTarget = null">取消</button>
            <button class="flex-1 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white text-sm" @click="submitDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
