/**
 * 前端错误兜底工具（V5）——纯逻辑，便于单测。
 * 背景：Vite 指纹 chunk 发版后，仍停在旧页面的用户点新路由会拿到 404 的旧 hash，
 * 表现为「Failed to load module script」白屏。此处负责识别这类错误并给出「只刷一次」决策。
 */

const CHUNK_ERROR_RE =
  /dynamically imported module|Importing a module script failed|error loading dynamically imported module|Failed to load (?:module )?script|Failed to fetch/i

/** 是否为懒加载 chunk / 模块脚本加载失败（值得硬刷新重试的错误） */
export function isChunkLoadError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? err ?? '')
  return CHUNK_ERROR_RE.test(msg)
}

/** sessionStorage 防刷新死循环键 */
export const CHUNK_RELOAD_KEY = 'campus-wall:chunk-reload'

/**
 * 决策本次 chunk 失败是否应触发硬刷新：未刷过才刷（返回 true 并由调用方记标志）。
 * storage 不可用（无痕/隐私模式抛错）时保守返回 false，绝不循环刷新。
 */
export function shouldReloadOnChunkError(store: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  try {
    if (store.getItem(CHUNK_RELOAD_KEY)) return false
    store.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
    return true
  } catch {
    return false
  }
}
