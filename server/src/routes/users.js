import express from 'express';
import { db } from '../db.js';
import { ok, fail, publicUser, publicNote, parseJSON } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/** GET /api/users/:id —— 个人主页资料 */
router.get('/:id', (req, res) => {
  const viewer = req.user?.id || 0;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return fail(res, '用户不存在', 404);
  const noteCount = db.prepare('SELECT COUNT(*) c FROM notes WHERE user_id = ?').get(u.id).c;
  return ok(res, { ...publicUser(u, viewer), noteCount });
});

/**
 * GET /api/users/:id/notes?tab=notes|likes|collects
 */
router.get('/:id/notes', (req, res) => {
  const viewer = req.user?.id || 0;
  const id = Number(req.params.id);
  const tab = req.query.tab || 'notes';
  const limit = Math.min(60, Number(req.query.limit) || 20);
  const offset = Math.max(0, Number(req.query.offset) || 0);

  let rows = [];
  if (tab === 'notes') {
    rows = db
      .prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
      .all(id, limit, offset);
  } else if (tab === 'likes') {
    rows = db
      .prepare(
        `SELECT n.* FROM notes n JOIN likes l ON l.note_id = n.id
         WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(id, limit, offset);
  } else if (tab === 'collects') {
    rows = db
      .prepare(
        `SELECT n.* FROM notes n JOIN collects c ON c.note_id = n.id
         WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
      )
      .all(id, limit, offset);
  }
  return ok(res, { tab, notes: rows.map((r) => publicNote(r, viewer)) });
});

/** POST /api/users/:id/follow —— 关注 / 取关（幂等切换） */
router.post('/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  const uid = req.user.id;
  if (targetId === uid) return fail(res, '不能关注自己');
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) return fail(res, '用户不存在', 404);

  // 事务内完成关注/取关与双方计数增减，避免并发下计数漂移
  const followTx = db.transaction((uid2, targetId2) => {
    const exist2 = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(uid2, targetId2);
    if (exist2) {
      db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(uid2, targetId2);
      db.prepare('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?').run(targetId2);
      db.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').run(uid2);
    } else {
      db.prepare('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(uid2, targetId2, Date.now());
      db.prepare('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?').run(targetId2);
      db.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').run(uid2);
      db.prepare(
        `INSERT INTO messages (box, from_user_id, to_user_id, content, created_at)
         VALUES ('follows', ?, ?, ?, ?)`
      ).run(uid2, targetId2, '关注了你', Date.now());
    }
    return !exist2;
  });
  const isFollowing = followTx(uid, targetId);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  return ok(res, {
    isFollowing,
    followerCount: fresh.follower_count,
    followingCount: db.prepare('SELECT following_count c FROM users WHERE id = ?').get(uid).c
  });
});

/** GET /api/users/:id/followers | /following */
function relation(kind) {
  return (req, res) => {
    const viewer = req.user?.id || 0;
    const id = Number(req.params.id);
    const rows =
      kind === 'followers'
        ? db
            .prepare(
              `SELECT u.* FROM users u JOIN follows f ON f.follower_id = u.id
               WHERE f.followee_id = ? ORDER BY f.created_at DESC`
            )
            .all(id)
        : db
            .prepare(
              `SELECT u.* FROM users u JOIN follows f ON f.followee_id = u.id
               WHERE f.follower_id = ? ORDER BY f.created_at DESC`
            )
            .all(id);
    return ok(res, { users: rows.map((r) => publicUser(r, viewer)) });
  };
}
router.get('/:id/followers', relation('followers'));
router.get('/:id/following', relation('following'));

/** GET /api/users —— 你可能感兴趣的人（未登录也能看） */
router.get('/', (_req, res) => {
  const viewer = _req.user?.id || 0;
  const rows = db.prepare('SELECT * FROM users ORDER BY follower_count DESC LIMIT 20').all();
  return ok(res, { users: rows.map((r) => publicUser(r, viewer)) });
});

export default router;
