import { db } from '../db.js';

/** 统一返回体 { code, msg, data } */
export function ok(res, data = null, msg = 'success') {
  return res.json({ code: 0, msg, data });
}

export function fail(res, msg = 'error', code = 400) {
  return res.status(code).json({ code, msg, data: null });
}

export function parseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

/** LIKE 通配符转义：用户搜 "%" 时不应该命中全表（配合 `LIKE ? ESCAPE '\'` 使用） */
export function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, (m) => '\\' + m);
}

const inClause = (n) => Array(n).fill('?').join(',');

export function publicUser(row, viewerId, { isFollowing } = {}) {
  if (!row) return null;
  const following =
    isFollowing !== undefined
      ? isFollowing
      : viewerId
        ? !!db.prepare('SELECT 1 FROM follows WHERE follower_id = ? AND followee_id = ?').get(viewerId, row.id)
        : false;
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatar: row.avatar,
    bio: row.bio,
    gender: row.gender,
    ipLocation: row.ip_location,
    followingCount: row.following_count,
    followerCount: row.follower_count,
    likeCollectCount: row.like_collect_count,
    isFollowing: following,
    isSelf: viewerId === row.id
  };
}

function shapeNote(row, { viewerId, liked, collected, user, following }) {
  const images = parseJSON(row.images, []);
  return {
    id: String(row.id),
    noteId: String(row.id),
    title: row.title,
    desc: row.content,
    type: row.note_type,
    images,
    cover: images[0] || null,
    topics: parseJSON(row.topics, []),
    location: row.location,
    createdAt: row.created_at,
    interactInfo: {
      likedCount: row.like_count,
      collectedCount: row.collect_count,
      commentCount: row.comment_count,
      // 演示用派生值（官方是真实分享上报），按浏览量估算，仅用于视觉对齐
      shareCount: Math.max(1, Math.round(row.view_count / 12)),
      liked,
      collected
    },
    user: user ? publicUser(user, viewerId, { isFollowing: following }) : null
  };
}

/**
 * 批量序列化笔记：把「每张卡片 4 次查询」压成「整页 4 次查询」。
 * 之前 20 条的 feed 要跑 80 次 SQL（like / collect / user / follow 各一遍）。
 */
export function serializeNotes(rows, viewerId) {
  if (!rows || !rows.length) return [];
  const ids = rows.map((r) => r.id);
  const uids = [...new Set(rows.map((r) => r.user_id))];
  const uid = viewerId || 0;

  const liked = new Set(
    uid
      ? db
          .prepare(`SELECT note_id FROM likes WHERE user_id = ? AND note_id IN (${inClause(ids.length)})`)
          .all(uid, ...ids)
          .map((r) => r.note_id)
      : []
  );
  const collected = new Set(
    uid
      ? db
          .prepare(`SELECT note_id FROM collects WHERE user_id = ? AND note_id IN (${inClause(ids.length)})`)
          .all(uid, ...ids)
          .map((r) => r.note_id)
      : []
  );
  const users = new Map(
    db
      .prepare(`SELECT * FROM users WHERE id IN (${inClause(uids.length)})`)
      .all(...uids)
      .map((u) => [u.id, u])
  );
  const following = new Set(
    uid
      ? db
          .prepare(`SELECT followee_id FROM follows WHERE follower_id = ? AND followee_id IN (${inClause(uids.length)})`)
          .all(uid, ...uids)
          .map((r) => r.followee_id)
      : []
  );

  return rows.map((row) =>
    shapeNote(row, {
      viewerId: uid,
      liked: liked.has(row.id),
      collected: collected.has(row.id),
      user: users.get(row.user_id),
      following: following.has(row.user_id)
    })
  );
}

/** 单条笔记序列化（详情页 / 发布后回显），内部复用批量实现 */
export function publicNote(row, viewerId) {
  if (!row) return null;
  return serializeNotes([row], viewerId)[0];
}

export function bumpCommentCount(noteId, delta) {
  db.prepare('UPDATE notes SET comment_count = MAX(0, comment_count + ?) WHERE id = ?').run(delta, noteId);
}

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const min = 60 * 1000;
  if (diff < min) return '刚刚';
  if (diff < 60 * min) return `${Math.floor(diff / min)} 分钟前`;
  if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))} 小时前`;
  if (diff < 30 * 24 * 60 * min) return `${Math.floor(diff / (24 * 60 * min))} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`;
}

export default { ok, fail, parseJSON, escapeLike, publicUser, publicNote, serializeNotes, bumpCommentCount, timeAgo };
