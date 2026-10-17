import express from 'express';
import { db } from '../db.js';
import { ok, fail, publicNote, bumpCommentCount, timeAgo } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const TABS = {
  recommend: `1 = 1`,
  following: `n.user_id IN (SELECT followee_id FROM follows WHERE follower_id = @viewer)`,
  nearby: `n.location <> ''`
};

/**
 * GET /api/notes/feed?tab=recommend|following|nearby&cursor=xxx&limit=20
 * cursor 为 keyset 游标 `${created_at}_${id}`，落库即返回 nextCursor
 */
router.get('/feed', (req, res) => {
  const viewer = req.user?.id || 0;
  const tab = TABS[req.query.tab] ? req.query.tab : 'recommend';
  const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 20));
  const cursor = req.query.cursor ? String(req.query.cursor) : null;

  let extra = '';
  const params = { viewer, limit: limit + 1 };
  if (cursor) {
    const [ts, id] = cursor.split('_').map(Number);
    if (Number.isFinite(ts) && Number.isFinite(id)) {
      extra = `AND (n.created_at < @ts OR (n.created_at = @ts AND n.id < @id))`;
      params.ts = ts;
      params.id = id;
    }
  }

  const sql = `
    SELECT n.* FROM notes n
    WHERE ${TABS[tab]} ${extra}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT @limit
  `;
  const rows = db.prepare(sql).all(params);
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return ok(res, {
    tab,
    notes: page.map((r) => publicNote(r, viewer)),
    nextCursor: hasMore && last ? `${last.created_at}_${last.id}` : null,
    hasMore
  });
});

/** GET /api/notes/:id —— 笔记详情（自动 +1 浏览） */
router.get('/:id', (req, res) => {
  const viewer = req.user?.id || 0;
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(req.params.id));
  if (!row) return fail(res, '笔记不存在或已删除', 404);
  db.prepare('UPDATE notes SET view_count = view_count + 1 WHERE id = ?').run(row.id);

  const related = db
    .prepare(
      `SELECT n.* FROM notes n
       WHERE n.id <> ? AND (n.topics LIKE '%' || ? || '%' OR n.user_id = ?)
       ORDER BY n.created_at DESC LIMIT 12`
    )
    .all(row.id, (JSON.parse(row.topics || '[]')[0] || ''), row.user_id)
    .map((r) => publicNote(r, viewer));

  return ok(res, { note: publicNote(row, viewer), relatedNotes: related });
});

/** POST /api/notes —— 发布图文笔记 */
router.post('/', requireAuth, (req, res) => {
  const { title, content, images = [], topics = [], location = '' } = req.body || {};
  if (!content && !images.length) return fail(res, '说点什么或上传一张图片吧');
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO notes (user_id, title, content, images, topics, location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, title || '', content || '', JSON.stringify(images), JSON.stringify(topics), location, now);
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(info.lastInsertRowid);
  return ok(res, publicNote(row, req.user.id), '发布成功');
});

/** DELETE /api/notes/:id */
router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(Number(req.params.id));
  if (!row) return fail(res, '笔记不存在', 404);
  if (row.user_id !== req.user.id) return fail(res, '只能删除自己的笔记', 403);
  db.prepare('DELETE FROM notes WHERE id = ?').run(row.id);
  return ok(res, null, '已删除');
});

function toggle(table, countCol) {
  return (req, res) => {
    const noteId = Number(req.params.id);
    const uid = req.user.id;
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
    if (!note) return fail(res, '笔记不存在', 404);
    const exist = db.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND note_id = ?`).get(uid, noteId);
    if (exist) {
      db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND note_id = ?`).run(uid, noteId);
      db.prepare(`UPDATE notes SET ${countCol} = MAX(0, ${countCol} - 1) WHERE id = ?`).run(noteId);
    } else {
      db.prepare(`INSERT INTO ${table} (user_id, note_id, created_at) VALUES (?, ?, ?)`).run(uid, noteId, Date.now());
      db.prepare(`UPDATE notes SET ${countCol} = ${countCol} + 1 WHERE id = ?`).run(noteId);
      if (table === 'likes') {
        db.prepare(
          `INSERT INTO messages (box, from_user_id, to_user_id, note_id, content, created_at)
           VALUES ('likes', ?, ?, ?, ?, ?)`
        ).run(uid, note.user_id, noteId, '赞了你的笔记', Date.now());
      }
    }
    const fresh = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
    const self = publicNote(fresh, uid);
    return ok(res, {
      liked: self.interactInfo.liked,
      collected: self.interactInfo.collected,
      likedCount: self.interactInfo.likedCount,
      collectedCount: self.interactInfo.collectedCount
    });
  };
}

