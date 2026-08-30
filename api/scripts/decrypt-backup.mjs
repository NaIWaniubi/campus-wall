/**
 * 备份解密工具（C-T12 恢复路径）：
 *   BACKUP_ENCRYPTION_KEY=<64位hex> node api/scripts/decrypt-backup.mjs <备份.db.enc> <输出.db>
 * 文件格式见 api/jobs/backup.ts：CWBK1 magic + IV(12B) + authTag(16B) + AES-256-GCM 密文体。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const MAGIC = 'CWBK1';
const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error('用法: node api/scripts/decrypt-backup.mjs <备份.db.enc> <输出.db>');
  process.exit(1);
}
const hex = process.env.BACKUP_ENCRYPTION_KEY?.trim();
if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
  console.error('缺少或非法 BACKUP_ENCRYPTION_KEY（需 64 位 hex = 32 字节）');
  process.exit(1);
}

const blob = fs.readFileSync(path.resolve(input));
const magic = blob.subarray(0, 5).toString('utf-8');
if (magic !== MAGIC) {
  console.error(`文件头不匹配（期望 ${MAGIC}，实际 ${magic}）——不是本工具加密的备份`);
  process.exit(1);
}

const iv = blob.subarray(5, 17);
const authTag = blob.subarray(17, 33);
const sealed = blob.subarray(33);

try {
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(hex, 'hex'), iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(sealed), decipher.final()]);
  fs.writeFileSync(path.resolve(output), plain);
  console.log(`[decrypt] 已解密: ${output}（${plain.length} 字节）`);
} catch (err) {
  console.error('[decrypt] 解密失败：key 不正确或文件被篡改（GCM 校验不过）', err?.message);
  process.exit(1);
}
