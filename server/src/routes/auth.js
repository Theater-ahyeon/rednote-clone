import express from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../utils/auth.js';
import { ok, fail, publicUser } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { makeAvatar } from '../utils/placeholder.js';

const router = express.Router();

/**
 * 「一键体验」开关。
 * 这个接口不需要任何凭证就能换到 token，等价于「任何人可登进 demo 账号」：
 * - 生产模式（NODE_ENV=production）默认关闭，必须显式 DEMO_LOGIN=1；
 * - 且只认 username = 'demo' 这个种子账号，绝不返回「库里第一个用户」（那可能是管理员）。
 */
export function demoLoginEnabled() {
  if (process.env.DEMO_LOGIN === '1') return true;
  if (process.env.DEMO_LOGIN === '0') return false;
  return process.env.NODE_ENV !== 'production';
}

// 登录按「IP + 用户名」限流：同一出口 NAT 下不同账号互不影响，单账号撞库会被卡住
const loginLimit = rateLimit({ windowMs: 10 * 60_000, max: 10, keyOf: (req) => String(req.body?.username || '') });
// 注册按 IP 限流，挡批量小号
const registerLimit = rateLimit({ windowMs: 60 * 60_000, max: 20 });
const demoLimit = rateLimit({ windowMs: 10 * 60_000, max: 20 });

/**
 * POST /api/auth/register
 * body: { username, password, nickname? }
 */
router.post('/register', registerLimit, (req, res) => {
  const { username, password, nickname } = req.body || {};
  if (!username || !password) return fail(res, '用户名和密码不能为空');
  if (!/^[\w\u4e00-\u9fa5-]{2,20}$/.test(username)) return fail(res, '用户名需为 2-20 位字母/数字/下划线/中文');
  if (String(password).length < 6) return fail(res, '密码至少 6 位');
  if (String(password).length > 72) return fail(res, '密码不能超过 72 位');
  const exist = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exist) return fail(res, '该用户名已被注册');

  const now = Date.now();
  const name = String(nickname || username).slice(0, 20);
  const info = db
    .prepare(
      `INSERT INTO users (username, password, nickname, avatar, bio, ip_location, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      username,
      hashPassword(String(password)),
      name,
      makeAvatar(username, name.slice(0, 1)),
      '这个人很懒，还没有写简介～',
      '广东',
      now
    );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  return ok(res, { token: signToken(user), user: publicUser(user, user.id) }, '注册成功');
});

/**
 * POST /api/auth/login
 * body: { username, password }
 */
router.post('/login', loginLimit, (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(String(password || ''), user.password)) {
    return fail(res, '用户名或密码错误', 401);
  }
  return ok(res, { token: signToken(user), user: publicUser(user, user.id) }, '登录成功');
});

/** GET /api/auth/me —— 用 token 换当前用户 */
router.get('/me', requireAuth, (req, res) => ok(res, publicUser(req.user, req.user.id)));

/**
 * PUT /api/auth/me —— 编辑资料
 * 注意：ip_location 不接受客户端写入。IP 属地是服务端推导的可信字段，
 * 允许用户自填等于把这个标签作废（也就能伪装成任何地区）。
 */
router.put('/me', requireAuth, (req, res) => {
  const { nickname, bio, avatar, gender } = req.body || {};
  const u = req.user;
  const nick = nickname ? String(nickname).trim().slice(0, 20) : u.nickname;
  const nextBio = bio === undefined ? u.bio : String(bio).slice(0, 200);
  const nextAvatar = avatar ? String(avatar).slice(0, 500) : u.avatar;
  const nextGender = ['female', 'male', 'unknown'].includes(gender) ? gender : u.gender;
  db.prepare(`UPDATE users SET nickname = ?, bio = ?, avatar = ?, gender = ? WHERE id = ?`).run(
    nick,
    nextBio,
    nextAvatar,
    nextGender,
    u.id
  );
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(u.id);
  return ok(res, publicUser(fresh, fresh.id), '已保存');
});

/**
 * GET /api/auth/demo —— 一键体验（仅演示环境）
 * 只认种子账号 demo，且受 DEMO_LOGIN / NODE_ENV 控制。
 */
router.get('/demo', demoLimit, (_req, res) => {
  if (!demoLoginEnabled()) return fail(res, '一键体验已关闭，请用账号 demo / 123456 登录', 404);
  const user = db.prepare("SELECT * FROM users WHERE username = 'demo'").get();
  if (!user) return fail(res, '暂无种子数据，请先执行 npm run seed', 404);
  return ok(res, { token: signToken(user), user: publicUser(user, user.id) });
});

export default router;
