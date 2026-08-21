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

// 静态文件服务（上传的图片）
const uploadsDir = path.join(__dirname, '..', 'public', 'uploads')
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  immutable: true,
}))

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
app.use('/api/admin', adminRoutes)

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
