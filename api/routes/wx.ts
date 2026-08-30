/**
 * 微信小程序辅助配置（/api/wx）：
 * - GET /push-config 匿名可查：端上据此决定是否调 wx.requestSubscribeMessage
 *   （模板 ID 未配置时返回 null，端上静默跳过——501 回退范式的配置版）
 */
import { Router } from 'express';
import { success } from '../utils/response.js';
import { getSubscribeTemplates } from '../utils/wx-push.js';

const router = Router();

router.get('/push-config', (_req, res) => {
  success(res, getSubscribeTemplates());
});

export default router;
