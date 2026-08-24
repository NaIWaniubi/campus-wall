/**
 * Express 应用入口
 */
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'

import './db.js'
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
 * 健康检查
 */
app.use('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ code: 200, message: 'ok', data: { status: 'running', timestamp: Date.now() } })
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
 */
app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Server Error:', error.message)
  // multer 文件大小/类型错误
  if (error.name === 'MulterError') {
    const msg = (error as any).code === 'LIMIT_FILE_SIZE' ? '文件大小超过 5MB 限制' : error.message
    return res.status(200).json({ code: 400, message: msg, data: null })
  }
  res.status(500).json({ code: 500, message: error.message || '服务器内部错误', data: null })
})

/**
 * 404 处理
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({ code: 404, message: '接口不存在', data: null })
})

export default app

