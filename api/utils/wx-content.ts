/**
 * 微信内容安全（msgSecCheck / mediaCheckAsync）
 *
 * 设计原则：
 * - 未配置 WX_APPID/WX_SECRET 时整体禁用，本地敏感词始终兜底
 * - access_token 内存缓存，提前 5 分钟刷新
 * - 网络异常默认不阻塞发布（fail-open），可用 WX_CONTENT_FAIL_CLOSED=1 改为拒绝
 */
import { logger } from './logger.js';

const APPID = (process.env.WX_APPID || '').trim();
const SECRET = (process.env.WX_SECRET || '').trim();
const FAIL_CLOSED = process.env.WX_CONTENT_FAIL_CLOSED === '1';

export function isWxContentEnabled(): boolean {
  return !!APPID && !!SECRET;
}

let cachedToken = '';
let tokenExpiresAt = 0;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(APPID)}&secret=${encodeURIComponent(SECRET)}`;
  const resp = await fetch(url);
  const data = (await resp.json()) as any;
  if (!data.access_token) {
    throw new Error(`获取 access_token 失败: ${data.errcode ?? '?'} ${data.errmsg ?? ''}`);
  }
  cachedToken = data.access_token;
  tokenExpiresAt = now + (Number(data.expires_in || 7200) - 300) * 1000;
  return cachedToken;
}

export type WxTextVerdict = 'pass' | 'review' | 'risky' | 'disabled' | 'error';

export interface WxTextResult {
  verdict: WxTextVerdict;
  label?: number;
  errcode?: number;
}

/**
 * 同步文本检测（msgSecCheck v2）。
 * openid 必须是该小程序用户；Web 注册用户没有 openid，调用时应跳过。
 */
export async function checkText(
  openid: string | null | undefined,
  content: string,
  scene = 2
): Promise<WxTextResult> {
  if (!isWxContentEnabled() || !openid || !content.trim()) {
    return { verdict: 'disabled' };
  }
  try {
    const token = await getAccessToken();
    const resp = await fetch(
      `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.slice(0, 2500),
          version: 2,
          scene,
          openid,
        }),
      }
    );
    const data = (await resp.json()) as any;
    if (data.errcode && data.errcode !== 0) {
      // 87014：内容含违法违规
      if (data.errcode === 87014) return { verdict: 'risky', errcode: data.errcode };
      logger.warn('msgSecCheck 返回错误', { errcode: data.errcode, errmsg: data.errmsg });
      return { verdict: 'error', errcode: data.errcode };
    }
    const suggest = data.result?.suggest;
    if (suggest === 'risky') return { verdict: 'risky', label: data.result?.label };
    if (suggest === 'review') return { verdict: 'review', label: data.result?.label };
    return { verdict: 'pass', label: data.result?.label };
  } catch (err: any) {
    logger.warn('msgSecCheck 调用异常', { error: err?.message });
    return { verdict: 'error' };
  }
}

/**
 * 异步图片检测（mediaCheckAsync）：提交后由微信回调结果（需在小程序后台配置消息推送），
 * 此处只负责提交，不阻塞上传。返回 trace_id 供后续对账。
 */
export async function submitImageCheck(
  openid: string | null | undefined,
  mediaUrl: string,
  scene = 2
): Promise<{ ok: boolean; traceId?: string }> {
  if (!isWxContentEnabled() || !openid || !mediaUrl) return { ok: false };
  try {
    const token = await getAccessToken();
    const resp = await fetch(
      `https://api.weixin.qq.com/wxa/media_check_async?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_url: mediaUrl,
          media_type: 2,
          version: 2,
          scene,
          openid,
        }),
      }
    );
    const data = (await resp.json()) as any;
    if (data.errcode === 0 && data.trace_id) {
      return { ok: true, traceId: data.trace_id };
    }
    logger.warn('mediaCheckAsync 提交失败', { errcode: data.errcode, errmsg: data.errmsg });
    return { ok: false };
  } catch (err: any) {
    logger.warn('mediaCheckAsync 调用异常', { error: err?.message });
    return { ok: false };
  }
}

/** 检查失败时是否拒绝（默认 fail-open：不因微信接口抖动阻断用户发布） */
export function shouldRejectOnCheckError(): boolean {
  return FAIL_CLOSED;
}
