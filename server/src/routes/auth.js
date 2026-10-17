import express from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../utils/auth.js';
import { ok, fail, publicUser } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';
import { makeAvatar } from '../utils/placeholder.js';

const router = express.Router();

/**
 * POST /api/auth/register
 * body: { username, password, nickname? }
 */
router.post('/register', (req, res) => {
  const { username, password, nickname } = req.body || {};
  if (!username || !password) return fail(res, '用户名和密码不能为空');
  if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(username)) return fail(res, '用户名需为 2-20 位字母/数字/下划线/中文');
  if (String(password).length < 6) return fail(res, '密码至少 6 位');
  const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exist) return fail(res, '该用户名已被注册');

  const now = Date.now();
  const name = nickname || username;
  const info = db
    .prepare(
      `INSERT INTO users (username, password, nickname, avatar, bio, ip_location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(username, hashPassword(String(password)), name, makeAvatar(username, name.slice(0, 1)), '这个人很懒，还没有写简介～', '广东', now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  return ok(res, { token: signToken(user), user: publicUser(user, user.id) }, '注册成功');
});

/**
 * POST /api/auth/login
 * body: { username, password }
 */
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(String(password || ''), user.password)) {
    return fail(res, '用户名或密码错误', 401);
  }
  return ok(res, { token: signToken(user), user: publicUser(user, user.id) }, '登录成功');
});

/** GET /api/auth/me —— 用 token 换当前用户 */
router.get('/me', requireAuth, (req, res) => ok(res, publicUser(req.user, req.user.id)));

/** PUT /api/auth/me —— 编辑资料 */
router.put('/me', requireAuth, (req, res) => {
  const { nickname, bio, avatar, gender, ipLocation } = req.body || {};
  const u = req.user;
  db.prepare(
    `UPDATE users SET nickname = ?, bio = ?, avatar = ?, gender = ?, ip_location = ? WHERE id = ?`
  ).run(
    nickname || u.nickname,
    bio ?? u.bio,
    avatar || u.avatar,
    gender || u.gender,
    ipLocation || u.ip_location,
    u.id
  );
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  return ok(res, publicUser(fresh, fresh.id), '已保存');
});

/** GET /api/auth/demo —— 一键体验账号（README 演示用） */
router.get('/demo', (_req, res) => {
  const user = db.prepare('SELECT * FROM users ORDER BY id LIMIT 1').get();
  if (!user) return fail(res, '暂无种子数据，请先执行 npm run seed', 404);
  return ok(res, { token: signToken(user), user: publicUser(user, user.id) });
});

export default router;
