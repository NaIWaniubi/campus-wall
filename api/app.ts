/**
 * Express 应用入口
 */
// 必须置于其他 import 之前：ESM 先求值整个 import 图，晚加载会让业务模块读不到 .env
import './env.js'
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

import './db.js'
import { db } from './db.js'
import { getStorage } from './storage/index.js'
import { stats as wsStats } from './ws/hub.js'
import { buildOpenApiDocument, swaggerHtml } from './openapi/document.js'
import { captureError } from './observability.js'
import crypto from 'crypto'
import authRoutes from './routes/auth.js'
import postRoutes from './routes/posts.js'
import commentRoutes from './routes/comments.js'
import userRoutes from './routes/users.js'
import messageRoutes from './routes/messages.js'
import sectionRoutes from './routes/sections.js'
import uploadRoutes from './routes/upload.js'
import adminRoutes from './routes/admin.js'
import draftRoutes from './routes/drafts.js'
import announcementRoutes from './routes/announcements.js'
import aiRoutes from './routes/ai.js'
import adminAiRoutes from './routes/adminAi.js'
import subscriptionRoutes from './routes/subscriptions.js'
import tradeRoutes from './routes/trades.js'
import feedbackRoutes from './routes/feedback.js'
import conversationRoutes from './routes/conversations.js'
import followRoutes from './routes/follows.js'
import pushRoutes from './routes/push.js'
import wxRoutes from './routes/wx.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app: express.Application = express()

// 反向代理信任层数：本地开发默认 1 足够；生产部署在 nginx 后面时按上游跳数设置
// （如单层 nginx 反代则设为 1，多层链路按真实跳数调整；错误的设置会导致
//  req.ip / X-Forwarded-* 头解析异常，从而影响限流与审计）
app.set('trust proxy', process.env.TRUST_PROXY ?? 1)

// 隐藏 Express 指纹，避免暴露服务器技术栈
app.disable('x-powered-by')

// 基础安全响应头（轻量实现，不引入 helmet 依赖）
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws: wss:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'self'; frame-ancestors 'self'")
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
  next()
})

// CORS 允许域（逗号分隔，默认本地前端）；生产环境通过 CORS_ORIGIN 注入真实域名白名单
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
app.use(cors({
  origin: ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// 受控上传文件访问：避免目录遍历/直接列举（替换原 express.static）
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads')
// 校验规则：filename 必须为 <userId>_<timestamp>.<ext> 或其缩略图 <原名>.thumb.webp，仅字母数字下划线点，禁止 .. 与路径分隔符
const UPLOAD_NAME_RE = /^[A-Za-z0-9_]+_\d+\.(jpg|jpeg|png)(\.thumb\.webp)?$/
app.get('/uploads/:file', (req: Request, res: Response) => {
  const file = String(req.params.file)
  if (!UPLOAD_NAME_RE.test(file) || file.includes('..') || file.includes('/') || file.includes('\\')) {
    return res.status(404).json({ code: 404, message: '文件不存在', data: null })
  }
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.sendFile(path.join(uploadsDir, file), (err) => {
    if (err) res.status(404).json({ code: 404, message: '文件不存在', data: null })
  })
})

/**
 * 简易请求日志（生产环境也保留，便于排查问题）
 */
app.use((req, _res, next) => {
  if (req.path !== '/api/health') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  }
  next()
})

/**
 * 请求 ID：为每个请求分配 UUID 并通过响应头 X-Request-Id 回传，
 * 便于客户端报错贴附 + 服务端日志关联排查。无 crypto.randomUUID 时降级为随机串。
 */
app.use((req, res, next) => {
  const id = crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)
  ;(req as any).id = id
  res.setHeader('X-Request-Id', id)
  next()
})

/**
 * 5xx 错误计数（内存）：暴露在 /api/health 供监控轮询，零依赖
 */
let error5xxCount = 0
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.on('finish', () => {
    if (res.statusCode >= 500) error5xxCount++
  })
  next()
})

/**
 * 备份健康状态（供 /api/health 暴露最近一次成功/失败时间戳与错误信息）：
 * server.ts 在每次 runBackup() 完成后回调 reportBackup()
 */
let lastBackupAt: number | null = null
let lastBackupError: string | null = null
export function reportBackup(success: boolean, err?: unknown): void {
  lastBackupAt = Date.now()
  lastBackupError = success ? null : String(err ?? 'unknown')
}

/**
 * API 路由
 */
