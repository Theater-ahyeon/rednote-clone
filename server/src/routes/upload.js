import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { db, UPLOADS } from '../db.js';
import { ok, fail } from '../utils/index.js';
import { requireAuth } from '../middleware/auth.js';
import imageSize from '../utils/imageSize.js';

const router = express.Router();

// 扩展名只从服务端白名单推导，绝不使用客户端原始文件名：
// 否则传一个 image/x 伪装的 .html 就会被 express.static 以 text/html 提供，构成存储型 XSS。
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/avif': '.avif'
};

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS),
  filename: (_req, file, cb) => {
    const ext = EXT_BY_MIME[file.mimetype] || '.jpg';
    cb(null, `${Date.now()}-${nanoid(8)}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (EXT_BY_MIME[file.mimetype]) cb(null, true);
    else cb(new Error('仅支持 jpg/png/gif/webp/avif/svg 图片'));
  }
});

const insertUpload = db.prepare('INSERT OR IGNORE INTO uploads (name, user_id, created_at) VALUES (?, ?, ?)');

/** 记录归属，DELETE 时才有据可查（否则任何登录用户都能删别人的图） */
function record(file, userId) {
  insertUpload.run(file.filename, userId, Date.now());
  const size = imageSize(file.path) || { w: 3, h: 4 };
  return { url: `/uploads/${file.filename}`, fallback: `/uploads/${file.filename}`, w: size.w, h: size.h };
}

/** 发布笔记时把用到的图片标记到该笔记，便于后续清理孤儿文件 */
export function linkUploadsToNote(images, userId, noteId) {
  if (!Array.isArray(images) || !images.length) return;
  const stmt = db.prepare('UPDATE uploads SET note_id = ? WHERE name = ? AND user_id = ?');
  for (const img of images) {
    const name = path.basename(String(img?.url || ''));
    if (name) stmt.run(noteId, name, userId);
  }
}

/** POST /api/upload —— 单图上传，返回 { url, w, h } */
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, '未收到文件');
  return ok(res, { ...record(req.file, req.user.id), name: req.file.originalname });
});

/** POST /api/upload/multi —— 多图上传（发布页一次最多 9 张） */
router.post('/multi', requireAuth, upload.array('files', 9), (req, res) => {
  const files = req.files || [];
  return ok(res, files.map((f) => record(f, req.user.id)));
});

/** DELETE /api/upload?url=/uploads/xxx.jpg —— 只能删自己上传的文件 */
router.delete('/', requireAuth, (req, res) => {
  const name = path.basename(String(req.query.url || ''));
  if (!name) return fail(res, 'url 不能为空');

  const row = db.prepare('SELECT name, user_id FROM uploads WHERE name = ?').get(name);
  // 没有归属记录（历史文件 / 种子图 / 别人的文件）一律拒绝：
  // 宁可留垃圾文件，也不能让任意登录用户删掉别人笔记里的图
  if (!row) return fail(res, '文件不存在或不属于你', 403);
  if (row.user_id !== req.user.id) return fail(res, '只能删除自己上传的文件', 403);

  const file = path.join(UPLOADS, name);
  if (!file.startsWith(UPLOADS + path.sep)) return fail(res, '非法路径', 400);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  db.prepare('DELETE FROM uploads WHERE name = ?').run(name);
  return ok(res, null, '已删除');
});

export default router;
