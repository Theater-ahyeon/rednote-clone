import express from 'express';
import { db } from '../db.js';
import { ok, fail, serializeNotes, parseJSON, escapeLike } from '../utils/index.js';

const router = express.Router();

/**
 * 三档排序必须真的不同：
 * - general（综合）= 互动量加权 + 时间兜底，不是「按时间倒序」的别名
 * - hot（最热）= 纯点赞数
 * - time（最新）= 纯发布时间
 */
const ORDER = {
  general: `(n.like_count * 3 + n.collect_count * 2 + n.comment_count * 2 + n.view_count * 0.05) DESC, n.created_at DESC`,
  hot: `n.like_count DESC, n.collect_count DESC, n.id DESC`,
  time: `n.created_at DESC, n.id DESC`
};

/** GET /api/search/hot —— 热搜榜（对应 /api/sns/web/v1/search/trending/query） */
router.get('/hot', (_req, res) => {
  const rows = db.prepare('SELECT keyword, heat, tag FROM hot_searches ORDER BY heat DESC LIMIT 20').all();
  return ok(res, { list: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
});

/** GET /api/search/suggest?keyword=xx —— 联想词 */
router.get('/suggest', (req, res) => {
  const kw = String(req.query.keyword || '').trim();
  if (!kw) return ok(res, { list: [] });
  const like = `%${escapeLike(kw)}%`;
  const notes = db
    .prepare(`SELECT keyword FROM hot_searches WHERE keyword LIKE ? ESCAPE '\\' LIMIT 10`)
    .all(like)
    .map((r) => r.keyword);
  const titles = db
    .prepare(`SELECT title FROM notes WHERE title LIKE ? ESCAPE '\\' OR content LIKE ? ESCAPE '\\' LIMIT 10`)
    .all(like, like)
    .map((r) => r.title)
    .filter(Boolean);
  return ok(res, { list: [...new Set([...notes, ...titles])].slice(0, 10) });
});

/**
 * GET /api/search/notes?keyword=xx&page=1&sort=general|time|hot
 */
router.get('/notes', (req, res) => {
  const viewer = req.user?.id || 0;
  const kw = String(req.query.keyword || '').trim();
  if (!kw) return fail(res, 'keyword 不能为空');
  if (kw.length > 50) return fail(res, '关键词过长');
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(40, Math.max(1, Number(req.query.pageSize) || 20));
  const sort = ORDER[req.query.sort] ? req.query.sort : 'general';

  // 转义 % 和 _，否则搜一个 "%" 会把全库笔记都捞出来
  const like = `%${escapeLike(kw)}%`;
  const where = `n.title LIKE ? ESCAPE '\\' OR n.content LIKE ? ESCAPE '\\'
                 OR n.topics LIKE ? ESCAPE '\\' OR n.location LIKE ? ESCAPE '\\'`;

  const rows = db
    .prepare(
      `SELECT n.* FROM notes n
       WHERE ${where}
       ORDER BY ${ORDER[sort]}
       LIMIT ? OFFSET ?`
    )
    .all(like, like, like, like, pageSize, (page - 1) * pageSize);

  const total = db.prepare(`SELECT COUNT(*) c FROM notes n WHERE ${where}`).get(like, like, like, like).c;

  if (viewer) {
    const exist = db
      .prepare('SELECT 1 FROM search_history WHERE user_id = ? AND keyword = ?')
      .get(viewer, kw);
    if (!exist) {
      db.prepare('INSERT INTO search_history (user_id, keyword, created_at) VALUES (?, ?, ?)').run(viewer, kw, Date.now());
      db.prepare(
        'DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20) AND user_id = ?'
      ).run(viewer, viewer);
    } else {
      db.prepare('UPDATE search_history SET created_at = ? WHERE user_id = ? AND keyword = ?').run(Date.now(), viewer, kw);
    }
  }

  return ok(res, {
    keyword: kw,
    sort,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
    notes: serializeNotes(rows, viewer)
  });
});

/** GET /api/search/history —— 搜索历史 */
router.get('/history', (req, res) => {
  if (!req.user) return ok(res, { list: [] });
  const rows = db
    .prepare('SELECT keyword FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.user.id);
  return ok(res, { list: rows.map((r) => r.keyword) });
});

/** DELETE /api/search/history —— 清空历史 */
router.delete('/history', (req, res) => {
  if (!req.user) return ok(res, null);
  db.prepare('DELETE FROM search_history WHERE user_id = ?').run(req.user.id);
  return ok(res, null, '已清空');
});

/** GET /api/search/topics?keyword= —— 话题聚合，用于搜索页「相关话题」 */
router.get('/topics', (req, res) => {
  const kw = String(req.query.keyword || '').trim();
  const counter = new Map();
  const rows = kw
    ? db.prepare(`SELECT topics FROM notes WHERE topics LIKE ? ESCAPE '\\'`).all(`%${escapeLike(kw)}%`)
    : db.prepare('SELECT topics FROM notes').all();
  for (const r of rows) for (const t of parseJSON(r.topics, [])) counter.set(t, (counter.get(t) || 0) + 1);
  const list = [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  return ok(res, { list });
});

export default router;