app.use('/api/auth', authRoutes)
app.use('/api/posts', postRoutes)
app.use('/api', commentRoutes)
app.use('/api/users', userRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api', sectionRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/drafts', draftRoutes)
app.use('/api/announcements', announcementRoutes)
app.use('/api/admin/ai', adminAiRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api', tradeRoutes)
app.use('/api/feedback', feedbackRoutes)
app.use('/api/conversations', conversationRoutes)
// 关注路由与 users 共用前缀（均为两段以上路径，不与 users.ts 的单段 /:id 冲突）
app.use('/api/users', followRoutes)
// Web Push（VAPID 未配置时端点存在但返回 501/null，前端据此隐藏入口）
app.use('/api/push', pushRoutes)
// 微信小程序辅助配置（订阅消息模板等，未配置返回 null）
app.use('/api/wx', wxRoutes)

/**
 * OpenAPI 契约（spec-C T7 裁剪版）：zod schema 为唯一契约源
 * - /api/openapi.json：机器可读 spec（3.1），CI/前端联调可直接消费
 * - /api/docs：Swagger UI（CDN 静态页，零依赖挂载）
 */
app.get('/api/openapi.json', (_req: Request, res: Response) => {
  res.json(buildOpenApiDocument())
})
app.get('/api/docs', (_req: Request, res: Response) => {
  res.type('html').send(swaggerHtml())
})

/**
 * 健康检查（升级版）：db / storage / ws 三路探测 + uptime/version + 5xx 计数
 * - 匿名可访问（位于鉴权之前），供负载均衡 / 监控轮询
 * - db/storage 探测失败时整体 status=degraded，但不抛 500（健康检查自身必须活着）
 */
app.use('/api/health', (_req: Request, res: Response) => {
  let version = 'unknown'
  try {
    version = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')) as { version?: string }).version ?? 'unknown'
  } catch { /* 版本读取失败不影响健康检查 */ }

  // db 探测：sqlite 轻量 SELECT 1
  let dbOk = false
  try {
    dbOk = !!db.prepare('SELECT 1 AS ok').get()
  } catch { /* 探测失败 → degraded */ }

  // storage 探测：工厂可实例化 + local 驱动根目录存在
  let storageOk = false
  const storageMode = (process.env.STORAGE_DRIVER ?? 'local').toLowerCase()
  try {
    const storage = getStorage()
    const root = (storage as { root?: string }).root
    storageOk = !root || fs.existsSync(root)
  } catch { /* 探测失败 → degraded */ }

  const dbDriver = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase()
  const degraded = !dbOk || !storageOk

  res.status(dbOk ? 200 : 503).json({
    code: dbOk ? 200 : 503,
    message: degraded ? 'degraded' : 'ok',
    data: {
      status: degraded ? 'degraded' : 'ok',
      timestamp: Date.now(),
      uptime: Math.round(process.uptime()),
      version,
      db: { driver: dbDriver, ok: dbOk },
      storage: { mode: storageMode, ok: storageOk },
      ws: wsStats(),
      errors: { count5xx: error5xxCount },
      health: {
        uptimeSec: Math.round(process.uptime()),
        lastBackupAt,
        lastBackupError,
      },
    },
  })
})

/**
 * 生产环境：托管前端构建产物 + SPA fallback
 * 开发环境由 Vite 处理前端，无需此段
 */
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', 'dist')
  app.use(express.static(clientDist, {
    maxAge: '1d',
    extensions: ['html'],
  }))
  // SPA history 模式 fallback：非 /api、/uploads 路径统一返回 index.html
  app.get(/^(?!\/api|\/uploads).*$/, (req, res, next) => {
    if (req.method !== 'GET') return next()
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next(err)
    })
  })
}

/**
 * 错误处理中间件
 * - MulterError：文件大小/类型错误，原属 4xx 客户端错误，必须用真 HTTP 400
 *   之前误用 res.status(200).json({code:400})，会让 axios/前端拦截器把 4xx 业务错当成功处理（guest-newbie P2-15 + admin-security P3-15 同根）
 * - 其他错误：生产环境统一返回「服务异常，请稍后重试」避免泄露堆栈/SQL/路径，细节仅进日志
 */
app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  // 完整 stack 进日志，便于排查；响应只暴露安全的客户端错
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} Server Error:`, error)

  // multer 文件大小/类型错误
  if (error.name === 'MulterError') {
    const msg = (error as any).code === 'LIMIT_FILE_SIZE' ? '文件大小超过 5MB 限制' : error.message
    return res.status(400).json({ code: 400, message: msg, data: null })
  }

  // Express body-parser 解析错误（如 JSON 语法错）也属 4xx
  if ((error as any).type === 'entity.parse.failed' || (error as any).statusCode === 400) {
    return res.status(400).json({ code: 400, message: '请求体格式错误', data: null })
  }

  // 其余一律 5xx：生产环境隐藏细节，开发环境保留 message 便于调试
  const isProd = process.env.NODE_ENV === 'production'
  const safeMessage = isProd ? '服务异常，请稍后重试' : (error.message || '服务器内部错误')
  // Sentry 已启用（SENTRY_DSN 配置）时上报服务端错误；未启用为 no-op
  captureError(error, { path: req.path, method: req.method })
  res.status(500).json({ code: 500, message: safeMessage, data: null })
})

/**
 * 404 处理
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null })
})

export default app

