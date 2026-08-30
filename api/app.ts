/**
 * Express 应用入口
 */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

import './db.js'
import { db } from './db.js'
import { getStorage } from './storage/index.js'
import { stats as wsStats } from './ws/hub.js'
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

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

// 隐藏 Express 指纹，避免暴露服务器技术栈
app.disable('x-powered-by')

// 基础安全响应头（轻量实现，不引入 helmet 依赖）
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.setHeader('X-XSS-Protection', '1; mode=block')
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  next()
})

app.use(cors())
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

/**
 * 健康检查（升级版）：db / storage / ws 三路探测 + uptime/version + 5xx 计数
 * - 匿名可访问（位于鉴权之前），供负载均衡 / 监控轮询
 * - db/storage 探测失败时整体 status=degraded，但不抛 500（健康检查自身必须活着）
 */
app.use('/api/health', (_req: Request, res: Response) => {
  let version = 'unknown'
  try {
    version = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')) as any).version ?? 'unknown'
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
    const root = (storage as any).root as string | undefined
    storageOk = !root || fs.existsSync(root)
  } catch { /* 探测失败 → degraded */ }

  const dbDriver = (process.env.DB_DRIVER ?? 'sqlite').toLowerCase()
  const degraded = !dbOk || !storageOk

  res.status(200).json({
    code: 200,
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
  res.status(500).json({ code: 500, message: safeMessage, data: null })
})

/**
 * 404 处理
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null })
})

export default app

