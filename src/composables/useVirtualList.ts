/**
 * useVirtualList —— 降级版"虚拟列表" / 自动加载更多
 *
 * 设计动机：A-T3 虚拟滚动原本想引入 @tanstack/vue-virtual，但 npm 锁死风险高
 *  → 改用浏览器原生 IntersectionObserver 实现"滚动到底自动加载更多"：
 *    1. 用户在模板底部放一个 <div ref="sentinelRef" /> 哨兵
 *    2. 哨兵进入视口 → 回调 onReachBottom
 *    3. 监听 isLoading / hasMore，命中其一不再触发（去重 + 锁）
 *  这是当前场景的"轻量虚拟滚动"：DOM 节点随 list 长度真实增长，但加载是按需的。
 *  后续如要上真正的窗口虚拟化（只渲染可视区 ± 缓冲），可单文件替换。
 *
 * 用法：
 *   const { sentinelRef, onReachBottom, isLoading, hasMore } = useVirtualList({
 *     isLoading: () => loadingMore.value,
 *     hasMore: () => hasMore.value,
 *     onLoad: loadMore,
 *     rootMargin: '200px', // 提前 200px 触发，体验更顺
 *   })
 *   <div ref="sentinelRef" />
 */
import { ref, onMounted, onUnmounted, type Ref } from 'vue'

export interface UseVirtualListOptions {
  /** 加载中状态（响应式取值） */
  isLoading: () => boolean
  /** 是否还有更多 */
  hasMore: () => boolean
  /** 触底回调 */
  onLoad: () => void | Promise<void>
  /** 提前触发距离，默认 '200px' */
  rootMargin?: string
  /** 节流：同一帧多次进入视口只触发一次（默认 true） */
  throttle?: boolean
}

export function useVirtualList(options: UseVirtualListOptions) {
  const sentinelRef: Ref<HTMLElement | null> = ref(null)
  let observer: IntersectionObserver | null = null
  let inFlight = false

  const onReachBottom = async () => {
    if (inFlight) return
    if (options.isLoading() || !options.hasMore()) return
    inFlight = true
    try {
      await options.onLoad()
    } finally {
      // 即便加载失败也要解锁（失败由调用方决定是否继续）
      inFlight = false
    }
  }

  onMounted(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return
    const el = sentinelRef.value
    if (!el) return
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onReachBottom()
        }
      },
      { rootMargin: options.rootMargin ?? '200px' },
    )
    observer.observe(el)
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return { sentinelRef, onReachBottom }
}
