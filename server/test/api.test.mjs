/**
 * 接口冒烟测试（node:test，零依赖）
 * 覆盖最高风险逻辑：注册/登录鉴权、点赞收藏的幂等与计数、feed 游标分页、上传扩展名白名单。
 * 运行：npm test（会在随机端口起一个独立实例，使用临时数据库，不影响开发数据）
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3000 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rednote-test-'));
let child;

const api = async (p, { method = 'GET', body, token, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + p, { method, headers, body: payload });
  return res.json();
};

before(async () => {
  child = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PORT), DB_FILE: path.join(tmp, 'test.db'), JWT_SECRET: 'test-secret' },
    stdio: 'ignore'
  });
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('测试服务启动超时');
});

after(() => child?.kill());

test('注册 → 登录 → me', async () => {
  const username = `t${Date.now() % 100000}`;
  const reg = await api('/api/auth/register', { method: 'POST', body: { username, password: 'abc12345', nickname: '测试君' } });
  assert.equal(reg.code, 0);
  assert.ok(reg.data.token);
  assert.equal(reg.data.user.nickname, '测试君');

  const bad = await api('/api/auth/login', { method: 'POST', body: { username, password: 'wrong-password' } });
  assert.equal(bad.code, 401);

  const ok = await api('/api/auth/login', { method: 'POST', body: { username, password: 'abc12345' } });
  assert.equal(ok.code, 0);

  const me = await api('/api/auth/me', { token: ok.data.token });
  assert.equal(me.code, 0);
  assert.equal(me.data.username, username);

  const noToken = await api('/api/auth/me');
  assert.equal(noToken.code, 401);

  globalThis.__token = ok.data.token;
  globalThis.__uid = me.data.id;
});

test('未登录不能发布/点赞', async () => {
  assert.equal((await api('/api/notes', { method: 'POST', body: { content: 'x' } })).code, 401);
  assert.equal((await api('/api/notes/1/like', { method: 'POST' })).code, 401);
});

test('点赞/收藏幂等，且计数与关系表一致', async () => {
  const token = globalThis.__token;
  const pub = await api('/api/notes', {
    method: 'POST',
    body: { title: '计数测试', content: '内容', images: [], topics: ['测试'] },
    token
  });
  assert.equal(pub.code, 0);
  const id = pub.data.id;

  const r1 = await api(`/api/notes/${id}/like`, { method: 'POST', token });
  assert.equal(r1.data.liked, true);
  assert.equal(r1.data.likedCount, 1);

  const r2 = await api(`/api/notes/${id}/like`, { method: 'POST', token });
  assert.equal(r2.data.liked, false);
  assert.equal(r2.data.likedCount, 0);

  const c1 = await api(`/api/notes/${id}/collect`, { method: 'POST', token });
  assert.equal(c1.data.collected, true);
  assert.equal(c1.data.collectedCount, 1);
  await api(`/api/notes/${id}/collect`, { method: 'POST', token });
  assert.equal(c1.data.collectedCount, 1);

  // 自己给自己点赞不产生消息
  const msgs = await api('/api/messages', { token });
  assert.equal(msgs.data.boxes.find((b) => b.key === 'likes').unread, 0);
});

test('feed 游标分页不重不漏', async () => {
  const token = globalThis.__token;
  // 造 8 条笔记，保证能翻两页
  for (let i = 0; i < 8; i++) {
    await api('/api/notes', { method: 'POST', body: { title: `分页 ${i}`, content: 'x', images: [] }, token });
  }
  const p1 = await api('/api/notes/feed?limit=5');
  assert.equal(p1.code, 0);
  assert.equal(p1.data.notes.length, 5);
  assert.ok(p1.data.nextCursor);

  const p2 = await api(`/api/notes/feed?limit=5&cursor=${encodeURIComponent(p1.data.nextCursor)}`);
  const ids1 = p1.data.notes.map((n) => n.id);
  const ids2 = p2.data.notes.map((n) => n.id);
  assert.equal(ids2.filter((x) => ids1.includes(x)).length, 0, '两页不应有重叠');
});

test('上传只接受白名单扩展名（防存储型 XSS）', async () => {
  const token = globalThis.__token;
  const fd = new FormData();
  fd.append('file', new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'], { type: 'image/svg+xml' }), 'x.svg');
  const okSvg = await api('/api/upload', { method: 'POST', token, form: fd });
  assert.equal(okSvg.code, 0);
  assert.match(okSvg.data.url, /\.svg$/);

  const fd2 = new FormData();
  fd2.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'evil.html');
  const bad = await api('/api/upload', { method: 'POST', token, form: fd2 });
  assert.equal(bad.code, 0);
  assert.doesNotMatch(bad.data.url, /\.html$/, '伪装成图片的 .html 不得按原扩展名落库');

  const fd3 = new FormData();
  fd3.append('file', new Blob(['MZ'], { type: 'application/x-msdownload' }), 'evil.exe');
  const rejected = await api('/api/upload', { method: 'POST', token, form: fd3 });
  assert.notEqual(rejected.code, 0, '非图片类型必须被拒绝');
});

test('搜索与评论', async () => {
  const token = globalThis.__token;
  const found = await api('/api/search/notes?keyword=计数测试');
  assert.ok(found.data.total >= 1);

  const missing = await api('/api/search/notes?keyword=');
  assert.notEqual(missing.code, 0);

  const noteId = found.data.notes[0].id;
  const c = await api(`/api/notes/${noteId}/comments`, { method: 'POST', body: { content: '测试评论' }, token });
  assert.equal(c.code, 0);
  const list = await api(`/api/notes/${noteId}/comments`);
  assert.ok(list.data.comments.some((x) => x.content === '测试评论'));
});
