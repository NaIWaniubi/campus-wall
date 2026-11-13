import { watch, onScopeDispose, type Ref } from 'vue'

/**
 * 模态焦点隔离（V5）：弹窗打开时给 #app 根节点加 inert，
 * 背景全部退出 Tab 序列 / 点击穿透 / 无障碍树；关闭自动恢复。
 * 依赖 Teleport 到 body 的弹窗结构（本项目模态都这么挂）。
 * 老基础库（iOS <15.5 / Chrome <102）不支持 inert 时静默降级为原行为。
 */
export function trapWithInert(visible: Ref<boolean>) {
  const stop = watch(
    visible,
    (v) => {
      const root = document.getElementById('app')
      if (!root) return
      if (v) root.setAttribute('inert', '')
      else root.removeAttribute('inert')
    },
    { immediate: false }
  )
  onScopeDispose(() => {
    document.getElementById('app')?.removeAttribute('inert')
    stop()
  })
}
