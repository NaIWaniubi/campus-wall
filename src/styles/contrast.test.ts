/**
 * 可访问性回归：颜色对比度必须满足 WCAG AA。
 *
 * 背景：Tailwind 默认 zinc-400 在白底只有 2.56:1、白字压在 emerald-500 上只有 2.54:1，
 * 都达不到 AA 要求的 4.5:1（正文）与 3:1（大字号/图形）。这类问题肉眼很难发现，
 * 用测试守住最省事。
 *
 * 断言对象是 src/styles/tokens.css 里的设计 token，保证「改 token 不会悄悄退化」。
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKENS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'tokens.css'
);
const css = fs.readFileSync(TOKENS_PATH, 'utf-8');

/** 从 :root 块里取变量值 */
function token(name: string): string {
  const m = css.match(new RegExp(`${name.replace(/[-]/g, '\\-')}\\s*:\\s*(#[0-9a-fA-F]{6})`));
  if (!m || !m[1]) throw new Error(`token not found: ${name}`);
  return m[1];
}

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = (hex.replace('#', '').match(/../g) || []).map((h) => {
    const v = parseInt(h, 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#FFFFFF';

describe('颜色对比度（WCAG AA）', () => {
  it('白字压在 brand-500 上 ≥ 4.5:1（主按钮）', () => {
    const ratio = contrast(WHITE, token('--color-brand-500'));
    expect(ratio, `brand-500 对比度 ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it('白字压在 brand-600 上 ≥ 4.5:1（hover 态）', () => {
    const ratio = contrast(WHITE, token('--color-brand-600'));
    expect(ratio, `brand-600 对比度 ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it('次级文字 text-mute 在白底 ≥ 4.5:1', () => {
    const ratio = contrast(token('--color-text-mute'), WHITE);
    expect(ratio, `text-mute 对比度 ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5);
  });

  it('正文 text / text-soft 在白底 ≥ 7:1（AAA 正文标准，留余量）', () => {
    expect(contrast(token('--color-text'), WHITE)).toBeGreaterThanOrEqual(7);
    expect(contrast(token('--color-text-soft'), WHITE)).toBeGreaterThanOrEqual(7);
  });

  it('品牌色作为文字放在白底 ≥ 4.5:1（品牌色文字链接）', () => {
    expect(contrast(token('--color-brand-500'), WHITE)).toBeGreaterThanOrEqual(4.5);
  });
});
