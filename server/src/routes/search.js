import express from 'express';
import { db } from '../db.js';
import { ok, fail, publicNote, parseJSON } from '../utils/index.js';

const router = express.Router();

/** GET /api/search/hot —— 热搜榜（对应 /api/sns/web/v1/search/trending/query） */
router.get('/hot', (_req, res) => {
  const rows = db.prepare('SELECT keyword, heat, tag FROM hot_searches ORDER BY heat DESC LIMIT 20').all();
  return ok(res, { list: rows.map((r, i) => ({ ...r, rank: i + 1 })) });
});

/** GET /api/search/suggest?keyword=xx —— 联想词 */
router.get('/suggest', (req, res) => {
  const kw = String(req.query.keyword || '').trim();
  if (!kw) return ok(res, { list: [] });
  const notes = db
    .prepare(`SELECT keyword FROM hot_searches WHERE keyword LIKE ? LIMIT 10`)
    .all(`%${kw}%`)
    .map((r) => r.keyword);
  const titles = db
    .prepare(`SELECT title FROM notes WHERE title LIKE ? OR content LIKE ? LIMIT 10`)
    .all(`%${kw}%`, `%${kw}%`)
    .map((r) => r.title)
    .filter(Boolean);
  return ok(res, { list: [...new Set([...notes, ...titles])].slice(0, 10) });
});

/**
 * GET /api/search/notes?keyword=xx&page=1&sort=general|hot
 */
router.get('/notes', (req, res) => {
  const viewer = req.user?.id || 0;
  const kw = String(req.query.keyword || '').trim();
  if (!kw) return fail(res, 'keyword 不能为空');
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(40, Number(req.query.pageSize) || 20);
  const sort = req.query.sort === 'hot' ? 'like_count DESC' : 'created_at DESC';

  const like = `%${kw}%`;
  const rows = db
    .prepare(
      `SELECT * FROM notes
       WHERE title LIKE ? OR content LIKE ? OR topics LIKE ? OR location LIKE ?
       ORDER BY ${sort} LIMIT ? OFFSET ?`
    )
    .all(like, like, like, like, pageSize, (page - 1) * pageSize);

  const total = db
    .prepare(
      `SELECT COUNT(*) c FROM notes
       WHERE title LIKE ? OR content LIKE ? OR topics LIKE ? OR location LIKE ?`
    )
    .get(like, like, like, like).c;

  if (viewer) {
    const exist = db
      .prepare('SELECT 1 FROM search_history WHERE user_id = ? AND keyword = ?')
      .get(viewer, kw);
    if (!exist) {
      db.prepare('INSERT INTO search_history (user_id, keyword, created_at) VALUES (?, ?, ?)').run(viewer, kw, Date.now());
      db.prepare('DELETE FROM search_history WHERE id NOT IN (SELECT id FROM search_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20) AND user_id = ?').run(viewer, viewer);
    } else {
      db.prepare('UPDATE search_history SET created_at = ? WHERE user_id = ? AND keyword = ?').run(Date.now(), viewer, kw);
    }
  }

  return ok(res, {
    keyword: kw,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
    notes: rows.map((r) => publicNote(r, viewer))
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

/** GET /api/search/topics?keyword= —— 话题聚合，用于搜索页“相关话题” */
router.get('/topics', (req, res) => {
  const kw = String(req.query.keyword || '').trim();
  const counter = new Map();
  const rows = kw
    ? db.prepare('SELECT topics FROM notes WHERE topics LIKE ?').all(`%${kw}%`)
    : db.prepare('SELECT topics FROM notes').all();
  for (const r of rows) for (const t of parseJSON(r.topics, [])) counter.set(t, (counter.get(t) || 0) + 1);
  const list = [...counter.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  return ok(res, { list });
});

export default router;
