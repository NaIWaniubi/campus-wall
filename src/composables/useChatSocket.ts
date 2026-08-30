/**
 * 私信/通知 WS 封装：在核心连接上路由 message:incoming / message:ack / notification:push
 * - 多消费者：ChatPanel、MessagePage 各自注册监听互不影响
 * - 连接（含重连）成功后自动（重）订阅 messages + notifications 主题
 * - 发送走 sendChat，WS 未就绪返回 false → 调用方走 REST 兜底
 */
import { useWebSocket, type WsFrame } from './useWebSocket'

export interface ChatIncoming {
  messageId: number
  from: number
  convId: number
  body: string
  createdAt: string
}

export interface ChatAck {
  requestId: string
  messageId: number
  clientMsgId: string
  createdAt: string
}

export interface NotifyPush {
  notificationId: number
  kind: string
  content: string
  relatedId: number | null
  createdAt: string
}

type Handler<T> = (msg: T) => void

const incomingHandlers = new Set<Handler<ChatIncoming>>()
const ackHandlers = new Set<Handler<ChatAck>>()
const notifyHandlers = new Set<Handler<NotifyPush>>()
let routingInstalled = false

function route(msg: WsFrame) {
  if (msg.type === 'message:incoming') incomingHandlers.forEach((h) => h(msg as unknown as ChatIncoming))
  else if (msg.type === 'message:ack') ackHandlers.forEach((h) => h(msg as unknown as ChatAck))
  else if (msg.type === 'notification:push') notifyHandlers.forEach((h) => h(msg as unknown as NotifyPush))
}

/** 安装帧路由 + 主题订阅（模块级一次） */
function install(ws: ReturnType<typeof useWebSocket>) {
  if (routingInstalled) return
  routingInstalled = true
  ws.onMessage(route)
  // 每次连接成功（含重连）重新订阅，保证断线恢复后不丢推送
  ws.onOpen(() => {
    ws.send({ type: 'subscribe', topics: ['messages', 'notifications'] })
  })
}

export function useChatSocket() {
  const ws = useWebSocket()
  install(ws)

  /** 收到私信推送（对端发来 / 本账号其他端同步） */
  function onIncoming(h: Handler<ChatIncoming>) {
    incomingHandlers.add(h)
    return () => incomingHandlers.delete(h)
  }

  /** 自己经 WS 发出的消息的服务端回执 */
  function onAck(h: Handler<ChatAck>) {
    ackHandlers.add(h)
    return () => ackHandlers.delete(h)
  }

  /** 站内通知实时推送（点赞/评论/匹配/摘要/系统等） */
  function onNotify(h: Handler<NotifyPush>) {
    notifyHandlers.add(h)
    return () => notifyHandlers.delete(h)
  }

  /**
   * 经 WS 发私信；返回 false 表示连接未就绪，调用方应走 REST 兜底
   * @param clientMsgId 客户端生成的幂等 id（同时作为回执 requestId）
   */
  function sendChat(to: number, body: string, clientMsgId: string): boolean {
    return ws.send({ type: 'message:send', requestId: clientMsgId, to, body, clientMsgId })
  }

  return { status: ws.status, onIncoming, onAck, onNotify, sendChat }
}
