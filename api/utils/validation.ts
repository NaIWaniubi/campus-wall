import type { Request, Response, NextFunction } from 'express';
import { z, type ZodSchema } from 'zod';
import { fail } from './response.js';

/**
 * 请求验证中间件工厂
 * 使用 Zod 进行类型安全的请求体、查询参数、路径参数验证
 */
export function validate(schema: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // 验证请求体
      if (schema.body) {
        req.body = schema.body.parse(req.body) as any;
      }
      
      // 验证查询参数（兼容 Express 5 只读 query getter）
      if (schema.query) {
        const parsed = schema.query.parse(req.query);
        Object.defineProperty(req, 'query', { value: parsed, writable: true, configurable: true, enumerable: true });
      }
      
      // 验证路径参数（兼容 Express 5 路由参数对象）
      if (schema.params) {
        const parsed = schema.params.parse(req.params);
        Object.defineProperty(req, 'params', { value: parsed, writable: true, configurable: true, enumerable: true });
      }
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.issues[0];
        if (firstError) {
          const message = `${firstError.path.join('.')}: ${firstError.message}`;
          fail(res, message, 400);
          return;
        }
      }
      fail(res, '请求参数验证失败', 400);
    }
  };
}

/**
 * 常用验证 Schema
 */
export const commonSchemas = {
  // ID 参数
  id: z.object({
    id: z.coerce.number().int().positive('ID 必须是正整数'),
  }),
  
  // 分页参数
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  }),
  
  /**
   * 登录账号（字段名沿用 studentId，避免破坏 JWT / 数据库 / 小程序契约）。
   * 不再强制学号：3–32 位，允许字母、数字、下划线、点、中划线、@，
   * 覆盖手机号（13800138000）、拼音（chenxiaobei）、邮箱前缀（chen.xb）、
   * 老学号（23770001）与超管 admin。中文请用昵称字段，账号保持 ASCII 便于输入。
   */
  account: z.string()
    .trim()
    .min(3, '账号至少 3 位')
    .max(32, '账号最多 32 位')
    .regex(/^[A-Za-z0-9_.@-]+$/, '账号只能包含字母、数字、下划线、点、中划线或 @'),
  
  // 密码（基础版本，后面会增强）
  password: z.string()
    .min(8, '密码至少 8 位')
    .max(32, '密码最多 32 位')
    .regex(/[A-Z]/, '密码必须包含大写字母')
    .regex(/[a-z]/, '密码必须包含小写字母')
    .regex(/[0-9]/, '密码必须包含数字'),
  
  /** 旧字段名别名（历史代码/小程序仍传 studentId） */
  studentId: z.string().trim().min(1).max(32),

  /**
   * 注册密码：6–32 位，只需包含字母与数字。
   * 原 commonSchemas.password（8 位 + 大小写 + 数字）保留给「修改密码」，
   * 注册侧放宽，避免前端提示「至少 6 位」但后端拒收的错位。
   */
  registerPassword: z.string()
    .min(6, '密码至少 6 位')
    .max(32, '密码最多 32 位')
    .regex(/[A-Za-z]/, '密码需包含字母')
    .regex(/[0-9]/, '密码需包含数字'),

  // 手机号
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  
  // 邮箱
  email: z.string().email('邮箱格式不正确'),
  
  // URL
  url: z.string().url('URL 格式不正确'),
  
  // 图片 URL 列表
  images: z.array(z.string().url()).max(9, '最多上传 9 张图片').optional(),
  
  // 内容文本
  content: z.string()
    .min(1, '内容不能为空')
    .max(5000, '内容最多 5000 字')
    .transform((s) => s.trim())
    .or(z.string().optional()),
  
  // 标题
  title: z.string()
    .min(1, '标题不能为空')
    .max(100, '标题最多 100 字')
    .transform((s) => s.trim())
    .or(z.string().optional()),
};

/**
 * 帖子相关 Schema
 */
export const postSchemas = {
  // 创建帖子
  create: z.object({
    sectionId: z.number().int().min(1).max(8, '板块 ID 必须在 1-8 之间'),
    title: z.string().min(1, '标题不能为空').max(50, '标题最多 50 字').transform((s) => s.trim()),
    content: z.string().min(1, '内容不能为空').max(500, '内容最多 500 字').transform((s) => s.trim()),
    images: z.array(z.string()).max(9, '最多上传 9 张图片').optional(),
    isAnonymous: z.boolean().default(false),
    extraFields: z.record(z.string(), z.unknown()).optional(),
  }),
  
  // 更新帖子
  update: z.object({
    title: z.string().min(1, '标题不能为空').max(50, '标题最多 50 字').transform((s) => s.trim()).optional(),
    content: z.string().min(1, '内容不能为空').max(500, '内容最多 500 字').transform((s) => s.trim()).optional(),
    images: z.array(z.string()).max(9, '最多上传 9 张图片').optional(),
    isAnonymous: z.boolean().optional(),
    extraFields: z.record(z.string(), z.unknown()).optional(),
  }),
  
  // 列表查询
  list: z.object({
    sectionId: z.coerce.number().int().min(0).max(8).optional(),
    sortBy: z.enum(['hot', 'latest']).default('latest'),
    sort: z.string().optional(),
    keyword: z.string().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
    search: z.string().max(100).optional(),
    subType: z.string().max(50).optional(),
    authorId: z.coerce.number().int().optional(),
    priceRange: z.string().optional(),
    timeRange: z.string().optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    lostOrFound: z.enum(['lost', 'found']).optional(),
    campus: z.string().max(30).optional(),
  }).passthrough(),
};

/**
 * 评论相关 Schema
 */
