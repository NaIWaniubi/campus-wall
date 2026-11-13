import io

def rd(p): return io.open(p, encoding='utf-8').read()
def wr(p, s): io.open(p, 'w', encoding='utf-8', newline='\n').write(s)

# ============ 1. db.ts：messages 增加 related_sub_id ============
p = 'api/db.ts'; s = rd(p)
anchor = """// 管理端反馈列表按时间倒序分页"""
mig = """// 老库升级：评论/回复通知直达具体评论（related_id=帖子，related_sub_id=顶层评论）
const msgHasSub = (db.prepare('PRAGMA table_info(messages)').all() as { name: string }[])
  .some((c) => c.name === 'related_sub_id');
if (!msgHasSub) {
  db.exec(`ALTER TABLE messages ADD COLUMN related_sub_id INTEGER`);
}

// 管理端反馈列表按时间倒序分页"""
assert anchor in s
s = s.replace(anchor, mig, 1)
wr(p, s); print('db migration ok')

# ============ 2. notification.ts：支持 related_sub_id ============
p = 'api/utils/notification.ts'; s = rd(p)
s = s.replace("""export function upsertNotification(
  user_id: number,
  type: string,
  content: string,
  related_id?: number | null
): void {""",
"""export function upsertNotification(
  user_id: number,
  type: string,
  content: string,
  related_id?: number | null,
  related_sub_id?: number | null
): void {""")
s = s.replace("""    SELECT id FROM messages
    WHERE user_id = ? AND type = ? AND related_id IS ?
      AND created_at >= datetime('now', '-' || ? || ' days')
    ORDER BY created_at DESC LIMIT 1
  `).get(user_id, type, related_id ?? null, DEDUP_WINDOW_DAYS) as any;""",
"""    SELECT id FROM messages
    WHERE user_id = ? AND type = ? AND related_id IS ? AND related_sub_id IS ?
      AND created_at >= datetime('now', '-' || ? || ' days')
    ORDER BY created_at DESC LIMIT 1
  `).get(user_id, type, related_id ?? null, related_sub_id ?? null, DEDUP_WINDOW_DAYS) as any;""")
s = s.replace("""      UPDATE messages
      SET content = ?, is_read = 0, created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(content, existing.id);""",
"""      UPDATE messages
      SET content = ?, related_sub_id = ?, is_read = 0, created_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(content, related_sub_id ?? null, existing.id);""")
s = s.replace("""      INSERT INTO messages (user_id, type, content, related_id)
      VALUES (?, ?, ?, ?)
    `).run(user_id, type, content, related_id ?? null);""",
"""      INSERT INTO messages (user_id, type, content, related_id, related_sub_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(user_id, type, content, related_id ?? null, related_sub_id ?? null);""")
# 文档注释同步
s = s.replace(""" * 同一 (user_id, type, related_id) 在 DEDUP_WINDOW_DAYS 天内已存在时，""",
              """ * 同一 (user_id, type, related_id, related_sub_id) 在 DEDUP_WINDOW_DAYS 天内已存在时，""")
wr(p, s); print('notification util ok')

# ============ 3. comments.ts：两处通知带上顶层评论 id ============
p = 'api/routes/comments.ts'; s = rd(p)
s = s.replace("""    upsertNotification(
      post.user_id, 'comment', `${req.currentUser!.nickname} 评论了你的帖子「${post.title}」`, postId
    );""",
"""    upsertNotification(
      post.user_id, 'comment', `${req.currentUser!.nickname} 评论了你的帖子「${post.title}」`, postId, Number(commentId)
    );""")
s = s.replace("""    upsertNotification(
      parent.user_id, 'comment', `${req.currentUser!.nickname} 回复了你的评论`, parent.post_id
    );""",
"""    // 直达锚点用顶层父评论：回复嵌在楼中楼里，滚到父评论才能看见整条对话
    upsertNotification(
      parent.user_id, 'comment', `${req.currentUser!.nickname} 回复了你的评论`, parent.post_id, commentId
    );""")
wr(p, s); print('comments route ok')

# ============ 4. messages.ts：返回 relatedSubId ============
p = 'api/routes/messages.ts'; s = rd(p)
s = s.replace("""    postId: m.related_id,
    isRead: !!m.is_read,""",
"""    postId: m.related_id,
    relatedSubId: m.related_sub_id ?? null,
    isRead: !!m.is_read,""")
wr(p, s); print('messages route ok')
