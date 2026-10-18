import express from 'express';
import { db } from '../db.js';
import { ok, fail, publicNote, serializeNotes, bumpCommentCount, timeAgo } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';
import { linkUploadsToNote } from './upload.js';

const router = express.Router();

const TABS = {
  recommend: `1 = 1`,
  following: `n.user_id IN (SELECT followee_id FROM follows WHERE follower_id = @viewer)`,
  nearby: `n.location <> ''`
};

// 浏览量去重：同一 IP 对同一篇笔记 6 小时内只计一次，
// 否则 F5 就能把浏览量和派生指标刷上天（也挡住了最粗暴的脚本刷量）
const VIEW_MARKS = new Map();
const VIEW_WINDOW = 6 * 60 * 60 * 1000;
function countViewOnce(ip, noteId) {
  const key = `${ip}|${noteId}`;
  const now = Date.now();
  const last = VIEW_MARKS.get(key);
  if (last && now - last < VIEW_WINDOW) return false;
  VIEW_MARKS.set(key, now);
  if (VIEW_MARKS.size > 20000) {
    for (const [k, v] of VIEW_MARKS) if (now - v > VIEW_WINDOW) VIEW_MARKS.delete(k);
  }
  return true;
}

/** 笔记入参校验：长度/数量/URL 协议都在服务端兜住（前端 maxLength 只是体验） */
function sanitizeNotePayload(body) {
  const raw = body || {};
  const title = String(raw.title ?? '').trim().slice(0, 60);
  const content = String(raw.content ?? '').trim().slice(0, 5000);
  const location = String(raw.location ?? '').trim().slice(0, 40);
  const topics = Array.isArray(raw.topics)
    ? [...new Set(raw.topics.map((t) => String(t ?? '').trim().replace(/^#/, '').slice(0, 20)).filter(Boolean))].slice(0, 10)
    : [];
  const images = Array.isArray(raw.images)
    ? raw.images
        .slice(0, 9)
        .map((i) => {
          const url = String(i?.url ?? '');
          const fallback = String(i?.fallback ?? url);
          return {
            url,
            fallback: /^(https?:\/\/|\/uploads\/)/.test(fallback) || fallback === url ? fallback : url,
            w: Math.max(1, Number(i?.w) || 3),
            h: Math.max(1, Number(i?.h) || 4)
          };
        })
        // 只接受站内上传或 https 外链，杜绝 javascript:/data: 这类伪协议进 <img src>
        .filter((i) => /^(\/uploads\/|https?:\/\/)/.test(i.url))
    : [];
  return { title, content, location, topics, images };
}

/**
 * GET /api/notes/feed?tab=recommend|following|nearby&channel=美食&cursor=xxx&limit=20
 * cursor 为 keyset 游标 `${created_at}_${id}`；channel 由服务端按话题过滤
 */
router.get('/feed', (req, res) => {
  const viewer = req.user?.id || 0;
  const tab = TABS[req.query.tab] ? req.query.tab : 'recommend';
  const limit = Math.min(40, Math.max(1, Number(req.query.limit) || 20));
  const cursor = req.query.cursor ? String(req.query.cursor) : null;
  const channel = String(req.query.channel || '').trim();

  const conds = [TABS[tab]];
  const params = { viewer, limit: limit + 1 };

  if (channel && channel !== '推荐') {
    conds.push('instr(n.topics, @channel) > 0');
    params.channel = channel;
  }
  if (cursor) {
    const [ts, id] = cursor.split('_').map(Number);
    if (Number.isFinite(ts) && Number.isFinite(id)) {
      conds.push('(n.created_at < @ts OR (n.created_at = @ts AND n.id < @id))');
      params.ts = ts;
      params.id = id;
    }
  }

  const rows = db
    .prepare(
      `SELECT n.* FROM notes n
       WHERE ${conds.join(' AND ')}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT @limit`
    )
    .all(params);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return ok(res, {
    tab,
    channel: channel || '推荐',
    notes: serializeNotes(page, viewer),
    nextCursor: hasMore && last ? `${last.created_at}_${last.id}` : null,
    hasMore
  });
});

/** GET /api/notes/:id —— 笔记详情（浏览量按 IP+笔记 去重计数） */
router.get('/:id', (req, res) => {
  const viewer = req.user?.id || 0;
  const noteId = Number(req.params.id);
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId);
  if (!row) return fail(res, '笔记不存在或已删除', 404);

  if (countViewOnce(req.ip || 'unknown', noteId)) {
    db.prepare('UPDATE notes SET view_count = view_count + 1 WHERE id = ?').run(noteId);
    row.view_count += 1;
  }

  // 相关推荐：instr 不做 LIKE 通配，话题里的 % 或 _ 不会让结果漂移；话题为空时不匹配任何笔记
  const topic = JSON.parse(row.topics || '[]')[0] || '';
  const related = topic
    ? serializeNotes(
        db
          .prepare(
            `SELECT n.* FROM notes n
             WHERE n.id <> ? AND instr(n.topics, ?) > 0
             ORDER BY n.created_at DESC LIMIT 12`
          )
          .all(noteId, topic),
        viewer
      )
    : [];

  return ok(res, { note: publicNote(row, viewer), relatedNotes: related });
});

/** POST /api/notes —— 发布图文笔记 */
router.post('/', requireAuth, (req, res) => {
  const { title, content, images, topics, location } = sanitizeNotePayload(req.body);
  if (!content && !images.length) return fail(res, '说点什么或上传一张图片吧');
  const now = Date.now();
  const info = db
    .prepare(
      `INSERT INTO notes (user_id, title, content, images, topics, location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(req.user.id, title, content, JSON.stringify(images), JSON.stringify(topics), location, now);
  // 把用到图片标记到笔记上，后续才能安全清理「上传了但没发布」的孤儿文件
  linkUploadsToNote(images, req.user.id, info.lastInsertRowid);
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

// 事务内完成「读关系 → 写关系 → 增减计数 → 写通知」：
// 只把前两步放进事务的话，通知失败会留下「点过赞但没有消息」的不一致状态
function makeToggle(kind) {
  const table = kind === 'like' ? 'likes' : 'collects';
  const countCol = kind === 'like' ? 'like_count' : 'collect_count';
  const find = db.prepare(`SELECT 1 FROM ${table} WHERE user_id = ? AND note_id = ?`);
  const del = db.prepare(`DELETE FROM ${table} WHERE user_id = ? AND note_id = ?`);
  const ins = db.prepare(`INSERT INTO ${table} (user_id, note_id, created_at) VALUES (?, ?, ?)`);
  const bump = db.prepare(`UPDATE notes SET ${countCol} = MAX(0, ${countCol} + ?) WHERE id = ?`);
  const hasMsg = db.prepare(
    `SELECT 1 FROM messages WHERE box = 'likes' AND from_user_id = ? AND to_user_id = ? AND note_id = ?`
  );
  const putMsg = db.prepare(
    `INSERT INTO messages (box, from_user_id, to_user_id, note_id, content, created_at)
     VALUES ('likes', ?, ?, ?, ?, ?)`
  );

  return db.transaction((uid, noteId, ownerId) => {
    const exist = find.get(uid, noteId);
    if (exist) {
      del.run(uid, noteId);
      bump.run(-1, noteId);
      return false;
    }
    ins.run(uid, noteId, Date.now());
    bump.run(1, noteId);
    // 自己赞自己不产生消息；反复「取消-再赞」不重复堆通知
    if (kind === 'like' && uid !== ownerId && !hasMsg.get(uid, ownerId, noteId)) {
      putMsg.run(uid, ownerId, noteId, '赞了你的笔记', Date.now());
    }
    return true;
  });
}

const toggleLike = makeToggle('like');
const toggleCollect = makeToggle('collect');

function toggle(kind) {
  const run = kind === 'like' ? toggleLike : toggleCollect;
  return (req, res) => {
    const noteId = Number(req.params.id);
    const note = db.prepare('SELECT id, user_id FROM notes WHERE id = ?').get(noteId);
    if (!note) return fail(res, '笔记不存在', 404);
    run(req.user.id, noteId, note.user_id);
    const self = publicNote(db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId), req.user.id);
    return ok(res, {
      liked: self.interactInfo.liked,
      collected: self.interactInfo.collected,
      likedCount: self.interactInfo.likedCount,
      collectedCount: self.interactInfo.collectedCount
    });
  };
}

/** POST /api/notes/:id/like —— 点赞/取消点赞 */
router.post('/:id/like', requireAuth, toggle('like'));
/** POST /api/notes/:id/collect —— 收藏/取消收藏 */
router.post('/:id/collect', requireAuth, toggle('collect'));

/**
 * GET /api/notes/:id/comments —— 一级评论 + 其下全部回复（按 root_id 归组）
 * 之前的实现只按「父评论 = 一级评论 id」分组，回复二级评论的楼层会永远不显示。
 */
router.get('/:id/comments', (req, res) => {
  const viewer = req.user?.id || 0;
  const noteId = Number(req.params.id);
  const rows = db
    .prepare('SELECT * FROM comments WHERE note_id = ? ORDER BY like_count DESC, created_at DESC')
    .all(noteId);

  if (!rows.length) return ok(res, { comments: [], total: 0 });

  const uids = [...new Set(rows.map((r) => r.user_id))];
  const users = new Map(
    db
      .prepare(`SELECT * FROM users WHERE id IN (${uids.map(() => '?').join(',')})`)
      .all(...uids)
      .map((u) => [u.id, u])
  );
  const likedSet = new Set(
    viewer
      ? db
          .prepare('SELECT comment_id FROM comment_likes WHERE user_id = ? AND comment_id IN (SELECT id FROM comments WHERE note_id = ?)')
          .all(viewer, noteId)
          .map((r) => r.comment_id)
      : []
  );

  const shape = (c) => {
    const u = users.get(c.user_id);
    return {
      id: String(c.id),
      content: c.content,
      likeCount: c.like_count,
      liked: likedSet.has(c.id),
      ipLocation: c.ip_location,
      createTime: timeAgo(c.created_at),
      createdAt: c.created_at,
      parentId: c.parent_id ? String(c.parent_id) : null,
      rootId: c.root_id ? String(c.root_id) : null,
      user: { id: u?.id, nickname: u?.nickname, avatar: u?.avatar },
      subComments: []
    };
  };

  const parents = rows.filter((r) => !r.parent_id).map(shape);
  const byId = new Map(parents.map((p) => [p.id, p]));
  for (const r of rows) {
    if (!r.parent_id) continue;
    // root_id 缺失（极老的数据）时退化为「挂到直接父级」
    const root = byId.get(String(r.root_id || r.parent_id));
    if (root) root.subComments.push(shape(r));
  }
  return ok(res, { comments: parents, total: rows.length });
});

/** POST /api/notes/:id/comments —— 发表评论 / 回复 */
router.post('/:id/comments', requireAuth, (req, res) => {
  const noteId = Number(req.params.id);
  const { content } = req.body || {};
  const rawParent = req.body?.parentId;
  if (!content || !String(content).trim()) return fail(res, '评论内容不能为空');
  const note = db.prepare('SELECT id, user_id FROM notes WHERE id = ?').get(noteId);
  if (!note) return fail(res, '笔记不存在', 404);

  let parentId = null;
  let rootId = null;
  if (rawParent !== undefined && rawParent !== null && rawParent !== '') {
    const pid = Number(rawParent);
    if (!Number.isInteger(pid) || pid <= 0) return fail(res, 'parentId 不合法');
    const parent = db.prepare('SELECT id, note_id, parent_id, root_id FROM comments WHERE id = ?').get(pid);
    if (!parent) return fail(res, '回复的评论不存在', 404);
    // 关键校验：父评论必须属于同一篇笔记，否则会出现「评论数 +1 却谁也看不见」的幽灵楼
    if (parent.note_id !== noteId) return fail(res, '回复的评论不属于该笔记', 400);
    parentId = parent.id;
    rootId = parent.parent_id ? parent.root_id || parent.parent_id : parent.id;
  }

  const text = String(content).trim().slice(0, 500);
  const info = db
    .prepare(
      `INSERT INTO comments (note_id, user_id, parent_id, root_id, content, ip_location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(noteId, req.user.id, parentId, rootId, text, req.user.ip_location, Date.now());
  bumpCommentCount(noteId, 1);

  // 通知：笔记作者 + 被回复的人（自己操作自己不发）
  const putMsg = db.prepare(
    `INSERT INTO messages (box, from_user_id, to_user_id, note_id, content, created_at)
     VALUES ('comments', ?, ?, ?, ?, ?)`
  );
  const now = Date.now();
  if (note.user_id !== req.user.id) putMsg.run(req.user.id, note.user_id, noteId, text.slice(0, 60), now);
  if (parentId) {
    const parentAuthor = db.prepare('SELECT user_id FROM comments WHERE id = ?').get(parentId)?.user_id;
    if (parentAuthor && parentAuthor !== req.user.id && parentAuthor !== note.user_id) {
      putMsg.run(req.user.id, parentAuthor, noteId, `回复了你：${text.slice(0, 50)}`, now);
    }
  }

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
      parentId: c.parent_id ? String(c.parent_id) : null,
      rootId: c.root_id ? String(c.root_id) : null,
      user: { id: req.user.id, nickname: req.user.nickname, avatar: req.user.avatar },
      subComments: []
    },
    '评论成功'
  );
});

/** POST /api/notes/:id/comments/:cid/like —— 给评论点赞（事务内切换） */
router.post('/:id/comments/:cid/like', requireAuth, (req, res) => {
  const noteId = Number(req.params.id);
  const cid = Number(req.params.cid);
  const uid = req.user.id;
  // 评论必须属于该笔记，避免用别的笔记的评论 id 制造跨笔记的点赞
  const c = db.prepare('SELECT id FROM comments WHERE id = ? AND note_id = ?').get(cid, noteId);
  if (!c) return fail(res, '评论不存在', 404);

  const toggleCommentLike = db.transaction(() => {
    const exist = db.prepare('SELECT 1 FROM comment_likes WHERE user_id = ? AND comment_id = ?').get(uid, cid);
    if (exist) {
      db.prepare('DELETE FROM comment_likes WHERE user_id = ? AND comment_id = ?').run(uid, cid);
      db.prepare('UPDATE comments SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(cid);
      return false;
    }
    db.prepare('INSERT INTO comment_likes (user_id, comment_id) VALUES (?, ?)').run(uid, cid);
    db.prepare('UPDATE comments SET like_count = like_count + 1 WHERE id = ?').run(cid);
    return true;
  });
  const liked = toggleCommentLike();
  const fresh = db.prepare('SELECT like_count FROM comments WHERE id = ?').get(cid);
  return ok(res, { liked, likeCount: fresh.like_count });
});

export default router;
