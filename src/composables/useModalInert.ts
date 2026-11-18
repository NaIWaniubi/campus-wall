import { watch, onScopeDispose, type Ref } from 'vue'

/**
 * 模态焦点隔离（V5）：弹窗打开时给 #app 根节点加 inert，
 * 背景全部退出 Tab 序列 / 点击穿透 / 无障碍树；关闭自动恢复。
 * 依赖 Teleport 到 body 的弹窗结构（本项目模态都这么挂）。
 * 老基础库（iOS <15.5 / Chrome <102）不支持 inert 时静默降级为原行为。
 *
 * 引用计数：多个模态可能同时存在（引导开着时用 Ctrl+K 打开命令面板）。
 * 原实现各自独立 set/removeAttribute —— 先关掉的那个会把锁整个解开，
 * 背景重新可 Tab 可滚，违反模态隔离。改为全局计数：只有最后一个模态关闭才解锁。
 */

/** 当前处于锁定状态的模态数量 */
let lockCount = 0

function applyInert(locked: boolean) {
  const root = document.getElementById('app')
  if (!root) return
  if (locked) root.setAttribute('inert', '')
  else root.removeAttribute('inert')
}

/**
 * 引用计数加锁：同时上 inert 与 body 滚动锁。
 * 滚动锁此前由各组件自行写 document.body.style.overflow —— 两个模态共存时
 * 先关的那个会把 overflow 还原，背景在另一个模态开着时就能滚。
 */
export function acquireModalLock() {
  lockCount += 1
  applyInert(true)
  document.body.style.overflow = 'hidden'
}

/** 引用计数解锁（计数归零才真正解除 inert 与滚动锁） */
export function releaseModalLock() {
  lockCount = Math.max(0, lockCount - 1)
  if (lockCount === 0) {
    applyInert(false)
    document.body.style.overflow = ''
  }
}

/** 当前锁定计数（测试/调试用） */
export function modalLockCount(): number {
  return lockCount
}

export function trapWithInert(visible: Ref<boolean>) {
  let held = false
  const stop = watch(
    visible,
    (v) => {
      if (v && !held) {
        held = true
        acquireModalLock()
      } else if (!v && held) {
        held = false
        releaseModalLock()
      }
    },
    { immediate: false }
  )
  onScopeDispose(() => {
    if (held) {
      held = false
      releaseModalLock()
    }
    stop()
  })
}
