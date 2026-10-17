import { db } from '../db.js';
import { verifyToken } from '../utils/auth.js';

/** 解析 Authorization: Bearer <token>，失败时 req.user = null（不阻断公开接口） */
export function optionalAuth(req, _res, next) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid) || null;
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ code: 401, msg: '请先登录' });
  next();
}

export default { optionalAuth, requireAuth };
