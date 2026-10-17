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

  const exist = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(uid, targetId);
  if (exist) {
    db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(uid, targetId);
    db.prepare('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?').run(targetId);
    db.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').run(uid);
  } else {
    db.prepare('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(uid, targetId, Date.now());
    db.prepare('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?').run(targetId);
    db.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').run(uid);
    db.prepare(
      `INSERT INTO messages (box, from_user_id, to_user_id, content, created_at)
       VALUES ('follows', ?, ?, ?, ?)`
    ).run(uid, targetId, '关注了你', Date.now());
  }
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  return ok(res, {
    isFollowing: !exist,
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

/** GET /api/users/suggest —— 你可能感兴趣的人（未登录也能看） */
router.get('/', (_req, res) => {
  const viewer = _req.user?.id || 0;
  const rows = db.prepare('SELECT * FROM users ORDER BY follower_count DESC LIMIT 20').all();
  return ok(res, { users: rows.map((r) => publicUser(r, viewer)) });
});

/** GET /api/users/:id/stats —— 主页顶部数字 */
router.get('/:id/stats', (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!u) return fail(res, '用户不存在', 404);
  const notes = db.prepare('SELECT COUNT(*) c FROM notes WHERE user_id = ?').get(id).c;
  const likes = db.prepare('SELECT COUNT(*) c FROM likes WHERE user_id = ?').get(id).c;
  const collects = db.prepare('SELECT COUNT(*) c FROM collects WHERE user_id = ?').get(id).c;
  return ok(res, { notes, following: u.following_count, followers: u.follower_count, likeCollect: likes + collects });
});

export default router;
