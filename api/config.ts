import { z } from 'zod';
import { config as dotenvConfig } from 'dotenv';

// 加载环境变量
dotenvConfig();

/**
 * 环境变量验证 Schema
 * 使用 Zod 确保所有配置在启动时就是类型安全的
 */
const envSchema = z.object({
  // 环境配置
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  
  // JWT 配置
  JWT_SECRET: z.string().min(32, 'JWT_SECRET 生产环境必须至少 32 字符'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  
  // 数据库配置
  DB_DRIVER: z.enum(['sqlite', 'postgres']).default('sqlite'),
  DB_PATH: z.string().default('api/data.db'),
  PG_HOST: z.string().optional(),
  PG_PORT: z.coerce.number().int().optional(),
  PG_USER: z.string().optional(),
  PG_PASSWORD: z.string().optional(),
  PG_DATABASE: z.string().optional(),
  
  // 备份配置
  BACKUP_ENCRYPTION_KEY: z.string().min(32).optional(),
  BACKUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),
  
  // AI 配置
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default('nvidia/nemotron-3-super-120b-a12b:free'),
  AI_BASE_URL: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  
  // 微信小程序配置
  WX_APPID: z.string().optional(),
  WX_SECRET: z.string().optional(),
  
  // CORS 配置
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  
  // 日志配置
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Sentry 配置
  SENTRY_DSN: z.string().url().optional(),
  
  // 存储配置
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
});

/**
 * 开发环境宽松验证
 * 生产环境严格验证
 */
const getValidatedConfig = () => {
  const isDev = process.env.NODE_ENV !== 'production';
  
  // 开发与测试环境自动补齐默认密钥
  if (isDev && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)) {
    process.env.JWT_SECRET = 'campus-wall-dev-secret-key-2026-please-change-in-production';
  }
  
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('环境变量验证失败', {
        issues: error.issues.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      throw new Error('环境变量配置错误，请检查 .env 文件');
    }
    throw error;
  }
};

/**
 * 经过验证的类型安全配置
 */
export const config = getValidatedConfig();

/**
 * 派生配置
 */
export const derivedConfig = {
  // 数据库连接字符串
  get databaseUrl(): string {
    if (config.DB_DRIVER === 'postgres') {
      const { PG_HOST, PG_PORT, PG_USER, PG_PASSWORD, PG_DATABASE } = config;
      if (!PG_HOST || !PG_USER || !PG_PASSWORD || !PG_DATABASE) {
        throw new Error('PostgreSQL 配置不完整');
      }
      return `postgres://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${PG_PORT || 5432}/${PG_DATABASE}`;
    }
    return config.DB_PATH;
  },
  
  // CORS 允许的来源列表
  get allowedOrigins(): string[] {
    return config.CORS_ORIGIN
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
      .filter((origin) => {
        // 验证 URL 格式
        try {
          new URL(origin);
          return true;
        } catch {
          console.warn('无效的 CORS origin', { origin });
          return false;
        }
      });
  },
  
  // 是否开发环境
  get isDevelopment(): boolean {
    return config.NODE_ENV === 'development';
  },
  
  // 是否生产环境
  get isProduction(): boolean {
    return config.NODE_ENV === 'production';
  },
  
  // 是否测试环境
  get isTest(): boolean {
    return config.NODE_ENV === 'test';
  },
};

/**
 * 配置类型导出
 */
export type Config = z.infer<typeof envSchema>;
export type DerivedConfig = typeof derivedConfig;
