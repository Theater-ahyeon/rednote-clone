# RedNote Clone 接口文档

- Base URL：`http://localhost:3001`
- 统一返回体：`{ "code": 0, "msg": "success", "data": ... }`，`code !== 0` 表示业务错误
- 鉴权：登录/注册后拿到 `token`，后续请求带 `Authorization: Bearer <token>`
- 字段命名与小红书真实接口对齐（`interactInfo` / `noteId` / `cover` …），对照关系见 [reverse-engineering.md](./reverse-engineering.md)

## 1. 认证 `/api/auth`

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| POST | `/api/auth/register` | `{username, password, nickname?}` | 注册，返回 `{token, user}` |
| POST | `/api/auth/login` | `{username, password}` | 登录，返回 `{token, user}` |
| GET  | `/api/auth/me` | Header token | 当前用户信息 |
| PUT  | `/api/auth/me` | `{nickname?, bio?, gender?, ipLocation?, avatar?}` | 编辑资料 |
| GET  | `/api/auth/demo` | - | 一键体验：返回种子账号 `demo` 的 token |

`user` 结构：

```json
{
  "id": 1, "username": "demo", "nickname": "一只小柚子",
  "avatar": "/uploads/seed/avatar-xxx.svg", "bio": "...",
  "gender": "female", "ipLocation": "广东",
  "followingCount": 5, "followerCount": 6, "likeCollectCount": 26,
  "isFollowing": false, "isSelf": true
}
```

## 2. 笔记 `/api/notes`

| 方法 | 路径 | 参数 | 说明 |
|---|---|---|---|
| GET | `/api/notes/feed` | `tab=recommend|following|nearby`，`cursor`，`limit` | 瀑布流，keyset 分页 |
| GET | `/api/notes/:id` | - | 笔记详情（附 `relatedNotes` 相关推荐），浏览量 +1 |
| POST | `/api/notes` | `{title, content, images[], topics[], location}` | 发布图文笔记 🔒 |
| DELETE | `/api/notes/:id` | - | 删除自己的笔记 🔒 |
| POST | `/api/notes/:id/like` | - | 点赞/取消点赞（幂等切换）🔒 |
| POST | `/api/notes/:id/collect` | - | 收藏/取消收藏 🔒 |
| GET | `/api/notes/:id/comments` | - | 评论列表（含二级评论） |
| POST | `/api/notes/:id/comments` | `{content, parentId?}` | 发表评论 🔒 |
| POST | `/api/notes/:id/comments/:cid/like` | - | 评论点赞 🔒 |

🔒 = 需要登录

`noteCard` 结构（与官方字段同名对齐）：

```json
{
  "id": "3", "noteId": "3",
  "title": "158小个子秋冬穿搭｜显高10cm公式",
  "desc": "...",
  "type": "normal",
  "images": [{ "url": "https://picsum.photos/...", "fallback": "/uploads/seed/cover-xxx.svg", "w": 600, "h": 882 }],
  "cover": { "...": "同 images[0]" },
  "topics": ["穿搭", "小个子穿搭"],
  "location": "上海·静安",
  "interactInfo": { "likedCount": 787, "collectedCount": 121, "commentCount": 4, "shareCount": 42, "liked": true, "collected": false },
  "user": { "id": 3, "nickname": "甜妹小鹿", "avatar": "..." }
}
```

> `images[].url` 为远程图片，`fallback` 为本地 SVG —— 前端加载失败自动回退，断网可演示。

## 3. 用户 `/api/users`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/users` | 用户列表（感兴趣的人） |
| GET | `/api/users/:id` | 用户主页资料（附 noteCount） |
| GET | `/api/users/:id/notes?tab=notes\|likes\|collects` | 笔记 / 赞过 / 收藏 |
| POST | `/api/users/:id/follow` | 关注/取关（幂等切换）🔒 |
| GET | `/api/users/:id/followers` | 粉丝列表 |
| GET | `/api/users/:id/following` | 关注列表 |
| GET | `/api/users/:id/stats` | 主页统计数字 |

## 4. 搜索 `/api/search`

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/search/hot` | 热搜榜 TOP20（`{keyword, heat, tag, rank}`，tag ∈ 热/新/爆） |
| GET | `/api/search/suggest?keyword=` | 搜索联想词 |
| GET | `/api/search/notes?keyword=&page=&sort=hot` | 笔记搜索（自动写入搜索历史） |
| GET | `/api/search/history` | 搜索历史 🔒（最多 20 条） |
| DELETE | `/api/search/history` | 清空搜索历史 🔒 |
| GET | `/api/search/topics?keyword=` | 话题聚合 |

## 5. 消息 `/api/messages` 🔒

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/messages` | 三个盒子（likes/follows/comments）+ 未读数 + 最近一条 |
| GET | `/api/messages/:box` | 某盒子消息列表（拉取即置为已读） |
| POST | `/api/messages/read-all` | 全部已读 |
| GET | `/api/messages/unread/count` | TabBar 角标数字 |

## 6. 上传与频道

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/upload` | 单图上传，字段名 `file`，≤12MB 🔒 |
| POST | `/api/upload/multi` | 多图上传（≤9 张），字段名 `files` 🔒 |
| DELETE | `/api/upload/?url=/uploads/xx` | 删除已上传文件 🔒 |
| GET | `/api/channels` | 首页频道列表 |
| GET | `/api/health` | 健康检查 |
