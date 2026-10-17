import express from 'express';
import { db } from '../db.js';
import { ok } from '../utils/index.js';

const router = express.Router();

/** GET /api/channels —— 首页顶部频道（推荐 / 穿搭 / 美食 / 彩妆 / 影视 / 职场 / 情感 / 家居 / 游戏 / 旅行 / 健身） */
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT name FROM channels ORDER BY sort').all();
  return ok(res, { list: rows.map((r) => r.name) });
});

export default router;
