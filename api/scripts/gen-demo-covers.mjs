/**
 * 生成演示帖子封面（抽象渐变海报风格，贴合 V3 多巴胺视色）
 * 输出：api/demo-assets/cover-<id>.jpg + cover-<id>.jpg.thumb.webp
 * 仅开发机执行；产物随 seed 一起进部署包，运行时不需要 sharp 生成。
 *
 * 用法：node api/scripts/gen-demo-covers.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'demo-assets');
fs.mkdirSync(OUT, { recursive: true });

/** 每个封面：主色 + 副色 + 形状种子（手工挑选，保证 8 个板块各有辨识度） */
const COVERS = [
  { id: 'ipad', a: '#3B82F6', b: '#8B5CF6', c: '#22D3EE', motif: 'device' },
  { id: 'bike', a: '#F59E0B', b: '#EF4444', c: '#FDE68A', motif: 'rings' },
  { id: 'books', a: '#7C3AED', b: '#4F46E5', c: '#DDD6FE', motif: 'stack' },
  { id: 'card', a: '#06B6D4', b: '#3B82F6', c: '#E0F2FE', motif: 'card' },
  { id: 'keys', a: '#8B5CF6', b: '#EC4899', c: '#FBCFE8', motif: 'rings' },
  { id: 'confession', a: '#FB7185', b: '#F43F5E', c: '#FFE4E6', motif: 'heart' },
  { id: 'rain', a: '#475569', b: '#0EA5E9', c: '#BAE6FD', motif: 'rain' },
  { id: 'stage', a: '#6D5BD0', b: '#C4538C', c: '#FDE68A', motif: 'stage' },
  { id: 'club', a: '#EC4899', b: '#8B5CF6', c: '#FCE7F3', motif: 'spark' },
  { id: 'car', a: '#C026D3', b: '#6D3BF5', c: '#F5D0FE', motif: 'road' },
  { id: 'study', a: '#4F46E5', b: '#22D3EE', c: '#E0F2FE', motif: 'grid' },
  { id: 'food', a: '#F97316', b: '#EF4444', c: '#FED7AA', motif: 'bowl' },
];

