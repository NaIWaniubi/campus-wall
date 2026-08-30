/**
 * 微信小程序订阅消息推送（spec-C T9 预埋，凭据门控）：
 * - 启用条件：WX_APPID + WX_SECRET + 对应场景模板 ID（WX_SUBSCRIBE_TEMPLATE_CHAT / WX_SUBSCRIBE_TEMPLATE_SYSTEM）
 *   任一缺失则 isWxPushEnabled()=false，所有路径静默跳过
 * - access_token 进程内缓存（有效期取 expires_in - 300s）
 * - data 字段名（thing1/time2...）需与所选模板字段一致；不一致时微信返回 47003，此处仅记日志不重试
 */
import { db } from '../db.js';

const WX_API = 'https://api.weixin.qq.com';

export function isWxPushEnabled(): boolean {
  return Boolean(
    process.env.WX_APPID?.trim() &&
    process.env.WX_SECRET?.trim() &&
    (process.env.WX_SUBSCRIBE_TEMPLATE_CHAT?.trim() || process.env.WX_SUBSCRIBE_TEMPLATE_SYSTEM?.trim())
  );
}

/** 小程序端查询可用模板（未启用/未配置场景返回 null，端上据此不调 requestSubscribeMessage） */
export function getSubscribeTemplates() {
  return {
    chatTemplateId: process.env.WX_SUBSCRIBE_TEMPLATE_CHAT?.trim() || null,
    systemTemplateId: process.env.WX_SUBSCRIBE_TEMPLATE_SYSTEM?.trim() || null,
  };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  const url = `${WX_API}/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(process.env.WX_APPID!.trim())}&secret=${encodeURIComponent(process.env.WX_SECRET!.trim())}`;
  const res = await fetch(url);
  const json: any = await res.json();
  if (!json.access_token) {
    throw new Error(`获取 access_token 失败: ${json.errcode ?? ''} ${json.errmsg ?? ''}`);
  }
  tokenCache = { token: json.access_token, expiresAt: Date.now() + (Number(json.expires_in) - 300) * 1000 };
  return tokenCache.token;
}

/**
 * 发一条订阅消息。任何失败（未启用/无 openid/无模板/微信侧拒绝）都静默，不影响业务主流程。
 * @param type 通知类型（chat → 私信模板；system → 系统通知模板）
 */
export async function sendWxSubscribeMessage(
  userId: number,
  type: string,
  content: string,
  relatedId?: number | null
): Promise<void> {
  if (!isWxPushEnabled()) return;
  try {
    const templateId = (type === 'chat' ? process.env.WX_SUBSCRIBE_TEMPLATE_CHAT : process.env.WX_SUBSCRIBE_TEMPLATE_SYSTEM)?.trim();
    if (!templateId) return;

    const user = db.prepare('SELECT openid FROM users WHERE id = ?').get(userId) as any;
    if (!user?.openid) return;

    const token = await getAccessToken();
    const body: Record<string, unknown> = {
      touser: user.openid,
      template_id: templateId,
      page: type === 'chat' && relatedId
        ? `pages/message/chat/chat?conversationId=${relatedId}`
        : 'pages/index/index',
      // 字段名需与所选模板一致；默认按「内容(thing1)」单字段模板假设，47003 时按实际模板字段调整
      data: { thing1: { value: content.slice(0, 20) } },
    };
    const res = await fetch(`${WX_API}/cgi-bin/message/subscribe/send?access_token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json: any = await res.json();
    if (json.errcode !== 0) {
      console.warn(`[wx-push] 发送失败 errcode=${json.errcode} errmsg=${json.errmsg}`);
    }
  } catch (err: any) {
    console.warn('[wx-push] 推送流程异常:', err?.message);
  }
}
