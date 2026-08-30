/**
 * Web Push 推送（spec-C T9，凭据门控）：
 * - VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT 三者齐备才启用；
 *   未配置时 isPushEnabled()=false，所有发送路径静默跳过（订阅接口返回未开启）
 * - 发送失败按状态码清理失效订阅（404=不存在 / 410=Gone 用户已退订）
 */
import { db } from '../db.js';

export interface PushPayload {
  title: string;
  body: string;
  /** 点击通知后打开的页面路径（Web 端路由） */
  url?: string;
}

function isVapidConfigured(): boolean {
  // 简单校验：公钥为 65 字节未压缩 EC 密钥的 base64url（约 88 字符），避免配错格式后运行时报错
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
    process.env.VAPID_PRIVATE_KEY?.trim() &&
    process.env.VAPID_SUBJECT?.trim()
  );
}

let webpushModule: typeof import('web-push') | null = null;
/** 懒加载：未启用时绝不 import web-push（保持零负担）；CJS 模块运行时取 .default */
async function getWebPush(): Promise<typeof import('web-push')> {
  if (!webpushModule) {
    const imported: any = await import('web-push');
    const mod = imported.default ?? imported;
    mod.setVapidDetails(
      process.env.VAPID_SUBJECT!.trim(),
      process.env.VAPID_PUBLIC_KEY!.trim(),
      process.env.VAPID_PRIVATE_KEY!.trim()
    );
    webpushModule = mod;
  }
  return webpushModule;
}

export function isPushEnabled(): boolean {
  return isVapidConfigured();
}

/** 公钥下发给前端做 subscribe 的 applicationServerKey；未启用返回 null */
export function getPublicKey(): string | null {
  return isVapidConfigured() ? process.env.VAPID_PUBLIC_KEY!.trim() : null;
}

/** 落库/刷新一条订阅（endpoint 唯一，重复授权刷新 keys） */
export function saveSubscription(userId: number, endpoint: string, p256dh: string, auth: string): void {
  db.prepare(`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `).run(userId, endpoint, p256dh, auth);
}

export function removeSubscription(endpoint: string): void {
  db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);
}

/** 向一个用户的所有订阅端点发推送；失效端点（404/410）自动清理。内部吞错，永不向上抛 */
export async function sendPushToUser(userId: number, payload: PushPayload): Promise<void> {
  if (!isVapidConfigured()) return;
  try {
    const webpush = await getWebPush();
    const rows = db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?').all(userId) as any[];
    await Promise.all(rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) {
          removeSubscription(row.endpoint);
        } else {
          console.warn('[push] 发送失败（保留订阅）:', status ?? err?.message);
        }
      }
    }));
  } catch (err: any) {
    console.warn('[push] 推送流程异常:', err?.message);
  }
}

/** 生成一对 VAPID 密钥（运维辅助：node -e 调用或临时脚本用，不进路由） */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const webpush = await getWebPush();
  return webpush.generateVAPIDKeys() as any;
}
