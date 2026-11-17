/**
 * 管理端 AI 设置路由：知识库在线编辑、模型切换、调用量统计
 */
import { Router, type Request, type Response } from 'express';
import fs from 'fs';
import { getSetting, setSetting } from '../db.js';
import { authRequired, superAdminRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';
import { DEFAULT_MODELS } from '../utils/ai.js';
import { getKbWritePath } from './ai.js';
import { aiStats } from './ai/usage.js';
import { logger } from '../utils/logger.js';

const KB_MAX_BYTES = 64 * 1024;

const router = Router();
router.use(authRequired, superAdminRequired);

// 读取官网知识库
router.get('/knowledge', (_req: Request, res: Response) => {
  try {
    const content = fs.readFileSync(getKbWritePath(), 'utf-8');
    return success(res, { content });
  } catch {
    return success(res, { content: '' });
  }
});

// 保存官网知识库
router.put('/knowledge', (req: Request, res: Response) => {
  const content = typeof req.body?.content === 'string' ? req.body.content : '';
  if (!content.trim()) return fail(res, '知识库内容不能为空');
  if (Buffer.byteLength(content, 'utf-8') > KB_MAX_BYTES) {
    return fail(res, '知识库内容过大（上限 64KB）');
  }
  try {
    fs.writeFileSync(getKbWritePath(), content, 'utf-8');
    return success(res, null, '知识库已保存');
  } catch (err: any) {
    logger.error('AI 知识库保存失败', { error: err?.message });
    return fail(res, '知识库保存失败，请检查服务器文件权限');
  }
});

// 读取 AI 设置
router.get('/settings', (_req: Request, res: Response) => {
  return success(res, {
    model: getSetting('ai_model') || '',
    presetModels: DEFAULT_MODELS,
  });
});

// 保存模型设置（空串 = 恢复默认链）
router.put('/settings', (req: Request, res: Response) => {
  const model = String(req.body?.model || '').trim();
  if (model.length > 100) return fail(res, '模型名过长');
  setSetting('ai_model', model);
  return success(res, { model }, model ? '模型已切换' : '已恢复默认模型链');
});

// 调用量统计
router.get('/stats', (_req: Request, res: Response) => {
  const stale = aiStats.date !== new Date().toISOString().slice(0, 10);
  return success(res, {
    today: stale ? 0 : aiStats.today,
    total: aiStats.total,
  });
});

export default router;
