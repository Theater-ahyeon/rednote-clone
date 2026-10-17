# 小红书（RED / RedNote）逆向分析报告

> 分析时间：2026-10-17 · 分析对象：小红书 PC Web 端（`www.xiaohongshu.com`）与移动端协议
> 方法：前端资源抓取 + 构建产物静态分析（JS Bundle 字符串提取、CSS 设计令牌提取、接口路径枚举）
> 用途：仅为学习目的还原其**信息架构、视觉规范与数据模型**，不破解、不绕过任何签名或风控，不访问任何真实接口。

---

## 1. 分析方法与取证过程

| 步骤 | 操作 | 产出 |
|---|---|---|
| 1 | 请求 `https://www.xiaohongshu.com/explore`（Chrome UA） | 302 → `/login`（未登录态强制跳登录页） |
| 2 | 跟随重定向抓取登录页 HTML | 得到前端构建产物清单（`fe-static.xhscdn.com/formula-static/xhs-pc-web/...`） |
| 3 | 下载主 CSS（`index.2c5833c6.css`，395 KB）与主 JS（`index.719e278e.js`，2.5 MB） | 静态分析素材 |
| 4 | JS 正则提取 `"/api/sns/..."` 字符串 | 接口路径全集（见 §3） |
| 5 | CSS 提取 `:root` 变量、`.reds-*` 组件类、品牌色 | 设计令牌（见 §2） |
| 6 | JS 提取数据字段名（`noteId` / `xsecToken` / `interactInfo` …） | 数据模型（见 §4） |

> 补充：本机未安装小红书 PC 客户端；此前对同类 Electron 套壳应用（抖音桌面版 asar 解包）的分析方法一致，小红书桌面版为 WebView 架构，Web 端产物即其 UI 内核。

---

## 2. 视觉规范（Design Tokens）

从 `index.2c5833c6.css` 中提取：

| 令牌 | 值 | 说明 |
|---|---|---|
| 品牌红 | `#ff2442` | 页面内联出现 8 次，另有 `rgba(255,36,66,0.06)` 弱化背景 |
| 暗色模式背景 | `#19191e` | `:root[dark]` 变量 `--bg` |
| 字体族 | `PingFang SC` | 全部 Typography 令牌（H1~T3/B1~C3）统一指定 |
| 基准字号 | `14px` | `html,body{font-size:14px}` |
| 组件类前缀 | `.reds-*` | `reds-button-new`(71)、`reds-uploader`(61)、`reds-avatar`(16)、`reds-tabs-list`、`reds-toast`、`reds-dialog-*` 等 |
| 布局类 | `.main-container`(flex)、`.side-bar`、`.channel-*`、`.note-item` | PC 端骨架 |
| 瀑布流实现 | `.note-item{position:absolute;left:0;top:0;width:var(--32eb1169)}` | **绝对定位 + JS 计算坐标**的瀑布流，非 CSS column |
| 笔记卡片圆角 | `8px`（`border-radius:8px`） | `.note-item` 遮罩层使用 8px 圆角 |
| 图片 CDN | `sns-img-{bd,hw,qc,qn}.xhscdn.com`（图）/ `sns-video-*`（视频）/ `sns-avatar-qc`（头像）/ `sns-webpic-qc` | 按运营商分线路 |

**本项目采用的对应实现**（`web/src/styles/global.css`）：

```css
--red: #ff2442;          /* 品牌红，一比一还原 */
--text-1: #333333;       /* 主文本 */
--text-3: #999999;       /* 弱化文本 */
--radius-card: 8px;      /* 笔记卡片圆角 */
font-family: 'PingFang SC', ...;
/* 瀑布流：同样采用 JS「最短列优先」分列（web/src/components/NoteCard.jsx），
   复现 .note-item 绝对定位方案的视觉效果且避免 CSS column 竖排缺陷 */
```

---

## 3. 接口路径（从 PC Web JS Bundle 枚举）

以下为真实存在的小红书接口路径（host：`edith.xiaohongshu.com`，环境另有 `edith.beta` / `edith.sit`）。**本项目仅参考其路径语义与参数命名，自己实现同构 API**，未调用任何真实接口。

### 3.1 内容流
| 真实接口 | 语义 | 本项目对应 |
|---|---|---|
| `POST /api/sns/web/v1/homefeed` | 首页推荐流 | `GET /api/notes/feed?tab=recommend` |
| `POST /api/sns/web/v1/feed` | 单条笔记流 | `GET /api/notes/:id` |
| `POST /api/sns/web/v1/note/like` / `dislike` | 赞/取消赞 | `POST /api/notes/:id/like` |
| `POST /api/sns/web/v1/note/collect` / `uncollect` | 收藏/取消 | `POST /api/notes/:id/collect` |
| `GET /api/sns/web/v1/feed/browsing_history` | 浏览历史 | （未实现） |
| `POST /api/sns/web/v1/common/dual_feed` | 双列流 | 瀑布流复用 feed |

### 3.2 搜索
| 真实接口 | 语义 | 本项目对应 |
|---|---|---|
| `POST /api/sns/web/v1/search/notes` | 笔记搜索 | `GET /api/search/notes?keyword=` |
| `GET /api/sns/web/v1/search/trending/query` | 热搜榜 | `GET /api/search/hot` |
| `POST /api/sns/web/search/history/sync` | 搜索历史同步 | `GET/DELETE /api/search/history` |
| `POST /api/sns/web/search/signal` / `send/ai` | AI 搜索 | （未实现） |

