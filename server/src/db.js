/**
 * 数据库层：better-sqlite3（同步 API，零外部依赖，单文件落盘）
 * 表结构参考逆向小红书得到的实体模型（user / note / comment / interactInfo / topic / message）
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '../data');
const UPLOAD_DIR = path.resolve(__dirname, '../public/uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(UPLOAD_DIR, 'seed'), { recursive: true });

const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'rednote.db');

export const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export const UPLOADS = UPLOAD_DIR;

// 模块加载即建表（IF NOT EXISTS，幂等）：
// 其它模块在 import 时就会 db.prepare，若等 index.js 里再建表，全新数据库一启动就崩。
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    username     TEXT NOT NULL UNIQUE,
    password     TEXT NOT NULL,
    nickname     TEXT NOT NULL,
    avatar       TEXT NOT NULL DEFAULT '',
    bio          TEXT NOT NULL DEFAULT '',
    gender       TEXT NOT NULL DEFAULT 'unknown',
    ip_location  TEXT NOT NULL DEFAULT '广东',
    following_count  INTEGER NOT NULL DEFAULT 0,
    follower_count   INTEGER NOT NULL DEFAULT 0,
    like_collect_count INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL DEFAULT '',
    content       TEXT NOT NULL DEFAULT '',
    images        TEXT NOT NULL DEFAULT '[]',   -- JSON: [{url, fallback, w, h}]
    topics        TEXT NOT NULL DEFAULT '[]',   -- JSON: ["露营","周末去哪儿"]
    location      TEXT NOT NULL DEFAULT '',
    note_type     TEXT NOT NULL DEFAULT 'normal',
    like_count    INTEGER NOT NULL DEFAULT 0,
    collect_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    view_count    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_notes_time ON notes(created_at DESC);

  CREATE TABLE IF NOT EXISTS likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, note_id)
  );

  CREATE TABLE IF NOT EXISTS collects (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, note_id)
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id    INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id  INTEGER,          -- 被回复的评论 id（可能是任意层级）
    root_id    INTEGER,          -- 所属一级评论 id；一级评论为 NULL
    content    TEXT NOT NULL,
    like_count INTEGER NOT NULL DEFAULT 0,
    ip_location TEXT NOT NULL DEFAULT '广东',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comments_note ON comments(note_id);

  CREATE TABLE IF NOT EXISTS comment_likes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    comment_id INTEGER NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, comment_id)
  );

  CREATE TABLE IF NOT EXISTS follows (
    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
  );

  -- 消息页：按官方的“赞和收藏 / 新增关注 / 评论和@”三个 box 建模
  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    box        TEXT NOT NULL,           -- likes | follows | comments
    from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    to_user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id    INTEGER,
    content    TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    read       INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_user_id, box);

  CREATE TABLE IF NOT EXISTS hot_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    heat INTEGER NOT NULL DEFAULT 0,
    tag TEXT NOT NULL DEFAULT ''      -- 热 / 新 / 爆 / 独家
  );

  CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    keyword TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0
  );

  -- 上传文件归属：没有这张表就无法判断「删的是不是自己的图」（越权删除）
  CREATE TABLE IF NOT EXISTS uploads (
    name       TEXT PRIMARY KEY,          -- 落盘文件名（含扩展名）
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id    INTEGER,                   -- 已发布到哪条笔记；NULL = 还没用上（孤儿）
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id);
  `);

/**
 * 轻量迁移：老库没有的列就地补上。
 * 项目没有 migration 框架，但加列必须兼容已经跑起来的数据库，否则升级即崩。
 */
function ensureColumn(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

ensureColumn('comments', 'root_id', 'root_id INTEGER');
db.exec('CREATE INDEX IF NOT EXISTS idx_comments_root ON comments(root_id)');

// 老数据的多级回复只有 parent_id，没有 root_id → 按父链回溯补全，否则回复会永远不显示
const pending = db.prepare('SELECT id, parent_id FROM comments WHERE parent_id IS NOT NULL AND root_id IS NULL').all();
if (pending.length) {
  const getOne = db.prepare('SELECT id, parent_id FROM comments WHERE id = ?');
  const setRoot = db.prepare('UPDATE comments SET root_id = ? WHERE id = ?');
  const fix = db.transaction((rows) => {
    for (const r of rows) {
      let cur = getOne.get(r.parent_id);
      let depth = 0;
      let root = null;
      while (cur && depth++ < 32) {
        if (!cur.parent_id) {
          root = cur.id;
          break;
        }
        cur = getOne.get(cur.parent_id);
      }
      if (root) setRoot.run(root, r.id);
    }
  });
  fix(pending);
}

export default db;
