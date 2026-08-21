<script setup lang="ts">
/**
 * 板块管理：列表 + 新增/编辑表单 + 删除
 */
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  LayoutDashboard, Users, FileCheck, MessageSquare, Flag, LayoutGrid,
  Home, LogOut, Shield, Plus, Pencil, Trash2, Megaphone,
} from 'lucide-vue-next'
import { adminApi, sectionApi } from '@/utils/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/request'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const router = useRouter()
const userStore = useUserStore()

const navItems = [
  { name: '数据看板', path: '/admin', icon: LayoutDashboard },
  { name: '用户管理', path: '/admin/users', icon: Users },
  { name: '内容审核', path: '/admin/posts', icon: FileCheck },
  { name: '评论管理', path: '/admin/comments', icon: MessageSquare },
  { name: '举报处理', path: '/admin/reports', icon: Flag },
  { name: '板块管理', path: '/admin/sections', icon: LayoutGrid },
  { name: '公告管理', path: '/admin/announcements', icon: Megaphone },
]

const list = ref<any[]>([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    const res: any = await sectionApi.list(true)
    list.value = res.data || []
  } catch {
    list.value = []
  } finally {
    loading.value = false
  }
}

const defaultForm = () => ({ name: '', icon: '', sort: 0, isActive: true, forceAnonymous: false, needAudit: false })
const formModal = reactive({ visible: false, isEdit: false, id: 0, form: defaultForm() })

function openAdd() {
  formModal.isEdit = false
  formModal.id = 0
  formModal.form = defaultForm()
  formModal.visible = true
}
function openEdit(s: any) {
  formModal.isEdit = true
  formModal.id = s.id
  formModal.form = {
    name: s.name,
    icon: s.icon || '',
    sort: s.sort || 0,
    isActive: s.isActive,
    forceAnonymous: s.forceAnonymous,
    needAudit: s.needAudit,
  }
  formModal.visible = true
}

async function submitForm() {
  if (!formModal.form.name.trim()) return toast.error('板块名称不能为空')
  try {
    const data = { ...formModal.form, name: formModal.form.name.trim() }
    if (formModal.isEdit) {
      await adminApi.updateSection(formModal.id, data)
      toast.success('板块已更新')
    } else {
      await adminApi.createSection(data)
      toast.success('板块已创建')
    }
    formModal.visible = false
    load()
  } catch {}
}

const deleteDialog = reactive({ visible: false, section: null as any })
function openDelete(s: any) { deleteDialog.section = s; deleteDialog.visible = true }
async function confirmDelete() {
  deleteDialog.visible = false
  if (!deleteDialog.section) return
  const id = deleteDialog.section.id
  try {
    await adminApi.deleteSection(id)
    toast.success('板块已删除')
    list.value = list.value.filter((s) => s.id !== id)
  } catch {
    // 错误已由拦截器 toast（如板块下有帖子）
  }
}

