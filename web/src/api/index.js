/**
 * API 客户端
 * - 网页开发态：走 Vite dev proxy（/api → http://localhost:3001）
 * - Android / Windows 客户端：打包产物以 file:// 或本地静态服务加载，
 *   此时自动回退到 VITE_API_BASE 指向的后端地址（默认 http://localhost:3001）
 */
const ENV_BASE = import.meta.env.VITE_API_BASE || '';

function resolveBase() {
  if (ENV_BASE) return ENV_BASE.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') return 'http://localhost:3001';
  return '';
}

const BASE = resolveBase();

function getToken() {
  try {
    return JSON.parse(localStorage.getItem('rednote-auth') || '{}')?.state?.token || '';
  } catch {
    return '';
  }
}

async function request(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const url = `${BASE}${path}`;
  const opts = { method, headers: { ...headers } };
  const token = getToken();
  if (token) opts.headers.Authorization = `Bearer ${token}`;
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (raw) return res;
  const json = await res.json().catch(() => ({ code: -1, msg: '网络异常' }));
  if (json.code !== 0) {
    const err = new Error(json.msg || '请求失败');
    err.code = json.code;
    throw err;
  }
  return json.data;
}

/** 拼 query：undefined / null / 空串 一律丢弃（否则 URL 里会出现 cursor=undefined） */
function qs(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  return sp.toString();
}

export const api = {
  // ---------- 认证 ----------
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  register: (username, password, nickname) =>
    request('/api/auth/register', { method: 'POST', body: { username, password, nickname } }),
  me: () => request('/api/auth/me'),
  updateMe: (patch) => request('/api/auth/me', { method: 'PUT', body: patch }),
  demoLogin: () => request('/api/auth/demo'),

  // ---------- 笔记 ----------
  feed: (params = {}) => request('/api/notes/feed?' + qs(params)),
  noteDetail: (id) => request(`/api/notes/${id}`),
  publish: (payload) => request('/api/notes', { method: 'POST', body: payload }),
  deleteNote: (id) => request(`/api/notes/${id}`, { method: 'DELETE' }),
  like: (id) => request(`/api/notes/${id}/like`, { method: 'POST' }),
  collect: (id) => request(`/api/notes/${id}/collect`, { method: 'POST' }),
  comments: (id) => request(`/api/notes/${id}/comments`),
  postComment: (id, content, parentId) =>
    request(`/api/notes/${id}/comments`, { method: 'POST', body: { content, parentId } }),
  likeComment: (noteId, cid) => request(`/api/notes/${noteId}/comments/${cid}/like`, { method: 'POST' }),

  // ---------- 用户 ----------
  user: (id) => request(`/api/users/${id}`),
  userNotes: (id, params) => request(`/api/users/${id}/notes?` + qs(params)),
  follow: (id) => request(`/api/users/${id}/follow`, { method: 'POST' }),
  followers: (id) => request(`/api/users/${id}/followers`),
  following: (id) => request(`/api/users/${id}/following`),
  suggestUsers: () => request('/api/users'),

  // ---------- 搜索 ----------
  hot: () => request('/api/search/hot'),
  suggest: (keyword) => request(`/api/search/suggest?keyword=${encodeURIComponent(keyword)}`),
  searchNotes: (params) => request('/api/search/notes?' + qs(params)),
  searchHistory: () => request('/api/search/history'),
  clearHistory: () => request('/api/search/history', { method: 'DELETE' }),

  // ---------- 消息 ----------
  messageBoxes: () => request('/api/messages'),
  messageList: (box) => request(`/api/messages/${box}`),
  readAll: () => request('/api/messages/read-all', { method: 'POST' }),
  unread: () => request('/api/messages/unread/count'),

  // ---------- 上传 ----------
  upload(file) {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/upload', { method: 'POST', body: fd });
  },
  uploadMulti(files) {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    return request('/api/upload/multi', { method: 'POST', body: fd });
  },
  deleteUpload(url) {
    return request('/api/upload?url=' + encodeURIComponent(url), { method: 'DELETE' });
  },

  // ---------- 频道 ----------
  channels: () => request('/api/channels'),

  health: () => request('/api/health')
};

export default api;