export const commentSchemas = {
  // 创建评论
  create: z.object({
    content: z.string()
      .trim()
      .min(1, '评论不能为空')
      .max(200, '评论最多 200 字'),
    isAnonymous: z.boolean().default(false),
  }),
  
  // 回复评论
  reply: z.object({
    content: z.string()
      .trim()
      .min(1, '回复不能为空')
      .max(150, '回复最多 150 字'),
    isAnonymous: z.boolean().default(false),
  }),
  
  // 举报评论
  report: z.object({
    reason: z.string().min(1, '请选择举报原因'),
  }),
};

/**
 * 用户相关 Schema
 */
export const userSchemas = {
  // 注册
  register: z
    .object({
      /** 新调用方用 account；老调用方仍可传 studentId */
      account: z.string().trim().min(1).max(32).optional(),
      studentId: z.string().trim().min(1).max(32).optional(),
      password: commonSchemas.registerPassword,
      nickname: z.string()
        .min(1, '昵称不能为空')
        .max(20, '昵称最多 20 字')
        .transform((s) => s.trim()),
      // 学院选填：账号注册即可，不强制补齐院系
      college: z.string().max(50, '学院最多 50 字').optional(),
      classInfo: z.string().max(50, '班级信息最多 50 字').optional(),
      phone: commonSchemas.phone.optional(),
      email: commonSchemas.email.optional(),
    })
    .refine((v) => !!(v.account || v.studentId), { message: '请输入账号', path: ['account'] })
    .transform((v) => {
      const account = commonSchemas.account.parse((v.account ?? v.studentId)!.trim())
      return { ...v, account, studentId: account }
    }),

  // 登录
  login: z
    .object({
      account: z.string().trim().min(1).max(32).optional(),
      studentId: z.string().trim().min(1).max(32).optional(),
      password: z.string().min(1, '密码不能为空'),
    })
    .refine((v) => !!(v.account || v.studentId), { message: '请输入账号', path: ['account'] })
    .transform((v) => {
      const account = commonSchemas.account.parse((v.account ?? v.studentId)!.trim())
      return { ...v, account, studentId: account }
    }),

  // 修改密码
  changePassword: z.object({
    oldPassword: z.string().min(1, '旧密码不能为空'),
    newPassword: commonSchemas.password,
  }),
  
  // 更新资料
  // signature 是「一句话介绍」的正式字段：前端 SettingsPage 与 ProfilePage 都在读写它，
  // 早期白名单误写成 bio 并默认 strip，导致保存签名静默失败（返回「无更新内容」）。
  updateProfile: z.object({
    nickname: z.string().min(1).max(20).optional(),
    // 头像：本地上传返回相对路径 /uploads/<file>（防换域名历史图失效），外链是完整 URL——两种都收
    avatar: z.union([z.string().url(), z.string().regex(/^\/uploads\/[\w.-]+$/)]).optional(),
    signature: z.string().max(100, '签名最多 100 字').optional(),
    bio: z.string().max(200).optional(),
    college: z.string().max(50).optional(),
    classInfo: z.string().max(50).optional(),
    phone: commonSchemas.phone.optional(),
    email: commonSchemas.email.optional(),
  }),
};

/**
 * 管理后台相关 Schema
 */
export const adminSchemas = {
  // 用户管理 - 封禁
  banUser: z.object({
    action: z.enum(['ban', 'unban']),
    reason: z.string().min(1, '封禁原因不能为空').max(200).optional(),
    duration: z.union([
      z.enum(['1', '7', '30', 'forever']),
      z.string().regex(/^\d+$/)
    ]).optional(),
  }),
  
  // 调整信誉分
  adjustReputation: z.object({
    amount: z.number().int().min(-100).max(100, '单次调整范围 -100 到 100'),
    reason: z.string().min(1, '调整原因不能为空').max(200),
  }),
  
  // 内容审核
  reviewContent: z.object({
    action: z.enum(['approve', 'reject', 'delete']),
    reason: z.string().max(200).optional(),
  }),
  
  // 处理举报
  handleReport: z.object({
    action: z.enum(['dismiss', 'delete_content', 'ban_user']),
    reason: z.string().max(200).optional(),
    banDuration: z.number().int().min(1).max(365).optional(),
  }),
};

/**
 * AI 助手相关 Schema
 */
export const aiSchemas = {
  // 提问
  ask: z.object({
    question: z.string()
      .min(1, '问题不能为空')
      .max(500, '问题最多 500 字')
      .transform((s) => s.trim()),
    conversationId: z.string().uuid().optional(),
  }),
  
  // 知识库条目
  knowledgeEntry: z.object({
    question: z.string().min(1).max(200),
    answer: z.string().min(1).max(2000),
    category: z.string().max(50).optional(),
    keywords: z.array(z.string().max(50)).max(10).optional(),
  }),
};

/**
 * 交易相关 Schema
 */
export const tradeSchemas = {
  // 标记交易完成
  markComplete: z.object({
    buyerId: z.number().int().positive(),
  }),
  
  // 交易评价
  rate: z.object({
    rating: z.number().int().min(1).max(5, '评分范围 1-5 星'),
    comment: z.string().max(200).optional(),
  }),
};

/**
 * 反馈相关 Schema
 */
export const feedbackSchemas = {
  // 提交反馈
  submit: z.object({
    type: z.enum(['bug', 'feature', 'improvement', 'other']),
    title: z.string().min(1).max(100),
    content: z.string().min(1).max(1000),
    images: z.array(z.string().url()).max(3).optional(),
  }),
};

/**
 * 草稿相关 Schema
 */
export const draftSchemas = {
  // 保存草稿
  save: z.object({
    sectionId: z.number().int().min(1).max(8),
    title: z.string().max(100),
    content: z.string().max(5000),
    images: z.array(z.string().url()).max(9).optional(),
    extraFields: z.record(z.string(), z.unknown()).optional(),
  }),
};