### 3.3 用户与关系
| 真实接口 | 语义 | 本项目对应 |
|---|---|---|
| `GET /api/sns/web/v1/user/selfinfo` | 我的信息 | `GET /api/auth/me` |
| `GET /api/sns/web/v1/user_posted` | 用户已发布笔记 | `GET /api/users/:id/notes?tab=notes` |
| `GET /api/sns/web/v1/you/likes` | 我赞过的 | `GET /api/users/:id/notes?tab=likes` |
| `GET /api/sns/web/v1/you/connections` | 关注/粉丝 | `GET /api/users/:id/followers|following` |

### 3.4 评论 / 消息 / 上传
| 真实接口 | 语义 | 本项目对应 |
|---|---|---|
| `POST /api/sns/web/v1/comment/post` | 发评论 | `POST /api/notes/:id/comments` |
| `POST /api/sns/web/v1/comment/like` / `dislike` | 评论点赞 | `POST /api/notes/:id/comments/:cid/like` |
| `GET /api/sns/v1/im/web/get_recent_chats` | 会话列表 | `GET /api/messages` |
| `GET /api/sns/v2/message/message_box` | 消息盒子 | `GET /api/messages/:box` |
| `POST /api/sns/web/upload/permit` | 上传许可 | `POST /api/upload` |

### 3.5 请求签名（只记录结论，不做绕过）
未登录状态下抓包与 Bundle 分析均显示：写操作请求需携带 `x-s` / `x-t` / `x-s-common` 系列签名头（由混淆 JS 在运行时计算，与 Cookie `a1`、时间戳、payload 相关）。社区已有公开逆向研究。**本项目不实现、不绕过该签名**，服务端自建 JWT 鉴权替代。

---

## 4. 数据模型（从 JS 字段名提取）

```ts
// 笔记卡片（瀑布流单元）
interface NoteCard {
  id: string;                 // 24 位 hex（如 65f1a2e3...）
  noteCard: {
    type: 'normal' | 'video';
    displayTitle: string;     // 瀑布流标题
    user: { userId, nickname, avatar };
    cover: { url, width, height, fileID? };
    interactInfo: { liked, likedCount, collected, collectedCount, commentCount, shareCount };
    tagList: { id, name, type }[];
  };
  xsecToken: string;          // 每条笔记的访问签名，详情页必须回传
  xsecSource: 'pc_search' | 'pc_feed' | ...;
}

// 详情页 note = NoteCard + desc + imageList + ipLocation + time + comments
// 评论 comment = { id, content, likeCount, ipLocation, createTime, userInfo, subComments }
// 消息盒子 box = 赞和收藏 | 新增关注 | 评论和@（App 消息页三入口，本项目一比一还原）
```

**本项目 SQLite 建模**（`server/src/db.js`）：`users / notes / likes / collects / comments / comment_likes / follows / messages / hot_searches / search_history / channels`，序列化输出字段与上述结构同名对齐（`noteId / cover / interactInfo / displayTitle→title` 等），便于对照学习。

---

## 5. 交互与信息架构还原清单

| 官方行为 | 本项目还原点 |
|---|---|
| 首页顶部「关注 / 发现 / 附近」三个 tab，选中项 17px 加粗 + 16px 红色短下划线 | ✔ `Home.jsx` + `.home-tab.active::after` |
| 频道条横向滚动（推荐/穿搭/美食/彩妆/影视/职场/情感/家居/游戏/旅行/健身/数码） | ✔ 服务端下发 `channels` |
| 双列瀑布流、卡片圆角 8px、底部「头像+昵称+红心赞数」 | ✔ `NoteCard.jsx`（2 列起，断点 3/4/5 列） |
| 底部 TabBar：首页 / 购物 / ＋（红色胶囊凸起）/ 消息（红点角标）/ 我 | ✔ `Layout.jsx` |
| 消息页三盒子：赞和收藏、新增关注、评论和@，未读红色角标 | ✔ `Messages.jsx` |
| 笔记详情：图片轮播圆点、浮层头像+关注、#话题 蓝色链接、IP 属地 | ✔ `NoteDetail.jsx` |
| PC 端详情页左右分栏（左媒体/右信息+评论+相关推荐） | ✔ `.detail-layout` grid 1fr/420px |
| 搜索页：搜索历史 chips + 热搜榜（名次红、热/新/爆角标、热度数值） | ✔ `Search.jsx` |
| 发布页：九宫格选图、标题占位「填写标题会有更多赞哦～」、话题/位置/可见范围 | ✔ `Publish.jsx` |
| 个人主页：小红书号、IP 属地、关注/粉丝/获赞与收藏、笔记/收藏/赞过 | ✔ `Profile.jsx` |
| PC 端左侧导航（发现/发布/通知/我）+ 中部瀑布流 | ✔ `SideBar.jsx` |

## 6. 合规声明

- 本项目所有内容均为**自建后端 + 种子数据**，不存储、不代理、不展示任何小红书真实用户数据。
- 图片素材来自 `picsum.photos` 免费图库（断网时自动回退本地生成的 SVG 占位图）。
- 分析仅针对公开可访问的前端静态资源，未进行渗透、未绕过签名/风控。
- 项目仅用于学习交流，与小红书（行吟信息科技有限公司）无任何关联；请勿用于商业用途。
