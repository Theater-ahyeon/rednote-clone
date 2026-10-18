import express from 'express';
import { db } from '../db.js';
import { ok, timeAgo, parseJSON } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

export const BOXES = [
  { key: 'likes', title: '赞和收藏', icon: '❤️' },
  { key: 'follows', title: '新增关注', icon: '👤' },
  { key: 'comments', title: '评论和@', icon: '💬' }
];

/** GET /api/messages —— 消息页三个入口 + 未读数 */
router.get('/', requireAuth, (req, res) => {
  const uid = req.user.id;
  const boxes = BOXES.map((b) => {
    const unread = db
      .prepare('SELECT COUNT(*) c FROM messages WHERE to_user_id = ? AND box = ? AND read = 0')
      .get(uid, b.key).c;
    const last = db
      .prepare(
        `SELECT m.*, u.nickname, u.avatar FROM messages m
         JOIN users u ON u.id = m.from_user_id
         WHERE m.to_user_id = ? AND m.box = ? ORDER BY m.created_at DESC LIMIT 1`
      )
      .get(uid, b.key);
    return {
      ...b,
      unread,
      lastMessage: last
        ? { nickname: last.nickname, avatar: last.avatar, content: last.content, time: timeAgo(last.created_at) }
        : null
    };
  });
  return ok(res, { boxes, totalUnread: boxes.reduce((s, b) => s + b.unread, 0) });
});

/** GET /api/messages/unread/count —— 角标（必须先于 /:box 注册，否则被其吞掉） */
router.get('/unread/count', requireAuth, (req, res) => {
  const c = db.prepare('SELECT COUNT(*) c FROM messages WHERE to_user_id = ? AND read = 0').get(req.user.id).c;
  return ok(res, { count: c });
});

/** GET /api/messages/:box —— 某个 box 的消息列表 */
router.get('/:box', requireAuth, (req, res) => {
  const uid = req.user.id;
  const box = req.params.box;
  if (!BOXES.some((b) => b.key === box)) return ok(res, { list: [] });
  const rows = db
    .prepare(
      `SELECT m.*, u.nickname, u.avatar FROM messages m
       JOIN users u ON u.id = m.from_user_id
       WHERE m.to_user_id = ? AND m.box = ? ORDER BY m.created_at DESC LIMIT 60`
    )
    .all(uid, box);
  // 只把「本轮真正返回给用户看」的消息标为已读：直接按 box 全量置位会吞掉 60 条之外的未读
  const readStmt = db.prepare('UPDATE messages SET read = 1 WHERE id = ?');
  for (const m of rows) if (!m.read) readStmt.run(m.id);
  const coverOf = db.prepare('SELECT images FROM notes WHERE id = ?');
  const list = rows.map((m) => ({
    id: String(m.id),
    box: m.box,
    content: m.content,
    noteId: m.note_id ? String(m.note_id) : null,
    time: timeAgo(m.created_at),
    createdAt: m.created_at,
    user: { id: m.from_user_id, nickname: m.nickname, avatar: m.avatar },
    noteCover: m.note_id ? parseJSON(coverOf.get(m.note_id)?.images, [])[0] || null : null
  }));
  return ok(res, { list });
});

/** POST /api/messages/read-all —— 全部已读 */
router.post('/read-all', requireAuth, (req, res) => {
  db.prepare('UPDATE messages SET read = 1 WHERE to_user_id = ?').run(req.user.id);
  return ok(res, null, '已全部标记为已读');
});

export default router;
