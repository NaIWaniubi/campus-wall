/**
 * 行为事件埋点：轻量漏斗记录
 *
 * 只记关键转化事件（注册 / 激活 / 首帖 / 首评 / 成交 / 邀请），不写全量访问日志。
 * 设计约束：
 * - 绝不阻塞主流程：写入失败只记日志，不影响业务响应
 * - 幂等友好：同一 (user, type, ref) 重复上报由调用方决定是否去重
 * - 便于出数：events 表按 (type, created_at) 与 (user_id, created_at) 建索引
 *
 * 用途：支撑答辩所需的 DAU、留存、漏斗、单校增长等指标（见 docs/COMPETITION-PLAN.md）。
 */
import { db } from '../db.js';
import { logger } from './logger.js';

export type EventType =
  | 'register'      // 注册成功
  | 'login'         // 登录成功
  | 'first_post'    // 首次发布（激活的关键标志）
  | 'first_comment' // 首次评论
  | 'post_create'   // 发帖
  | 'comment_create'// 评论
  | 'trade_complete'// 交易完成
  | 'offer_create'  // 发起出价
  | 'match_view'    // 查看匹配结果
  | 'invite'        // 邀请注册（带邀请人）
  | 'audit_done';   // 审核完成

/** 记录一条事件（失败静默，不影响业务） */
export function trackEvent(
  userId: number,
  type: EventType,
  refId?: number | null,
  meta?: Record<string, unknown>
): void {
  try {
    db.prepare('INSERT INTO events (user_id, type, ref_id, meta) VALUES (?, ?, ?, ?)').run(
      userId,
      type,
      refId ?? null,
      JSON.stringify(meta || {})
    );
  } catch (e: any) {
    logger.warn('trackEvent failed', { type, userId, error: e?.message });
  }
}

/** 某用户是否已有某类事件（用于「首次」判定，避免重复计数） */
export function hasEvent(userId: number, type: EventType): boolean {
  const row = db.prepare('SELECT 1 FROM events WHERE user_id = ? AND type = ? LIMIT 1').get(userId, type);
  return !!row;
}

/** 只在首次发生时记录（首次发帖/首评等） */
export function trackFirstEvent(
  userId: number,
  type: EventType,
  refId?: number | null,
  meta?: Record<string, unknown>
): void {
  if (hasEvent(userId, type)) return;
  trackEvent(userId, type, refId, meta);
}

/** 更新用户最后活跃时间（登录、发帖、评论时调用；失败静默） */
export function touchActive(userId: number): void {
  try {
    db.prepare('UPDATE users SET last_active_at = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
  } catch (e: any) {
    logger.warn('touchActive failed', { userId, error: e?.message });
  }
}

/* ==========================================================================
 * 指标查询：供运营报表 / 答辩取数使用
 * 全部基于 events 与业务表，不依赖外部分析平台。
 * ========================================================================== */

export interface GrowthMetrics {
  registered: number;
  activeToday: number;
  active7d: number;
  postsTotal: number;
  tradesCompleted: number;
  /** 注册 → 首帖转化率 */
  activationRate: number;
}

/** 汇总核心增长指标 */
export function growthMetrics(): GrowthMetrics {
  const registered = (db.prepare("SELECT COUNT(*) c FROM users WHERE role = 'user'").get() as any).c;
  const activeToday = (
    db.prepare("SELECT COUNT(DISTINCT user_id) c FROM events WHERE date(created_at) = date('now')").get() as any
  ).c;
  const active7d = (
    db
      .prepare("SELECT COUNT(DISTINCT user_id) c FROM events WHERE created_at >= datetime('now', '-7 days')")
      .get() as any
  ).c;
  const postsTotal = (db.prepare("SELECT COUNT(*) c FROM posts WHERE status != 'deleted'").get() as any).c;
  const tradesCompleted = (
    db
      .prepare(
        "SELECT COUNT(*) c FROM posts WHERE json_extract(extra_fields, '$.soldAt') IS NOT NULL AND status != 'deleted'"
      )
      .get() as any
  ).c;
  const firstPosts = (db.prepare("SELECT COUNT(DISTINCT user_id) c FROM events WHERE type = 'first_post'").get() as any).c;

  return {
    registered,
    activeToday,
    active7d,
    postsTotal,
    tradesCompleted,
    activationRate: registered ? firstPosts / registered : 0,
  };
}
