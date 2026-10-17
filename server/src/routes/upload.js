import express from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';
import { UPLOADS } from '../db.js';
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

/** POST /api/upload —— 单图上传，返回 { url, w, h } */
router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return fail(res, '未收到文件');
  const size = imageSize(req.file.path) || { w: 3, h: 4 };
  return ok(res, {
    url: `/uploads/${req.file.filename}`,
    fallback: `/uploads/${req.file.filename}`,
    w: size.w,
    h: size.h,
    name: req.file.originalname
  });
});

/** POST /api/upload/multi —— 多图上传（发布页一次最多 9 张） */
router.post('/multi', requireAuth, upload.array('files', 9), (req, res) => {
  const files = req.files || [];
  return ok(
    res,
    files.map((f) => {
      const size = imageSize(f.path) || { w: 3, h: 4 };
      return { url: `/uploads/${f.filename}`, fallback: `/uploads/${f.filename}`, w: size.w, h: size.h };
    })
  );
});

/** DELETE /api/upload —— 删除上传的临时文件 */
router.delete('/', requireAuth, (req, res) => {
  const url = String(req.query.url || '');
  const name = path.basename(url);
  const file = path.join(UPLOADS, name);
  if (file.startsWith(UPLOADS) && fs.existsSync(file)) fs.unlinkSync(file);
  return ok(res, null, '已删除');
});

export default router;