/** 形状图层：每种 motif 返回一段 SVG（透明底） */
function motifSvg(motif, _c) {
  const white = (o) => `rgba(255,255,255,${o})`;
  switch (motif) {
    case 'device':
      return `<rect x="470" y="250" width="260" height="340" rx="28" fill="${white(0.18)}"/>
        <rect x="492" y="282" width="216" height="276" rx="14" fill="${white(0.34)}"/>
        <rect x="560" y="575" width="80" height="8" rx="4" fill="${white(0.5)}"/>`;
    case 'rings':
      return `<circle cx="600" cy="400" r="190" fill="none" stroke="${white(0.28)}" stroke-width="26"/>
        <circle cx="600" cy="400" r="120" fill="none" stroke="${white(0.18)}" stroke-width="18"/>
        <circle cx="600" cy="400" r="52" fill="${white(0.3)}"/>`;
    case 'stack':
      return `<rect x="380" y="480" width="440" height="46" rx="12" fill="${white(0.34)}"/>
        <rect x="410" y="420" width="380" height="46" rx="12" fill="${white(0.26)}"/>
        <rect x="440" y="360" width="320" height="46" rx="12" fill="${white(0.18)}"/>`;
    case 'card':
      return `<rect x="380" y="290" width="440" height="240" rx="30" fill="${white(0.22)}"/>
        <rect x="410" y="330" width="150" height="26" rx="12" fill="${white(0.45)}"/>
        <rect x="410" y="378" width="260" height="16" rx="8" fill="${white(0.3)}"/>
        <circle cx="740" cy="470" r="26" fill="${white(0.4)}"/>`;
    case 'heart':
      return `<path d="M600 560 C 470 470, 420 380, 480 320 C 530 272, 590 300, 600 360 C 610 300, 670 272, 720 320 C 780 380, 730 470, 600 560 Z" fill="${white(0.3)}"/>`;
    case 'rain':
      return `<g stroke="${white(0.28)}" stroke-width="10" stroke-linecap="round">
        ${Array.from({ length: 11 }, (_, i) => {
          const x = 300 + i * 55;
          return `<line x1="${x}" y1="230" x2="${x - 40}" y2="470"/>`;
        }).join('')}
      </g><path d="M420 560 Q 600 620 780 560" stroke="${white(0.5)}" stroke-width="18" fill="none" stroke-linecap="round"/>`;
    case 'stage':
      return `<polygon points="600,190 760,520 440,520" fill="${white(0.16)}"/>
        <circle cx="600" cy="360" r="70" fill="${white(0.35)}"/>
        <rect x="360" y="520" width="480" height="26" rx="13" fill="${white(0.28)}"/>
        ${[0, 1, 2, 3].map((i) => `<circle cx="${420 + i * 120}" cy="600" r="16" fill="${white(0.22)}"/>`).join('')}`;
    case 'spark':
      return `<g fill="${white(0.3)}">
        <path d="M600 220 L 630 350 L 760 380 L 630 410 L 600 540 L 570 410 L 440 380 L 570 350 Z"/>
      </g>
      <circle cx="420" cy="260" r="26" fill="${white(0.2)}"/>
      <circle cx="780" cy="520" r="34" fill="${white(0.2)}"/>`;
    case 'road':
      return `<path d="M470 640 L 560 190 L 640 190 L 730 640 Z" fill="${white(0.16)}"/>
        ${[0, 1, 2, 3].map((i) => `<rect x="594" y="${250 + i * 100}" width="12" height="56" rx="6" fill="${white(0.4)}"/>`).join('')}`;
    case 'grid':
      return `<g stroke="${white(0.2)}" stroke-width="3">
        ${[0, 1, 2, 3, 4].map((i) => `<line x1="${360 + i * 120}" y1="220" x2="${360 + i * 120}" y2="580"/>`).join('')}
        ${[0, 1, 2].map((i) => `<line x1="360" y1="${220 + i * 120}" x2="840" y2="${220 + i * 120}"/>`).join('')}
      </g><rect x="480" y="340" width="240" height="120" rx="18" fill="${white(0.28)}"/>`;
    case 'bowl':
      return `<path d="M400 380 Q 600 560 800 380 Z" fill="${white(0.28)}"/>
        <ellipse cx="600" cy="380" rx="200" ry="34" fill="${white(0.2)}"/>
        <path d="M520 300 q 30 -50 0 -90 M600 290 q 30 -50 0 -90 M680 300 q 30 -50 0 -90" stroke="${white(0.3)}" stroke-width="10" fill="none" stroke-linecap="round"/>`;
    default:
      return `<circle cx="600" cy="400" r="170" fill="${white(0.22)}"/>`;
  }
}

function svgFor({ a, b, c, motif }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a}"/>
      <stop offset="55%" stop-color="${b}"/>
      <stop offset="100%" stop-color="${c}"/>
    </linearGradient>
    <radialGradient id="glow" cx="18%" cy="12%" r="55%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="86%" cy="88%" r="60%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.06"/></feComponentTransfer>
    </filter>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <rect width="1200" height="800" fill="url(#glow)"/>
  <rect width="1200" height="800" fill="url(#glow2)"/>
  ${motifSvg(motif, c)}
  <rect width="1200" height="800" filter="url(#grain)" opacity="0.5"/>
</svg>`;
}

for (const cover of COVERS) {
  const base = path.join(OUT, `cover-${cover.id}.jpg`);
  await sharp(Buffer.from(svgFor(cover))).jpeg({ quality: 84, mozjpeg: true, chromaSubsampling: '4:2:0' }).toFile(base);
  await sharp(base).resize({ width: 400, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`${base}.thumb.webp`);
  const size = fs.statSync(base).size;
  console.log(`cover-${cover.id}.jpg  ${(size / 1024).toFixed(0)} KB`);
}
console.log('demo covers generated:', COVERS.length);
