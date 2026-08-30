/**
 * PWA 图标生成：public/icons/*.svg → PNG（192/512 + maskable 512）
 * 用现有 sharp 依赖渲染，零新增依赖。产物入库，仅在图标改动后手动运行：
 *   node scripts/generate-pwa-icons.mjs
 */
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');

async function render(svgFile, outFile, size) {
  await sharp(path.join(iconsDir, svgFile))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(iconsDir, outFile));
  console.log(`[icons] ${outFile} (${size}x${size})`);
}

await render('icon.svg', 'icon-192.png', 192);
await render('icon.svg', 'icon-512.png', 512);
await render('icon-maskable.svg', 'icon-maskable-512.png', 512);
console.log('[icons] done');
