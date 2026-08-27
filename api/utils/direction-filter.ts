/**
 * 失物方向筛选工具：仅当目标板块属于失物招领类（失物/招领/拾/寻物）时，
 * 才把 direction=lost|found 落到 SQL 上；其它情况静默忽略。
 */
import { isLostFoundSection } from './match.js';

export type DirectionValue = 'lost' | 'found';

export interface DirectionFilterResult {
  /** 实际应写入 WHERE 的 direction 值；空串表示不加这个过滤条件 */
  applied: DirectionValue | '';
}

/**
 * @param directionRaw  来自 req.query.direction 的原始字符串
 * @param sectionId     目标板块 id（<= 0 表示全站，强制忽略）
 * @param sectionName   目标板块名（用于 isLostFoundSection 判断）
 */
export function applyDirectionFilter(
  directionRaw: string | null | undefined,
  sectionId: number,
  sectionName: string | null | undefined
): DirectionFilterResult {
  if (sectionId <= 0) return { applied: '' };
  if (directionRaw !== 'lost' && directionRaw !== 'found') return { applied: '' };
  if (!sectionName || !isLostFoundSection(sectionName)) return { applied: '' };
  return { applied: directionRaw };
}
