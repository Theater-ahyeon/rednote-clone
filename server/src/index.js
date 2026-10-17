import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initSchema } from './db.js';
import { optionalAuth } from './middleware/auth.js';
import { ok } from './utils/index.js';

import authRoutes from './routes/auth.js';
import noteRoutes from './routes/notes.js';
import userRoutes from './routes/users.js';
import searchRoutes from './routes/search.js';
import messageRoutes from './routes/messages.js';
import uploadRoutes from './routes/upload.js';
import channelRoutes from './routes/channels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

initSchema();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(optionalAuth);

// 上传目录
const uploads = path.resolve(__dirname, '../public/uploads');
fs.mkdirSync(uploads, { recursive: true });
app.use('/uploads', express.static(uploads, { maxAge: '7d' }));

// API
app.get('/api/health', (_req, res) => ok(res, { status: 'ok', time: Date.now() }));
app.use('/api/auth', authRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/users', userRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/channels', channelRoutes);

app.use('/api', (_req, res) => res.status(404).json({ code: 404, msg: '接口不存在', data: null }));

// 生产模式：直接托管 web/dist（前端构建产物），并做 SPA history fallback
const dist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: 'index.html' }));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(`\n  🟥 RedNote API 已启动  →  http://localhost:${PORT}`);
  console.log(`     静态资源          →  http://localhost:${PORT}/uploads`);
  if (fs.existsSync(dist)) console.log(`     网页版            →  http://localhost:${PORT}\n`);
  else console.log(`     网页版请先执行    →  npm run dev（前端开发服务器 :5173）\n`);
});

export default app;
