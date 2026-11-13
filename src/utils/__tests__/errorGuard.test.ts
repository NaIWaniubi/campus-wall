/**
 * errorGuard 纯函数单测（V5）：chunk 加载失败识别 + 只刷一次的决策。
 * 固守本会话真实踩过的坑：发版后旧 hash chunk 404 → 白屏，必须能识别并硬刷新，
 * 但绝不能无限刷新（sessionStorage 已有标记 / storage 抛错时都不得再刷）。
 */
import { describe, it, expect } from 'vitest'
import { isChunkLoadError, shouldReloadOnChunkError, CHUNK_RELOAD_KEY } from '../errorGuard'

describe('isChunkLoadError', () => {
  it('识别动态 import 失败（各浏览器文案）', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /assets/Home-x.js'))).toBe(true)
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isChunkLoadError(new Error('Failed to load module script: Expected a JavaScript module script'))).toBe(true)
  })
  it('普通业务错误不误判', () => {
    expect(isChunkLoadError(new Error('Request failed with status 500'))).toBe(false)
    expect(isChunkLoadError('boom')).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
  })
})

describe('shouldReloadOnChunkError', () => {
  const mem = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      _map: m,
    }
  }

  it('首次返回 true 并写入标记', () => {
    const s = mem()
    expect(shouldReloadOnChunkError(s)).toBe(true)
    expect(s._map.has(CHUNK_RELOAD_KEY)).toBe(true)
  })
  it('已刷过返回 false（防死循环）', () => {
    const s = mem()
    expect(shouldReloadOnChunkError(s)).toBe(true)
    expect(shouldReloadOnChunkError(s)).toBe(false)
  })
  it('storage 抛错时保守返回 false，绝不刷', () => {
    const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    expect(shouldReloadOnChunkError(broken)).toBe(false)
  })
})
