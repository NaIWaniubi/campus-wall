/**
 * E2E 自验脚本：匿名帖举报阈值揭示作者（跑完即删）
 */
const BASE = 'http://127.0.0.1:3001/api';

async function api(method, path, token, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'} | ${name} | ${detail ?? ''}`);
}

// ---- 准备账号 ----
const adminLogin = await api('POST', '/auth/login', null, { studentId: 'admin', password: 'admin123' });
check('管理员登录', adminLogin.code === 200 && adminLogin.data?.token, `role=${adminLogin.data?.role}`);
const adminToken = adminLogin.data.token;

const users = [];
for (let i = 1; i <= 3; i++) {
  const sid = `99000${i}`;
  const nick = ['测试用户甲', '测试用户乙', '测试用户丙'][i - 1];
  const reg = await api('POST', '/auth/register', null, { studentId: sid, password: 'test123456', nickname: nick, college: '测试学院' });
  let token;
  if (reg.code === 200) token = reg.data.token;
  else token = (await api('POST', '/auth/login', null, { studentId: sid, password: 'test123456' })).data.token; // 幂等重跑
  users.push({ sid, nick, token });
  check(`测试账号 ${nick}(${sid}) 就绪`, !!token, reg.code === 200 ? '新注册' : '已存在改登录');
}

// ---- 找树洞板块 ----
const sections = await api('GET', '/sections');
const hole = sections.data.find((s) => s.name === '吐槽树洞');
check('找到吐槽树洞板块', !!hole, `id=${hole?.id}`);

// ---- 帖子A：只被举报1次；帖子B：被3人举报 ----
async function createPost(title) {
  const r = await api('POST', '/posts', users[0].token, {
    sectionId: hole.id,
    title,
    content: '这是一条用于验证匿名帖举报阈值作者揭示功能的测试正文，内容超过十个字。',
    isAnonymous: true,
  });
  return r.data; // { id }
}
const postA = await createPost('E2E树洞测试帖A-单次举报');
const postB = await createPost('E2E树洞测试帖B-三次举报');
check('创建匿名帖A/B', !!postA?.id && !!postB?.id, `A=${postA?.id} B=${postB?.id}`);

const reason = 'E2E测试举报：验证阈值揭示';
await api('POST', `/posts/${postA.id}/report`, users[0].token, { reason });
for (const u of users) await api('POST', `/posts/${postB.id}/report`, u.token, { reason });

// ---- 管理端举报列表校验 ----
const reports = await api('GET', '/admin/reports?status=pending&page=1&pageSize=50', adminToken);
const rowA = reports.data.list.find((r) => r.targetType === 'post' && r.targetId === postA.id);
const rowB = reports.data.list.find((r) => r.targetType === 'post' && r.targetId === postB.id);
check('工单A(1人)存在且无 revealedAuthor', rowA && rowA.reportCount === 1 && !('revealedAuthor' in rowA), JSON.stringify(rowA));
check(
  '工单B(3人)返回 revealedAuthor 且身份正确',
  rowB && rowB.reportCount === 3 && rowB.revealedAuthor
    && rowB.revealedAuthor.nickname === users[0].nick
    && String(rowB.revealedAuthor.studentId) === users[0].sid
    && typeof rowB.revealedAuthor.id === 'number',
  JSON.stringify(rowB)
);

// ---- 普通用户侧零泄露 ----
const detailAsUser = await api('GET', `/posts/${postB.id}`, users[1].token);
const detailText = JSON.stringify(detailAsUser);
check(
  '普通用户看帖子详情：作者匿名',
  detailAsUser.code === 200 && detailAsUser.data.author.nickname === '匿名用户'
    && Number(detailAsUser.data.author.id) === 0
    && !detailText.includes(users[0].sid) && !detailText.includes(users[0].nick),
  `author=${JSON.stringify(detailAsUser.data.author)}`
);
const listAsUser = await api('GET', `/posts?page=1&pageSize=50`, users[1].token);
const listText = JSON.stringify(listAsUser);
check('普通用户帖子列表无真实作者信息', listAsUser.code === 200 && !listText.includes(users[0].sid) && !listText.includes(users[0].nick), '');
const forbiddenRes = await api('GET', '/admin/reports', users[1].token);
check('普通用户访问管理端举报接口被拒', forbiddenRes.code === 403, JSON.stringify(forbiddenRes));

console.log('\nSUMMARY: ' + results.filter(r => r.pass).length + '/' + results.length + ' passed');
if (results.some(r => !r.pass)) process.exit(1);

// ---- 清理测试数据（直接 sqlite，WAL 下与运行中服务安全共存）----
const require = (await import('node:module')).createRequire(import.meta.url);
const Database = require('better-sqlite3');
const db = new Database('api/data.db');
const sids = users.map(u => u.sid);
const ph = sids.map(() => '?').join(',');
const userIds = db.prepare(`SELECT id FROM users WHERE student_id IN (${ph})`).all(...sids).map(r => r.id);
const uidPh = userIds.map(() => '?').join(',');
const r1 = db.prepare(`DELETE FROM reports WHERE reporter_id IN (${uidPh}) OR (target_type='post' AND target_id IN (?, ?))`).run(...userIds, postA.id, postB.id);
const r2 = db.prepare(`DELETE FROM messages WHERE user_id IN (${uidPh})`).run(...userIds);
const r3 = db.prepare('DELETE FROM posts WHERE id IN (?, ?)').run(postA.id, postB.id);
const r4 = db.prepare(`DELETE FROM users WHERE id IN (${uidPh})`).run(...userIds);
console.log(`CLEANUP done: reports=${r1.changes} messages=${r2.changes} posts=${r3.changes} users=${r4.changes}`);
const leftReports = db.prepare('SELECT COUNT(*) c FROM reports WHERE target_type=\'post\' AND target_id IN (?, ?)').get(postA.id, postB.id).c;
const leftPosts = db.prepare('SELECT COUNT(*) c FROM posts WHERE id IN (?, ?)').get(postA.id, postB.id).c;
const leftUsers = db.prepare(`SELECT COUNT(*) c FROM users WHERE student_id IN (${ph})`).get(...sids).c;
console.log(`VERIFY clean: leftReports=${leftReports} leftPosts=${leftPosts} leftUsers=${leftUsers}`);