function onLogout() { userStore.logout(); router.replace('/admin/login') }
function isActive(p: string) { return router.currentRoute.value.path === p }
onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-zinc-50">
    <aside class="hidden md:flex flex-col w-[200px] fixed inset-y-0 left-0 bg-white border-r border-zinc-100 z-20">
      <div class="h-14 flex items-center px-4 border-b border-zinc-100">
        <Shield class="w-5 h-5 text-brand-500 mr-2" /><span class="font-semibold text-zinc-900 text-sm">校园墙后台</span>
      </div>
      <nav class="flex-1 py-2 px-2 space-y-0.5">
        <router-link v-for="item in navItems" :key="item.path" :to="item.path"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition"
          :class="isActive(item.path) ? 'bg-brand-50 text-brand-600 font-medium' : 'text-zinc-600 hover:bg-zinc-50'">
          <component :is="item.icon" class="w-4 h-4" />{{ item.name }}
        </router-link>
      </nav>
      <div class="p-2 border-t border-zinc-100">
        <router-link to="/" class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 hover:bg-zinc-50">
          <Home class="w-4 h-4" /> 返回前台
        </router-link>
      </div>
    </aside>

    <div class="md:ml-[200px]">
      <header class="h-14 bg-white border-b border-zinc-100 flex items-center justify-between px-4 md:px-6 sticky top-0 z-10">
        <h1 class="font-medium text-zinc-900">板块管理</h1>
        <button class="flex items-center gap-1 text-sm text-zinc-500 hover:text-red-500" @click="onLogout">
          <LogOut class="w-4 h-4" /> 退出
        </button>
      </header>
      <div class="md:hidden bg-white border-b border-zinc-100">
        <div class="flex items-center gap-1 px-2 h-11 overflow-x-auto scrollbar-hide">
          <router-link v-for="item in navItems" :key="item.path" :to="item.path"
            class="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs whitespace-nowrap"
            :class="isActive(item.path) ? 'bg-brand-50 text-brand-600 font-medium' : 'text-zinc-500'">
            <component :is="item.icon" class="w-3.5 h-3.5" />{{ item.name }}
          </router-link>
        </div>
      </div>

      <div class="p-4 md:p-6 space-y-4">
        <div class="flex justify-end">
          <button class="flex items-center gap-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium" @click="openAdd">
            <Plus class="w-4 h-4" />新增板块
          </button>
        </div>

        <!-- 表格 -->
        <div class="bg-white rounded-xl border border-zinc-100 shadow-sm overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-zinc-500 text-xs bg-zinc-50 border-b border-zinc-100">
                <th class="text-left px-3 py-2 font-medium">名称</th>
                <th class="text-left px-3 py-2 font-medium">图标</th>
                <th class="text-left px-3 py-2 font-medium">排序</th>
                <th class="text-left px-3 py-2 font-medium">状态</th>
                <th class="text-left px-3 py-2 font-medium">强制匿名</th>
                <th class="text-left px-3 py-2 font-medium">需要审核</th>
                <th class="text-left px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in list" :key="s.id" class="border-b border-zinc-50 hover:bg-zinc-50/50">
                <td class="px-3 py-2 text-zinc-900 font-medium">{{ s.name }}</td>
                <td class="px-3 py-2 text-zinc-600">{{ s.icon || '-' }}</td>
                <td class="px-3 py-2 text-zinc-600">{{ s.sort }}</td>
                <td class="px-3 py-2">
                  <span class="px-2 py-0.5 rounded text-xs font-medium"
                    :class="s.isActive ? 'bg-green-100 text-green-600' : 'bg-zinc-200 text-zinc-500'">
                    {{ s.isActive ? '启用' : '停用' }}
                  </span>
                </td>
                <td class="px-3 py-2">
                  <span class="text-xs" :class="s.forceAnonymous ? 'text-brand-600 font-medium' : 'text-zinc-400'">{{ s.forceAnonymous ? '是' : '否' }}</span>
                </td>
                <td class="px-3 py-2">
                  <span class="text-xs" :class="s.needAudit ? 'text-amber-600 font-medium' : 'text-zinc-400'">{{ s.needAudit ? '是' : '否' }}</span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1.5 whitespace-nowrap">
                    <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-50 text-blue-600 hover:bg-blue-100" @click="openEdit(s)">
                      <Pencil class="w-3 h-3" />编辑
                    </button>
                    <button class="flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-50 text-red-600 hover:bg-red-100" @click="openDelete(s)">
                      <Trash2 class="w-3 h-3" />删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <EmptyState v-if="!loading && !list.length" text="暂无板块" />
          <div v-if="loading" class="py-10 text-center text-sm text-zinc-400">加载中...</div>
        </div>
      </div>
    </div>

    <!-- 新增/编辑弹窗 -->
    <Teleport to="body">
      <div v-if="formModal.visible" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="formModal.visible = false">
        <div class="absolute inset-0 bg-black/40"></div>
        <div class="relative bg-white rounded-2xl w-full max-w-sm p-6">
          <h3 class="text-lg font-semibold mb-4">{{ formModal.isEdit ? '编辑板块' : '新增板块' }}</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-sm text-zinc-600 mb-1">板块名称</label>
              <input v-model="formModal.form.name" placeholder="请输入板块名称"
                class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
            </div>
            <div>
              <label class="block text-sm text-zinc-600 mb-1">图标（emoji 或文字）</label>
              <input v-model="formModal.form.icon" placeholder="如 📚"
                class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
            </div>
            <div>
              <label class="block text-sm text-zinc-600 mb-1">排序（数字越小越靠前）</label>
              <input v-model.number="formModal.form.sort" type="number"
                class="w-full px-3 py-2 rounded-lg bg-zinc-50 border border-zinc-200 focus:border-brand-500 focus:outline-none text-sm" />
            </div>
            <label class="flex items-center justify-between text-sm text-zinc-700">
              <span>是否启用</span>
              <input v-model="formModal.form.isActive" type="checkbox" class="w-4 h-4 accent-brand-500" />
            </label>
            <label class="flex items-center justify-between text-sm text-zinc-700">
              <span>强制匿名</span>
              <input v-model="formModal.form.forceAnonymous" type="checkbox" class="w-4 h-4 accent-brand-500" />
            </label>
            <label class="flex items-center justify-between text-sm text-zinc-700">
              <span>需要审核</span>
              <input v-model="formModal.form.needAudit" type="checkbox" class="w-4 h-4 accent-brand-500" />
            </label>
          </div>
          <div class="flex gap-3 mt-5">
            <button class="flex-1 py-2 rounded-full border border-zinc-200 text-zinc-600 text-sm" @click="formModal.visible = false">取消</button>
            <button class="flex-1 py-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-sm" @click="submitForm">确定</button>
          </div>
        </div>
      </div>
    </Teleport>

    <ConfirmDialog :visible="deleteDialog.visible" :content="`确定删除板块「${deleteDialog.section?.name || ''}」吗？板块下有帖子时不可删除。`" confirm-text="删除" danger
      @confirm="confirmDelete" @cancel="deleteDialog.visible = false" />
  </div>
</template>
