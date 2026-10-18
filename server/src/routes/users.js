import express from 'express';
import { db } from '../db.js';
import { ok, fail, publicUser, serializeNotes } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const inClause = (n) => Array(n).fill('?').join(',');

/** 批量算「我关注了其中谁」，避免每个用户一次查询 */
function followingSet(viewerId, ids) {
  if (!viewerId || !ids.length) return new Set();
  return new Set(
    db
      .prepare(`SELECT followee_id FROM follows WHERE follower_id = ? AND followee_id IN (${inClause(ids.length)})`)
      .all(viewerId, ...ids)
      .map((r) => r.followee_id)
  );
}

function mapUsers(rows, viewerId) {
  const set = followingSet(viewerId, rows.map((r) => r.id));
  return rows.map((r) => publicUser(r, viewerId, { isFollowing: set.has(r.id) }));
}

/** GET /api/users/:id —— 个人主页资料 */
router.get('/:id', (req, res) => {
  const viewer = req.user?.id || 0;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) return fail(res, '用户不存在', 404);
  const noteCount = db.prepare('SELECT COUNT(*) c FROM notes WHERE user_id = ?').get(u.id).c;
  return ok(res, { ...mapUsers([u], viewer)[0], noteCount });
});

/**
 * GET /api/users/:id/notes?tab=notes|likes|collects&limit=20&offset=0
 * 返回 hasMore —— 之前前端没有分页，主页最多只能看到 20 条
 */
router.get('/:id/notes', (req, res) => {
  const viewer = req.user?.id || 0;
  const id = Number(req.params.id);
  const tab = ['notes', 'likes', 'collects'].includes(req.query.tab) ? req.query.tab : 'notes';
  const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 20));
  const offset = Math.max(0, Number(req.query.offset) || 0);

  const SQL = {
    notes: `SELECT n.* FROM notes n WHERE n.user_id = ? ORDER BY n.created_at DESC, n.id DESC LIMIT ? OFFSET ?`,
    likes: `SELECT n.* FROM notes n JOIN likes l ON l.note_id = n.id
            WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
    collects: `SELECT n.* FROM notes n JOIN collects c ON c.note_id = n.id
               WHERE c.user_id = ? ORDER BY c.created_at DESC LIMIT ? OFFSET ?`
  };
  const rows = db.prepare(SQL[tab]).all(id, limit + 1, offset);
  const hasMore = rows.length > limit;
  return ok(res, { tab, notes: serializeNotes(hasMore ? rows.slice(0, limit) : rows, viewer), hasMore, offset });
});

/** POST /api/users/:id/follow —— 关注 / 取关（幂等切换） */
router.post('/:id/follow', requireAuth, (req, res) => {
  const targetId = Number(req.params.id);
  const uid = req.user.id;
  if (targetId === uid) return fail(res, '不能关注自己');
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target) return fail(res, '用户不存在', 404);

  // 事务内完成关注/取关、双方计数增减与通知，避免并发下计数漂移
  const followTx = db.transaction((uid2, targetId2) => {
    const exist = db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(uid2, targetId2);
    if (exist) {
      db.prepare('DELETE FROM follows WHERE follower_id = ? AND followee_id = ?').run(uid2, targetId2);
      db.prepare('UPDATE users SET follower_count = MAX(0, follower_count - 1) WHERE id = ?').run(targetId2);
      db.prepare('UPDATE users SET following_count = MAX(0, following_count - 1) WHERE id = ?').run(uid2);
      return false;
    }
    db.prepare('INSERT INTO follows (follower_id, followee_id, created_at) VALUES (?, ?, ?)').run(uid2, targetId2, Date.now());
    db.prepare('UPDATE users SET follower_count = follower_count + 1 WHERE id = ?').run(targetId2);
    db.prepare('UPDATE users SET following_count = following_count + 1 WHERE id = ?').run(uid2);
    db.prepare(
      `INSERT INTO messages (box, from_user_id, to_user_id, content, created_at)
       VALUES ('follows', ?, ?, ?, ?)`
    ).run(uid2, targetId2, '关注了你', Date.now());
    return true;
  });
  const isFollowing = followTx(uid, targetId);
  const fresh = db.prepare('SELECT follower_count FROM users WHERE id = ?').get(targetId);
  const mine = db.prepare('SELECT following_count FROM users WHERE id = ?').get(uid);
  return ok(res, { isFollowing, followerCount: fresh.follower_count, followingCount: mine.following_count });
});

/** GET /api/users/:id/followers | /following */
function relation(kind) {
  return (req, res) => {
    const viewer = req.user?.id || 0;
    const id = Number(req.params.id);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const rows =
      kind === 'followers'
        ? db
            .prepare(
              `SELECT u.* FROM users u JOIN follows f ON f.follower_id = u.id
               WHERE f.followee_id = ? ORDER BY f.created_at DESC LIMIT ?`
            )
            .all(id, limit)
        : db
            .prepare(
              `SELECT u.* FROM users u JOIN follows f ON f.followee_id = u.id
               WHERE f.follower_id = ? ORDER BY f.created_at DESC LIMIT ?`
            )
            .all(id, limit);
    return ok(res, { users: mapUsers(rows, viewer) });
  };
}
router.get('/:id/followers', relation('followers'));
router.get('/:id/following', relation('following'));

/** GET /api/users —— 你可能感兴趣的人（未登录也能看，排除自己与已关注） */
router.get('/', (req, res) => {
  const viewer = req.user?.id || 0;
  const rows = viewer
    ? db
        .prepare(
          `SELECT * FROM users
           WHERE id <> ?
             AND id NOT IN (SELECT followee_id FROM follows WHERE follower_id = ?)
           ORDER BY follower_count DESC LIMIT 20`
        )
        .all(viewer, viewer)
    : db.prepare('SELECT * FROM users ORDER BY follower_count DESC LIMIT 20').all();
  return ok(res, { users: mapUsers(rows, viewer) });
});

export default router;
