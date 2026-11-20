/**
 * Web Push 路由（/api/push，spec-C T9 预埋）：
 * - GET  /public-key   匿名可查；VAPID 未配置时 publicKey=null（前端据此隐藏入口）
 * - POST /subscribe    登录态，落库/刷新推送订阅
 * - POST /unsubscribe  登录态，按 endpoint 退订
 */
import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { success, fail } from '../utils/response.js';
import { getPublicKey, saveSubscription, removeSubscription } from '../utils/push.js';

const router = Router();

router.get('/public-key', (_req, res) => {
  success(res, { publicKey: getPublicKey(), enabled: getPublicKey() !== null });
});

router.post('/subscribe', authRequired, (req, res) => {
  const sub = req.body?.subscription;
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint : '';
  const p256dh = sub?.keys?.p256dh;
  const auth = sub?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return fail(res, '订阅结构不完整（需 endpoint + keys.p256dh + keys.auth）');
  // R5 审查 P2：原实现对字段长度与字符集零校验——可存任意超长串（或多 MB 垃圾）
  // 进 push_subscriptions；Push endpoint 应是 https URL，密钥是定长 base64url。
  if (endpoint.length > 512 || !/^https:\/\//i.test(endpoint)) {
    return fail(res, 'endpoint 不合法');
  }
  const sP256dh = String(p256dh);
  const sAuth = String(auth);
  if (sP256dh.length > 128 || sAuth.length > 64 || !/^[A-Za-z0-9_-]+$/.test(sP256dh) || !/^[A-Za-z0-9_-]+$/.test(sAuth)) {
    return fail(res, '密钥格式不合法');
  }
  if (!getPublicKey()) return fail(res, '推送未开启（服务端未配置 VAPID）', 501, 501);
  saveSubscription(req.currentUser!.id, endpoint, sP256dh, sAuth);
  success(res, { subscribed: true });
});

router.post('/unsubscribe', authRequired, (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.slice(0, 512) : '';
  if (!endpoint) return fail(res, '缺少 endpoint');
  // 只能退订自己的订阅：拿到他人 endpoint（日志/共享设备泄漏）不可用来摘掉别人设备
  removeSubscription(endpoint, req.currentUser!.id);
  success(res, { subscribed: false });
});

export default router;
