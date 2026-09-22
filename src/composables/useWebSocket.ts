/**
 * WS 客户端核心：全应用单例连接（私信 + 通知共用）
 * - 服务端协议见 api/ws/protocol.ts：open 后立即发 {type:'hello', token} 鉴权（服务端 10s 超时）
 * - 心跳 25s 发 {type:'ping'}，服务端回 pong（pong 不下发业务层）
 * - 断线指数退避重连 1s→2s→…→30s 封顶；登出断开、token 变化自动重连
 * - 多消费者：onMessage 可注册多个回调（useChatSocket 路由私信/通知帧）
 *
 * 仅 SPA 客户端使用：模块级状态在多实例/SSR 下不安全；本项目当前为纯 SPA，构建产物无 SSR。
 */
import { ref } from 'vue'
import { useUserStore } from '@/stores/user'
import { useRealtimeStore } from '@/stores/realtime'

export type WsStatus = 'connecting' | 'open' | 'closed' | 'reconnecting'

/** 服务端帧的宽松类型（协议细节由各消费者自行判断 type） */
export interface WsFrame {
  type: string
  [key: string]: unknown
}

const HEARTBEAT_MS = 25_000
const MAX_BACKOFF_MS = 30_000

/** 指数退避：1s, 2s, 4s, 8s, 16s, 30s(封顶) */
const backoff = (n: number) => Math.min(1000 * 2 ** n, MAX_BACKOFF_MS)

// —— 单例状态（模块级，全应用一条连接）——
const status = ref<WsStatus>('closed')
const handlers = new Set<(msg: WsFrame) => void>()
const openHandlers = new Set<() => void>()
let ws: WebSocket | null = null
let attempt = 0
let stopped = true
let watchInstalled = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function clearTimers() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

function teardownSocket(permanent: boolean) {
  clearTimers()
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (permanent) stopped = true
  const socket = ws
  ws = null
  if (socket) {
    socket.onclose = null
    socket.onerror = null
    socket.onmessage = null
    try {
      socket.close()
    } catch {
      /* noop */
    }
  }
  status.value = 'closed'
}

function scheduleReconnect() {
  const userStore = useUserStore()
  if (stopped || !userStore.token || reconnectTimer !== null) return
  status.value = 'reconnecting'
  useRealtimeStore().setAttempt(attempt)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    open()
  }, backoff(attempt++))
}

function open() {
  const userStore = useUserStore()
  if (!userStore.token) return
  if (ws && ws.readyState <= WebSocket.OPEN) return
  stopped = false
  status.value = 'connecting'
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const socket = new WebSocket(`${proto}://${location.host}/ws`)
  ws = socket

  socket.onopen = () => {
    if (ws !== socket) return
    status.value = 'open'
    attempt = 0
    useRealtimeStore().setConnected(true)
    // 服务端 hello 超时 10s：open 后立即鉴权
    socket.send(JSON.stringify({ type: 'hello', token: userStore.token }))
    openHandlers.forEach((h) => h())
    heartbeatTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' }))
    }, HEARTBEAT_MS)
  }

  socket.onmessage = (e) => {
    useRealtimeStore().touch()
    let msg: WsFrame
    try {
      msg = JSON.parse(e.data)
    } catch {
      return
    }
    if (msg.type === 'pong') return
    if (msg.type === 'error') {
      // 鉴权失败（token 过期等）：停止重连，等下次登录/token 刷新由 watch 触发
      if (msg.code === 'UNAUTHORIZED') {
        teardownSocket(true)
        return
      }
      console.warn('[ws] 服务端错误帧:', msg.message)
      return
    }
    handlers.forEach((h) => h(msg))
  }

  socket.onerror = () => {
    if (ws === socket) try { socket.close() } catch { /* noop */ }
  }

  socket.onclose = () => {
    if (ws !== socket) return // 已被 teardown 主动关闭，勿重复处理
    ws = null
    clearTimers()
    status.value = 'closed'
    useRealtimeStore().setConnected(false)
    scheduleReconnect()
  }
}

/**
 * WS 核心句柄：start 幂等启动 + token 跟随；onMessage/open 订阅；send 未就绪返回 false
 */
export function useWebSocket() {
  const userStore = useUserStore()
  const realtime = useRealtimeStore()

  /** 启动连接（幂等）：登录态下建立并跟随 token 变化（登出断开、换号重连） */
  function start() {
    if (userStore.token) open()
    if (watchInstalled) return
    watchInstalled = true
    userStore.$subscribe(() => {
      const token = userStore.token
      if (token && !ws) {
        // 登录/换号：立即用新 token 重连
        attempt = 0
        stopped = false
        open()
      } else if (!token && ws) {
        // 登出：永久断开
        teardownSocket(true)
        realtime.setConnected(false)
      }
    })
  }

  /** 注册业务帧回调，返回取消订阅函数 */
  function onMessage(h: (msg: WsFrame) => void) {
    handlers.add(h)
    return () => handlers.delete(h)
  }

  /** 连接建立（含每次重连成功）后触发，用于（重）发订阅帧 */
  function onOpen(h: () => void) {
    openHandlers.add(h)
    return () => openHandlers.delete(h)
  }

  /** 发送一帧；连接未就绪返回 false，调用方自行走 REST 兜底 */
  function send(frame: Record<string, unknown>): boolean {
    if (ws?.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(frame))
    return true
  }

  return { status, start, onMessage, onOpen, send }
}
