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

test('一键体验只认 demo 账号（不返回库里第一个用户）', async () => {
  // 先造一个更早注册的账号：老实现会返回「库里第一个用户」，那就是越权
  await api('/api/auth/register', { method: 'POST', body: { username: 'zzz_first', password: 'abc12345' } });
  const reg = await api('/api/auth/register', { method: 'POST', body: { username: 'demo', password: '123456' } });
  assert.equal(reg.code, 0);

  const d = await api('/api/auth/demo');
  assert.equal(d.code, 0, '非 production 环境下默认可用');
  assert.equal(d.data.user.username, 'demo');
  const me = await api('/api/auth/me', { token: d.data.token });
  assert.equal(me.data.username, 'demo');
});

test('多级回复：三层楼全部可见，且都归到同一条一级评论下', async () => {
  const token = globalThis.__token;
  const note = await api('/api/notes', { method: 'POST', body: { title: '楼中楼', content: 'x' }, token });
  const nid = note.data.id;
  const a = await api(`/api/notes/${nid}/comments`, { method: 'POST', body: { content: 'A 一级' }, token });
  const b = await api(`/api/notes/${nid}/comments`, { method: 'POST', body: { content: 'B 回A', parentId: a.data.id }, token });
  const c = await api(`/api/notes/${nid}/comments`, { method: 'POST', body: { content: 'C 回B', parentId: b.data.id }, token });

  assert.equal(b.data.rootId, a.data.id);
  assert.equal(c.data.rootId, a.data.id, '回复二级评论也要挂回根评论，否则刷新后消失');

  const list = await api(`/api/notes/${nid}/comments`);
  assert.equal(list.data.total, 3);
  const root = list.data.comments.find((x) => x.id === a.data.id);
  assert.equal(root.subComments.length, 2, '两条回复都应可见');
});

test('跨笔记 parentId 必须被拒绝（否则是计数漂移的幽灵评论）', async () => {
  const token = globalThis.__token;
  const n1 = await api('/api/notes', { method: 'POST', body: { title: 'A 笔记', content: 'x' }, token });
  const n2 = await api('/api/notes', { method: 'POST', body: { title: 'B 笔记', content: 'x' }, token });
  const c1 = await api(`/api/notes/${n1.data.id}/comments`, { method: 'POST', body: { content: 'A 的评论' }, token });

  const bad = await api(`/api/notes/${n2.data.id}/comments`, {
    method: 'POST',
    body: { content: '挂到别的笔记的评论下', parentId: c1.data.id },
    token
  });
  assert.equal(bad.code, 400);
  const list = await api(`/api/notes/${n2.data.id}/comments`);
  assert.equal(list.data.total, 0, '被拒绝后不应留下任何行');
});

test('不能删除别人上传的文件（越权删除）', async () => {
  const token = globalThis.__token;
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }), 'a.jpg');
  const up = await api('/api/upload', { method: 'POST', token, form: fd });
  assert.equal(up.code, 0);

  const other = await api('/api/auth/register', {
    method: 'POST',
    body: { username: `x${Date.now() % 100000}`, password: 'abc12345' }
  });
  const del = await api(`/api/upload?url=${encodeURIComponent(up.data.url)}`, { method: 'DELETE', token: other.data.token });
  assert.equal(del.code, 403, '他人文件必须 403');

  const own = await api(`/api/upload?url=${encodeURIComponent(up.data.url)}`, { method: 'DELETE', token });
  assert.equal(own.code, 0, '自己的文件应可删除');
});

test('搜索三档排序真的不同 + 通配符不命中全表', async () => {
  const token = globalThis.__token;
  // 先发「热门」，再发「最新」：这样两种排序的首位必然不同，才能证明不是同一个 SQL
  const hot = await api('/api/notes', { method: 'POST', body: { title: '排序热门条目', content: '排序实验' }, token });
  await api(`/api/notes/${hot.data.id}/like`, { method: 'POST', token });
  const fresh = await api('/api/notes', { method: 'POST', body: { title: '排序最新条目', content: '排序实验' }, token });

  const byTime = await api('/api/search/notes?keyword=排序实验&sort=time');
  const byHot = await api('/api/search/notes?keyword=排序实验&sort=hot');
  assert.equal(byTime.data.sort, 'time');
  assert.equal(byHot.data.sort, 'hot');
  assert.equal(byTime.data.notes[0].id, fresh.data.id, '最新排序应把后发的排前面');
  assert.equal(byHot.data.notes[0].id, hot.data.id, '最热排序应把有点赞的排前面');

  const wildcard = await api('/api/search/notes?keyword=%25');
  assert.equal(wildcard.data.total, 0, '搜 "%" 不应命中全表');
});

test('频道筛选在服务端生效', async () => {
  const token = globalThis.__token;
  await api('/api/notes', { method: 'POST', body: { title: '露营装备', content: 'x', topics: ['露营'] }, token });
  await api('/api/notes', { method: 'POST', body: { title: '咖啡探店', content: 'x', topics: ['咖啡'] }, token });
  const d = await api(`/api/notes/feed?channel=${encodeURIComponent('露营')}&limit=20`);
  assert.ok(d.data.notes.length >= 1);
  assert.ok(
    d.data.notes.every((n) => n.topics.includes('露营')),
    '频道筛选必须全量在服务端过滤，不能只过滤已加载的前 20 条'
  );
});

test('生产模式下一键体验默认关闭', async () => {
  const port2 = 3800 + Math.floor(Math.random() * 300);
  const child2 = spawn(process.execPath, ['src/index.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(port2), DB_FILE: path.join(tmp, 'test.db'), JWT_SECRET: 'x', NODE_ENV: 'production', DEMO_LOGIN: '' },
    stdio: 'ignore'
  });
  try {
    let ready = false;
    for (let i = 0; i < 50; i++) {
      try {
        if ((await fetch(`http://localhost:${port2}/api/health`)).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }
    assert.ok(ready, '生产实例应能启动');
    const res = await fetch(`http://localhost:${port2}/api/auth/demo`);
    const json = await res.json();
    assert.equal(json.code, 404, 'production 下 demo 后门必须关闭');
  } finally {
    child2.kill();
  }
});