/** POST /api/notes/:id/like —— 点赞/取消点赞 */
router.post('/:id/like', requireAuth, toggle('likes', 'like_count'));
/** POST /api/notes/:id/collect —— 收藏/取消收藏 */
router.post('/:id/collect', requireAuth, toggle('collects', 'collect_count'));

/** GET /api/notes/:id/comments —— 一级评论 + 子评论（最多 3 条预览） */
router.get('/:id/comments', (req, res) => {
  const viewer = req.user?.id || 0;
  const noteId = Number(req.params.id);
  const rows = db
    .prepare('SELECT * FROM comments WHERE note_id = ? ORDER BY like_count DESC, created_at DESC')
    .all(noteId);

  const likedSet = new Set(
    viewer
      ? db
          .prepare(
            `SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (SELECT id FROM comments WHERE note_id = ?)`
          )
          .all(viewer, noteId)
          .map((r) => r.comment_id)
      : []
  );

  const shape = (c) => {
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(c.user_id);
    return {
      id: String(c.id),
      content: c.content,
      likeCount: c.like_count,
      liked: likedSet.has(c.id),
      ipLocation: c.ip_location,
      createTime: timeAgo(c.created_at),
      createdAt: c.created_at,
      user: { id: u?.id, nickname: u?.nickname, avatar: u?.avatar },
      subComments: []
    };
  };

  const parents = rows.filter((r) => !r.parent_id).map(shape);
  const children = rows.filter((r) => r.parent_id);
  for (const p of parents) {
    p.subComments = children.filter((c) => c.parent_id === Number(p.id)).map(shape);
  }
  return ok(res, { comments: parents, total: rows.length });
});

/** POST /api/notes/:id/comments —— 发表评论 */
router.post('/:id/comments', requireAuth, (req, res) => {
  const noteId = Number(req.params.id);
  const { content, parentId } = req.body || {};
  if (!content || !String(content).trim()) return fail(res, '评论内容不能为空');
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!note) return fail(res, '笔记不存在', 404);

  const info = db
    .prepare(
      `INSERT INTO comments (note_id, user_id, parent_id, content, ip_location, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(noteId, req.user.id, parentId || null, String(content).slice(0, 500), req.user.ip_location, Date.now());
  bumpCommentCount(noteId, 1);
  db.prepare(
    `INSERT INTO messages (box, from_user_id, to_user_id, note_id, content, created_at)
     VALUES ('comments', ?, ?, ?, ?, ?)`
  ).run(req.user.id, note.user_id, noteId, String(content).slice(0, 60), Date.now());

  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(info.lastInsertRowid);
  return ok(
    res,
    {
      id: String(c.id),
      content: c.content,
      likeCount: 0,
      liked: false,
      ipLocation: c.ip_location,
      createTime: '刚刚',
      createdAt: c.created_at,
      user: { id: req.user.id, nickname: req.user.nickname, avatar: req.user.avatar },
      subComments: []
    },
    '评论成功'
  );
});

/** POST /api/notes/:id/comments/:cid/like —— 给评论点赞 */
router.post('/:id/comments/:cid/like', requireAuth, (req, res) => {
  const cid = Number(req.params.cid);
  const uid = req.user.id;
  const c = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
  if (!c) return fail(res, '评论不存在', 404);
  const exist = db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(uid, cid);
  if (exist) {
    db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(uid, cid);
    db.prepare('UPDATE comments SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(cid);
  } else {
    db.prepare('INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)').run(uid, cid);
    db.prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?').run(cid);
  }
  const fresh = db.prepare('SELECT * FROM comments WHERE id = ?').get(cid);
  return ok(res, { liked: !exist, likeCount: fresh.like_count });
});

export default router;
