/**
 * 微信小程序辅助路由（/api/wx）：
 * - GET  /push-config  匿名可查：端上据此决定是否调 wx.requestSubscribeMessage
 *   （模板 ID 未配置时返回 null，端上静默跳过）
 * - POST /wx-login     兼容别名：主入口为 POST /api/auth/wx-login（与小程序 utils/auth.js 一致）
 */
import { Router } from 'express';
import { success } from '../utils/response.js';
import { getSubscribeTemplates } from '../utils/wx-push.js';
import { wxLoginHandler } from '../utils/wx-login.js';

const router = Router();

router.get('/push-config', (_req, res) => {
  success(res, getSubscribeTemplates());
});

// 兼容别名：早期文档/客户端可能指向 /api/wx/wx-login，行为与 /api/auth/wx-login 完全一致
router.post('/wx-login', wxLoginHandler);

export default router;
