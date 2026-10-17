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

export function publicUser(row, viewerId) {
  if (!row) return null;
  const following = viewerId
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

const likeQuery = db.prepare('SELECT 1 FROM likes WHERE user_id = ? AND note_id = ?');
const collectQuery = db.prepare('SELECT 1 FROM collects WHERE user_id = ? AND note_id = ?');

function getLikeState(uid, nid) {
  return { liked: uid ? !!likeQuery.get(uid, nid) : false, collected: uid ? !!collectQuery.get(uid, nid) : false };
}

/** 把 notes 行序列化成前端 noteCard 结构（对应逆向得到的 noteCard 字段） */
export function publicNote(row, viewerId, { withUser = true } = {}) {
  if (!row) return null;
  const images = parseJSON(row.images, []);
  const state = getLikeState(viewerId, row.id);
  const user = withUser ? db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id) : null;
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
      shareCount: Math.max(1, Math.round(row.view_count / 12)),
      liked: state.liked,
      collected: state.collected
    },
    user: withUser ? publicUser(user, viewerId) : null
  };
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

export default { ok, fail, parseJSON, publicUser, publicNote, bumpCommentCount, timeAgo };
