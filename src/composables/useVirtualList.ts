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
import { ref, watch, onMounted, onUnmounted, type Ref } from 'vue'

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

  /**
   * 哨兵观察器的建立时机：
   * 原实现在 onMounted 里一次性取 sentinelRef.value —— 但哨兵常被 v-if 包裹
   * （如「有更多时才渲染」），挂载那一刻它可能还不存在 → el 为 null → 直接 return，
   * IntersectionObserver 从未创建 → 无限滚动彻底失效。
   * 改为 watch 哨兵 ref：元素出现时建观察器，消失时拆掉；条件渲染切换也能正确重建。
   */
  const setupObserver = (el: HTMLElement | null) => {
    observer?.disconnect();
    observer = null;
    if (!el) return;
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) onReachBottom()
        }
      },
      { rootMargin: options.rootMargin ?? '200px' },
    );
    observer.observe(el);
  };

  const stopWatch = watch(sentinelRef, (el) => setupObserver(el), { immediate: true });

  onMounted(() => {
    // 兜底：watch immediate 已处理首次；若哨兵在挂载后才被 v-if 渲染，watch 会补建
    if (!observer && sentinelRef.value) setupObserver(sentinelRef.value);
  });

  onUnmounted(() => {
    stopWatch();
    observer?.disconnect();
    observer = null;
  })

  return { sentinelRef, onReachBottom }
}
