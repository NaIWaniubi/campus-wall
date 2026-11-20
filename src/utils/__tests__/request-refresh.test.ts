/**
 * 401 双入口续期回归（P0）：
 * 后端 unauthorized() 发真实 HTTP 401（非 200+body.code），axios 会走 error 拦截器。
 * 这里用自定义 adapter 精确模拟「HTTP 401 → 静默续期 → 重放原请求」全链路。
 *
 * 场景：
 * 1. HTTP 401 → refresh 成功 → 原请求重放并拿到数据（不会再掉登录）
 * 2. HTTP 401 → refresh 失败 → 清会话并按角色跳登录页、toast 报错
 * 3. /auth/refresh 自身 401 → 不递归续期（__skipAuthRefresh）
 * 4. 200 + body.code=401 同路径处理（后端多数 fail() 仍是 HTTP 200）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AxiosError, type AxiosAdapter } from 'axios'

const { mockStore, pushSpy } = vi.hoisted(() => ({
  mockStore: {
    token: 'old-access',
    refreshToken: 'rt-live',
    user: { role: 'user' },
    isAdmin: false,
    refreshAccessToken: vi.fn(async () => true),
    logout: vi.fn(),
  },
  pushSpy: vi.fn(),
}))

vi.mock('@/stores/user', () => ({ useUserStore: () => mockStore }))
vi.mock('@/router', () => ({ default: { currentRoute: { value: { fullPath: '/' } }, push: pushSpy } }))

import request from '../request'

/** 造一个「前 N 次 401、之后 200」或「全 401」的 adapter */
function makeAdapter(script: Array<'401-http' | '401-body' | 'ok'>) {
  const calls: Array<{ url: string; auth?: string }> = []
  const adapter: AxiosAdapter = async (config) => {
    calls.push({ url: String(config.url), auth: (config.headers as any)?.Authorization })
    const step = script.length > 1 ? script.shift()! : script[0]
    const payload =
      step === '401-http' || step === '401-body'
        ? { code: 401, message: '未登录或登录已过期', data: null }
        : { code: 200, message: 'ok', data: { hello: 'world' } }
    const res: any = {
      status: step === '401-http' ? 401 : 200,
      statusText: step === '401-http' ? 'Unauthorized' : 'OK',
      headers: {},
      config,
      data: payload,
    }
    if (step === '401-http') {
      throw new AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config as any, {}, res)
    }
    return res
  }
  return { adapter, calls }
}

describe('401 续期拦截（HTTP 状态码与业务码双入口）', () => {
  beforeEach(() => {
    mockStore.token = 'old-access'
    mockStore.refreshToken = 'rt-live'
    mockStore.refreshAccessToken.mockReset().mockResolvedValue(true)
    mockStore.logout.mockReset()
    pushSpy.mockReset()
  })

  it('真实 HTTP 401 → 续期成功 → 重放原请求拿到数据', async () => {
    const { adapter, calls } = makeAdapter(['401-http', 'ok'])
    request.defaults.adapter = adapter

    const res: any = await request.get('/posts')
    expect(res.code).toBe(200)
    expect(res.data).toEqual({ hello: 'world' })
    expect(mockStore.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
    expect(mockStore.logout).not.toHaveBeenCalled()
  })

  it('真实 HTTP 401 → 续期失败 → 清会话跳登录页', async () => {
    mockStore.refreshAccessToken.mockResolvedValue(false)
    const { adapter } = makeAdapter(['401-http'])
    request.defaults.adapter = adapter

    await expect(request.get('/posts')).rejects.toBeTruthy()
    expect(mockStore.logout).toHaveBeenCalledTimes(1)
    expect(pushSpy).toHaveBeenCalledWith({ path: '/login', query: { redirect: expect.any(String) } })
  })

  it('200+body.code=401 同样走续期（兼容 fail() 默认 HTTP 200 的接口）', async () => {
    const { adapter, calls } = makeAdapter(['401-body', 'ok'])
    request.defaults.adapter = adapter

    const res: any = await request.get('/users/profile')
    expect(res.code).toBe(200)
    expect(mockStore.refreshAccessToken).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(2)
  })

  it('refresh 端点自身 401 不递归续期（避免死循环），直接清会话', async () => {
    const refreshMock = vi.fn(async () => false)
    mockStore.refreshAccessToken = refreshMock as any
    const { adapter, calls } = makeAdapter(['401-http'])
    request.defaults.adapter = adapter

    await expect(request.post('/auth/refresh', { refreshToken: 'rt-live' })).rejects.toBeTruthy()
    expect(calls).toHaveLength(1)
    expect(refreshMock).not.toHaveBeenCalled()
    expect(mockStore.logout).toHaveBeenCalledTimes(1)
  })

  // R4 审查 P1：三态契约的第三态——null = 网络无响应（fetch reject），
  // store 单飞机制明确「不清会话、等重试」。原拦截器把 null 当失败处理，
  // 一次瞬时断网叠加 token 到期就强制掉线。
  it('网络异常（null）不销毁会话：拒请求但不清登录态、不跳登录页', async () => {
    mockStore.refreshAccessToken.mockReset().mockResolvedValue(null as unknown as boolean)
    const { adapter } = makeAdapter(['401-http'])
    request.defaults.adapter = adapter

    let caught: any
    try {
      await request.get('/posts')
    } catch (e) {
      caught = e
    }
    expect(String(caught?.message)).toContain('网络异常')
    expect(mockStore.logout).not.toHaveBeenCalled()
    expect(pushSpy).not.toHaveBeenCalled()
  })
})
// ---- fetchWithAuth（SSE 流式接口专用）----
import { fetchWithAuth } from '../request'

describe('fetchWithAuth（流式接口续期）', () => {
  beforeEach(() => {
    mockStore.token = 'old-access'
    mockStore.refreshToken = 'rt-live'
    mockStore.refreshAccessToken.mockReset().mockResolvedValue(true)
    mockStore.logout.mockReset()
  })

  it('401 → 续期一次 → 用新 token 重发', async () => {
    const seen: Array<string | undefined> = []
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
      seen.push(init?.headers?.Authorization)
      n += 1
      if (n === 1) return new Response('', { status: 401 })
      // 续期后 store.token 由 mock refreshAccessToken 负责更新（此处手动模拟）
      return new Response('ok', { status: 200 })
    }))
    mockStore.refreshAccessToken.mockImplementation(async () => { mockStore.token = 'new-access'; return true })

    const resp = await fetchWithAuth('/api/ai/chat/stream', { method: 'POST' })
    expect(resp.status).toBe(200)
    expect(seen).toEqual(['Bearer old-access', 'Bearer new-access'])
    expect(mockStore.refreshAccessToken).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('续期失败时不无限重试，原样返回 401 给调用方', async () => {
    let n = 0
    vi.stubGlobal('fetch', vi.fn(async () => { n += 1; return new Response('', { status: 401 }) }))
    mockStore.refreshAccessToken.mockResolvedValue(false)

    const resp = await fetchWithAuth('/api/agent/assist/stream', {})
    expect(resp.status).toBe(401)
    expect(n).toBe(1) // 只发一次原始请求，无重发
    vi.unstubAllGlobals()
  })

  it('200 直接返回，不触发续期', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('ok', { status: 200 })))
    const resp = await fetchWithAuth('/api/ai/chat/stream', {})
    expect(resp.status).toBe(200)
    expect(mockStore.refreshAccessToken).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
